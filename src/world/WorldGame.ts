import * as THREE from "three";

import { Badges } from "./interact/Badges";
import { CameraRig } from "./CameraRig";
import { KiteActivity } from "./activities/kite/KiteActivity";
import { ShuttlecockActivity } from "./activities/shuttlecock/ShuttlecockActivity";
import { SwimActivity } from "./activities/swim/SwimActivity";
import { isActivity, keepsMovement } from "./activities";
import { Engine } from "./Engine";
import { HowlerAudio } from "./audio/HowlerAudio";
import { Input } from "./Input";
import { Tweens } from "./Tween";
import { HELP_LINES, readLines } from "./help";
import { createChildhoodYard } from "./locations/childhoodYard";
import { disposeObject } from "./world/dispose";
import { findActiveSpot } from "./interact/spots";
import { terrainHeight } from "./terrain/heightfield";
import { dampAngle } from "./character/motion";
import {
  dressFor,
  duskLevel,
  kiteTuning,
  motionTuning,
  NOOK_SECONDS,
  QUIET_SECONDS,
  UNINVITED_SECONDS,
  KEEPSAKE_LIST,
  keepsakeWithin,
  placeAt,
  progress,
  shuttleTuning,
  swimTuning,
} from "./progress";
import { gameEvents } from "../events";
import { setInputDevice } from "../ui/device";
import { playSfx } from "../ui/sfx";

import type { ActivityName, RunningActivity } from "./activities";
import type { FrameInfo } from "./Engine";
import type { LocationRuntime } from "./locations/types";
import type { Spot } from "./interact/spots";
import type { SeatView, SpotData } from "./locations/childhoodYard";
import type { CameraShot } from "./CameraRig";
import type { AudioSlot } from "./audio/HowlerAudio";

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

const FRIEND_IDLE = { forward: 0, right: 0, run: false };

export class WorldGame {
  private readonly audio = new HowlerAudio();

  private readonly tweens = new Tweens();

  private engine: Engine | undefined;

  private rig: CameraRig | undefined;

  private input: Input | undefined;

  private badges: Badges | undefined;

  private location: LocationRuntime | undefined;

  /** Trò chơi con đang chạy (thả diều, bơi ao, đá cầu). Chỉ một ván một lúc. */
  private activity: RunningActivity | undefined;

  /**
   * Cú bấm E của frame này, để dành cho ván con.
   *
   * `frame()` chạy TRƯỚC listener của ván (đăng ký sau), nên cú bấm phải nằm
   * chờ ở đây đúng một nhịp — nếu không, phím đá cầu rơi vào khoảng trống giữa
   * hai listener và người chơi bấm mà không có gì xảy ra.
   */
  private interactPressed = false;

  private detachFrame: (() => void) | undefined;

  private activeSpotId: string | undefined;

  private controlsEnabled = false;

  private footsteps: { move: (p: { x: number; y: number; z: number }) => void; stop: () => void } | undefined;

  /** Mặt nền của tiếng bước chân đang phát */
  private footstepSlot: AudioSlot | undefined;

  /** Chỗ đang ngồi (cửa sổ, băng ghế) — có thì camera giữ khung ngắm cảnh. */
  private seated: SeatView | undefined;

  /** Đang đứng dậy — chặn cú bấm thứ hai trong lúc người còn đang nhổm lên. */
  private standing = false;

  /** Đã ngồi yên ở chỗ hiện tại bao lâu (giây) */
  private seatedFor = 0;

  /** Chế độ ngắm cảnh (H) đang bật — App báo qua sự kiện `scenic` */
  private scenic = false;

  /** Ngồi yên + ngắm cảnh liền bao lâu (giây) — "Một phút không làm gì" */
  private quietFor = 0;

  /** Lần hù chim đang theo dõi, và người chơi đã đi khỏi chỗ đó chưa */
  private scare: { x: number; z: number; at: number; left: boolean } | undefined;

  /** Đang đọc bảng trợ giúp — chặn cú bấm Trợ giúp thứ hai chồng lên. */
  private helpOpen = false;

  private detachHelp: (() => void) | undefined;

  /** Sổ hồi ký đang mở — người chơi đọc sổ thì thế giới đứng im. */
  private journalOpen = false;

  /** Mức chạng vạng đang dùng — chỉ đổi trời/âm thanh khi nó thật sự đổi. */
  private dusk = -1;

  private detachJournal: (() => void) | undefined;

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
    this.input.onPointerLock((locked, quiet) => {
      gameEvents.emit("look", { locked });

      if (quiet) return;

      gameEvents.emit("notice", {
        text: locked
          ? "Di chuột để nhìn quanh · Esc để thoát chế độ này"
          : "Đã thoát điều khiển góc nhìn bằng chuột — bấm vào màn hình để bật lại",
        hold: locked ? 2600 : 3400,
      });
    });

    // Trợ giúp là thứ NGƯỜI CHƠI gọi, không phải thứ tự bật lên.
    this.detachHelp = gameEvents.on("help", () => void this.showHelp());

    // Sổ mở từ Rương gỗ, đóng bằng nút trên bảng sổ (bàn phím đi đường phím
    // Esc trong lớp giao diện) — không có đường nào khác, nên sổ không bao
    // giờ tự hiện giữa lúc người chơi đang chơi.
    const offClose = gameEvents.on("journalClose", () => this.closeJournal());
    // Đổi/mặc đồ ngay trong Sổ: nhân vật thay đồ tức thì, đứng ngay cạnh rương.
    const offBuy = gameEvents.on("journalBuy", ({ id }) => {
      if (progress.buy(id)) this.applyDress();
    });
    const offWear = gameEvents.on("journalWear", ({ id }) => {
      if (progress.wear(id)) this.applyDress();
    });

    // Sổ đổi (ván vừa ghi, trang mới mở) → trời có thể ngả thêm một chút.
    // Kỹ năng đi bộ vừa mở thì có tác dụng ngay bước kế tiếp.
    const offScenic = gameEvents.on("scenic", ({ on }) => {
      this.scenic = on;
    });
    const offJournal = gameEvents.on("journal", () => {
      this.applyDusk();
      this.applyMotion();
    });

    this.detachJournal = () => {
      offScenic();
      offJournal();
      offClose();
      offBuy();
      offWear();
    };

    this.enterWorld();
    this.applyDress();

    // Kỷ vật đã nhặt ở lần chơi trước thì không nằm lại trên cỏ nữa.
    for (const id of progress.journal.keepsakes) this.location?.hideKeepsake?.(id);
    this.applyMotion();

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

  /** Nút giữ-để-chạy trên màn hình cảm ứng (dưới nước là lặn). */
  setTouchRun(held: boolean) {
    this.input?.setTouchRun(held);
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

    this.detachJournal?.();
    this.detachJournal = undefined;
    this.journalOpen = false;

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

    // Ván con đang chạy thì cú bấm E thuộc về VÁN (đá cầu), không phải đồ vật
    // trong sân. Cất lại ở đây để ván đọc được nó ngay trong frame này.
    this.interactPressed = this.activity ? this.interactPressed || interact : false;

    // Đang ngồi: bấm E hoặc bất kỳ phím di chuyển nào là đứng dậy.
    if (this.seated && !this.standing && this.controlsEnabled) {
      const move = input.snapshot();

      if (interact || move.forward !== 0 || move.right !== 0) void this.standUp();
    }

    // Ván TỰ LÁI nhân vật (bơi ao) thì vòng lặp chính không được đụng vào: hai
    // bên cùng ghi vị trí là nhân vật giật giữa bờ và mặt nước.
    if (this.activity?.drivesCharacter !== true) {
      // Nhân vật đi theo hướng CAMERA: xoay camera rồi bấm W là đi về phía màn
      // hình, đúng như mọi game góc nhìn thứ ba.
      location.character.update(input.snapshot(), rig.yawAngle, dt, elapsed);
    }

    const position = location.character.position;

    rig.setTarget(position.x, position.y, position.z);

    // Ván tự lái nhân vật (bơi): camera lựa dần ra sau lưng hướng bơi, như
    // camera bám thuyền — A/D quay người thì khung hình quay theo. Chuột vẫn
    // nhìn quanh được, chỉ là nhả ra thì camera trôi về sau lưng.
    if (this.activity?.drivesCharacter) {
      rig.setYaw(dampAngle(rig.yawAngle, location.character.root.rotation.y + Math.PI, 2.2, dt));
    }

    // Chim bám theo con diều: ván diều cho điểm trên trời; không có ván nào
    // (hoặc ván khác) thì `undefined` là chim về lộ trình vòng quanh sân.
    location.setSkyFocus?.(this.activity?.skyFocus?.());

    location.update?.(dt, elapsed);

    // Người bạn ở bãi đá cầu đứng chơi (thở, ngó quanh) khi không có ván nào lái bạn.
    if (!this.activity?.drivesFriend) location.friend?.update(FRIEND_IDLE, 0, dt, elapsed);

    // Ngồi đủ lâu ở một chỗ ngắm cảnh thì chỗ đó vào sổ — ghi một lần.
    if (this.seated?.nook && !this.standing) {
      this.seatedFor += dt;

      if (this.seatedFor >= NOOK_SECONDS) {
        progress.nook(this.seated.nook);
        this.seatedFor = Number.NEGATIVE_INFINITY;
      }
    }

    this.watchSecrets(dt, elapsed);
    this.watchExploration();
    this.updateSpots(interact);
    this.updateFootsteps();

    rig.update(dt, look, elapsed);

    const direction = new THREE.Vector3();

    engine.camera.getWorldDirection(direction);

    this.audio.setListener(engine.camera.position, direction);

    this.badges?.update(engine.camera);
  }

  // ── Thế giới ────────────────────────────────────────────────────────────

  /**
   * Trời ngả theo số trang hồi ký đã mở: vòm trời, ánh sáng, đom đóm, và tiếng
   * chim nhường dần cho tiếng dế. Gọi lại mỗi lần Sổ đổi.
   */
  private applyDusk(instant = false) {
    const level = duskLevel(progress.journal);

    if (level === this.dusk && !instant) return;

    this.dusk = level;
    this.location?.setDusk?.(level, instant);

    const fade = instant ? 2400 : 6000;

    this.audio.fadeIn("childhoodBirds", fade, 0.26 * (1 - level * 0.85));

    if (level > 0) this.audio.fadeIn("crickets", fade, 0.3 * level);
  }

  /** Mặc đúng những gì Sổ ghi đang mặc: dáng nhân vật + đuôi con diều chờ. */
  private applyDress() {
    const location = this.location;

    if (!location) return;

    const { patch, tail } = dressFor(progress.journal.wearing);

    location.character.dress(patch);
    location.kiteTail?.(tail);
  }

  private applyMotion() {
    this.location?.character.setMotion(motionTuning(progress.journal.skills));
  }

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
        // Tính từ mặt đất: chỗ ngồi trên đồi cao 3,5 m thì nhãn không được chôn dưới cỏ.
        position: new THREE.Vector3(
          spot.x,
          terrainHeight(spot.x, spot.z) + (location.badgeHeight?.[spot.id] ?? 2.4),
          spot.z,
        ),
      });
    }

    // Tiếng chim chiều (rồi tiếng dế khi trời ngả) — nền âm thanh duy nhất,
    // không ai dẫn chuyện.
    this.applyDusk(true);

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

    // Ván con đang chạy thì đồ vật trong sân đứng im: E đã thuộc về ván, và
    // một nhãn "bấm E" nổi lên giữa ván đá cầu chỉ làm người chơi bấm nhầm.
    if (!location || !this.controlsEnabled || this.activity) return;

    // Đang ngồi thì không có đồ vật nào "trước mặt" — E là để đứng dậy.
    if (this.seated) {
      if (this.activeSpotId) {
        this.activeSpotId = undefined;
        this.badges?.hideAll();
        location.character.setGaze(undefined);
      }

      return;
    }

    const position = location.character.position;

    const match = findActiveSpot(position.x, position.z, location.spots);

    if (match?.spot.id !== this.activeSpotId) {
      this.activeSpotId = match?.spot.id;

      if (match) this.badges?.show(match.spot.id);
      else this.badges?.hideAll();

      // Đứng gần món đồ nào thì ngoái nhìn món đó — trước cả khi bấm E.
      location.character.setGaze(
        match && {
          x: match.spot.x,
          y: terrainHeight(match.spot.x, match.spot.z) + 0.9,
          z: match.spot.z,
        },
      );
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
      await this.playActivity(spot.activity, spot);

      return;
    }

    if (spot.payload?.seat) {
      await this.sitDown(spot.payload.seat);

      return;
    }

    this.setControls(false);

    location.character.face(spot.x, spot.z);

    let opened = false;

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

      // Rương gỗ: với tay mở nắp xong mới mở Sổ hồi ký. Mở TRONG `try` để
      // `finally` bên dưới biết là đừng trả lại quyền điều khiển — trả rồi
      // khoá lại ngay trong cùng một frame là nhân vật nhổm dậy giữa lúc
      // người chơi đang đọc sổ.
      if (spot.payload?.journal) opened = this.openJournal();
    } finally {
      if (this.location === location && !opened) this.setControls(true);
    }
  }

  /**
   * Mở Sổ hồi ký.
   *
   * Sổ là một ĐỒ VẬT trước khi là một giao diện: người chơi phải tự đi vào
   * nhà, tới cái rương rồi bấm E. Đó là lý do không có nút "mở hồ sơ" trên
   * HUD, và cũng là lý do chơi bình thường không có bảng nào tự hiện lên.
   *
   * Trả về `false` khi sổ không mở được (đang ngồi, đang có ván, hoặc đã mở
   * rồi) — lớp gọi dùng đúng giá trị đó để biết có được trả lại quyền không.
   */
  private openJournal(): boolean {
    // KHÔNG kiểm `controlsEnabled` ở đây: đường vào duy nhất là `touch()`, mà
    // `touch()` đã tạm khoá điều khiển từ lúc với tay tới rương — đòi cờ đó
    // thì sổ không bao giờ mở được. Chỉ chặn những thứ thật sự chồng lên: một
    // ván đang chạy, hoặc sổ đã mở rồi.
    if (this.journalOpen || this.activity) return false;

    this.journalOpen = true;
    this.setControls(false);
    // Sổ có nút để bấm: con trỏ phải hiện ra.
    this.input?.releasePointer();

    // Đẩy sổ hiện tại sang giao diện TRƯỚC khi mở bảng: bảng sổ dựng từ dữ
    // liệu nhận được, không tự đi hỏi lại.
    gameEvents.emit("journal", progress.journal);
    gameEvents.emit("journalView", { open: true });

    return true;
  }

  private closeJournal() {
    if (!this.journalOpen) return;

    this.journalOpen = false;
    gameEvents.emit("journalView", { open: false });

    if (this.location) this.setControls(true);
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
    this.seatedFor = 0;
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
   * Ván con — vào bằng E ở một điểm trong sân, ra bằng R (hoặc nút trên bảng
   * điều khiển) lúc nào cũng được.
   *
   * Ba ván có ba luật điều khiển khác nhau, và đó là toàn bộ khác biệt:
   *
   *  - **Diều**: khoá người chơi tại chỗ, camera thuộc về con diều;
   *  - **Bơi ao**: ván tự lái nhân vật (`drivesCharacter`) — người chơi bơi
   *    trong nước ngay cả khi lớp đi bộ đã bị khoá, còn camera vẫn theo sau lưng;
   *  - **Đá cầu**: người chơi đi lại y như đang dạo sân (xem `keepsMovement`),
   *    chỉ khác là cú bấm E thuộc về quả cầu.
   *
   * Không ván nào tự kết thúc: chỉ cú bấm của người chơi mới đóng ván lại, nên
   * chuyến khám phá của họ không bao giờ bị cắt ngang.
   */
  private async playActivity(name: string, spot: Spot<SpotData>) {
    if (!isActivity(name)) {
      throw new Error(`World: không có trò chơi "${name}"`);
    }

    const location = this.location;

    if (!location || this.activity) return;

    const activity = this.buildActivity(name, spot);

    if (!activity) return;

    this.activity = activity;

    // Cú bấm nào còn nằm trong hàng đợi đều thuộc về NGƯỜI ĐI DẠO trước đó —
    // cú bấm mở ván đã được đọc rồi, phần còn lại là rác.
    this.input?.clearPending();
    this.activeSpotId = undefined;
    this.badges?.hideAll();

    // Ván GIỮ quyền đi lại thì input sống nguyên — người chơi phải chạy tới
    // chỗ quả cầu rơi. Ván khoá người chơi tại chỗ (diều, bơi) thì tắt input
    // đi, nhưng ván vẫn đọc được phím riêng của nó (xem `Input.kiteInput` và
    // `Input.swimInput`).
    if (!keepsMovement(name)) this.setControls(false);

    // Phím `R` (đi đường `Input`) và nút trên bảng điều khiển cho màn hình cảm
    // ứng gộp về đúng MỘT hàng đợi, nên ván không cần biết người chơi vừa bấm
    // bàn phím hay chạm màn hình.
    const detachExit = gameEvents.on("exitActivity", () => this.input?.queueExit());

    // Con diều nằm trên cỏ được CẤT ĐI trong lúc nó đang bay, và hiện lại đúng
    // chỗ cũ khi ván kết thúc — đó là toàn bộ cơ chế "reset diều".
    const carriesKite = name === "kite";
    // Cùng cách với quả cầu nằm chờ trên bãi cỏ.
    const waiting = carriesKite ? location.kite : name === "shuttlecock" ? location.shuttle : undefined;

    if (waiting) waiting.visible = false;
    // Thôi ngoái nhìn chỗ vừa bấm E — ván nào muốn nhìn gì (diều) tự đặt lại.
    location.character.setGaze(undefined);

    try {
      await activity.play();

      // Ván vừa xong là lúc DUY NHẤT còn đọc được số của nó — ghi vào sổ ngay,
      // trước khi `dispose()` dọn hình khối đi.
      this.recordRun(activity);
    } finally {
      // `finally`: một lỗi giữa ván cũng không được để diều nằm lại trong
      // scene hoặc camera kẹt trên trời.
      detachExit();

      // Trả camera TRƯỚC khi kéo dây: camera trôi về sau lưng nhân vật đúng
      // trong lúc tay đang thu dây, hai chuyển động chồng lên nhau.
      activity.dispose();

      if (this.activity === activity) this.activity = undefined;

      this.interactPressed = false;

      if (waiting) waiting.visible = true;
    }

    try {
      // Thu dây: chỉ ván diều có dây để thu.
      if (carriesKite) await location.character.perform("reel", REEL_SECONDS);
    } finally {
      if (this.location === location) this.setControls(true);
    }
  }

  /**
   * Dựng ván con theo TÊN — chỗ DUY NHẤT biết lớp nào cài trò nào, và cũng là
   * chỗ duy nhất biết trò ấy cần gì ở bối cảnh (ao ở đâu, quả cầu nằm chỗ nào).
   * Mọi ván đi qua đúng một cửa này, nên thêm trò mới chỉ là thêm một nhánh —
   * không phải sửa vòng lặp chính.
   */
  private buildActivity(
    name: ActivityName,
    spot: Spot<SpotData>,
  ): RunningActivity | undefined {
    const engine = this.engine;
    const location = this.location;

    if (!engine || !location) return undefined;

    switch (name) {
      case "kite":
        return new KiteActivity({
          engine,
          character: location.character,
          // Bộ số đã cộng kỹ năng của Sổ hồi ký — đọc lúc DỰNG ván, nên kỹ
          // năng mở giữa chừng chỉ có tác dụng từ ván sau. Đổi số giữa ván là
          // cách chắc chắn nhất để người chơi thấy dây dài ra dưới tay mình.
          // Bãi diều trên đồi có gió riêng (mạnh và đều hơn) — đè lên bộ số đã
          // cộng kỹ năng, nên Dây dài vẫn có tác dụng trên đồi.
          tuning: { ...kiteTuning(progress.journal.skills), ...spot.payload?.kite?.wind },
          tailColor: dressFor(progress.journal.wearing).tail,
          readInput: () => this.input?.kiteInput() ?? { reel: 0, steer: 0 },
          readViewToggle: () => this.input?.consumeCameraToggle() ?? false,
          readExit: () => this.input?.consumeExit() ?? false,
          camera: (shot) => this.rig?.setShot(shot),
          forward: spot.payload?.kite?.forward ?? location.kiteForward ?? { x: 1, z: 0 },
        });

      case "swim": {
        const pond = location.pond;

        // Bối cảnh không có ao thì không có ván bơi: bỏ qua còn hơn dựng một
        // cái ao ma ở gốc toạ độ.
        if (!pond) return undefined;

        return new SwimActivity({
          engine,
          character: location.character,
          tuning: swimTuning(progress.journal.skills),
          pond,
          // Bờ chính là chỗ người chơi đang đứng khi bấm E.
          entry: { x: spot.x, z: spot.z },
          readInput: () => this.input?.swimInput() ?? { forward: 0, turn: 0 },
          readExit: () => this.input?.consumeExit() ?? false,
        });
      }

      case "shuttlecock":
        return new ShuttlecockActivity({
          engine,
          character: location.character,
          tuning: shuttleTuning(progress.journal.skills),
          spot: { x: spot.x, z: spot.z },
          partner: location.friend,
          readKick: () => this.takeInteract(),
          readExit: () => this.input?.consumeExit() ?? false,
        });
    }
  }

  /**
   * Ghi một ván vừa xong vào Sổ hồi ký.
   *
   * Gọi đúng MỘT chỗ cho cả ba ván: nếu mỗi ván con tự ghi lấy thì thêm trò
   * thứ tư là thêm một chỗ nữa để quên, và kỷ lục sẽ có bốn định nghĩa khác
   * nhau. Ván nào không khai `summary()` thì không có gì được ghi.
   */
  private recordRun(activity: RunningActivity) {
    const summary = activity.summary?.();

    if (summary && progress.record(summary).secrets?.length) playSfx("chime");
  }

  /** Cú bấm E đang chờ của ván con — đọc xong là hết. */
  private takeInteract(): boolean {
    const pressed = this.interactPressed;

    this.interactPressed = false;

    return pressed;
  }

  /** Bật/tắt con diều nằm chờ trong sân — xem `LocationRuntime.kite`. */
  /**
   * Bảng trợ giúp — chỉ mở khi người chơi đang cầm lái: giữa ván diều thì
   * bảng điều khiển của ván đã nói đủ, và hai lớp chữ chồng nhau chỉ che trời.
   */
  private async showHelp() {
    if (this.helpOpen || !this.controlsEnabled || this.activity) return;

    this.helpOpen = true;
    this.setControls(false);

    try {
      await readLines(HELP_LINES);
    } finally {
      this.helpOpen = false;
      this.setControls(true);
    }
  }

  /**
   * Đi khám phá: bước qua kỷ vật là nhặt, đặt chân tới nơi mới là bản đồ hiện
   * thêm một chỗ. Không bấm gì — đi là đủ.
   */
  private watchExploration() {
    const location = this.location;

    if (!location) return;

    const { x, z } = location.character.position;
    const journal = progress.journal;
    const found = keepsakeWithin(KEEPSAKE_LIST, x, z, journal.keepsakes);

    if (found && progress.keepsake(found)) {
      location.hideKeepsake?.(found);
      playSfx("chime");
    }

    const place = placeAt(x, z, journal.visited);

    if (place) progress.visit(place.id, place.label);
  }

  /**
   * Hai nhiệm vụ ẩn sống ngoài ván chơi (GDD §3.4). Không có bảng nào nhắc —
   * chỉ lặng lẽ đếm, đủ thì Sổ có thêm một dòng.
   */
  private watchSecrets(dt: number, elapsed: number) {
    const location = this.location;

    if (!location) return;

    // Một phút không làm gì: ngồi yên VÀ ẩn hết giao diện.
    this.quietFor = this.seated && !this.standing && this.scenic ? this.quietFor + dt : 0;

    if (this.quietFor >= QUIET_SECONDS && progress.secret("quiet-minute")) playSfx("chime");

    // Khách không mời: hù chim bay, đi khỏi đó, rồi quay lại sau một phút.
    // Xét lần hù CŨ trước: quay lại là hù con chim vừa đậu về, và lần hù mới
    // đó không được xoá mất chuyến quay lại.
    const scare = this.scare;
    const here = location.character.position;

    if (scare) {
      const away = Math.hypot(here.x - scare.x, here.z - scare.z);

      if (away > 8) scare.left = true;

      if (scare.left && away < 2.5 && elapsed - scare.at >= UNINVITED_SECONDS) {
        if (progress.secret("uninvited")) playSfx("chime");

        this.scare = undefined;
      }
    }

    const latest = location.lastScare?.();

    if (latest && latest.at !== scare?.at && !this.scare?.left) {
      this.scare = { ...latest, left: false };
    }
  }

  private updateFootsteps() {
    const location = this.location;

    if (!location) return;

    const moving = location.character.speed > 0.4 && this.controlsEnabled;
    const position = location.character.position;
    const slot = location.footstepSlot(position.x, position.z);

    // Bước qua ngưỡng cửa: đổi tiếng ngay, không đợi dừng chân.
    if (this.footsteps && (!moving || slot !== this.footstepSlot)) {
      this.footsteps.stop();
      this.footsteps = undefined;
    }

    if (moving && !this.footsteps) {
      this.footstepSlot = slot;
      this.footsteps = this.audio.playAt(slot, position, {
        volume: slot === "footsteps" ? 0.1 : 0.15,
        loop: true,
        id: "steps",
      });
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
