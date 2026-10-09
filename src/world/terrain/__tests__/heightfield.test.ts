import { describe, expect, it } from "vitest";

import {
  flatness,
  terrainHeight,
  terrainNormal,
  YARD_RADIUS,
} from "../heightfield";

describe("flatness", () => {
  it("phẳng hoàn toàn trong sân", () => {
    expect(flatness(0, 0)).toBe(0);
    expect(flatness(YARD_RADIUS - 1, 0)).toBe(0);
  });

  it("bằng 1 khi ra ngoài vùng chuyển tiếp", () => {
    expect(flatness(YARD_RADIUS * 2 + 5, 0)).toBe(1);
  });

  it("tăng đơn điệu theo khoảng cách", () => {
    const samples = [YARD_RADIUS, YARD_RADIUS * 1.25, YARD_RADIUS * 1.5, YARD_RADIUS * 1.75, YARD_RADIUS * 2];

    for (let i = 1; i < samples.length; i += 1) {
      expect(flatness(samples[i], 0)).toBeGreaterThan(flatness(samples[i - 1], 0));
    }
  });
});

describe("terrainHeight", () => {
  it("bằng 0 trong sân để đặt được nhà, giếng, hàng rào", () => {
    // Mọi điểm phải nằm trong YARD_RADIUS, nếu không là đã ra tới sườn đồi.
    const yardPoints = [
      [0, 0],
      [10, -8],
      [-20, 15],
      [18, 18],
      [-24, 8],
    ];

    for (const [x, z] of yardPoints) {
      expect(Math.hypot(x, z)).toBeLessThan(YARD_RADIUS);
      expect(terrainHeight(x, z)).toBe(0);
    }
  });

  it("có đồi thoải ra xa", () => {
    const heights = [-120, -80, -40, 40, 80, 120].map((x) => terrainHeight(x, 0));

    expect(Math.max(...heights)).toBeGreaterThan(0.5);
  });

  it("bị chặn biên độ — không có vách dựng đứng", () => {
    for (let x = -300; x <= 300; x += 7) {
      expect(Math.abs(terrainHeight(x, x / 3))).toBeLessThan(4.1);
    }
  });

  it("là hàm thuần, gọi hai lần ra cùng kết quả", () => {
    expect(terrainHeight(37.5, -12.25)).toBe(terrainHeight(37.5, -12.25));
  });

  it("không sinh NaN trên lưới rộng", () => {
    for (let x = -500; x <= 500; x += 40) {
      for (let z = -500; z <= 500; z += 40) {
        expect(Number.isFinite(terrainHeight(x, z))).toBe(true);
      }
    }
  });
});

describe("terrainNormal", () => {
  it("thẳng đứng ở chỗ phẳng", () => {
    const normal = terrainNormal(0, 0);

    expect(normal.y).toBeCloseTo(1, 6);
    expect(normal.x).toBeCloseTo(0, 9);
    expect(normal.z).toBeCloseTo(0, 9);
  });

  it("luôn là vector đơn vị", () => {
    for (const [x, z] of [
      [40, 10],
      [-70, 55],
      [95, -85],
    ]) {
      const normal = terrainNormal(x, z);

      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 6);
    }
  });
});
