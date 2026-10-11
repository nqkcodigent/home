import { describe, expect, it } from "vitest";

import {
  createKiteState,
  stepKite,
  thermalsAt,
  windDirection,
  windStrength,
  DEFAULT_KITE,
  KITE_SPAN,
} from "../model";

import type { KiteInput, KiteState } from "../model";

const IDLE: KiteInput = { reel: 0, steer: 0 };
const RELEASE: KiteInput = { reel: -0.6, steer: 0 };

/** Chạy `seconds` giây ở 60 fps; `input` có thể là hàm của (t, state). */
function simulate(
  state: KiteState,
  input: KiteInput | ((t: number, state: KiteState) => KiteInput),
  seconds: number,
): KiteState {
  const dt = 1 / 60;
  const steps = Math.round(seconds / dt);
  let current = state;

  for (let index = 0; index < steps; index += 1) {
    const next = typeof input === "function" ? input(index * dt, current) : input;

    current = stepKite(current, next, dt);
  }

  return current;
}

/** Thời điểm gió mạnh nhất trong 30 giây đầu — dùng để dựng cảnh "gặp gió giật". */
function gustyMoment(seconds = 30): number {
  let best = 0;

  for (let t = 0; t < seconds; t += 0.05) {
    if (windStrength(t) > windStrength(best)) best = t;
  }

  return best;
}

describe("windStrength", () => {
  it("luôn nằm trong khoảng 0,08…1", () => {
    for (let step = 0; step < 400; step += 1) {
      const wind = windStrength(step * 0.37);

      expect(wind).toBeGreaterThanOrEqual(0.08);
      expect(wind).toBeLessThanOrEqual(1);
    }
  });

  it("có lúc mạnh lúc yếu — gió đứng yên một mức thì không có gì để chơi", () => {
    const samples = Array.from({ length: 120 }, (_, index) => windStrength(index * 0.4));

    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.3);
  });

  it("hướng gió xoay theo thời gian", () => {
    expect(windDirection(0)).not.toBe(windDirection(30));
  });
});

describe("thermalsAt", () => {
  it("tất định: cùng thời điểm cho cùng kết quả", () => {
    expect(thermalsAt(12.5)).toEqual(thermalsAt(12.5));
  });

  it("một thời điểm chỉ có vài cột, và cột mới sinh dần theo thời gian", () => {
    const early = thermalsAt(0);

    expect(early.length).toBeGreaterThanOrEqual(1);
    expect(early.length).toBeLessThanOrEqual(3);

    const later = thermalsAt(60).map((cone) => cone.index);

    expect(Math.max(...later)).toBeGreaterThan(Math.max(...early.map((c) => c.index)));
  });

  it("sắp theo thời điểm sinh — bên gọi biết cột nào sắp tắt", () => {
    const indexes = thermalsAt(24).map((cone) => cone.index);

    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes);
  });

  it("mọi cột đều nằm trong vùng bay được, kể cả cột sinh trước mốc 0", () => {
    for (let step = 0; step < 60; step += 1) {
      for (const cone of thermalsAt(step * 1.1)) {
        expect(Math.abs(cone.x)).toBeLessThanOrEqual(KITE_SPAN);
        expect(cone.radius).toBeGreaterThan(0);
        expect(cone.strength).toBeGreaterThan(0);
        expect(cone.remaining).toBeGreaterThan(0);
      }
    }
  });
});

describe("stepKite", () => {
  it("bắt đầu giữa không trung với trọn thời gian", () => {
    const state = createKiteState();

    expect(state.altitude).toBeGreaterThan(0);
    expect(state.over).toBe(false);
    expect(state.timeLeft).toBe(DEFAULT_KITE.duration);
  });

  it("KHÔNG sửa trạng thái truyền vào — mô phỏng là hàm thuần", () => {
    const state = Object.freeze(createKiteState());

    // Nếu stepKite gán vào state, chế độ strict của ESM sẽ ném TypeError.
    expect(() => stepKite(state, RELEASE, 1 / 60)).not.toThrow();
  });

  it("thả dây thì lên cao", () => {
    const start = createKiteState();
    const after = simulate(start, RELEASE, 6);

    expect(after.altitude).toBeGreaterThan(start.altitude + 4);
    expect(after.climb).toBeGreaterThan(0);
  });

  it("thu dây liên tục thì diều bị ghì xuống đất — không phải đứt dây", () => {
    const after = simulate(createKiteState(), { reel: 1, steer: 0 }, 12);

    expect(after.over).toBe(true);
    expect(after.outcome).toBe("landed");
    expect(after.lineLength).toBe(DEFAULT_KITE.lineMin);
    expect(after.tension).toBeLessThan(DEFAULT_KITE.snapTension);
  });

  it("thả dây hết cỡ rồi gặp cơn gió mạnh thì đứt", () => {
    const after = simulate(createKiteState(), { reel: -1, steer: 0 }, 24);

    expect(after.over).toBe(true);
    expect(after.outcome).toBe("snapped");
    expect(after.lineLength).toBe(DEFAULT_KITE.lineMax);
  });

  it("dây ngắn thì gió mạnh cũng không đứt — rủi ro đến từ độ DÀI của dây", () => {
    const gust = gustyMoment();

    const short = simulate(
      { ...createKiteState(), t: gust, lineLength: DEFAULT_KITE.lineMin + 6 },
      IDLE,
      1.5,
    );

    expect(short.over).toBe(false);
    expect(short.tension).toBeLessThan(DEFAULT_KITE.snapTension);
  });

  it("chơi cẩn thận thì sống hết giờ và có điểm", () => {
    const after = simulate(
      createKiteState(),
      // Căng thì thu dây, rảnh thì thả dây: đúng vòng lặp mà HUD dạy.
      (_t, state) =>
        state.tension > 0.62
          ? { reel: 1, steer: 0 }
          : state.tension < 0.5
            ? { reel: -0.55, steer: 0 }
            : IDLE,
      DEFAULT_KITE.duration + 1,
    );

    expect(after.over).toBe(true);
    expect(after.outcome).toBe("timeout");
    expect(after.timeLeft).toBe(0);
    expect(after.score).toBeGreaterThan(0);
    expect(after.best).toBeGreaterThan(10);
  });

  it("trần độ cao bằng độ dài dây — dây ngắn thì gió to cũng không lên được", () => {
    const gust = gustyMoment();
    const start = { ...createKiteState(), t: gust, climb: 0, altitude: 10 };

    const shortLine = simulate({ ...start, lineLength: 8 }, IDLE, 8);
    const longLine = simulate({ ...start, lineLength: 40 }, IDLE, 8);

    expect(shortLine.altitude).toBeLessThanOrEqual(8 * DEFAULT_KITE.lineCeiling + 0.5);
    expect(longLine.altitude).toBeGreaterThan(shortLine.altitude);
  });

  it("bay vào cột khí nóng thì lên nhanh hơn hẳn bay ngoài", () => {
    const t = 8;
    const cone = thermalsAt(t).find((entry) => Math.abs(entry.x) < 8);
    const base = { ...createKiteState(), t, altitude: 12, climb: 0, lineLength: 40 };

    expect(cone).toBeDefined();

    const inside = simulate({ ...base, lateral: cone!.x }, { reel: -0.3, steer: 0 }, 1.5);
    const outside = simulate(
      { ...base, lateral: cone!.x + 12 },
      { reel: -0.3, steer: 0 },
      1.5,
    );

    expect(inside.altitude).toBeGreaterThan(outside.altitude + 1);
    expect(inside.thermals).toBeGreaterThan(0);
    expect(inside.score).toBeGreaterThan(outside.score);
  });

  it("bắt cùng một cột hai lần thì không cộng điểm hai lần", () => {
    const t = 8;
    const cone = thermalsAt(t).find((entry) => Math.abs(entry.x) < 8)!;
    const base = { ...createKiteState(), t, lateral: cone.x, lineLength: 40, altitude: 12 };

    const first = simulate(base, IDLE, 2);
    const second = simulate({ ...first, t: first.t, lateral: cone.x }, IDLE, 2);

    expect(first.thermals).toBe(1);
    expect(second.thermals).toBe(1);
  });

  it("gió đẩy diều trôi ngang, người chơi phải lạng để bù", () => {
    const drifting = simulate(createKiteState(), IDLE, 5);

    expect(drifting.lateral).toBeGreaterThan(1);
  });

  it("lạng bị kẹp trong vùng trời, không bay ra ngoài bản đồ", () => {
    const after = simulate(createKiteState(), { reel: 0, steer: -1 }, 30);

    expect(after.lateral).toBeGreaterThanOrEqual(-KITE_SPAN * 1.25);
    expect(after.lateral).toBeLessThanOrEqual(KITE_SPAN * 1.25);
  });

  it("60 giây chơi liên tục không sinh ra NaN hay giá trị vô cực", () => {
    const after = simulate(
      createKiteState(),
      (t, state) => ({
        reel: Math.sin(t * 1.7) * (state.tension > 0.5 ? 0.4 : -0.4),
        steer: Math.sin(t * 0.9),
      }),
      60,
    );

    for (const value of [
      after.altitude,
      after.climb,
      after.lateral,
      after.lineLength,
      after.tension,
      after.score,
      after.best,
      after.timeLeft,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("ván đã kết thúc thì đứng yên, không chạy tiếp", () => {
    const finished = simulate(createKiteState(), { reel: 1, steer: 0 }, 12);
    const frozen = stepKite(finished, RELEASE, 1);

    expect(finished.over).toBe(true);
    expect(frozen).toBe(finished);
  });
});
