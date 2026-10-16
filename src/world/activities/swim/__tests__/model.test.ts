import { describe, expect, it } from "vitest";

import {
  createSwimState,
  stepSwim,
  swimBob,
  DEFAULT_SWIM,
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
      state = stepSwim({ ...state, x: lotus.homeX, z: lotus.homeZ }, IDLE, 1 / 60);
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
