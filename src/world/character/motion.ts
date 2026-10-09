/**
 * Chuyển động nhân vật — thuần số học, không đụng three.js.
 *
 * Tách khỏi `Character.ts` để kiểm thử được bằng số: mọi thứ dưới đây là
 * hàm của (trạng thái, input, dt). Nhân vật đi theo hướng CAMERA (giống
 * character-threejs: WASD luôn là "về phía trước màn hình"), xoay dần về
 * hướng đi thay vì bẻ ngoặt tức thì, và tích luỹ `gaitPhase` để lớp hình
 * thể biết đang ở pha nào của bước chân.
 */

export interface MotionInput {
  /** -1 (ra sau) … 1 (tới trước), theo hướng camera */
  forward: number;
  /** -1 (sang trái) … 1 (sang phải), theo hướng camera */
  right: number;
  /** Chạy nhanh (Shift) */
  run: boolean;
}

export interface MotionState {
  x: number;
  z: number;
  /** Hướng nhân vật đang quay (radian, 0 = nhìn về -Z) */
  yaw: number;
  /** Tốc độ hiện tại (mét/giây) */
  speed: number;
  /** Pha bước chân, tăng đều theo quãng đường đã đi (vòng 0…1) */
  gaitPhase: number;
}

export interface MotionTuning {
  walkSpeed: number;
  runSpeed: number;
  /** Gia tốc khi tăng tốc (m/s²) */
  acceleration: number;
  /** Giảm tốc khi nhả phím (m/s²) */
  damping: number;
  /** Tốc độ quay thân (radian/giây) */
  turnRate: number;
  /** Số bước chân trên mỗi mét */
  stridesPerMetre: number;
}

/**
 * Tinh chỉnh theo tỉ lệ chibi (cao ~1,35 m, chân ngắn). Đi bộ 2,2 m/s đã là
 * nhanh nhẹn; và 0,7 bước/m giữ nhịp chân rơi vào khoảng 3 bước/giây.
 */
export const DEFAULT_MOTION: MotionTuning = {
  walkSpeed: 2.2,
  runSpeed: 4.5,
  acceleration: 18,
  damping: 22,
  turnRate: 9.5,
  stridesPerMetre: 0.7,
};

export interface MotionStep {
  state: MotionState;
  /** Quãng đường đi được trong frame này (mét) */
  distance: number;
  /** true nếu frame này có ý định di chuyển */
  moving: boolean;
  /** Hướng đi mong muốn trên mặt phẳng XZ (đã chuẩn hoá, 0 nếu đứng yên) */
  directionX: number;
  directionZ: number;
}

export function createMotionState(
  x = 0,
  z = 0,
  yaw = 0,
): MotionState {
  return { x, z, yaw, speed: 0, gaitPhase: 0 };
}

/** Góc quay ngắn nhất từ `from` tới `to`, trong khoảng (-π, π]. */
export function shortestAngle(from: number, to: number): number {
  const tau = Math.PI * 2;
  let delta = (to - from) % tau;

  if (delta > Math.PI) delta -= tau;
  if (delta <= -Math.PI) delta += tau;

  return delta;
}

/**
 * Hướng đi mong muốn, quy về hệ toạ độ thế giới theo `cameraYaw`.
 *
 * Quy ước three.js: camera nhìn về -Z khi yaw = 0, nên "tới trước" là
 * (-sin yaw, -cos yaw) và "sang phải" là (cos yaw, -sin yaw).
 */
export function worldDirection(
  input: MotionInput,
  cameraYaw: number,
): { x: number; z: number } {
  const ax = input.forward;
  const az = input.right;
  const length = Math.hypot(ax, az);

  if (length < 1e-4) {
    return { x: 0, z: 0 };
  }

  const nx = ax / length;
  const nz = az / length;

  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);

  return {
    x: nx * -sin + nz * cos,
    z: nx * -cos + nz * -sin,
  };
}

export function stepMotion(
  state: MotionState,
  input: MotionInput,
  cameraYaw: number,
  dt: number,
  tuning: MotionTuning = DEFAULT_MOTION,
): MotionStep {
  const step = Math.max(0, dt);
  const { x: dirX, z: dirZ } = worldDirection(input, cameraYaw);
  const moving = dirX !== 0 || dirZ !== 0;

  const targetSpeed = moving
    ? input.run
      ? tuning.runSpeed
      : tuning.walkSpeed
    : 0;

  const rate =
    targetSpeed > state.speed ? tuning.acceleration : tuning.damping;

  const delta = targetSpeed - state.speed;
  const maxDelta = rate * step;

  const speed =
    Math.abs(delta) <= maxDelta ? targetSpeed : state.speed + Math.sign(delta) * maxDelta;

  let yaw = state.yaw;

  if (moving) {
    const targetYaw = Math.atan2(dirX, dirZ);
    const turn = shortestAngle(yaw, targetYaw);
    const maxTurn = tuning.turnRate * step;

    yaw = Math.abs(turn) <= maxTurn ? targetYaw : yaw + Math.sign(turn) * maxTurn;
  }

  const distance = speed * step;

  // Chỉ tích pha khi thật sự có quãng đường: đứng yên thì chân về tư thế nghỉ
  // qua `gaitPhase` giữ nguyên, lớp hình thể tự lerp về 0.
  const gaitPhase = (state.gaitPhase + distance * tuning.stridesPerMetre) % 1;

  return {
    state: {
      x: state.x + dirX * distance,
      z: state.z + dirZ * distance,
      yaw,
      speed,
      gaitPhase,
    },
    distance,
    moving,
    directionX: dirX,
    directionZ: dirZ,
  };
}
