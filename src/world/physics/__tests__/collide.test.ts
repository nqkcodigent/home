import { describe, expect, it } from "vitest";

import { resolveCollisions, rotateObstacles } from "../collide";

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

describe("vật cản dạng đoạn (tường)", () => {
  const WALL = { x: -5, z: 0, toX: 5, toZ: 0, radius: 0.2 };

  it("đẩy ra theo pháp tuyến của đoạn, ở bất kỳ chỗ nào dọc tường", () => {
    for (const x of [-4.9, -1.3, 0, 2.21, 4.9]) {
      const result = resolveCollisions(x, 0.3, 0.3, [WALL]);

      expect(result.x).toBeCloseTo(x, 6);
      expect(result.z).toBeCloseTo(0.5, 6);
    }
  });

  it("hai đầu đoạn tròn như viên thuốc", () => {
    const result = resolveCollisions(5.3, 0, 0.3, [WALL]);

    expect(result.x).toBeCloseTo(5.5, 6);
    expect(result.z).toBeCloseTo(0, 6);
  });

  it("xoay cả hai đầu đoạn theo phép đặt vật", () => {
    const [moved] = rotateObstacles([WALL], { x: 1, z: 2, rotation: Math.PI / 2 });

    expect(moved.x).toBeCloseTo(1, 6);
    expect(moved.z).toBeCloseTo(7, 6);
    expect(moved.toX).toBeCloseTo(1, 6);
    expect(moved.toZ).toBeCloseTo(-3, 6);
  });
});
