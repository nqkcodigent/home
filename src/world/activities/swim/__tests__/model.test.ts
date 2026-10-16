import { describe, expect, it } from "vitest";

import {
  createSwimState,
  stepSwim,
  swimBob,
  DEFAULT_SWIM,
  FISH_COUNT,
  LOTUS_COUNT,
} from "../model";

import type { SwimInput } from "../model";

/**
 * Mô hình bơi ao — luật chơi thuần số.
 *
 * Ba điều khoá ở đây:
 *  1. **Không bao giờ ra khỏi ao** — tính từ tâm ao, mỗi bước đều bị kẹp về
 *     `radius`; một frame dài hay một cú "đạp thoát" không được đưa người chơi
 *     lên bờ.
 *  2. **Nhặt sen là khoảng cách**, không phải bấm nút — bơi tới gần là nhặt,
 *     và nhặt hết thì `done` đúng ở frame cuối.
 *  3. **Tất định** — không có số ngẫu nhiên thật, nên hai ván cùng lệnh cho
 *     cùng một thế giới; test so sánh được từng con số.
 */

const POND = { x: 17.5, z: -5.5, radius: 3.2 };

const IDLE: SwimInput = { forward: 0, turn: 0 };

function run(state: ReturnType<typeof createSwimState>, input: SwimInput, frames: number) {
  let current = state;

  for (let index = 0; index < frames; index += 1) {
    current = stepSwim(current, input, 1 / 60);
  }

  return current;
}

describe("SwimModel — mép ao", () => {
  it("đâm thẳng vào mép là dừng tại chỗ trong ao, rồi bơi song song bờ thì giữ nguyên tốc độ", () => {
    const start = createSwimState(POND);

    // Đâm thẳng ra mép (+Z) suốt hai phút — dài hơn bất kỳ cú bơi thật nào.
    const atEdge = run(start, { forward: 1, turn: 0 }, 60 * 120);

    const edgeDistance = Math.hypot(atEdge.x - POND.x, atEdge.z - POND.z);

    expect(edgeDistance).toBeLessThanOrEqual(DEFAULT_SWIM.radius + 1e-9);
    // Đâm vuông góc vào bờ là đứng yên — không có "đẩy ngược ra giữa ao".
    expect(atEdge.speed).toBeLessThan(0.01);

    // Quay song song mép rồi đạp: tốc độ trở lại đầy đủ — bơi vòng quanh
    // mép ao mượt, không bị sượng ở mỗi khúc cua sát bờ.
    const along = run(
      { ...atEdge, heading: Math.PI / 2 },
      { forward: 1, turn: 0 },
      120,
    );

    expect(along.speed).toBeGreaterThan(0.5);
    expect(Math.hypot(along.x - POND.x, along.z - POND.z)).toBeLessThanOrEqual(
      DEFAULT_SWIM.radius + 1e-9,
    );
  });

  it("gấp khúc thời gian (dt lớn) không nhảy vọt qua mép ao", () => {
    let state = createSwimState(POND);

    for (let index = 0; index < 200; index += 1) {
      // Một giây mỗi bước — lớn hơn bất kỳ frame thật nào, kể cả lúc máy lag.
      state = stepSwim(state, { forward: 1, turn: 0.4 }, 1);

      const distance = Math.hypot(state.x - POND.x, state.z - POND.z);

      expect(distance).toBeLessThanOrEqual(DEFAULT_SWIM.radius + 1e-9);
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.z)).toBe(true);
    }
  });
});

describe("SwimModel — nhặt sen", () => {
  it("bơi tới chỗ bông sen là nhặt được đúng bông đó", () => {
    let state = createSwimState(POND);

    const target = state.lotuses[0];

    // Đặt người bơi ngay cạnh bông ( mô hình cho phép test nhắm đúng tọa độ).
    state = { ...state, x: target.homeX, z: target.homeZ };

    state = stepSwim(state, IDLE, 1 / 60);

    expect(state.caught).toBe(1);
    expect(state.lotuses[0].caught).toBe(true);
    expect(state.justCaught).toBe(0);
    expect(state.done).toBe(false);

    // Frame sau không nhặt lại bông đã mất.
    state = stepSwim(state, IDLE, 1 / 60);

    expect(state.caught).toBe(1);
    expect(state.justCaught).toBeUndefined();
  });

  it("nhặt hết thì `done` bật đúng một lần — và người chơi vẫn bơi tiếp được", () => {
    let state = createSwimState(POND);

    for (const lotus of state.lotuses) {
      state = stepSwim(
        { ...state, x: lotus.homeX, z: lotus.homeZ, depth: lotus.depth },
        IDLE,
        1 / 60,
      );
    }

    expect(state.caught).toBe(LOTUS_COUNT);
    expect(state.done).toBe(true);

    // Ván xong nhưng mô hình không "kết thúc": vẫn nhả nước cho người bơi
    // bơi tiếp tới khi nào tự bấm thoát.
    const after = stepSwim(state, { forward: 1, turn: 0 }, 60);

    expect(Math.hypot(after.x - state.x, after.z - state.z)).toBeGreaterThan(0.1);
    expect(after.done).toBe(true);
  });

  it("sen trôi tất định: hai ván cùng lệnh cho cùng một thế giới", () => {
    const a = run(createSwimState(POND), { forward: 0.6, turn: 0.3 }, 900);
    const b = run(createSwimState(POND), { forward: 0.6, turn: 0.3 }, 900);

    expect(a.x).toBe(b.x);
    expect(a.z).toBe(b.z);
    expect(a.caught).toBe(b.caught);
    expect(a.lotuses.map((lotus) => [lotus.x, lotus.z])).toEqual(
      b.lotuses.map((lotus) => [lotus.x, lotus.z]),
    );
  });

  it("năm bông sen đều nằm TRONG vùng bơi được", () => {
    const state = createSwimState(POND);

    expect(state.lotuses).toHaveLength(LOTUS_COUNT);

    for (const lotus of state.lotuses) {
      const distance = Math.hypot(lotus.homeX - POND.x, lotus.homeZ - POND.z);

      expect(distance).toBeLessThan(DEFAULT_SWIM.radius);
    }
  });
});

describe("SwimModel — trạng thái vật lý", () => {
  it("đứng im thì nước cản đưa tốc độ về gần không, không có NaN", () => {
    const far = run(createSwimState(POND), { forward: 1, turn: 0 }, 600);
    const calm = run(far, IDLE, 600);

    expect(Math.abs(calm.speed)).toBeLessThan(1e-3);
    expect(Number.isFinite(calm.x)).toBe(true);
    expect(Number.isFinite(calm.z)).toBe(true);
    expect(Number.isFinite(swimBob(calm))).toBe(true);
  });

  it("dt = 0 là một bước im lặng, không nhảy toạ độ", () => {
    const state = createSwimState(POND);
    const still = stepSwim(state, { forward: 1, turn: 1 }, 0);

    expect(still.x).toBe(state.x);
    expect(still.z).toBe(state.z);
    expect(still.t).toBe(state.t);
  });

  it("quay bằng nửa vòng rồi đạp nước thì đi ĐÚNG hướng ngược cũ", () => {
    let state = createSwimState(POND);

    state = { ...state, heading: Math.PI };
    state = run(state, { forward: 1, turn: 0 }, 60);

    // Heading π là -Z; vị trí Z phải giảm.
    expect(state.z).toBeLessThan(POND.z);
  });
});

describe("SwimModel — lặn", () => {
  const DIVE: SwimInput = { forward: 0, turn: 0, dive: true };

  it("có đúng hai bông chìm ở đáy, sâu 0,6–1,2 m", () => {
    const sunk = createSwimState(POND).lotuses.filter((lotus) => lotus.depth > 0);

    expect(sunk).toHaveLength(2);

    for (const lotus of sunk) {
      expect(lotus.depth).toBeGreaterThanOrEqual(0.6);
      expect(lotus.depth).toBeLessThanOrEqual(DEFAULT_SWIM.depthMax);
    }
  });

  it("sen chìm không nhặt được từ mặt nước, lặn xuống thì nhặt được", () => {
    let state = createSwimState(POND);
    const index = state.lotuses.findIndex((lotus) => lotus.depth > 0);
    const lotus = state.lotuses[index];

    state = { ...state, x: lotus.homeX, z: lotus.homeZ };

    expect(stepSwim(state, IDLE, 1 / 60).lotuses[index].caught).toBe(false);

    const dived = stepSwim({ ...state, depth: lotus.depth }, DIVE, 1 / 60);

    expect(dived.lotuses[index].caught).toBe(true);
  });

  it("giữ lặn thì chìm tới đáy rồi dừng, hơi tụt dần", () => {
    const state = run(createSwimState(POND), DIVE, 120);

    expect(state.depth).toBeCloseTo(DEFAULT_SWIM.depthMax, 6);
    expect(state.air).toBeLessThan(1);
    expect(state.air).toBeGreaterThan(0);
  });

  it("hết hơi thì tự nổi lên, mất đà, depth về 0 và không bao giờ âm", () => {
    let state = createSwimState(POND);
    let lowest = 0;

    // Giữ lặn VÀ đạp tới suốt 20 giây — lâu hơn hẳn một hơi.
    for (let frame = 0; frame < 20 * 60; frame += 1) {
      state = stepSwim(state, { forward: 1, turn: 0, dive: true }, 1 / 60);
      lowest = Math.min(lowest, state.depth);

      if (state.air === 0) {
        expect(state.gasping).toBe(true);
      }
    }

    expect(lowest).toBe(0);

    // Lúc vừa hết hơi: tốc độ chạy về 0 và người nổi dần lên.
    let gasp = createSwimState(POND);

    while (gasp.air > 0) gasp = stepSwim(gasp, { forward: 1, turn: 0, dive: true }, 1 / 60);

    const after = run(gasp, { forward: 1, turn: 0, dive: true }, 90);

    expect(after.depth).toBe(0);
    expect(after.speed).toBeLessThan(0.3);
    expect(after.gasping).toBe(true);
  });

  it("lên mặt nước thì hồi đầy hơi", () => {
    const tired = { ...createSwimState(POND), air: 0.1 };
    const rested = run(tired, IDLE, Math.ceil(DEFAULT_SWIM.breathRecover * 60));

    expect(rested.air).toBe(1);
    expect(rested.gasping).toBe(false);
  });
});

describe("SwimModel — đàn cá", () => {
  it("cá luôn ở trong vùng bơi được", () => {
    let state = createSwimState(POND);

    for (let frame = 0; frame < 60 * 30; frame += 1) {
      state = stepSwim(state, IDLE, 1 / 60);

      for (const fish of state.fish) {
        expect(Math.hypot(fish.x - POND.x, fish.z - POND.z)).toBeLessThanOrEqual(
          DEFAULT_SWIM.radius + 1e-6,
        );
      }
    }

    expect(state.fish).toHaveLength(FISH_COUNT);
  });

  it("bơi chạm cá: +1 đúng một lần, cá vọt đi rồi mới chạm lại được", () => {
    let state = stepSwim(createSwimState(POND), IDLE, 1 / 60);
    const fish = state.fish[0];

    state = stepSwim({ ...state, x: fish.x, z: fish.z }, IDLE, 1 / 60);

    expect(state.tagged).toBe(1);
    expect(state.justTagged).toBe(0);

    // Đứng yên tại chỗ: con cá đã hoảng, không tính thêm.
    for (let frame = 0; frame < 30; frame += 1) {
      state = stepSwim({ ...state, x: state.fish[0].x, z: state.fish[0].z }, IDLE, 1 / 60);
    }

    expect(state.tagged).toBe(1);
  });
});
