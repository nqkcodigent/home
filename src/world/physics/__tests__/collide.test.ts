import { describe, expect, it } from "vitest";

import { resolveCollisions } from "../collide";

const TREE = { x: 5, z: 0, radius: 1 };

describe("resolveCollisions", () => {
  it("trả về đúng vị trí khi không có gì chồng lên", () => {
    const result = resolveCollisions(0, 0, 0.5, [TREE]);

    expect(result).toEqual({ x: 0, z: 0, contacts: 0 });
  });

  it("đẩy ra vừa đủ để hai hình tròn rời nhau", () => {
    const result = resolveCollisions(4.6, 0, 0.5, [TREE]);
    const distance = Math.hypot(result.x - TREE.x, result.z - TREE.z);

    expect(distance).toBeCloseTo(TREE.radius + 0.5, 6);
    expect(result.contacts).toBe(1);
  });

  it("đẩy theo hướng đang đứng, không nhảy sang bên kia vật thể", () => {
    const result = resolveCollisions(4.6, 0, 0.5, [TREE]);

    expect(result.x).toBeLessThan(4.6);
    expect(result.x).toBeGreaterThanOrEqual(TREE.x - TREE.radius - 0.5 - 1e-9);
  });

  it("đứng đúng tâm vật thể thì bị đẩy ra một bán kính an toàn", () => {
    const result = resolveCollisions(TREE.x, TREE.z, 0.5, [TREE]);

    expect(Math.hypot(result.x - TREE.x, result.z - TREE.z)).toBeCloseTo(1.5, 6);
  });

  it("kẹt giữa hai vật thể thì đẩy tiếp cho tới khi thoát, không dao động", () => {
    // Hai thân cây hai bên, nhân vật lọt vào khe nhưng chưa ra hẳn.
    const obstacles = [
      { x: -2.4, z: 0, radius: 1 },
      { x: 2.0, z: 0, radius: 1 },
    ];

    const result = resolveCollisions(0.6, 0, 0.5, obstacles);

    const clear = obstacles.every(
      (o) => Math.hypot(result.x - o.x, result.z - o.z) >= 1.5 - 1e-6,
    );

    expect(clear).toBe(true);
  });

  it("giữ trong biên thế giới", () => {
    const bounds = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };

    const result = resolveCollisions(50, -50, 0.6, [], bounds);

    expect(result.x).toBe(10 - 0.6);
    expect(result.z).toBe(-10 + 0.6);
  });

  it("không đẩy khi vật thể ở xa", () => {
    const result = resolveCollisions(-30, 12, 0.5, [
      { x: 100, z: 100, radius: 4 },
    ]);

    expect(result.x).toBe(-30);
    expect(result.z).toBe(12);
    expect(result.contacts).toBe(0);
  });
});
