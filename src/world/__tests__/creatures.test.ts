import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  birdRoutePosition,
  birdFocusOrbit,
  birdThermalSpiral,
  pickWanderTarget,
  fleeDestination,
  nextFreePerch,
  BUTTERFLY_LAND_SECONDS,
  Creatures,
} from "../world/Creatures";

import type { BirdRoute, WanderZone } from "../world/Creatures";

/**
 * Sinh vật — các hàm thuần quyết định "chim bay đâu, gà đi đâu".
 *
 * Ba điều khoá:
 *  1. **Chim không bao giờ ra khỏi vùng trời của nó** — lộ trình là một dải
 *     cao độ và bán kính có giới hạn; một con chim bay khuất khỏi bản đồ là
 *     một con chim không bao giờ được nhìn thấy.
 *  2. **Gà không bao giờ bước vào vật cản** — đống rơm, chân tường.
 *  3. **Gà chạy THOÁT ra xa người, không chạy TỚI** — và không bao giờ ra
 *     khỏi vùng của nó.
 */

const ROUTE: BirdRoute = {
  cx: 2,
  cz: -3,
  radius: 18,
  height: 20,
  speed: 0.03,
  phase: 0.7,
  stretch: 0.85,
};

describe("Chim trời — lộ trình", () => {
  it("nằm gọn trong dải bán kính × cao độ, với bước nhảy liên tục", () => {
    const out = { x: 0, y: 0, z: 0 };

    let previous: { x: number; y: number; z: number } | undefined;

    for (let t = 0; t < 120; t += 1 / 30) {
      birdRoutePosition(out, ROUTE, t);

      const horizontal = Math.hypot(out.x - ROUTE.cx, out.z - ROUTE.cz);

      expect(horizontal).toBeLessThanOrEqual(ROUTE.radius + 1e-9);
      expect(out.y).toBeGreaterThanOrEqual(ROUTE.height - 3);
      expect(out.y).toBeLessThanOrEqual(ROUTE.height + 3);

      if (previous) {
        // Một phần ba giây không được nhảy quá 4 m — chim bay, không phải chớp mắt.
        const step = Math.hypot(out.x - previous.x, out.y - previous.y, out.z - previous.z);

        expect(step).toBeLessThan(4);
      }

      previous = { ...out };
    }
  });
});

describe("Chim bám diều — vòng quanh focus", () => {
  it("luôn ở quanh con diều — không bao giờ bay tít ra một hướng", () => {
    const out = { x: 0, y: 0, z: 0 };
    const focus = { x: 10, y: 30, z: 14 };

    for (let t = 0; t < 600; t += 0.25) {
      birdFocusOrbit(out, focus, ROUTE, t);

      const distance = Math.hypot(out.x - focus.x, out.y - focus.y, out.z - focus.z);

      expect(distance).toBeLessThan(12);
      // Có lúc phải bay dưới diều — nếu không thì khung hình nào cũng một kiểu.
    }

    let below = false;

    for (let t = 0; t < 60; t += 0.1) {
      birdFocusOrbit(out, focus, ROUTE, t);

      if (out.y < focus.y) below = true;
    }

    expect(below).toBe(true);
  });
});

describe("Chim lượn nhiệt — cột chim chỉ chỗ có gió lên", () => {
  it("bay quanh trục cột, không trôi ra xa, và có lúc lên lúc xuống theo cột", () => {
    const out = { x: 0, y: 0, z: 0 };
    const thermal = { x: 8, y: 24, z: -5, radius: 3.2 };

    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;

    for (let t = 0; t < 120; t += 0.2) {
      birdThermalSpiral(out, thermal, ROUTE, t);

      expect(Math.hypot(out.x - thermal.x, out.z - thermal.z)).toBeLessThan(thermal.radius * 1.1);

      lowest = Math.min(lowest, out.y);
      highest = Math.max(highest, out.y);
    }

    // Cột chim trải dọc theo cột khí: chân cột dưới diều, đỉnh trên diều.
    expect(lowest).toBeLessThan(thermal.y - 3);
    expect(highest).toBeGreaterThan(thermal.y + 6);
  });
});

describe("Chim cành — đổi chỗ đậu", () => {
  it("chọn cột TRỐNG kế tiếp, và ở lại cột cũ khi mọi cột khác đã có chủ", () => {
    // Ba cột, chim đang ở cột 0, cột 1 đã có chủ → sang cột 2.
    expect(nextFreePerch(0, new Set([1]), 3)).toBe(2);

    // Mọi cột khác đều có chủ: đứng im ở cột cũ — không nhảy sang toạ độ vô
    // nghĩa, và cũng không đè lên một con khác.
    expect(nextFreePerch(0, new Set([1, 2]), 3)).toBe(0);
    expect(nextFreePerch(1, new Set([0, 1, 2]), 3)).toBe(1);

    // Chưa có cột nào (bối cảnh không khai báo chỗ đậu): không NaN.
    expect(nextFreePerch(0, new Set(), 0)).toBe(0);
  });
});

describe("Gà — nơi đi bới", () => {
  const zone: WanderZone = {
    homeX: -11.5,
    homeZ: -11,
    radius: 4,
    avoid: [
      { x: -9.5, z: -13, radius: 1.1 },
      { x: -13, z: -14.5, radius: 1.1 },
    ],
  };

  function seeded(seed: number) {
    let state = seed;

    return () => {
      state = (state + 0x6d2b79f5) >>> 0;

      let t = state;

      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  it("mọi điểm dừng đều nằm trong vùng và tránh xa vật cản", () => {
    const random = seeded(4242);

    for (let index = 0; index < 200; index += 1) {
      const target = pickWanderTarget(zone, random);

      expect(target).toBeDefined();

      if (!target) continue;

      const homeDistance = Math.hypot(target.x - zone.homeX, target.z - zone.homeZ);

      expect(homeDistance).toBeLessThanOrEqual(zone.radius + 1e-9);

      for (const obstacle of zone.avoid) {
        const clear = Math.hypot(target.x - obstacle.x, target.z - obstacle.z);

        expect(clear).toBeGreaterThan(obstacle.radius);
      }
    }
  });

  it("vùng chỉ toàn vật cản thì trả undefined — gà đứng im một nhịp, không nhảy vào tường", () => {
    const blocked: WanderZone = {
      homeX: 0,
      homeZ: 0,
      radius: 1,
      avoid: [{ x: 0, z: 0, radius: 4 }],
    };

    expect(pickWanderTarget(blocked, seeded(1))).toBeUndefined();
  });

  it("chỗ chạy thoát luôn RA XA người hơn chỗ cũ, và không ra ngoài vùng", () => {
    const chicken = { x: -10, z: -10 };
    const player = { x: -9, z: -10.2 };

    const destination = fleeDestination(zone, chicken, player);

    const before = Math.hypot(chicken.x - player.x, chicken.z - player.z);
    const after = Math.hypot(destination.x - player.x, destination.z - player.z);

    expect(after).toBeGreaterThan(before);
    expect(
      Math.hypot(destination.x - zone.homeX, destination.z - zone.homeZ),
    ).toBeLessThanOrEqual(zone.radius + 1e-9);

    // Người đứng ngay bụng gà (khoảng cách ~0) — vẫn không có NaN, không chạy
    // tới chỗ người chơi.
    const panic = fleeDestination(zone, { x: 0, z: 0 }, { x: 0, z: 0 });

    expect(Number.isFinite(panic.x)).toBe(true);
    expect(Number.isFinite(panic.z)).toBe(true);
  });
});

describe("đàn gà", () => {
  it("dựng được cả đàn, mỗi con một màu lông, chạy được vài giây không lỗi", () => {
    const creatures = new Creatures({
      perches: [],
      chickenZone: { homeX: 0, homeZ: 0, radius: 4, avoid: [] },
      butterflyZones: [],
      flockSize: 0,
      chickenCount: 4,
      butterflyCount: 0,
    });

    for (let frame = 0; frame < 90; frame += 1) {
      creatures.update(1 / 30, frame / 30, { x: 20, y: 0, z: 20 });
    }

    const coats = new Set<number>();

    creatures.group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry && child.geometry.parameters.radius === 0.16) {
        coats.add((child.material as THREE.MeshStandardMaterial).color.getHex());
      }
    });

    expect(coats.size).toBe(4);
  });
});

describe("bướm đậu lên vai", () => {
  function make() {
    return new Creatures({
      perches: [],
      chickenZone: { homeX: 50, homeZ: 50, radius: 1, avoid: [] },
      butterflyZones: [{ x: 2, z: 0, radius: 2 }],
      flockSize: 0,
      chickenCount: 0,
      butterflyCount: 1,
    });
  }

  const player = { x: 0, y: 0, z: 0 };
  const shoulder = { x: 0.2, y: 1.0, z: 0 };

  function run(creatures: Creatures, seconds: number, from: number, at = player) {
    for (let frame = 0; frame < seconds * 30; frame += 1) {
      creatures.update(1 / 30, from + frame / 30, at, shoulder);
    }
  }

  it("đứng yên đủ lâu thì bướm bay tới đậu đúng trên vai", () => {
    const creatures = make();
    const butterfly = creatures.group.children[0];

    run(creatures, BUTTERFLY_LAND_SECONDS - 1, 0);
    expect(Math.hypot(butterfly.position.x - 0.2, butterfly.position.y - 1.04, butterfly.position.z)).toBeGreaterThan(0.3);

    run(creatures, 8, BUTTERFLY_LAND_SECONDS - 1);
    expect(Math.hypot(butterfly.position.x - 0.2, butterfly.position.y - 1.04, butterfly.position.z)).toBeLessThan(0.05);
  });

  it("bước đi là bướm giật mình bay mất", () => {
    const creatures = make();
    const butterfly = creatures.group.children[0];

    run(creatures, BUTTERFLY_LAND_SECONDS + 8, 0);
    // Đi bộ: mỗi frame một chỗ khác.
    for (let frame = 0; frame < 60; frame += 1) {
      creatures.update(1 / 30, 30 + frame / 30, { x: frame * 0.05, y: 0, z: 0 }, shoulder);
    }

    expect(Math.hypot(butterfly.position.x - 0.2, butterfly.position.z)).toBeGreaterThan(0.3);
  });
});

describe("khói bếp", () => {
  it("cụm khói bay lên, nở ra, tan hẳn trước khi vòng lại; luôn trên miệng ống khói", async () => {
    const { smokePuff } = await import("../world/Landmarks");
    const chimney = { x: 0, y: 5, z: 0 };
    const young = smokePuff(0, 0.5, chimney);
    const old = smokePuff(0, 4.7, chimney);

    expect(old.y).toBeGreaterThan(young.y);
    expect(old.scale).toBeGreaterThan(young.scale);
    expect(old.opacity).toBeLessThan(0.05);

    for (let t = 0; t < 30; t += 0.37) {
      const puff = smokePuff(3, t, chimney);

      expect(puff.y).toBeGreaterThanOrEqual(chimney.y);
      expect(puff.opacity).toBeGreaterThanOrEqual(0);
    }
  });
});
