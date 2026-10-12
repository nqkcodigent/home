import { describe, expect, it } from "vitest";

import {
  createKiteState,
  endKite,
  gustNoise,
  snapRate,
  stepKite,
  thermalsAt,
  windDirection,
  windStrength,
  DEFAULT_KITE,
  KITE_DRIFT_SPAN,
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

/**
 * Chạy tới lúc dây đứt và trả về thời điểm đứt (giây). Dùng chung cho các
 * test so sánh cách chơi — ném lỗi nếu dây không bao giờ đứt, vì khi đó ván
 * diều mất hẳn cao trào.
 */
function timeToSnap(
  input: KiteInput | ((t: number, state: KiteState) => KiteInput),
): number {
  const dt = 1 / 60;
  let state = createKiteState();

  for (let index = 0; index < 60 * 240; index += 1) {
    const next = typeof input === "function" ? input(index * dt, state) : input;

    state = stepKite(state, next, dt);

    if (state.phase === "adrift") return state.snapAt ?? state.t;
  }

  throw new Error("dây không bao giờ đứt — ván diều sẽ không có cao trào");
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
  it("bắt đầu giữa không trung, dây còn nguyên và chưa có nguy cơ nào", () => {
    const state = createKiteState();

    expect(state.altitude).toBeGreaterThan(0);
    expect(state.over).toBe(false);
    expect(state.phase).toBe("flying");
    expect(state.strain).toBe(0);
    expect(state.snapAt).toBeUndefined();
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

  it("thu dây liên tục thì diều bị ghì xuống cỏ — không phải đứt dây", () => {
    const after = simulate(createKiteState(), { reel: 1, steer: 0 }, 12);

    expect(after.lineLength).toBe(DEFAULT_KITE.lineMin);
    expect(after.tension).toBeLessThan(DEFAULT_KITE.snapTension);
    // Ghì xuống là hậu quả trong mô phỏng, KHÔNG phải một kết thúc: ván chỉ
    // kết thúc khi người chơi cất diều.
    expect(after.over).toBe(false);
    expect(after.altitude).toBeLessThan(3);
  });

  it("thả dây hết cỡ rồi gặp cơn gió mạnh thì dây đứt — chuyển sang pha trôi", () => {
    const after = simulate(createKiteState(), { reel: -1, steer: 0 }, 24);

    expect(after.phase).toBe("adrift");
    expect(after.lineLength).toBe(DEFAULT_KITE.lineMax);
    expect(after.snapAt).toBeGreaterThan(DEFAULT_KITE.snapGrace);
    expect(after.snapAt).toBeLessThanOrEqual(after.t);
    expect(after.tension).toBe(0);
    // Đứt dây KHÔNG kết thúc ván: người chơi còn ngồi xem diều trôi.
    expect(after.over).toBe(false);
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

  it("chơi cẩn thận thì dây bền hơn hẳn thả phóng", () => {
    // Chỉ số duy nhất khiến việc thu dây có nghĩa: cùng một trường gió, cùng
    // một con diều, cách chơi quyết định dây còn hay mất — và còn được bao lâu.
    //
    // Người chơi cẩn thận làm ĐÚNG hai việc mà HUD dạy: giữ dây chùng vừa
    // phải, và lạng về giữa sân chứ không để diều trôi ra sát mép.
    const careful = timeToSnap((_t, state) => ({
      reel: state.tension > 0.52 ? 1 : state.tension < 0.4 ? -0.55 : 0,
      steer: Math.abs(state.lateral) < 1 ? 0 : state.lateral > 0 ? -1 : 1,
    }));

    const reckless = timeToSnap(() => ({ reel: -1, steer: 0 }));

    expect(careful).toBeGreaterThan(reckless * 1.5);
    expect(careful).toBeGreaterThan(DEFAULT_KITE.snapGrace * 2);
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

  it("ba phút bay liên tục (kể cả sau khi đứt dây) không sinh ra NaN hay vô cực", () => {
    const after = simulate(
      createKiteState(),
      (t, state) => ({
        reel: Math.sin(t * 1.7) * (state.tension > 0.5 ? 0.4 : -0.4),
        steer: Math.sin(t * 0.9),
      }),
      180,
    );

    for (const value of [
      after.altitude,
      after.climb,
      after.lateral,
      after.lineLength,
      after.tension,
      after.score,
      after.best,
      after.strain,
      after.drift,
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("ván đã kết thúc thì đứng yên, không chạy tiếp", () => {
    const finished = endKite(createKiteState(), "stowed");
    const frozen = stepKite(finished, RELEASE, 1);

    expect(finished.over).toBe(true);
    expect(frozen).toBe(finished);
  });
});

describe("đứt dây", () => {

  it("trong thời gian miễn đứt thì không gì làm dây đứt được", () => {
    // Thả hết dây là cách chơi rủi ro nhất, mà vẫn phải yên trong `snapGrace`
    // giây đầu: ván nào cũng cần một quãng để người chơi kịp nhìn thấy diều.
    const state = simulate(createKiteState(), { reel: -1, steer: 0 }, DEFAULT_KITE.snapGrace - 0.2);

    expect(state.phase).toBe("flying");
    expect(snapRate({ ...state, t: DEFAULT_KITE.snapGrace - 0.1 })).toBe(0);
  });

  it("nguy cơ tăng theo LỰC CĂNG — đúng con số người chơi nhìn trên HUD", () => {
    const base = { ...createKiteState(), t: 20, lateral: 0 };

    const slack = snapRate({ ...base, tension: 0.3 });
    const taut = snapRate({ ...base, tension: 0.9 });

    expect(taut).toBeGreaterThan(slack * 4);
  });

  it("diều trôi ra sát mép vùng trời thì nguy cơ tăng vọt — 'quá xa' cũng làm đứt", () => {
    const base = { ...createKiteState(), t: 20, lineLength: 48, tension: 0.6 };

    const near = snapRate({ ...base, lateral: 0 });
    const far = snapRate({ ...base, lateral: KITE_SPAN * 1.2 });

    expect(far).toBeGreaterThan(near * 1.8);
  });

  it("cơn giật đổi theo từng khoảng hơn một giây, không rỉ đều", () => {
    const samples = Array.from({ length: 40 }, (_, index) => gustNoise(index * 1.2));

    expect(Math.min(...samples)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...samples)).toBeLessThan(1);
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.4);

    // Giữ nguyên trong cả một khoảng, nên nguy cơ dồn thành từng cơn.
    expect(gustNoise(3.0)).toBe(gustNoise(3.2));
    expect(gustNoise(3.0)).not.toBe(gustNoise(4.4));
  });

  it("cách chơi nào rồi cũng có lúc đứt, nhưng lúc đứt thì không ai hẹn trước", () => {
    const idle = timeToSnap(IDLE);
    const released = timeToSnap({ reel: -1, steer: 0 });

    expect(idle).toBeGreaterThan(DEFAULT_KITE.snapGrace);
    expect(released).toBeGreaterThan(DEFAULT_KITE.snapGrace);

    // Thả phóng thì mất dây sớm hơn hẳn giữ dây ngắn.
    expect(released).toBeLessThan(idle);
  });

  it("ván diều tất định: cùng lối chơi cho cùng thời điểm đứt", () => {
    expect(timeToSnap(IDLE)).toBe(timeToSnap(IDLE));
  });
});

describe("trôi tự do", () => {
  /** Trạng thái ngay sau khi dây đứt, ở một độ cao cho trước. */
  function adrift(altitude = 30, lateral = 0): KiteState {
    return {
      ...createKiteState(),
      t: 20,
      altitude,
      lateral,
      lineLength: 50,
      climb: -2,
      phase: "adrift",
      strain: 1,
      snapAt: 20,
    };
  }

  it("mất dây rồi thì không ai lái được nữa — input bị bỏ qua", () => {
    const still = simulate(adrift(), IDLE, 3);
    const pulled = simulate(adrift(), { reel: 1, steer: -1 }, 3);

    expect(pulled.lateral).toBeCloseTo(still.lateral, 6);
    expect(pulled.altitude).toBeCloseTo(still.altitude, 6);
  });

  it("diều trôi xa dần và tụt dần — chuyến phiêu lưu có hướng", () => {
    const start = adrift(40);
    const after = simulate(start, IDLE, 20);

    expect(after.lateral).toBeGreaterThan(start.lateral + 10);
    expect(after.altitude).toBeLessThan(start.altitude);
    expect(after.drift).toBeGreaterThan(10);
  });

  it("điểm tăng theo quãng đường trôi — đi xa là phần thưởng", () => {
    // Ở sát trần vùng trôi thì diều bị kẹp, không đi thêm được nữa — nên đây
    // là phép so sánh "cùng thời gian, khác quãng đường".
    const capped = simulate(adrift(30, KITE_DRIFT_SPAN), IDLE, 5);
    const free = simulate(adrift(30, 0), IDLE, 5);

    expect(free.drift).toBeGreaterThan(capped.drift + 3);
    expect(free.score).toBeGreaterThan(capped.score);
  });

  it("trôi mãi cũng không chạm đất hẳn, và không tự kết thúc ván", () => {
    const after = simulate(adrift(12), IDLE, 300);

    expect(after.over).toBe(false);
    expect(after.altitude).toBeGreaterThan(0);
    expect(Math.abs(after.lateral)).toBeLessThanOrEqual(KITE_DRIFT_SPAN);
  });

  it("kết thúc ván là việc của người chơi, và chỉ làm được một lần", () => {
    const ended = endKite(adrift(), "snapped");

    expect(ended.over).toBe(true);
    expect(ended.outcome).toBe("snapped");
    expect(endKite(ended, "stowed")).toBe(ended);
  });
});
