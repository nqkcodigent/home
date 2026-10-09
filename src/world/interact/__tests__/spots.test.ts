import { describe, expect, it } from "vitest";

import { findActiveSpot } from "../spots";

import type { Spot } from "../spots";

const SPOTS: Spot<string>[] = [
  { id: "well", x: 0, z: 10, radius: 3, label: "Cái giếng", payload: "well-line" },
  { id: "door", x: 0, z: 4, radius: 3, label: "Cửa nhà", payload: "door-line" },
  { id: "tree", x: 40, z: 0, radius: 3, label: "Gốc cây", payload: "tree-line" },
];

describe("findActiveSpot", () => {
  it("không có gì khi đứng xa mọi điểm", () => {
    expect(findActiveSpot(20, 20, SPOTS)).toBeUndefined();
  });

  it("chọn điểm chứa người chơi", () => {
    const match = findActiveSpot(0, 4.5, SPOTS);

    expect(match?.spot.id).toBe("door");
  });

  it("hai điểm chồng lấn thì lấy điểm GẦN hơn, không phải điểm khai báo trước", () => {
    const overlapping: Spot<string>[] = [
      { id: "xa", x: 0, z: 8, radius: 5, label: "xa", payload: "a" },
      { id: "gan", x: 0, z: 5.5, radius: 5, label: "gần", payload: "b" },
    ];

    expect(findActiveSpot(0, 5, overlapping)?.spot.id).toBe("gan");
  });

  it("bỏ qua điểm đã thu thập", () => {
    const collected = new Set(["door"]);
    const match = findActiveSpot(0, 4.5, SPOTS, collected);

    expect(match).toBeUndefined();
  });

  it("đúng biên bán kính vẫn tính là trong tầm", () => {
    const well: Spot<string>[] = [
      { id: "well", x: 0, z: 10, radius: 3, label: "Cái giếng", payload: "w" },
    ];

    expect(findActiveSpot(0, 7, well)?.spot.id).toBe("well");
    expect(findActiveSpot(0, 6.99, well)).toBeUndefined();
  });

  it("mang theo payload của điểm được chọn", () => {
    expect(findActiveSpot(40, 0, SPOTS)?.spot.payload).toBe("tree-line");
  });
});
