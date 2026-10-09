/**
 * Va chạm — hình tròn trên mặt phẳng XZ, thuần số học.
 *
 * Bản gốc (character-threejs) dùng Rapier3D. Bản này cố ý KHÔNG kéo theo
 * WASM physics: cả thế giới chỉ có cây, nhà, giếng, hàng rào — đều là hình
 * tròn/xê dịch được. Đẩy-ra-khỏi-vòng-tròn là đủ để không đi xuyên vật thể,
 * và nó chạy được trong unit test, thứ mà Rapier thì không.
 */

export interface Obstacle {
  x: number;
  z: number;
  /** Bán kính vật thể (mét) */
  radius: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ResolvedPosition {
  x: number;
  z: number;
  /** Số vật thể đã đẩy nhân vật ra trong lần giải này */
  contacts: number;
}

/**
 * Đẩy lặp cho tới khi hết chồng lấn.
 *
 * Một vòng là không đủ: đẩy khỏi vật thể A có thể tống nhân vật vào vật thể B.
 * Vì vậy lặp cho tới khi một vòng không còn va chạm nào (thường là 1–2 vòng),
 * và luôn có trần để một thế kẹp không giải được cũng không treo vòng lặp.
 */
const MAX_PASSES = 8;

function passLimit(obstacleCount: number): number {
  return Math.min(Math.max(obstacleCount + 2, 3), MAX_PASSES);
}

/** Giữ vị trí trong biên của thế giới. */
function clampToBounds(
  x: number,
  z: number,
  radius: number,
  bounds?: Bounds,
): { x: number; z: number } {
  if (!bounds) return { x, z };

  return {
    x: Math.min(Math.max(x, bounds.minX + radius), bounds.maxX - radius),
    z: Math.min(Math.max(z, bounds.minZ + radius), bounds.maxZ - radius),
  };
}

/**
 * Đẩy (x, z) ra khỏi mọi vật thể mà bán kính `radius` đang chồng lên.
 * Không có va chạm thì trả về đúng vị trí ban đầu.
 */
export function resolveCollisions(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly Obstacle[],
  bounds?: Bounds,
): ResolvedPosition {
  let currentX = x;
  let currentZ = z;
  let contacts = 0;

  const limit = passLimit(obstacles.length);

  for (let pass = 0; pass < limit; pass += 1) {
    let touched = false;

    for (const obstacle of obstacles) {
      const dx = currentX - obstacle.x;
      const dz = currentZ - obstacle.z;
      const minimum = obstacle.radius + radius;
      const distanceSq = dx * dx + dz * dz;

      if (distanceSq >= minimum * minimum) continue;

      const distance = Math.sqrt(distanceSq);
      touched = true;
      contacts += 1;

      // Chồng khít tâm (hiếm, nhưng nếu không xử lý thì chia cho 0)
      if (distance < 1e-5) {
        currentX = obstacle.x + minimum;
        currentZ = obstacle.z;

        continue;
      }

      const push = (minimum - distance) / distance;

      currentX += dx * push;
      currentZ += dz * push;
    }

    if (!touched) break;
  }


  const clamped = clampToBounds(currentX, currentZ, radius, bounds);

  return { x: clamped.x, z: clamped.z, contacts };
}
