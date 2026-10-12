import * as THREE from "three";

import { Badges } from "./interact/Badges";
import { CameraRig } from "./CameraRig";
import { KiteActivity } from "./activities/kite/KiteActivity";
import { isActivity } from "./activities";
import { Engine } from "./Engine";
import { HowlerAudio } from "./audio/HowlerAudio";
import { Input } from "./Input";
import { Tweens } from "./Tween";
import { HELP_LINES, readLines } from "./help";
import { createChildhoodYard } from "./locations/childhoodYard";
import { disposeObject } from "./world/dispose";
import { findActiveSpot } from "./interact/spots";
import { gameEvents } from "../events";
import { setInputDevice } from "../ui/device";

import type { FrameInfo } from "./Engine";
import type { LocationRuntime } from "./locations/types";
import type { Spot } from "./interact/spots";
import type { SeatView, SpotData } from "./locations/childhoodYard";
import type { CameraShot } from "./CameraRig";

/**
 * WorldGame — bộ máy của trò chơi.
 *
 * Thế giới mở, không cốt truyện: dựng MỘT thế giới (nhà + sân) đúng một lần,
 * trao điều khiển cho người chơi ngay, và chỉ phản ứng với những gì họ làm —
 * chạm vào đồ vật (E), thả diều (E ở bãi cỏ), thu diều (R), gọi trợ giúp.
 * Đi từ trong nhà ra sân chỉ là mở một cánh cửa: không chuyển cảnh, không tải.
 */

/** Động tác với tay chạm đồ vật (giây) và lúc bàn tay chạm tới (0 … 1). */
const REACH_SECONDS = 0.62;
const REACH_CONTACT = 0.45;

/** Động tác kéo dây thu diều (giây) — camera bay về trong lúc này. */
const REEL_SECONDS = 1.1;

export class WorldGame {
  private readonly audio = new HowlerAudio();

  private readonly tweens = new Tweens();

  private engine: Engine | undefined;

  private rig: CameraRig | undefined;

  private input: Input | undefined;

  private badges: Badges | undefined;

  private location: LocationRuntime | undefined;

  /** Trò chơi con đang chạy (thả diều). Chỉ một ván một lúc. */
  private activity: KiteActivity | undefined;

  private detachFrame: (() => void) | undefined;

  private activeSpotId: string | undefined;

  private controlsEnabled = false;

  private footsteps: { move: (p: { x: number; y: number; z: number }) => void; stop: () => void } | undefined;

  /** Chỗ đang ngồi (cửa sổ, băng ghế) — có thì camera giữ khung ngắm cảnh. */
  private seated: SeatView | undefined;

  /** Đang đứng dậy — chặn cú bấm thứ hai trong lúc người còn đang nhổm lên. */
  private standing = false;

  /** Đang đọc bảng trợ giúp — chặn cú bấm Trợ giúp thứ hai chồng lên. */
  private helpOpen = false;

  private detachHelp: (() => void) | undefined;

  /** Idempotent: React StrictMode gọi effect hai lần, chỉ được dựng một engine. */
  start(container: HTMLElement) {
    if (this.engine) return;

    const engine = new Engine(container);

    this.engine = engine;
    this.input = new Input(container);
    // Rig và thế giới dùng CHUNG một bộ Tween, nên chỉ có một chỗ gọi update().
    this.rig = new CameraRig(engine.camera, this.tweens);

    this.badges = new Badges(container);

    setInputDevice(this.input.currentDevice);

    // Khoá/nhả chuột là thay đổi người chơi KHÔNG nhìn thấy (con trỏ chỉ biến
    // mất hoặc hiện lại), nên phải nói thành lời — nhất là khi bấm Esc.
    this.input.onPointerLock((locked) => {
      gameEvents.emit("look", { locked });
      gameEvents.emit("notice", {
        text: locked
          ? "Di chuột để nhìn quanh · Esc để thoát chế độ này"
          : "Đã thoát điều khiển góc nhìn bằng chuột — bấm vào màn hình để bật lại",
        hold: locked ? 2600 : 3400,
      });
    });

    // Trợ giúp là thứ NGƯỜI CHƠI gọi, không phải thứ tự bật lên.
    this.detachHelp = gameEvents.on("help", () => void this.showHelp());

    this.enterWorld();

    this.detachFrame = engine.onUpdate((frame) => this.frame(frame));

    engine.start();
  }

  /** Cần điều khiển cảm ứng đẩy vào đây (toạ độ đã chuẩn hoá -1…1). */
  setStick(right: number, forward: number) {
    this.input?.setStick(right, forward);
  }

  releaseStick() {
    this.input?.releaseStick();
  }

  /** Nút tương tác trên màn hình cảm ứng. */
  interact() {
    this.input?.queueInteract();
  }

  destroy() {
    this.detachFrame?.();
    this.detachFrame = undefined;

    this.detachHelp?.();
    this.detachHelp = undefined;

    this.activity?.dispose();
    this.activity = undefined;

    this.footsteps?.stop();
    this.footsteps = undefined;

    if (this.location) disposeObject(this.location.group);
    this.location = undefined;

    this.badges?.dispose();
    this.badges = undefined;

    this.input?.dispose();
    this.input = undefined;

    this.rig = undefined;

    this.audio.dispose();

    this.tweens.clear();

    this.engine?.dispose();
    this.engine = undefined;
  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private frame({ dt, elapsed }: FrameInfo) {
    const engine = this.engine;
    const rig = this.rig;
    const input = this.input;
    const location = this.location;

    if (!engine || !rig || !input || !location) return;

    this.tweens.update(dt);

    if (input.consumePauseToggle()) {
      const muted = this.audio.toggleMuted();

      gameEvents.emit("notice", {
        text: muted ? "Đã tắt tiếng" : "Đã bật tiếng",
        hold: 1400,
      });
    }

    const look = input.look();

    // Đọc phím tương tác MỖI frame, kể cả khi không đứng cạnh đồ vật nào: nếu
    // chỉ đọc lúc đã có đồ vật, cú bấm ở chỗ trống nằm lại trong hàng đợi và
    // món đồ kế tiếp tự phản ứng mà người chơi không bấm gì.
    const interact = input.consumeInteract();

    // Đang ngồi: bấm E hoặc bất kỳ phím di chuyển nào là đứng dậy.
    if (this.seated && !this.standing && this.controlsEnabled) {
      const move = input.snapshot();

      if (interact || move.forward !== 0 || move.right !== 0) void this.standUp();
    }

    // Nhân vật đi theo hướng CAMERA: xoay camera rồi bấm W là đi về phía màn
    // hình, đúng như mọi game góc nhìn thứ ba.
    location.character.update(input.snapshot(), rig.yawAngle, dt, elapsed);

    const position = location.character.position;

    rig.setTarget(position.x, position.y, position.z);
    location.update?.(dt, elapsed);

    this.updateSpots(interact);
    this.updateFootsteps();

    rig.update(dt, look, elapsed);

    const direction = new THREE.Vector3();

    engine.camera.getWorldDirection(direction);

    this.audio.setListener(engine.camera.position, direction);

    this.badges?.update(engine.camera);
  }

  // ── Thế giới ────────────────────────────────────────────────────────────

  private enterWorld() {
    const engine = this.engine;
    const rig = this.rig;

    if (!engine || !rig) return;

    const location = createChildhoodYard({ engine });

    this.location = location;

    engine.scene.add(location.group);

    rig.applyPreset(location.rig);
    // Cần gạt phải biết thế giới có gì để không chọc xuyên qua: tường nhà, cây,
    // giếng là cùng một danh sách vật cản mà nhân vật đã dùng.
    rig.setColliders(location.colliders ?? []);

    const { x, y, z } = location.character.position;

    rig.setTarget(x, y, z);
    rig.lookAt(x, y + 1, z);

    for (const spot of location.spots) {
      this.badges?.add({
        id: spot.id,
        label: spot.label,
        position: new THREE.Vector3(spot.x, location.badgeHeight?.[spot.id] ?? 2.4, spot.z),
      });
    }

    // Tiếng chim chiều lan khắp nhà và sân — nền âm thanh duy nhất, không ai
    // dẫn chuyện.
    this.audio.fadeIn("childhoodBirds", 2400, 0.26);

    this.setControls(true);
  }

  private setControls(enabled: boolean) {
    this.controlsEnabled = enabled;

    this.input?.setMuted(!enabled);

    if (!enabled) {
      this.location?.character.halt();
      this.badges?.hideAll();
      this.activeSpotId = undefined;
    }

    gameEvents.emit("controls", { enabled });
  }

  // ── Đồ vật ──────────────────────────────────────────────────────────────

  private updateSpots(interact: boolean) {
    const location = this.location;

    if (!location || !this.controlsEnabled) return;

    // Đang ngồi thì không có đồ vật nào "trước mặt" — E là để đứng dậy.
    if (this.seated) {
      if (this.activeSpotId) {
        this.activeSpotId = undefined;
        this.badges?.hideAll();
      }

      return;
    }

    const position = location.character.position;

    const match = findActiveSpot(position.x, position.z, location.spots);

    if (match?.spot.id !== this.activeSpotId) {
      this.activeSpotId = match?.spot.id;

      if (match) this.badges?.show(match.spot.id);
      else this.badges?.hideAll();
    }

    if (match && interact && !location.character.busy) {
      void this.touch(match.spot as Spot<SpotData>);
    }
  }

  /**
   * Chạm vào một đồ vật: nhân vật quay về phía nó, với tay ra, và ĐÚNG lúc bàn
   * tay chạm tới thì đồ vật phản ứng. Điểm mở trò chơi con (bãi diều) thì vào
   * ván diều thay vì phản ứng.
   */
  private async touch(spot: Spot<SpotData>) {
    const location = this.location;

    if (!location) return;

    if (spot.activity) {
      await this.playActivity(spot.activity);

      return;
    }

    if (spot.payload?.seat) {
      await this.sitDown(spot.payload.seat);

      return;
    }

    this.setControls(false);

    location.character.face(spot.x, spot.z);

    try {
      await location.character.perform(
        "reach",
        REACH_SECONDS,
        () => {
          location.interact(spot.id);

          if (spot.payload?.sfx) {
            this.audio.play(spot.payload.sfx, { volume: 0.45 });
          }
        },
        REACH_CONTACT,
      );
    } finally {
      if (this.location === location) this.setControls(true);
    }
  }

  /**
   * Ngồi xuống: nhân vật bước tới ghế, quay người, hạ người xuống; camera trôi
   * sang khung ngắm cảnh sau vai. Ngồi bao lâu cũng được — bấm E hoặc phím
   * di chuyển là đứng dậy.
   */
  private async sitDown(seat: SeatView) {
    const location = this.location;

    if (!location) return;

    this.setControls(false);

    await location.character.sit(seat);

    if (this.location !== location) return;

    this.seated = seat;
    this.rig?.setShot(seatShot(seat));

    gameEvents.emit("notice", {
      text: "Ngồi thư thả một lúc · E hoặc phím di chuyển để đứng dậy",
      hold: 3200,
    });

    this.setControls(true);
  }

  private async standUp() {
    const location = this.location;

    if (!location || this.standing) return;

    this.standing = true;
    this.setControls(false);

    // Camera bay về sau lưng trong lúc người đang nhổm dậy — hai chuyển động
    // chồng lên nhau thay vì nối đuôi.
    this.rig?.setShot(undefined);

    try {
      await location.character.standUp();
    } finally {
      this.seated = undefined;
      this.standing = false;

      if (this.location === location) this.setControls(true);
    }
  }

  /**
   * Ván thả diều — vào bằng E ở bãi cỏ, ra bằng R lúc nào cũng được.
   *
   * Ván không tự kết thúc: dù diều còn dây hay đã đứt và trôi đi, camera bám
   * theo nó cho tới khi người chơi thu diều. Lúc đó nhân vật kéo dây, camera
   * trôi về sau lưng, con diều lại nằm chờ trên cỏ — và E là chơi lại.
   */
  private async playActivity(name: string) {
    if (!isActivity(name)) {
      throw new Error(`World: không có trò chơi "${name}"`);
    }

    const engine = this.engine;
    const location = this.location;

    if (!engine || !location || this.activity) return;

    this.setControls(false);

    const activity = new KiteActivity({
      engine,
      character: location.character,
      readInput: () => this.input?.kiteInput() ?? { reel: 0, steer: 0 },
      readViewToggle: () => this.input?.consumeCameraToggle() ?? false,
      readExit: () => this.input?.consumeKiteExit() ?? false,
      camera: (shot) => this.rig?.setShot(shot),
      forward: location.kiteForward ?? { x: 1, z: 0 },
    });

    this.activity = activity;

    // Phím thu diều có HAI cửa: phím R (đi đường `Input`) và nút trên bảng
    // điều khiển cho màn hình cảm ứng. Hai cửa gộp về MỘT hàng đợi.
    const detachExit = gameEvents.on("kiteExit", () => this.input?.queueKiteExit());

    // Con diều nằm trên cỏ được CẤT ĐI trong lúc nó đang bay, và hiện lại đúng
    // chỗ cũ khi ván kết thúc — đó là toàn bộ cơ chế "reset diều".
    this.setKiteWaiting(location, false);

    try {
      await activity.play();
    } finally {
      // `finally`: một lỗi giữa ván cũng không được để diều nằm lại trong
      // scene hoặc camera kẹt trên trời.
      detachExit();

      // Trả camera TRƯỚC khi kéo dây: camera trôi về sau lưng nhân vật đúng
      // trong lúc tay đang thu dây, hai chuyển động chồng lên nhau.
      activity.dispose();
      this.activity = undefined;

      this.setKiteWaiting(location, true);
    }

    await location.character.perform("reel", REEL_SECONDS);

    if (this.location === location) this.setControls(true);
  }

  /** Bật/tắt con diều nằm chờ trong sân — xem `LocationRuntime.kite`. */
  private setKiteWaiting(location: LocationRuntime, waiting: boolean) {
    if (location.kite) location.kite.visible = waiting;
  }

  /**
   * Bảng trợ giúp — chỉ mở khi người chơi đang cầm lái: giữa ván diều thì
   * bảng điều khiển của ván đã nói đủ, và hai lớp chữ chồng nhau chỉ che trời.
   */
  private async showHelp() {
    if (this.helpOpen || !this.controlsEnabled) return;

    this.helpOpen = true;
    this.setControls(false);

    try {
      await readLines(HELP_LINES);
    } finally {
      this.helpOpen = false;
      this.setControls(true);
    }
  }

  private updateFootsteps() {
    const location = this.location;

    if (!location) return;

    const moving = location.character.speed > 0.4 && this.controlsEnabled;
    const position = location.character.position;

    if (moving && !this.footsteps) {
      this.footsteps = this.audio.playAt(location.footstepSlot, position, {
        volume: 0.15,
        loop: true,
        id: "steps",
      });
    } else if (!moving && this.footsteps) {
      this.footsteps.stop();
      this.footsteps = undefined;
    }

    this.footsteps?.move(position);
  }
}

/** Khung hình ngắm cảnh khi ngồi: sau-chéo vai, nhìn ra xa; chuột để ngoảnh nhìn quanh. */
export function seatShot(seat: SeatView): CameraShot {
  const forwardX = Math.sin(seat.yaw);
  const forwardZ = Math.cos(seat.yaw);
  // Bên phải người ngồi (quay 90° theo chiều kim đồng hồ nhìn từ trên xuống).
  const rightX = -forwardZ;
  const rightZ = forwardX;

  return {
    position: new THREE.Vector3(
      seat.x - forwardX * seat.back + rightX * seat.side,
      seat.height + seat.eye,
      seat.z - forwardZ * seat.back + rightZ * seat.side,
    ),
    look: new THREE.Vector3(
      seat.x + forwardX * seat.ahead,
      seat.height + seat.lookUp,
      seat.z + forwardZ * seat.ahead,
    ),
    fov: seat.fov,
    shake: 0,
    // Người đang ngồi thì ngoảnh đầu nhìn quanh, không bay vòng quanh ghế.
    pivot: "camera",
  };
}

export const worldGame = new WorldGame();
