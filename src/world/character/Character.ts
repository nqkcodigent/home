import * as THREE from "three";

import { createAvatar } from "./avatar";
import { disposeObject } from "../world/dispose";
import {
  createMotionState,
  damp,
  dampAngle,
  shortestAngle,
  stepMotion,
  DEFAULT_MOTION,
} from "./motion";
import { resolveCollisions } from "../physics/collide";
import { terrainHeight } from "../terrain/heightfield";

import type { AvatarLook, AvatarRig, AvatarVariant } from "./avatar";
import type { MotionInput, MotionState, MotionTuning } from "./motion";
import type { Bounds, Obstacle } from "../physics/collide";

/**
 * Character — người chơi (và các nhân vật phụ) trong thế giới 3D.
 *
 * Ba việc, tách hẳn nhau:
 *  1. Động học: `stepMotion()` lo (thuần), lớp này chỉ áp kết quả.
 *  2. Va chạm + bám nền: đẩy khỏi vật thể, đặt `y` theo `groundHeight` — mặt
 *     đất ngoài sân, mặt sàn trong nhà.
 *  3. Hình thể: tay/chân/thân theo `gaitPhase`, người đứng thì thở, và một
 *     lớp hành động (`perform`) blend chồng lên mọi dáng: với tay mở cửa, kéo
 *     dây thu diều.
 *
 * ── Vì sao lớp hình thể viết lại ───────────────────────────────────────────
 * Bản trước trộn mọi thứ vào một `walkBlend` và làm mượt bằng
 * `blend += (target - blend) * dt * 9`. Hệ quả: máy 144 fps có dáng đi nhanh
 * gấp rưỡi máy 60 fps, và "chạy" chỉ là "đi nhanh hơn" chứ không phải một dáng
 * khác. Nay có ba trọng số riêng (`walk`, `run`, `lean`) đều đi qua `damp()`
 * (hàm mũ, độc lập tần số khung hình), thêm khớp khuỷu/gối, phản xoay hông,
 * nghiêng người khi rẽ, và mắt chớp.
 */

export interface CharacterOptions {
  variant: AvatarVariant;
  x: number;
  z: number;
  yaw?: number;
  obstacles?: readonly Obstacle[];
  bounds?: Bounds;
  /** Bán kính va chạm (mét) */
  radius?: number;
  /** Hệ số nhân độ cao — để hạ nhân vật xuống nếu cần */
  heightOffset?: number;
  /** Trang phục đè lên dáng mặc định (xem `dress()`) */
  look?: Partial<AvatarLook>;
  /**
   * Độ cao mặt nền tại (x, z). Mặc định là `terrainHeight`; thế giới có nhà
   * thì truyền hàm biết cả mặt sàn — nếu không chân sẽ lún xuống sàn nhà.
   */
  groundHeight?: (x: number, z: number) => number;
  /** Bộ số đi/chạy — mặc định `DEFAULT_MOTION`; kỹ năng đi bộ đưa bản nới vào */
  motion?: MotionTuning;
}

/** Chỗ ngồi — toạ độ thế giới; `height` là độ cao MẶT GHẾ (mét). */
export interface Seat {
  x: number;
  z: number;
  /** Hướng mặt khi ngồi */
  yaw: number;
  height: number;
}

interface SeatState extends Seat {
  phase: "approach" | "seated" | "leaving";
  /** Giải quyết khi đã ngồi xuống (approach) hoặc đã đứng hẳn dậy (leaving) */
  resolve?: () => void;
}

/** Hành động chồng lên dáng đi — xem `perform()`. */
export type CharacterAction = "reach" | "reel";

interface ActiveAction {
  kind: CharacterAction;
  elapsed: number;
  duration: number;
  contactAt: number;
  onContact?: () => void;
  resolve: () => void;
}

/** Trạng thái hình thể — tách khỏi `MotionState` (động học) để hai thứ không
 *  trộn vào nhau: `MotionState` là "ở đâu, đi hướng nào", còn đây là "đang diễn
 *  dáng gì". */
interface CharacterAnim {
  /** Trọng số dáng đi (0 đứng yên … 1 sải bước) */
  walk: number;
  /** Trọng số dáng chạy, chồng lên dáng đi */
  run: number;
  /** Độ nghiêng người khi đang rẽ */
  lean: number;
  /** Đồng hồ tới lần chớp mắt kế tiếp (giây) */
  blinkIn: number;
  /** Tiến độ một lần chớp mắt: 1 → 0 */
  blink: number;
  /** Số lần đã chớp — nguồn cho khoảng nghỉ tất định */
  blinks: number;
  /** Yaw frame trước, để suy ra tốc độ rẽ */
  lastYaw: number;
  /** Trọng số lớp hành động (0 … 1), blend vào/ra như dáng đi */
  act: number;
  /** Hành động gần nhất — vẫn giữ tư thế của nó trong lúc blend ra */
  actKind: CharacterAction;
  /** Tiến độ 0 … 1 của hành động gần nhất */
  actProgress: number;
  /** Trọng số dáng ngồi (0 đứng … 1 ngồi hẳn) */
  sit: number;
  /** Trọng số dáng chống tay vào vật cản (0 … 1) */
  press: number;
  /** Trọng số + góc đã làm mượt của ánh nhìn (xem `setGaze`) */
  gaze: number;
  gazeYaw: number;
  gazePitch: number;
}

/** Tốc độ blend vào/ra của lớp hành động (1/giây). */
const ACT_IN = 12;
const ACT_OUT = 7;

/** Tốc độ ngồi xuống / đứng dậy (1/giây) — đủ chậm để thấy rõ người hạ xuống. */
const SIT_RATE = 4.2;

/** Hông nhấc thêm ngần này trên mặt ghế để đùi nằm TRÊN ghế, không xuyên. */
const SIT_LIFT = 0.07;

/** Tốc độ chân bám theo bậc nền — đủ nhanh để không trôi, đủ êm để lên bậc. */
const FOOT_RATE = 22;

/** Một lần chớp mắt kéo dài bao lâu (giây) và mắt khép hờ tới đâu. */
const BLINK_SECONDS = 0.16;
const EYE_SHUT = 0.08;

/** Nhỏ hơn ngưỡng này thì coi như đứng yên. */
const MOVING_SPEED = 0.06;

export class Character {
  readonly root = new THREE.Group();

  /** Hình nhân vật — đổi được bằng `dress()`, nên đừng giữ tham chiếu lâu. */
  rig: AvatarRig;

  protected readonly options: Required<
    Pick<CharacterOptions, "radius" | "heightOffset">
  > &
    CharacterOptions;

  protected state: MotionState;

  private groundSpeed = 0;

  private obstacles: readonly Obstacle[];

  private bounds: Bounds | undefined;

  private readonly anim: CharacterAnim;

  private action: ActiveAction | undefined;

  private readonly ground: (x: number, z: number) => number;

  /** Độ cao chân đã làm mượt — lên bậc thềm không giật cục. */
  private footY: number;

  /** Hướng cần quay về trong lúc làm hành động (xem `face()`). */
  private faceYaw: number | undefined;

  private seat: SeatState | undefined;

  private motion: MotionTuning;

  private gaze: { x: number; y: number; z: number } | undefined;

  constructor(options: CharacterOptions) {
    this.options = {
      radius: 0.36,
      heightOffset: 0,
      ...options,
    };

    this.obstacles = options.obstacles ?? [];
    this.bounds = options.bounds;
    this.ground = options.groundHeight ?? terrainHeight;
    this.motion = options.motion ?? DEFAULT_MOTION;
    this.footY = this.ground(options.x, options.z);

    this.rig = createAvatar(options.variant, options.look);

    this.state = createMotionState(options.x, options.z, options.yaw ?? 0);

    this.anim = {
      walk: 0,
      run: 0,
      lean: 0,
      // Lần chớp đầu tiên rơi vào khoảng 2,4–5,2 giây: vừa vào cảnh mà mắt đã
      // nháy ngay thì trông như lỗi.
      blinkIn: 2.4,
      blink: 0,
      blinks: 0,
      lastYaw: options.yaw ?? 0,
      act: 0,
      actKind: "reach",
      actProgress: 0,
      sit: 0,
      press: 0,
      gaze: 0,
      gazeYaw: 0,
      gazePitch: 0,
    };

    this.root.add(this.rig.root);
    this.root.position.set(options.x, this.footY + this.options.heightOffset, options.z);
    this.root.rotation.y = this.state.yaw;
  }

  /**
   * Thay trang phục: dựng lại hình nhân vật với dáng mới. Vị trí, hướng, đà
   * và mọi trọng số animation giữ nguyên — frame sau hình mới đã ở đúng tư
   * thế cũ, nên đổi đồ không làm nhân vật "giật".
   */
  dress(look: Partial<AvatarLook>) {
    const old = this.rig;

    this.rig = createAvatar(this.options.variant, look);
    this.rig.root.position.copy(old.root.position);
    this.root.remove(old.root);
    disposeObject(old.root);
    this.root.add(this.rig.root);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  /** Tốc độ thật trên mặt đất (m/s), đã trừ phần bị vật cản chặn. */
  get speed(): number {
    return this.groundSpeed;
  }

  setObstacles(obstacles: readonly Obstacle[], bounds?: Bounds) {
    this.obstacles = obstacles;
    this.bounds = bounds;
  }

  teleport(x: number, z: number, yaw?: number) {
    this.state = { ...this.state, x, z, speed: 0, yaw: yaw ?? this.state.yaw };
    this.anim.lastYaw = this.state.yaw;
    this.footY = this.ground(x, z);
    this.applyTransform(0);
  }

  /**
   * Ngoái đầu nhìn theo một điểm (con diều, món đồ trước mặt) — chỉ cái đầu,
   * thân vẫn đi đúng hướng. Giữ THAM CHIẾU: truyền một vector đang chạy là đầu
   * bám theo nó mỗi frame. `undefined` là thôi nhìn.
   */
  setGaze(point: { x: number; y: number; z: number } | undefined) {
    this.gaze = point;
  }

  /** Đổi bộ số đi/chạy (kỹ năng vừa mở) — có tác dụng từ frame sau. */
  setMotion(motion: MotionTuning) {
    this.motion = motion;
  }

  /** Dừng lại ngay — dùng khi điều khiển bị khoá giữa lúc đang chạy. */
  halt() {
    this.state = { ...this.state, speed: 0 };
  }

  /** Đang ngồi, đang đi tới ghế, hoặc đang đứng dậy. */
  get seated(): boolean {
    return this.seat !== undefined;
  }

  /**
   * Đi tới ghế rồi ngồi xuống. Trả promise khi đã tới ghế và bắt đầu ngồi.
   *
   * Không phải dịch chuyển tức thì: nhân vật BƯỚC tới bằng đúng dáng đi bộ,
   * quay người về hướng ghế, rồi hạ người xuống — như người thật ngồi xuống.
   */
  sit(seat: Seat): Promise<void> {
    this.seat?.resolve?.();

    return new Promise<void>((resolve) => {
      this.seat = { ...seat, phase: "approach", resolve };
    });
  }

  /** Đứng dậy khỏi ghế. Trả promise khi đã đứng hẳn và đi lại được. */
  standUp(): Promise<void> {
    const seat = this.seat;

    if (!seat) return Promise.resolve();

    seat.resolve?.();

    return new Promise<void>((resolve) => {
      seat.phase = "leaving";
      seat.resolve = resolve;
    });
  }

  /** Quay mặt về một điểm — xoay mượt trong lúc làm hành động kế tiếp. */
  face(x: number, z: number) {
    const dx = x - this.state.x;
    const dz = z - this.state.z;

    if (Math.hypot(dx, dz) > 1e-3) this.faceYaw = Math.atan2(dx, dz);
  }

  /** Đang làm dở một hành động (với tay, thu dây). */
  get busy(): boolean {
    return this.action !== undefined;
  }

  /**
   * Làm một hành động trong `seconds` giây, blend chồng lên dáng hiện tại.
   *
   * `onContact` chạy ở thời điểm `contactAt` (0 … 1) — lúc tay CHẠM tới đồ
   * vật — để cánh cửa bắt đầu mở đúng lúc bàn tay đẩy vào, không sớm hơn.
   * Hành động mới thay hành động cũ: hành động cũ vẫn được giải quyết, và
   * `onContact` của nó vẫn chạy nếu chưa kịp, để không đồ vật nào kẹt nửa vời.
   */
  perform(
    kind: CharacterAction,
    seconds: number,
    onContact?: () => void,
    contactAt = 0.5,
  ): Promise<void> {
    this.finishAction();

    return new Promise<void>((resolve) => {
      this.action = {
        kind,
        elapsed: 0,
        duration: Math.max(seconds, 1e-3),
        contactAt,
        onContact,
        resolve,
      };

      this.anim.actKind = kind;
      this.anim.actProgress = 0;
    });
  }

  update(input: MotionInput, cameraYaw: number, dt: number, elapsed: number) {
    if (this.seat) this.updateSeat(dt);
    else this.updateInput(input, cameraYaw, dt);
    this.updateAction(dt);
    this.animate(dt, elapsed);
  }

  private updateAction(dt: number) {
    const action = this.action;

    if (!action) return;

    action.elapsed += dt;

    if (this.faceYaw !== undefined) {
      this.state = { ...this.state, yaw: dampAngle(this.state.yaw, this.faceYaw, 10, dt) };
      this.root.rotation.y = this.state.yaw;
    }

    const progress = Math.min(action.elapsed / action.duration, 1);

    this.anim.actProgress = progress;

    if (progress >= action.contactAt && action.onContact) {
      const contact = action.onContact;

      action.onContact = undefined;
      contact();
    }

    if (progress >= 1) this.finishAction();
  }

  private finishAction() {
    const action = this.action;

    if (!action) return;

    this.action = undefined;
    this.faceYaw = undefined;
    action.onContact?.();
    action.resolve();
  }

  /** Đi tới ghế (bỏ qua va chạm — ghế nằm sát bàn), rồi ngồi, rồi đứng dậy. */
  private updateSeat(dt: number) {
    const seat = this.seat;

    if (!seat) return;

    if (seat.phase === "approach") {
      const dx = seat.x - this.state.x;
      const dz = seat.z - this.state.z;
      const distance = Math.hypot(dx, dz);
      const step = Math.min(distance, this.motion.walkSpeed * 0.8 * dt);

      // Còn xa thì nhìn về phía ghế mà đi; tới sát rồi thì xoay về hướng ngồi.
      const heading = distance > 0.25 ? Math.atan2(dx, dz) : seat.yaw;

      this.state = {
        x: this.state.x + (distance > 1e-6 ? (dx / distance) * step : 0),
        z: this.state.z + (distance > 1e-6 ? (dz / distance) * step : 0),
        yaw: dampAngle(this.state.yaw, heading, 9, dt),
        speed: dt > 0 ? step / dt : 0,
        gaitPhase: (this.state.gaitPhase + step * this.motion.stridesPerMetre) % 1,
      };

      const facing = Math.abs(shortestAngle(this.state.yaw, seat.yaw)) < 0.08;

      if (distance < 0.02 && facing) {
        this.state = { ...this.state, speed: 0 };
        seat.phase = "seated";

        const resolve = seat.resolve;

        seat.resolve = undefined;
        resolve?.();
      }
    } else {
      this.state = {
        ...this.state,
        speed: 0,
        yaw: dampAngle(this.state.yaw, seat.yaw, 9, dt),
      };

      if (seat.phase === "leaving" && this.anim.sit < 0.04) {
        this.seat = undefined;
        seat.resolve?.();
      }
    }

    this.applyTransform(dt);
  }

  private updateInput(input: MotionInput, cameraYaw: number, dt: number) {
    const step = stepMotion(this.state, input, cameraYaw, dt, DEFAULT_MOTION);

    const resolved = resolveCollisions(
      step.state.x,
      step.state.z,
      this.options.radius,
      this.obstacles,
      this.bounds,
    );

    // `state.speed` giữ tốc độ Ý ĐỊNH (để gia tốc không bị va chạm ăn mòn dần
    // mỗi frame); dáng chân đọc `groundSpeed` — quãng đường thật sau va chạm —
    // ở `applyTransform`, nên đâm thẳng vào tường thì đứng, chạm xiên thì trượt.
    this.state = { ...step.state, x: resolved.x, z: resolved.z };

    this.applyTransform(dt);
  }

  private applyTransform(dt: number) {
    const moved = Math.hypot(
      this.state.x - this.root.position.x,
      this.state.z - this.root.position.z,
    );

    this.groundSpeed = dt > 0 ? Math.min(moved / dt, this.state.speed) : 0;

    const ground = this.ground(this.state.x, this.state.z);

    this.footY = dt > 0 ? damp(this.footY, ground, FOOT_RATE, dt) : ground;

    this.root.position.set(
      this.state.x,
      this.footY + this.options.heightOffset,
      this.state.z,
    );

    this.root.rotation.y = this.state.yaw;
  }

  private animate(dt: number, elapsed: number) {
    const speed = this.groundSpeed;
    const moving = speed > MOVING_SPEED;

    // ── Ba trọng số dáng đi ────────────────────────────────────────────────
    // Vào dáng đi hơi nhanh hơn thoát ra: bắt đầu bước thì dứt khoát, dừng lại
    // thì từ từ — đúng như người thật.
    this.anim.walk = damp(this.anim.walk, moving ? 1 : 0, moving ? 13 : 8.5, dt);

    // Chạy chỉ bắt đầu khi đã vượt tốc độ đi bộ, và chuyển mượt trong khoảng
    // giữa hai tốc độ đó.
    const runFrom = this.motion.walkSpeed * 0.92;

    const runTarget = clamp01(
      (speed - runFrom) / (this.motion.runSpeed - runFrom),
    );

    this.anim.run = damp(this.anim.run, moving ? runTarget : 0, 7, dt);

    const blend = this.anim.walk;
    const run = this.anim.run;
    const idle = 1 - blend;

    const phase = this.state.gaitPhase * Math.PI * 2;
    const speedRatio = Math.min(speed / this.motion.runSpeed, 1);

    // ── Chân và gối ────────────────────────────────────────────────────────
    const stride = 0.42 + speedRatio * 0.6;
    const swing = Math.sin(phase) * stride * blend;

    this.rig.legL.rotation.x = swing;
    this.rig.legR.rotation.x = -swing;

    // Gối gập trong pha VUNG chân (bàn chân rời đất, đùi đưa về trước), duỗi
    // thẳng khi chống xuống. Đây là chi tiết khiến dáng đi có trọng lượng thay
    // vì chỉ lắc qua lắc lại như con lắc.
    const kneeGain = (0.34 + speedRatio * 0.56) * blend;

    this.rig.kneeL.rotation.x = Math.max(0, -Math.cos(phase)) * kneeGain;
    this.rig.kneeR.rotation.x = Math.max(0, Math.cos(phase)) * kneeGain;

    // ── Tay và khuỷu ───────────────────────────────────────────────────────
    // Tay vung ngược pha với chân cùng bên.
    this.rig.armL.rotation.x = -swing * 0.8;
    this.rig.armR.rotation.x = swing * 0.8;

    const bendBase = 0.13 + blend * 0.12 + run * 0.3;
    const idleSway = idle * Math.sin(elapsed * 1.3) * 0.05;

    this.rig.elbowL.rotation.x =
      -(bendBase + Math.max(0, swing) * 0.5) - idleSway;
    this.rig.elbowR.rotation.x =
      -(bendBase + Math.max(0, -swing) * 0.5) - idleSway;

    // ── Thân ───────────────────────────────────────────────────────────────
    // Hông phản xoay: vai và hông ngược pha với chân, thân không còn là khối cứng.
    const twist = -swing * 0.16;

    // Nghiêng vào cua: đo tốc độ quay đầu rồi làm mượt, nên cú rẽ gắt cũng
    // không làm nhân vật giật.
    const yawRate =
      shortestAngle(this.anim.lastYaw, this.state.yaw) / Math.max(dt, 1e-3);

    this.anim.lastYaw = this.state.yaw;

    this.anim.lean = damp(
      this.anim.lean,
      clamp(yawRate * 0.05, -0.18, 0.18) * blend,
      6,
      dt,
    );

    this.rig.body.rotation.y = twist;
    this.rig.body.rotation.z = Math.sin(phase) * 0.04 * blend + this.anim.lean;
    // Người hơi chúi về trước khi đi nhanh.
    this.rig.body.rotation.x = blend * (0.05 + run * 0.16) + idle * 0.01;
    // Nhịp thở khi đứng; khi chạy thì lồng ngực căng ra rất nhẹ.
    this.rig.body.scale.y =
      1 + idle * Math.sin(elapsed * 2.1) * 0.014 + run * 0.015;

    // Nhấp nhô: một nhịp lên xuống cho mỗi bước.
    this.rig.root.position.y =
      Math.abs(Math.sin(phase)) * (0.028 + speedRatio * 0.036) * blend;

    // ── Đầu ────────────────────────────────────────────────────────────────
    // Đứng yên thì ngó quanh; đang đi thì đầu ngược lại với thân để mắt vẫn
    // nhìn về phía trước.
    this.rig.head.rotation.y =
      idle * Math.sin(elapsed * 0.63) * 0.24 - twist * 0.5;
    this.rig.head.rotation.x =
      -blend * (0.05 + run * 0.05) + idle * Math.sin(elapsed * 1.7) * 0.02;
    this.rig.head.rotation.z = -this.rig.body.rotation.z * 0.6;

    // Đồ lủng lẳng (đuôi khăn, lọn tóc, móc khoá): rủ xuống khi đứng, bay ra
    // sau theo tốc độ và phần phật nhẹ — mỗi món lệch pha để không đồng loạt.
    this.rig.trailing.forEach((piece, index) => {
      const sway = piece.userData.sway as number;
      const flutter = elapsed * (4 + speedRatio * 9) + index * 1.7;

      piece.rotation.x =
        sway *
        (0.08 +
          speedRatio * 0.95 * blend +
          Math.sin(flutter) * (0.03 + speedRatio * 0.12) +
          idle * Math.sin(elapsed * 1.1 + index) * 0.03);
      piece.rotation.z = sway * Math.sin(elapsed * 2.3 + index) * 0.05 * (0.3 + speedRatio);
    });

    // ── Chống tay vào vật cản ──────────────────────────────────────────────
    // Muốn đi mà vật cản không cho đi: hai tay đưa ra chống, người chúi vào.
    // Sượt xiên thì gần như không (phần tốc độ mất ít), đâm thẳng thì rõ.
    const pressTarget = clamp01((this.state.speed - speed - 0.4) / 1.4);

    this.anim.press = damp(this.anim.press, pressTarget, pressTarget > this.anim.press ? 14 : 6, dt);

    const press = this.anim.press;

    if (press > 1e-3) {
      const mix = (from: number, to: number) => from + (to - from) * press;

      this.rig.armL.rotation.x = mix(this.rig.armL.rotation.x, -1.25);
      this.rig.armR.rotation.x = mix(this.rig.armR.rotation.x, -1.25);
      this.rig.elbowL.rotation.x = mix(this.rig.elbowL.rotation.x, -0.45);
      this.rig.elbowR.rotation.x = mix(this.rig.elbowR.rotation.x, -0.45);
      this.rig.body.rotation.x += press * 0.14;
      this.rig.head.rotation.x -= press * 0.1;
    }

    this.applySitPose(dt, elapsed);
    this.applyActionPose(dt, elapsed);
    this.applyGaze(dt);

    this.updateBlink(dt);
  }

  /** Đầu quay về điểm đang nhìn, kẹp trong tầm cổ người thật. */
  private applyGaze(dt: number) {
    const target = this.gaze;

    this.anim.gaze = damp(this.anim.gaze, target ? 1 : 0, target ? 5 : 3, dt);

    if (target) {
      const dx = target.x - this.state.x;
      const dz = target.z - this.state.z;
      const yaw = clamp(shortestAngle(this.state.yaw, Math.atan2(dx, dz)), -1.1, 1.1);
      const pitch = clamp(
        Math.atan2(target.y - (this.root.position.y + 1.1), Math.hypot(dx, dz)),
        -0.35,
        0.85,
      );

      this.anim.gazeYaw = damp(this.anim.gazeYaw, yaw, 6, dt);
      this.anim.gazePitch = damp(this.anim.gazePitch, pitch, 6, dt);
    }

    const weight = this.anim.gaze;

    if (weight < 1e-3) return;

    const head = this.rig.head.rotation;

    head.y += (this.anim.gazeYaw - head.y) * weight;
    // Ngẩng lên là xoay âm quanh X (xem dáng chạy: chúi tới là dương).
    head.x += (-this.anim.gazePitch * 0.8 - head.x) * weight;
  }

  /**
   * Dáng ngồi: hông hạ xuống mặt ghế, đùi gập ra trước, cẳng chân thõng
   * xuống, hai tay đặt lên đùi, đầu thong thả ngó ra cảnh. Blend bằng `damp()`
   * như mọi lớp khác, nên ngồi xuống và đứng dậy là chuyển động liên tục.
   */
  private applySitPose(dt: number, elapsed: number) {
    const seat = this.seat;
    const target = seat && seat.phase === "seated" ? 1 : 0;

    this.anim.sit = damp(this.anim.sit, target, SIT_RATE, dt);

    const weight = this.anim.sit;

    if (weight < 1e-3 || !seat) return;

    const rig = this.rig;
    const mix = (from: number, to: number) => from + (to - from) * weight;

    // Mặt ghế so với chân, trừ đi độ cao hông: rig hạ/nhấc đúng chừng đó.
    const hipY = rig.legL.position.y;
    const lift = seat.height - this.footY - hipY + SIT_LIFT;

    rig.root.position.y = mix(rig.root.position.y, lift);

    // Chân chibi ngắn hơn mặt ghế: cẳng chân chìa ra trước-xuống, buông thẳng
    // thì bàn chân nằm ngang mặt ghế, trông như quỳ. Chân dài (người cao)
    // thì buông thẳng xuống như người ngồi ghế thật.
    const kneeBend = lift < 0 ? 1.35 : 0.6;

    for (const [leg, knee] of [
      [rig.legL, rig.kneeL],
      [rig.legR, rig.kneeR],
    ] as const) {
      leg.rotation.x = mix(leg.rotation.x, -1.4);
      knee.rotation.x = mix(knee.rotation.x, kneeBend);
    }

    // Đung đưa chân, lệch pha hai bên — trẻ con ngồi ghế cao thì thế.
    const dangle = Math.sin(elapsed * 1.6) * 0.16 * weight;

    rig.kneeL.rotation.x += dangle;
    rig.kneeR.rotation.x -= dangle;

    rig.armL.rotation.x = mix(rig.armL.rotation.x, -0.55);
    rig.armR.rotation.x = mix(rig.armR.rotation.x, -0.55);
    rig.elbowL.rotation.x = mix(rig.elbowL.rotation.x, -0.75);
    rig.elbowR.rotation.x = mix(rig.elbowR.rotation.x, -0.75);

    rig.body.rotation.x = mix(rig.body.rotation.x, -0.06);
    rig.body.rotation.z = mix(rig.body.rotation.z, 0);
    rig.head.rotation.x = mix(rig.head.rotation.x, -0.12 + Math.sin(elapsed * 0.4) * 0.04);
    rig.head.rotation.y = mix(rig.head.rotation.y, Math.sin(elapsed * 0.27) * 0.32);
  }

  /**
   * Lớp hành động: kéo từng khớp từ dáng hiện tại (đứng/đi/chạy) về tư thế của
   * hành động theo trọng số `act`. Vì `act` đi qua `damp()` giống `walk`/`run`,
   * chuyển Idle → Walk → Interact và ngược lại đều là blend liên tục, không
   * có khung hình nào nhảy tư thế.
   */
  private applyActionPose(dt: number, elapsed: number) {
    const active = this.action !== undefined;

    this.anim.act = damp(this.anim.act, active ? 1 : 0, active ? ACT_IN : ACT_OUT, dt);

    const weight = this.anim.act;

    if (weight < 1e-3) return;

    const rig = this.rig;
    const t = this.anim.actProgress;
    const mix = (from: number, to: number) => from + (to - from) * weight;

    if (this.anim.actKind === "reach") {
      // Với tay phải ra trước, đẩy nhẹ ở giữa động tác rồi thu về.
      const push = Math.sin(Math.PI * t);

      rig.armR.rotation.x = mix(rig.armR.rotation.x, -1.05 - push * 0.35);
      rig.elbowR.rotation.x = mix(rig.elbowR.rotation.x, -0.55 + push * 0.4);
      rig.armL.rotation.x = mix(rig.armL.rotation.x, 0.12);
      rig.body.rotation.x = mix(rig.body.rotation.x, 0.05 + push * 0.08);
      rig.head.rotation.x = mix(rig.head.rotation.x, 0.08);
    } else {
      // Thu diều: hai tay ra trước, khuỷu gập, kéo dây tay nọ nối tay kia.
      const pull = Math.sin(elapsed * 10);

      rig.armL.rotation.x = mix(rig.armL.rotation.x, -0.95 + pull * 0.3);
      rig.armR.rotation.x = mix(rig.armR.rotation.x, -0.95 - pull * 0.3);
      rig.elbowL.rotation.x = mix(rig.elbowL.rotation.x, -1.05 - Math.max(0, pull) * 0.35);
      rig.elbowR.rotation.x = mix(rig.elbowR.rotation.x, -1.05 - Math.max(0, -pull) * 0.35);
      rig.body.rotation.x = mix(rig.body.rotation.x, -0.08);
      rig.head.rotation.x = mix(rig.head.rotation.x, -0.22);
    }
  }

  /**
   * Chớp mắt — nhỏ tới mức gần như không nhận ra, nhưng thiếu nó thì cái đầu
   * trông như tượng.
   */
  private updateBlink(dt: number) {
    this.anim.blinkIn -= dt;

    if (this.anim.blinkIn <= 0) {
      this.anim.blink = 1;
      this.anim.blinkIn = this.nextBlinkDelay();
    }

    this.anim.blink = Math.max(0, this.anim.blink - dt / BLINK_SECONDS);

    // 1 → 0 → 1: mắt khép dần ở giữa một lần chớp rồi mở ra, không nháy tức thì.
    const openness = this.anim.blink > 0 ? Math.abs(this.anim.blink * 2 - 1) : 1;

    for (const eye of this.rig.eyes) {
      eye.scale.y = EYE_SHUT + (1 - EYE_SHUT) * openness;
    }
  }

  /**
   * Khoảng nghỉ tới lần chớp mắt kế tiếp (giây).
   *
   * Dùng dãy tỉ lệ vàng thay vì `Math.random()`: mắt vẫn chớp so le như thật,
   * nhưng chuỗi là tất định nên test đếm được số lần chớp và một lỗi "mắt khép
   * mãi" không thể lọt qua.
   */
  private nextBlinkDelay(): number {
    this.anim.blinks += 1;

    const fraction = (this.anim.blinks * 0.6180339887) % 1;

    return 2.4 + fraction * 2.8;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}
