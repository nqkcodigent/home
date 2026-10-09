import { describe, expect, it } from "vitest";

import {
  PUNY_CARDINAL,
  PUNY_COLUMN,
  PUNY_FRAME,
  PUNY_IDLE_CYCLE,
  PUNY_ROW,
  PUNY_SHEET_SIZE,
  PUNY_WALK_CYCLE,
  punyColumnOf,
  punyFrame,
  punyFrameAt,
  punyRowOf,
} from "../punyFrames";

describe("punyFrames", () => {
  it("sheet 768×256 chia thành lưới 24×8 frame 32×32", () => {
    expect(PUNY_SHEET_SIZE).toEqual({ width: 768, height: 256 });
    expect(PUNY_FRAME).toEqual({
      width: 32,
      height: 32,
      columns: 24,
      rows: 8,
    });
  });

  it("frame đếm theo hàng rồi tới cột", () => {
    expect(punyFrame(0, 0)).toBe(0);
    expect(punyFrame(0, 3)).toBe(3);
    expect(punyFrame(1, 0)).toBe(24);
  });

  it("hàng nằm trong khoảng của sheet", () => {
    for (const direction of PUNY_CARDINAL) {
      const row = PUNY_ROW[direction];

      expect(row).toBeGreaterThanOrEqual(0);
      expect(row).toBeLessThan(PUNY_FRAME.rows);
    }
  });

  it("hướng đi dùng đúng hàng đã dò: down 0, left 2, up 4, right 6", () => {
    expect(punyFrameAt("down", PUNY_COLUMN.idle)).toBe(0);
    expect(punyFrameAt("left", PUNY_COLUMN.idle)).toBe(48);
    expect(punyFrameAt("up", PUNY_COLUMN.idle)).toBe(96);
    expect(punyFrameAt("right", PUNY_COLUMN.idle)).toBe(144);
  });

  it("các hướng nghiêng/thẳng đối xứng gương qua trục giữa", () => {
    // `up` (hàng 4) là trục đối xứng: mỗi cặp trái–phải có tổng bằng 8.
    expect(PUNY_ROW.up).toBe(4);
    expect(PUNY_ROW.left + PUNY_ROW.right).toBe(2 * PUNY_ROW.up);
    expect(PUNY_ROW.downLeft + PUNY_ROW.downRight).toBe(2 * PUNY_ROW.up);
    expect(PUNY_ROW.upLeft + PUNY_ROW.upRight).toBe(2 * PUNY_ROW.up);

    // `down` không có hàng bạn đối xứng (bạn của nó là hàng 8, ngoài lưới) vì
    // nó tự đối xứng qua trục dọc — đúng như ảnh chụp mặt trước.
    expect(PUNY_ROW.down).toBe(0);
  });

  it("chu kỳ idle là 2 khung đứng yên", () => {
    expect(PUNY_IDLE_CYCLE).toEqual([0, 1]);
  });

  it("chu kỳ đi xen kẽ sải chân và chân chụm", () => {
    expect(PUNY_WALK_CYCLE).toEqual([2, 0, 3, 1]);

    // hai khung sải chân phải khác nhau, nếu không nhịp bước sẽ đứng yên
    expect(PUNY_WALK_CYCLE[0]).not.toBe(PUNY_WALK_CYCLE[2]);
  });

  it("frame nào cũng nằm trong lưới", () => {
    for (const direction of PUNY_CARDINAL) {
      for (const column of [...PUNY_IDLE_CYCLE, ...PUNY_WALK_CYCLE]) {
        const frame = punyFrameAt(direction, column);

        expect(frame).toBeGreaterThanOrEqual(0);
        expect(frame).toBeLessThan(PUNY_FRAME.columns * PUNY_FRAME.rows);
      }
    }
  });

  it("punyColumnOf / punyRowOf là phép ngược của punyFrame", () => {
    for (const frame of [0, 3, 24, 48, 96, 144, 191]) {
      expect(punyFrame(punyRowOf(frame), punyColumnOf(frame))).toBe(frame);
    }
  });
});
