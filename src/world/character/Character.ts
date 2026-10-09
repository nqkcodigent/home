import * as THREE from "three";

import { createAvatar } from "./avatar";
import { createMotionState, stepMotion, DEFAULT_MOTION } from "./motion";
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

const ARRIVE_EPSILON = 0.02;

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

  private walkBlend = 0;

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
      yaw: approachAngle(this.state.yaw, targetYaw, dt * 7),
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
    const moving = this.state.speed > 0.08;

    this.walkBlend += ((moving ? 1 : 0) - this.walkBlend) * Math.min(1, dt * 9);

    const blend = this.walkBlend;
    const phase = this.state.gaitPhase * Math.PI * 2;
    const speedRatio = Math.min(this.state.speed / DEFAULT_MOTION.runSpeed, 1);

    // Chân: hai pha ngược nhau. Tay vung ngược pha với chân cùng bên.
    const swing = Math.sin(phase) * (0.45 + speedRatio * 0.5) * blend;

    this.rig.legL.rotation.x = swing;
    this.rig.legR.rotation.x = -swing;
    this.rig.armL.rotation.x = -swing * 0.75;
    this.rig.armR.rotation.x = swing * 0.75;

    // Nhấp nhô: một nhịp lên xuống cho mỗi bước, cộng nhịp thở khi đứng yên.
    const bob = Math.abs(Math.sin(phase)) * 0.05 * blend;
    const breathe = (1 - blend) * Math.sin(elapsed * 2.1) * 0.012;

    this.rig.root.position.y = bob;
    this.rig.body.scale.y = 1 + breathe;

    // Người hơi chúi về trước khi đi nhanh.
    this.rig.body.rotation.x = blend * (0.05 + speedRatio * 0.09);

    // Đứng yên thì đầu hơi ngó quanh — chi tiết nhỏ nhưng làm nhân vật "sống".
    const idleLook = (1 - blend) * Math.sin(elapsed * 0.63) * 0.24;

    this.rig.head.rotation.y = idleLook;
    this.rig.head.rotation.x =
      -blend * 0.06 + (1 - blend) * Math.sin(elapsed * 1.7) * 0.02;
  }
}

function approachAngle(current: number, target: number, maxStep: number): number {
  const tau = Math.PI * 2;
  let delta = (target - current) % tau;

  if (delta > Math.PI) delta -= tau;
  if (delta <= -Math.PI) delta += tau;

  if (Math.abs(delta) <= maxStep) return target;

  return current + Math.sign(delta) * maxStep;
}
