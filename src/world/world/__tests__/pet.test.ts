import { describe, expect, it } from "vitest";

import { PET_RADIUS, createPetState, stepPet } from "../Pet";

import type { PetState } from "../Pet";
import type { Obstacle } from "../../physics/collide";

function run(
  state: PetState,
  player: { x: number; z: number },
  seconds: number,
  obstacles: readonly Obstacle[] = [],
) {
  let current = state;

  for (let frame = 0; frame < seconds * 60; frame += 1) {
    current = stepPet(current, player, 1 / 60, obstacles);
  }

  return current;
}

const gap = (pet: PetState, player: { x: number; z: number }) =>
  Math.hypot(pet.x - player.x, pet.z - player.z);

describe("chó đi theo", () => {
  it("chạy tới gần chủ rồi dừng, không chen vào chân", () => {
    const player = { x: 10, z: 0 };
    const pet = run(createPetState(0, 0), player, 6);

    expect(gap(pet, player)).toBeLessThan(2.4);
    expect(gap(pet, player)).toBeGreaterThan(1);
    expect(pet.speed).toBeLessThan(0.05);
  });

  it("chủ nhích một chút thì nằm yên (khoảng trễ), ngồi xuống sau một lúc", () => {
    const pet = run(createPetState(0, 0), { x: 1.8, z: 0 }, 2);

    expect(pet.x).toBe(0);
    expect(pet.still).toBeGreaterThan(1.2);
  });

  it("chủ xuống ao thì đợi trên bờ — không bao giờ lội vào", () => {
    const pond: Obstacle = { x: 0, z: 0, radius: 3.3 };
    const player = { x: 0.5, z: 0 };
    let pet = createPetState(9, 0);
    let closest = Infinity;

    for (let frame = 0; frame < 12 * 60; frame += 1) {
      pet = stepPet(pet, player, 1 / 60, [pond]);
      closest = Math.min(closest, Math.hypot(pet.x, pet.z));
    }

    expect(closest).toBeGreaterThanOrEqual(3.3 + PET_RADIUS - 1e-6);
    // Đứng lại đợi chứ không giẫm chân tại chỗ mãi.
    expect(pet.wait + pet.still).toBeGreaterThan(0);
  });

  it("lạc quá xa thì xuất hiện lại sau lưng chủ", () => {
    const player = { x: 40, z: 0 };
    const pet = stepPet(createPetState(0, 0), player, 1 / 60, []);

    expect(gap(pet, player)).toBeCloseTo(1.4, 6);
  });
});
