/**
 * Địa hình — hàm độ cao thuần, dùng CHUNG cho lưới đất và cho bước chân.
 *
 * Nếu lưới và chân nhân vật tính độ cao theo hai cách khác nhau thì nhân vật
 * sẽ chìm hoặc bay lơ lửng trên sườn dốc. Nên chỉ có một hàm, và mọi thứ gọi nó.
 *
 * Quanh sân nhà (bán kính `YARD_RADIUS`) địa hình được làm phẳng dần: sân
 * trước nhà phải êm để đặt nhà, giếng, hàng rào.
 */

export const YARD_RADIUS = 26;

/** Làm phẳng quanh gốc toạ độ: 0 ở tâm sân, 1 ở ngoài rìa. */
export function flatness(x: number, z: number, radius = YARD_RADIUS): number {
  const distance = Math.hypot(x, z);

  if (distance <= radius) return 0;
  if (distance >= radius * 2) return 1;

  const t = (distance - radius) / radius;

  // smoothstep để bìa sân không bị gãy khúc
  return t * t * (3 - 2 * t);
}

const HILLS = [
  { amplitude: 2.6, fx: 0.021, fz: 0.017, ox: 1.3, oz: 0.4 },
  { amplitude: 1.1, fx: 0.053, fz: 0.041, ox: 0.2, oz: 2.1 },
  { amplitude: 0.35, fx: 0.131, fz: 0.097, ox: 3.4, oz: 1.1 },
] as const;

/** Độ cao mặt đất tại (x, z), tính bằng mét. */
export function terrainHeight(x: number, z: number): number {
  const mask = flatness(x, z);

  if (mask === 0) return 0;

  let height = 0;

  for (const hill of HILLS) {
    height +=
      hill.amplitude *
      Math.sin(x * hill.fx + hill.ox) *
      Math.cos(z * hill.fz + hill.oz);
  }

  return height * mask;
}

/** Vector pháp tuyến (đã chuẩn hoá) của mặt đất tại (x, z). */
export function terrainNormal(
  x: number,
  z: number,
  epsilon = 0.5,
): { x: number; y: number; z: number } {
  const dx =
    (terrainHeight(x + epsilon, z) - terrainHeight(x - epsilon, z)) /
    (2 * epsilon);
  const dz =
    (terrainHeight(x, z + epsilon) - terrainHeight(x, z - epsilon)) /
    (2 * epsilon);

  const length = Math.hypot(dx, 1, dz);

  return { x: -dx / length, y: 1 / length, z: -dz / length };
}
