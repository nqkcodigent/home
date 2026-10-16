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
  /**
   * Có thì vật cản là một ĐOẠN (x,z)→(toX,toZ) dày `radius` — hình viên thuốc.
   * Tường làm bằng chuỗi hình tròn thì trượt dọc theo nó bị gợn như chuỗi hạt
   * (nhân vật lắc ra lắc vào ~10 lần/giây khi chạy); một đoạn thẳng thì phẳng.
   */
  toX?: number;
  toZ?: number;
}

/** Vector từ điểm gần nhất của vật cản tới (px, pz), và độ dài của nó. */
export function obstacleOffset(
  obstacle: Obstacle,
  px: number,
  pz: number,
): { dx: number; dz: number; distance: number } {
  let cx = obstacle.x;
  let cz = obstacle.z;

  if (obstacle.toX !== undefined && obstacle.toZ !== undefined) {
    const sx = obstacle.toX - obstacle.x;
    const sz = obstacle.toZ - obstacle.z;
    const lengthSq = sx * sx + sz * sz;
    const t =
      lengthSq > 1e-9
        ? Math.min(1, Math.max(0, ((px - cx) * sx + (pz - cz) * sz) / lengthSq))
        : 0;

    cx += sx * t;
    cz += sz * t;
  }

  const dx = px - cx;
  const dz = pz - cz;

  return { dx, dz, distance: Math.hypot(dx, dz) };
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
 * Đưa một chùm vật cản từ toạ độ CỤC BỘ sang toạ độ thế giới.
 *
 * Vì sao cần: vật thể có hình khối riêng của nó (ngôi nhà được dựng ở gốc toạ
 * độ của chính nó, rồi mới đặt xuống sân và xoay một chút cho tự nhiên), nên
 * phần va chạm phải đi qua ĐÚNG phép biến đổi đó. Chép tay toạ độ đã xoay là
 * lỗi chờ sẵn: sửa độ xoay ở một chỗ là tường chặn lệch ở chỗ kia, và triệu
 * chứng duy nhất là "đi xuyên được qua tường nhà".
 */
export function rotateObstacles(
  obstacles: readonly Obstacle[],
  place: { x: number; z: number; rotation: number },
): Obstacle[] {
  const cos = Math.cos(place.rotation);
  const sin = Math.sin(place.rotation);

  // Xoay quanh trục Y rồi dịch — cùng thứ tự với `Object3D.rotation` +
  // `Object3D.position` của three.js.
  const moveX = (x: number, z: number) => place.x + x * cos + z * sin;
  const moveZ = (x: number, z: number) => place.z - x * sin + z * cos;

  return obstacles.map((obstacle) => {
    const moved: Obstacle = {
      radius: obstacle.radius,
      x: moveX(obstacle.x, obstacle.z),
      z: moveZ(obstacle.x, obstacle.z),
    };

    if (obstacle.toX !== undefined && obstacle.toZ !== undefined) {
      moved.toX = moveX(obstacle.toX, obstacle.toZ);
      moved.toZ = moveZ(obstacle.toX, obstacle.toZ);
    }

    return moved;
  });
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
      const { dx, dz, distance } = obstacleOffset(obstacle, currentX, currentZ);
      const minimum = obstacle.radius + radius;

      if (distance >= minimum) continue;

      touched = true;
      contacts += 1;

      // Chồng khít tâm (hiếm, nhưng nếu không xử lý thì chia cho 0)
      if (distance < 1e-5) {
        currentX += minimum;

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
