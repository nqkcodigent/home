/**
 * Sơ đồ sân tuổi thơ — MỘT nguồn sự thật cho vị trí.
 *
 * Trước đây (bản Phaser) toạ độ nhà, giếng, cây nằm rải rác trong
 * ChildhoodScene: chỗ vẽ hình, chỗ khai báo điểm ký ức, chỗ đặt bán kính
 * tương tác — lệch một số là điểm ký ức nằm cạnh cái giếng nhưng không bấm
 * được. Nay mọi thứ đọc từ đây.
 *
 * Hệ toạ độ: X sang phải, Z ra trước (về phía cổng), gốc là giữa sân.
 */

export type Vec2 = readonly [x: number, z: number];

export const YARD = {
  house: { x: -3, z: -10.5 },

  /**
   * Chỗ đứng NGAY TRƯỚC CỬA — điểm ký ức "Cửa nhà", và cũng là đầu của lối
   * đi đất.
   *
   * Cửa nhà nằm lệch sang trái mặt tiền (xem `HOUSE.doorFrom` trong Props), nên
   * điểm này phải nằm trước đúng cái cửa đó. Bản trước để nó ở giữa mặt tiền
   * vì cả ngôi nhà là một khối đặc — người chơi đứng cách cửa năm mét mà game
   * vẫn nói là "cửa nhà".
   */
  door: { x: -4.4, z: -6.6 },

  well: { x: 9.5, z: 3.5 },

  tree: { x: -13.5, z: 6.5 },

  gate: { x: 0, z: 18 },

  pond: { x: 17.5, z: -5.5 },

  clothesLine: { x: -12.5, z: -3.5 },

  /** Trường làng ở xa, chỉ để vọng tiếng trống và làm nền cho đường chân trời */
  school: { x: 42, z: -36 },

  /** Lối đi đất chính: từ cửa nhà ra tới cổng */
  path: [
    { x: -4.4, z: -6.6 },
    { x: -2.2, z: 3 },
    { x: 0.4, z: 9.5 },
    { x: 0, z: 17.5 },
  ] as const,

  /** Nhánh rẽ vào giếng */
  wellPath: [
    { x: 9.5, z: 3.5 },
    { x: 5, z: 6.6 },
    { x: 0.4, z: 9.5 },
  ] as const,

  /** Hàng rào quanh sân, chừa một khoảng làm cổng */
  fence: {
    z: 18,
    from: -15,
    to: 7,
    gateFrom: -1.6,
    gateTo: 1.6,
  },

  /** Cây quanh rìa sân (bán kính lớn để không chắn lối đi) */
  trees: [
    [-13.5, 6.5],
    [-18, -1],
    [-16, 13],
    [-6, 15.5],
    [6, 15],
    [13, 12],
    [19, 8],
    [21, -1],
    [15, -14],
    [4, -17],
    [-8, -18],
    [-19, -12],
    [-22, 6],
    [11, -12],
  ] as ReadonlyArray<Vec2>,

  bushes: [
    [-7.5, 3],
    [3.5, -5],
    [-10, 10.5],
    [12, 6.5],
    [6.5, -3],
    [-15.5, -6],
  ] as ReadonlyArray<Vec2>,

  rocks: [
    [-4.5, 8.5],
    [7.5, -8],
    [-16, 10],
  ] as ReadonlyArray<Vec2>,

  haystacks: [
    [-9.5, -13],
    [-13, -14.5],
  ] as ReadonlyArray<Vec2>,
} as const;

/**
 * Vành cây vòng ngoài — rìa của vùng đi được, cách sân chừng 65 mét.
 *
 * Sinh bằng công thức chứ không chép tay 26 cặp số: hình khối và vật cản đọc
 * CÙNG một dãy, nên không bao giờ lệch nhau. Đây là thứ nói với người chơi
 * "hết làng rồi" mà không cần hàng rào thứ hai — và là lý do sân không còn bị
 * nhốt trong bốn mươi mét vuông hàng rào.
 */
export const OUTER_TREES: ReadonlyArray<Vec2> = Array.from(
  { length: 26 },
  (_, index) => {
    const angle = (index / 26) * Math.PI * 2 + 0.19;
    const radius = 63 + (index % 4) * 2.8;

    return [Math.cos(angle) * radius, Math.sin(angle) * radius] as const;
  },
);

/** Khoảng cách từ (x, z) tới một đoạn thẳng. */
export function distanceToSegment(
  x: number,
  z: number,
  from: { x: number; z: number },
  to: { x: number; z: number },
): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;

  const lengthSq = dx * dx + dz * dz;

  if (lengthSq < 1e-9) return Math.hypot(x - from.x, z - from.z);

  const t = Math.min(
    1,
    Math.max(0, ((x - from.x) * dx + (z - from.z) * dz) / lengthSq),
  );

  return Math.hypot(x - (from.x + dx * t), z - (from.z + dz * t));
}

/** Khoảng cách ngắn nhất tới một chuỗi điểm (đường đi). */
export function distanceToPolyline(
  x: number,
  z: number,
  points: ReadonlyArray<{ x: number; z: number }>,
): number {
  let best = Number.POSITIVE_INFINITY;

  for (let index = 1; index < points.length; index += 1) {
    best = Math.min(best, distanceToSegment(x, z, points[index - 1], points[index]));
  }

  return best;
}

/** Khoảng cách tới lối đi gần nhất (đường chính hoặc nhánh vào giếng). */
export function distanceToPath(x: number, z: number): number {
  return Math.min(
    distanceToPolyline(x, z, YARD.path),
    distanceToPolyline(x, z, YARD.wellPath),
  );
}
