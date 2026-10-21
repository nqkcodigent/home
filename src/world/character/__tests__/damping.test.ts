import { describe, expect, it } from "vitest";

import { damp, dampAngle, dampFactor, shortestAngle } from "../motion";

/**
 * Damping là nền của mọi chuyển động mượt trong lớp hình thể. Nó phải có đúng
 * ba tính chất, và cả ba đều bị vi phạm bởi `lerp(current, target, dt * k)`:
 *
 *  1. cùng một quỹ đạo bất kể frame dài bao nhiêu;
 *  2. không vọt qua đích (không overshoot);
 *  3. tiến đơn điệu về đích.
 */
describe("damp", () => {
  it("một bước dài bằng nhiều bước ngắn — độc lập tần số khung hình", () => {
    const oneStep = damp(0, 1, 9, 1);

    let many = 0;

    for (let index = 0; index < 240; index += 1) {
      many = damp(many, 1, 9, 1 / 240);
    }

    expect(many).toBeCloseTo(oneStep, 9);
  });

  it("60 fps và 144 fps cho cùng kết quả sau cùng một khoảng thời gian", () => {
    let fast = 0;
    let slow = 0;

    for (let index = 0; index < 60; index += 1) {
      slow = damp(slow, 1, 7, 1 / 60);
    }

    for (let index = 0; index < 144; index += 1) {
      fast = damp(fast, 1, 7, 1 / 144);
    }

    expect(fast).toBeCloseTo(slow, 9);
  });

  it("không vọt qua đích và không lùi lại", () => {
    let value = 0;

    for (let index = 0; index < 200; index += 1) {
      const next = damp(value, 1, 14, 1 / 60);

      expect(next).toBeGreaterThanOrEqual(value);
      expect(next).toBeLessThanOrEqual(1);

      value = next;
    }

    expect(value).toBeCloseTo(1, 3);
  });

  it("dt = 0 không làm gì; rate = 0 là đứng yên", () => {
    expect(damp(0.3, 1, 12, 0)).toBe(0.3);
    expect(damp(0.3, 1, 0, 0.5)).toBe(0.3);
    expect(dampFactor(12, 0)).toBe(0);
  });
});

describe("dampAngle", () => {
  it("đi theo cung ngắn nhất, không quay vòng qua 2π", () => {
    // Từ 3,0 rad tới -3,0 rad: cung ngắn là qua ±π (0,28 rad), không phải 6 rad.
    const next = dampAngle(3, -3, 10, 1 / 60);

    expect(shortestAngle(3, -3)).toBeCloseTo(2 * Math.PI - 6, 6);
    expect(next).toBeGreaterThan(3);
  });

  it("hội tụ về đúng góc đích", () => {
    let yaw = 0;

    for (let index = 0; index < 240; index += 1) {
      yaw = dampAngle(yaw, Math.PI, 8, 1 / 60);
    }

    expect(Math.abs(shortestAngle(yaw, Math.PI))).toBeLessThan(0.01);
  });
});
