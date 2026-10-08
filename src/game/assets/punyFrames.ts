/**
 * Bố cục spritesheet "Puny Characters" (Shade, CC0) — dò bằng phân tích pixel.
 *
 * Ảnh 768×256 được chia thành **24 cột × 8 hàng**, mỗi frame **32×32**
 * (sprite chỉ chiếm khoảng 14×13 px ở giữa frame, phần còn lại trong suốt).
 *
 * - **Hàng = hướng nhìn**, xếp theo thứ tự la bàn và đối xứng qua `up` (hàng 4):
 *   down, down-left, left, up-left, up, up-right, right, down-right.
 * - **Cột = tiến trình thời gian** của cùng một chuỗi animation cho hướng đó:
 *   c0–c1 là tư thế đứng (idle), c2–c3 là hai pha sải chân, c4 trở đi là các
 *   animation đánh/hurt/death của pack.
 */
export const PUNY_FRAME = {
  width: 32,
  height: 32,
  columns: 24,
  rows: 8,
} as const;

/** Kích thước gốc của sheet, suy ra từ lưới frame. */
export const PUNY_SHEET_SIZE = {
  width: PUNY_FRAME.columns * PUNY_FRAME.width,
  height: PUNY_FRAME.rows * PUNY_FRAME.height,
} as const;

/** Hàng theo hướng nhìn. */
export const PUNY_ROW = {
  down: 0,
  downLeft: 1,
  left: 2,
  upLeft: 3,
  up: 4,
  upRight: 5,
  right: 6,
  downRight: 7,
} as const;

export type PunyDirection = keyof typeof PUNY_ROW;

/** Bốn hướng game đang dùng cho di chuyển. */
export const PUNY_CARDINAL: readonly PunyDirection[] = [
  "down",
  "left",
  "right",
  "up",
];

/** Cột dùng được cho di chuyển. */
export const PUNY_COLUMN = {
  idle: 0,
  idleAlt: 1,
  walkA: 2,
  walkB: 3,
} as const;

/** Đứng yên: hai khung thở rất nhẹ. */
export const PUNY_IDLE_CYCLE: readonly number[] = [
  PUNY_COLUMN.idle,
  PUNY_COLUMN.idleAlt,
];

/**
 * Đi: sải chân → chân chụm → sải chân ngược → chân chụm.
 *
 * Pack gốc chỉ có hai khung sải chân (c2, c3); hai khung chân chụm lấy từ tư
 * thế đứng được chèn vào giữa để nhịp bước có pha nhấc – đặt chân thay vì lắc
 * qua lắc lại.
 */
export const PUNY_WALK_CYCLE: readonly number[] = [
  PUNY_COLUMN.walkA,
  PUNY_COLUMN.idle,
  PUNY_COLUMN.walkB,
  PUNY_COLUMN.idleAlt,
];

/** Chỉ số frame Phaser: đếm theo hàng rồi tới cột. */
export function punyFrame(row: number, column: number): number {
  return row * PUNY_FRAME.columns + column;
}

/** Frame của một hướng tại một cột — dùng chung cho Phaser và crop CSS. */
export function punyFrameAt(direction: PunyDirection, column: number): number {
  return punyFrame(PUNY_ROW[direction], column);
}

/** Cột của frame Phaser, ngược lại của `punyFrame`. */
export function punyColumnOf(frame: number): number {
  return frame % PUNY_FRAME.columns;
}

/** Hàng của frame Phaser, ngược lại của `punyFrame`. */
export function punyRowOf(frame: number): number {
  return Math.floor(frame / PUNY_FRAME.columns);
}
