import * as THREE from "three";

import { createShuttlecock } from "./Shuttlecock";
import {
  createShuttleState,
  stepShuttle,
  DEFAULT_SHUTTLE,
} from "./model";
import { gameEvents } from "../../../events";
import { terrainHeight } from "../../terrain/heightfield";
import { easeInOutSine, easeOutCubic } from "../../Tween";

import type { PlayHudPayload } from "../../../events";
import type { Engine } from "../../Engine";
import type { AvatarRig } from "../../character/avatar";
import type { Character } from "../../character/Character";
import type { KickGrade, ShuttleState, ShuttleTuning } from "./model";
import type { SessionReport } from "../index";

/**
 * Ván đá cầu — trò chơi dân gian, và là trò chơi con DUY NHÁT giữ nguyên
 * quyền đi lại cho người chơi.
 *
 * Cả ván là một cuộc chạy: cầu bị đẩy lệch sau mỗi cú đá, nên người chơi
 * phải chạy tới chỗ nó rơi rồi bấm E đúng lúc cầu ở ngang tầm chân. Vì thế
 * `WorldGame` KHÔNG khoá input và KHÔNG tự lái nhân vật trong ván này —
 * vòng lặp chính vẫn chạy y như đang đi dạo, chỉ khác là cú bấm E thuộc về
 * ván (đá) chứ không phải đồ vật.
 *
 * Ván không có thua cuộc: cầu rơi là lượt kết thúc, kỷ lục lưu lại, và cú
 * bấm E kế tiếp là tung lượt mới. `R` thoát ra sân lúc nào cũng được.
 */

/** Thời gian diễn vung chân (giây): nhấc nhanh, giữ lúc chạm cầu, hạ êm. */
const KICK_SECONDS = 0.5;

/** Tốc độ vào/ra dáng thủ thế chờ cầu (1/giây). */
const STANCE_RATE = 6;

/** Chữ chấm cú đá trên bảng — người chơi học bằng mắt, không bằng thanh đo. */
const GRADE_WORD: Record<KickGrade, string> = {
  perfect: "Hoàn hảo!",
  good: "Tốt",
  miss: "Hụt",
};

/** Thời gian tối thiểu đẩy số liệu ra bảng (giây). */
const PUBLISH_INTERVAL = 0.1;

export interface ShuttlecockActivityOptions {
  engine: Engine;
  character: Character;
  /** Chỗ cầu nằm chờ — cũng là tâm của điểm tương tác */
  spot: { x: number; z: number };
  /** Cú bấm đá trong frame này (phím E, đã qua hàng đợi một-lần) */
  readKick: () => boolean;
  /** Phím thoát ván vừa được bấm chưa (đọc xong là xoá) */
  readExit: () => boolean;
  /**
   * Bộ số của ván — mặc định là `DEFAULT_SHUTTLE`. Sổ hồi ký đưa vào đây bộ
   * số đã cộng kỹ năng, nhưng lớp này không biết gì về tiến trình.
   */
  tuning?: ShuttleTuning;
  /** Người bạn đá cùng (xem luật trong `model.ts`) — mượn của sân, không sở hữu */
  partner?: Character;
}

const IDLE = { forward: 0, right: 0, run: false };

export class ShuttlecockActivity {
  /** Ván này người chơi vẫn đi lại được — `WorldGame` đọc cờ này. */
  readonly freeMove = true;

  /** Ván lái người bạn — `WorldGame` thôi cho bạn đứng chơi trong lúc này. */
  readonly drivesFriend = true;

  /** Chỗ bạn đứng lúc vào ván — đá xong một quả thì bạn về đây. */
  private readonly home: { x: number; z: number } | undefined;

  private readonly options: ShuttlecockActivityOptions;

  private readonly tuning: ShuttleTuning;

  private readonly field = createShuttlecock();

  private state: ShuttleState;

  /** Vung chân của người chơi / của bạn — xem `KickPose`. */
  private readonly playerKick: KickPose = { timer: -1, side: 1, twist: 0, stance: 0 };

  private readonly friendKick: KickPose = { timer: -1, side: 1, twist: 0, stance: 0 };

  /** Chỗ cầu trên thế giới — đầu hai đứa ngoái theo (giữ tham chiếu). */
  private readonly shuttleAt = new THREE.Vector3();

  /** Người bạn đá cùng — chỉ sống trong ván. */
  private readonly friend: Character | undefined;

  private grade: KickGrade | undefined;

  private sincePublish = 0;

  /** Số cú của lượt vừa kết thúc — bộ nhớ frame để báo thành tích. */
  private comboSnapshot = 0;

  private detach: (() => void) | undefined;

  private resolve: (() => void) | undefined;

  private finished = false;

  constructor(options: ShuttlecockActivityOptions) {
    this.options = options;

    this.tuning = options.tuning ?? DEFAULT_SHUTTLE;

    this.state = createShuttleState(options.spot.x, options.spot.z);

    this.friend = options.partner;
    this.home = options.partner && { x: options.partner.position.x, z: options.partner.position.z };
  }

  /**
   * Tóm tắt ván vừa xong cho Sổ hồi ký: kỷ lục của trò này là số cú liên tiếp
   * nhiều nhất trong một lượt, đúng con số đang in trên bảng.
   */
  readonly summary = (): SessionReport => ({
    name: "shuttlecock",
    score: this.state.best,
    thermals: 0,
  });

  /** Thêm cầu vào scene và chạy tới khi người chơi bấm thoát. */
  play(): Promise<void> {
    const { engine } = this.options;

    engine.scene.add(this.field.group);

    this.publish(true);

    this.detach = engine.onUpdate(({ dt, elapsed }) => this.tick(dt, elapsed));

    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  /** Dỡ cầu khỏi scene. Gọi được nhiều lần. */
  dispose() {
    // Dỡ giữa chừng (HMR, app unmount) vẫn phải TRẢ KẾT QUẢ — xem chú thích
    // tương tự trong `SwimActivity`.
    if (!this.finished) this.finish();

    this.detach?.();
    this.detach = undefined;

    // Dỡ giữa chừng khi chân đang còn giơ — không trả lại thì nhân vật đứng
    // xổng một chân cho tới frame `animate()` kế tiếp.
    this.releasePose();
    this.options.character.setGaze(undefined);
    this.friend?.setGaze(undefined);

    this.options.engine.scene.remove(this.field.group);

    this.field.dispose();

  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private tick(dt: number, elapsed: number) {
    if (this.options.readExit()) {
      this.finish();

      return;
    }

    this.comboSnapshot = this.state.combo;

    const { character } = this.options;

    this.state = stepShuttle(
      this.state,
      { x: character.position.x, z: character.position.z },
      { kick: this.options.readKick() },
      dt,
      this.tuning,
      this.friend?.position,
    );

    // Bấm hụt cũng vung chân — thấy mình đá vào không khí mới hiểu vì sao khựng.
    if (this.state.justKicked || this.state.grade === "miss") startKick(this.playerKick, character, this.state);
    if (this.state.friendKicked && this.friend) startKick(this.friendKick, this.friend, this.state);
    if (this.state.grade) this.grade = this.state.grade;

    this.moveFriend(dt, elapsed);
    if (this.state.justLanded && this.comboSnapshot > 0) {
      gameEvents.emit("notice", {
        text: `Đá được ${this.comboSnapshot} cú liên tiếp!`,
        hold: 2200,
      });
    }

    this.render(dt);

    this.sincePublish += dt;
    this.publish(false);
  }

  private render(dt: number) {
    const state = this.state;

    // Cầu nghiêng theo hướng đi ngang — đang bay chứ không phải đang trượt.
    const leanX = THREE.MathUtils.clamp(state.vz * 0.12, -0.5, 0.5);
    const leanZ = THREE.MathUtils.clamp(-state.vx * 0.12, -0.5, 0.5);

    this.field.place(state.x, state.y, state.z, leanX, leanZ, (4 + state.vy) * dt);

    // Cầu đang bay thì hai đứa dõi mắt theo và thủ thế chờ; nằm đất thì thôi.
    const airborne = state.phase === "rally";

    this.shuttleAt.set(state.x, terrainHeight(state.x, state.z) + state.y, state.z);
    this.options.character.setGaze(airborne ? this.shuttleAt : undefined);
    this.friend?.setGaze(airborne ? this.shuttleAt : undefined);

    animateKick(this.options.character.rig, this.playerKick, airborne, dt);

    if (this.friend) animateKick(this.friend.rig, this.friendKick, airborne, dt);
  }

  /**
   * Bạn đá cùng — một máy trạng thái hai ô: cầu đang bay SANG mình thì chạy
   * tới chỗ cầu sắp rơi; còn lại thì về chỗ đứng. Lái bằng đúng `Character`
   * như người chơi (camera yaw 0: "tới" là −Z, "phải" là +X).
   */
  private moveFriend(dt: number, elapsed: number) {
    const friend = this.friend;
    const home = this.home;

    if (!friend || !home) return;

    const coming = this.state.phase === "rally" && this.state.by === "player";
    const goal = coming ? { x: this.state.targetX, z: this.state.targetZ } : home;
    const dx = goal.x - friend.position.x;
    const dz = goal.z - friend.position.z;
    const distance = Math.hypot(dx, dz);

    const input =
      distance < 0.15
        ? IDLE
        : { forward: -dz / distance, right: dx / distance, run: coming && distance > 0.8 };

    friend.update(input, 0, dt, elapsed);
  }

  /** Trả các khớp về 0 — gọi khi dỡ ván giữa chừng lúc chân còn đang giơ. */
  private releasePose() {
    releaseKick(this.options.character.rig);
  }

  // ── Bảng số liệu ─────────────────────────────────────────────────────────

  private publish(force: boolean) {
    if (!force && this.sincePublish < PUBLISH_INTERVAL) return;

    this.sincePublish = 0;

    const stats: PlayHudPayload["stats"] = [
      { label: "Liên tiếp", value: `${this.state.combo}` },
      { label: "Kỷ lục", value: `${this.state.best}` },
    ];

    if (this.grade) stats.push({ label: "Cú đá", value: GRADE_WORD[this.grade] });

    gameEvents.emit("play", {
      visible: !this.finished,
      title: "Đá cầu",
      stats,
      hint:
        this.state.phase === "ready"
          ? this.state.best > 0
            ? "Chạy tới chỗ cầu nằm, bấm E để tung lượt mới · R để ra chơi trò khác"
            : "Đứng gần chiếc cầu rồi bấm E để tung lên"
          : this.friend
            ? "Chờ cầu rơi xuống ngang gối rồi bấm E · bấm hụt là khựng chân một nhịp · R để kết thúc"
            : "Chờ cầu rơi xuống ngang gối rồi bấm E · bấm hụt là khựng chân · R để kết thúc",
    });
  }

  // ── Kết thúc ─────────────────────────────────────────────────────────────

  private finish() {
    if (this.finished) return;

    this.finished = true;

    this.detach?.();
    this.detach = undefined;

    gameEvents.emit("play", { visible: false, title: "Đá cầu", stats: [] });

    if (this.state.best > 0) {
      gameEvents.emit("notice", {
        text: `Kỷ lục hôm nay: ${this.state.best} cú liên tiếp`,
        hold: 2200,
      });
    }

    this.resolve?.();
    this.resolve = undefined;
  }
}

/**
 * Một người đang đá: đồng hồ vung chân (giây, âm là không vung), chân nào
 * (−1 = chân bên −X của hình, +1 = bên +X), thân xoay về phía cầu bao nhiêu,
 * và trọng số dáng thủ thế chờ cầu.
 */
export interface KickPose {
  timer: number;
  side: number;
  twist: number;
  stance: number;
}

/** Bắt đầu một cú vung: chọn chân phía gần cầu, và góc xoay thân về phía nó. */
function startKick(pose: KickPose, who: Character, state: ShuttleState) {
  const yaw = who.root.rotation.y;
  const dx = state.x - who.position.x;
  const dz = state.z - who.position.z;
  // Toạ độ cầu trong khung người: trục X của hình là (cos yaw, −sin yaw).
  const across = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const ahead = dx * Math.sin(yaw) + dz * Math.cos(yaw);

  pose.timer = 0;
  pose.side = across < 0 ? -1 : 1;
  pose.twist = THREE.MathUtils.clamp(Math.atan2(across, Math.max(0.2, ahead)), -0.6, 0.6);
}

/**
 * Diễn đá cầu bằng má trong bàn chân — kiểu đá cầu sân làng: đùi nhấc ra
 * trước và mở sang ngang, gối gập cho cẳng chân vắt vào trong, lòng bàn chân
 * ngửa lên đỡ cầu. Chân trụ khuỵu nhẹ, hai tay dang giữ thăng bằng, thân ngả
 * về phía chân trụ và xoay về phía cầu.
 *
 * Lớp dáng đi của nhân vật chạy MỖI frame, nên cú đá ghi đè SAU đó (thứ tự
 * đăng ký listener bảo đảm điều này). Các khớp lớp dáng đi không viết (xoay
 * Y/Z của hông, Z của vai) thì trả về dáng gốc khi xong.
 */
export function animateKick(rig: AvatarRig, pose: KickPose, airborne: boolean, dt: number) {
  const kicking = pose.timer >= 0;

  // Thủ thế: chỉ khi cầu đang bay và không đang vung.
  const stanceGoal = airborne && !kicking ? 1 : 0;

  pose.stance += (stanceGoal - pose.stance) * Math.min(1, dt * STANCE_RATE);

  if (!kicking) {
    standReady(rig, pose.stance);

    return;
  }

  pose.timer += dt;

  const progress = pose.timer / KICK_SECONDS;

  if (progress >= 1) {
    pose.timer = -1;
    releaseKick(rig);
    standReady(rig, pose.stance);

    return;
  }

  // Nhấc nhanh (0–25 %), giữ lúc chạm cầu (25–40 %), hạ êm (40–100 %).
  const lift =
    progress < 0.25
      ? easeOutCubic(progress / 0.25)
      : progress < 0.4
        ? 1
        : 1 - easeInOutSine((progress - 0.4) / 0.6);
  // Chân trụ khuỵu trước khi chân đá lên tới đỉnh, đứng thẳng lại sau cùng.
  const crouch = Math.sin(Math.PI * Math.min(1, progress * 1.4));
  const side = pose.side;
  const [hip, knee] = side < 0 ? [rig.legL, rig.kneeL] : [rig.legR, rig.kneeR];
  const [standHip, standKnee] = side < 0 ? [rig.legR, rig.kneeR] : [rig.legL, rig.kneeL];

  // Thứ tự ZXY: xoay đùi quanh trục của nó (đầu gối mở ra ngoài) TRƯỚC, rồi
  // mới nhấc ra trước và mở sang ngang — gối gập khi ấy đưa cẳng chân vắt
  // vào trong, lòng bàn chân ngửa lên. Thứ tự XYZ mặc định thì đùi bị kéo ra sau.
  hip.rotation.order = "ZXY";
  hip.rotation.set(-1.0 * lift, side * 0.9 * lift, side * 0.35 * lift);
  knee.rotation.x = 1.3 * lift;

  standHip.rotation.set(-0.22 * crouch, 0, -side * 0.06 * crouch);
  standKnee.rotation.x = 0.45 * crouch;

  // Hạ hông theo chân trụ khuỵu, rồi bật nhẹ lên lúc chạm cầu.
  rig.root.position.y = -0.05 * crouch + 0.025 * lift * (1 - crouch);

  rig.body.rotation.set(-0.1 * lift + 0.08 * crouch, pose.twist * lift, -side * 0.14 * lift);

  // Hai tay dang ra, tay phía chân đá vung ra sau một chút để cân người.
  const spread = 0.16 + 0.6 * lift;

  rig.armL.rotation.set(side < 0 ? 0.35 * lift : -0.3 * lift, 0, -spread);
  rig.armR.rotation.set(side > 0 ? 0.35 * lift : -0.3 * lift, 0, spread);
  rig.elbowL.rotation.x = -0.45 * lift;
  rig.elbowR.rotation.x = -0.45 * lift;
}

/**
 * Dáng chờ cầu: gối chùng, hông hơi gập, hai tay hé ra. Ghi bằng phép lấy
 * cực trị (không cộng dồn) để frame nào lớp dáng đi không chạy thì cũng
 * không trôi khớp.
 */
function standReady(rig: AvatarRig, weight: number) {
  if (weight < 1e-3) return;

  for (const knee of [rig.kneeL, rig.kneeR]) knee.rotation.x = Math.max(knee.rotation.x, 0.28 * weight);

  rig.root.position.y = Math.min(rig.root.position.y, -0.025 * weight);
  rig.body.rotation.x = Math.max(rig.body.rotation.x, 0.08 * weight);
  rig.armL.rotation.z = -(0.16 + 0.22 * weight);
  rig.armR.rotation.z = 0.16 + 0.22 * weight;
}

/** Trả mọi khớp cú đá đã chạm về dáng gốc của hình (vai hé 0,16 như `createAvatar`). */
function releaseKick(rig: AvatarRig) {
  for (const joint of [rig.legL, rig.legR, rig.body]) joint.rotation.set(0, 0, 0, "XYZ");

  rig.kneeL.rotation.x = 0;
  rig.kneeR.rotation.x = 0;
  rig.elbowL.rotation.x = 0;
  rig.elbowR.rotation.x = 0;
  rig.armL.rotation.set(0, 0, -0.16);
  rig.armR.rotation.set(0, 0, 0.16);
  rig.root.position.y = 0;
}
