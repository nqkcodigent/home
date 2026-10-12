import * as THREE from "three";

import { createAvatar } from "./avatar";
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

import type { AvatarRig, AvatarVariant } from "./avatar";
import type { MotionInput, MotionState } from "./motion";
import type { Bounds, Obstacle } from "../physics/collide";

/**
 * Character — người chơi (và các nhân vật phụ) trong thế giới 3D.
 *
 * Ba việc, tách hẳn nhau:
 *  1. Động học: `stepMotion()` lo (thuần), lớp này chỉ áp kết quả.
 *  2. Va chạm + bám địa hình: đẩy khỏi vật thể, đặt `y` theo `terrainHeight`.
 *  3. Hình thể: tay/chân/thân theo `gaitPhase`, người đứng thì thở.
 *
 * Ngoài ra có hai chế độ chỉnh bởi nhịp truyện: `walkTo()` (đi theo kịch bản,
 * bỏ qua input) và `setOpacity()` (hiện dần khi "thức dậy").
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
}

interface ScriptedWalk {
  fromX: number;
  fromZ: number;
  toX: number;
  toZ: number;
  /** giây đã trôi qua */
  elapsed: number;
  /** tổng thời lượng, GIÂY */
  duration: number;
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
}

const ARRIVE_EPSILON = 0.02;

/** Một lần chớp mắt kéo dài bao lâu (giây) và mắt khép hờ tới đâu. */
const BLINK_SECONDS = 0.16;
const EYE_SHUT = 0.08;

/** Nhỏ hơn ngưỡng này thì coi như đứng yên. */
const MOVING_SPEED = 0.06;

export class Character {
  readonly root = new THREE.Group();

  readonly rig: AvatarRig;

  protected readonly options: Required<
    Pick<CharacterOptions, "radius" | "heightOffset">
  > &
    CharacterOptions;

  /** Nhịp đi hiện tại theo kịch bản, nếu có. */
  get scriptedWalk(): boolean {
    return this.script !== undefined;
  }

  protected state: MotionState;

  private obstacles: readonly Obstacle[];

  private bounds: Bounds | undefined;

  private readonly anim: CharacterAnim;

  private opacity = 1;

  private script: ScriptedWalk | undefined;

  constructor(options: CharacterOptions) {
    this.options = {
      radius: 0.36,
      heightOffset: 0,
      ...options,
    };

    this.obstacles = options.obstacles ?? [];
    this.bounds = options.bounds;

    this.rig = createAvatar(options.variant);

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
    };

    this.root.add(this.rig.root);
    this.root.position.set(options.x, terrainHeight(options.x, options.z), options.z);
    this.root.rotation.y = this.state.yaw;
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get speed(): number {
    return this.state.speed;
  }

  setObstacles(obstacles: readonly Obstacle[], bounds?: Bounds) {
    this.obstacles = obstacles;
    this.bounds = bounds;
  }

  setOpacity(value: number) {
    this.opacity = Math.min(1, Math.max(0, value));

    for (const material of this.rig.materials) {
      material.transparent = this.opacity < 1;
      material.opacity = this.opacity;
      // Trong suốt thì không nên ghi depth, nếu không sẽ thấy viền răng cưa.
      material.depthWrite = this.opacity >= 1;
    }

    this.root.visible = this.opacity > 0.01;
  }

  teleport(x: number, z: number, yaw?: number) {
    this.state = { ...this.state, x, z, speed: 0, yaw: yaw ?? this.state.yaw };
    this.anim.lastYaw = this.state.yaw;
    this.root.position.set(x, terrainHeight(x, z), z);
    this.root.rotation.y = this.state.yaw;
  }

  /** Dừng lại ngay — dùng khi nhịp `controls: false` cắt ngang lúc đang chạy. */
  halt() {
    this.state = { ...this.state, speed: 0 };
  }

  resume() {
    this.script = undefined;
  }

  /**
   * Đi theo kịch bản tới một điểm, hết `seconds` thì trả promise.
   *
   * Nhịp `walk` trong story.json kèm thời lượng, nên chuyển động được nội suy
   * theo thời lượng đó chứ không theo tốc độ — nhịp thơ mới khớp với lời thoại.
   *
   * ĐƠN VỊ LÀ GIÂY (khớp `dt` của vòng lặp frame); story.json dùng mili-giây,
   * nên bên gọi phải đổi. Trộn hai đơn vị ở đây từng làm một cú đi bộ 1,8 giây
   * biến thành 1.800 giây.
   */
  walkTo(x: number, z: number, seconds: number): Promise<void> {
    if (seconds <= 0) {
      this.teleport(x, z, this.state.yaw);

      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.script = {
        fromX: this.state.x,
        fromZ: this.state.z,
        toX: x,
        toZ: z,
        elapsed: 0,
        duration: seconds,
        resolve,
      };
    });
  }

  update(input: MotionInput, cameraYaw: number, dt: number, elapsed: number) {
    if (this.script) {
      this.updateScript(dt);
    } else {
      this.updateInput(input, cameraYaw, dt);
    }

    this.animate(dt, elapsed);
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

    // Vị trí lấy theo kết quả va chạm để không bị đẩy ngược lại vào vật thể.
    const blocked = resolved.x !== step.state.x || resolved.z !== step.state.z;

    this.state = {
      ...step.state,
      x: resolved.x,
      z: resolved.z,
      // Bị chặn thì mất tốc độ — nếu không, nhân vật "trượt" dọc tường như băng.
      speed: blocked ? step.state.speed * 0.4 : step.state.speed,
    };

    this.applyTransform();
  }

  private updateScript(dt: number) {
    const script = this.script;

    if (!script) return;

    script.elapsed += dt;

    const raw = Math.min(script.elapsed / script.duration, 1);
    // Vào và ra êm: người đi bộ không tăng tốc tức thì.
    const t = raw * raw * (3 - 2 * raw);

    const x = script.fromX + (script.toX - script.fromX) * t;
    const z = script.fromZ + (script.toZ - script.fromZ) * t;

    const dx = x - this.state.x;
    const dz = z - this.state.z;
    const distance = Math.hypot(dx, dz);

    const targetYaw = distance > 1e-4 ? Math.atan2(dx, dz) : this.state.yaw;

    this.state = {
      x,
      z,
      // Xoay theo hàm mũ thay vì `dt × 7`: cùng một cú quay cho mọi fps.
      yaw: dampAngle(this.state.yaw, targetYaw, 8, dt),
      speed: script.duration > 0 ? distance / dt : 0,
      gaitPhase: (this.state.gaitPhase + distance * DEFAULT_MOTION.stridesPerMetre) % 1,
    };

    this.applyTransform();

    if (raw >= 1 || Math.hypot(script.toX - x, script.toZ - z) <= ARRIVE_EPSILON) {
      this.script = undefined;
      this.state = { ...this.state, speed: 0 };
      script.resolve();
    }
  }

  private applyTransform() {
    this.root.position.set(
      this.state.x,
      terrainHeight(this.state.x, this.state.z) + this.options.heightOffset,
      this.state.z,
    );

    this.root.rotation.y = this.state.yaw;
  }

  private animate(dt: number, elapsed: number) {
    const speed = this.state.speed;
    const moving = speed > MOVING_SPEED;

    // ── Ba trọng số dáng đi ────────────────────────────────────────────────
    // Vào dáng đi hơi nhanh hơn thoát ra: bắt đầu bước thì dứt khoát, dừng lại
    // thì từ từ — đúng như người thật.
    this.anim.walk = damp(this.anim.walk, moving ? 1 : 0, moving ? 13 : 8.5, dt);

    // Chạy chỉ bắt đầu khi đã vượt tốc độ đi bộ, và chuyển mượt trong khoảng
    // giữa hai tốc độ đó.
    const runFrom = DEFAULT_MOTION.walkSpeed * 0.92;

    const runTarget = clamp01(
      (speed - runFrom) / (DEFAULT_MOTION.runSpeed - runFrom),
    );

    this.anim.run = damp(this.anim.run, moving ? runTarget : 0, 7, dt);

    const blend = this.anim.walk;
    const run = this.anim.run;
    const idle = 1 - blend;

    const phase = this.state.gaitPhase * Math.PI * 2;
    const speedRatio = Math.min(speed / DEFAULT_MOTION.runSpeed, 1);

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

    this.updateBlink(dt);
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
