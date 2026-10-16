import { describe, expect, it } from "vitest";

import {
  createShuttleState,
  stepShuttle,
  canServe,
  DEFAULT_SHUTTLE,
} from "../model";

import type { ShuttleInput, ShuttleState, ShuttleTuning } from "../model";

/**
 * Mô hình đá cầu — luật chơi thuần số.
 *
 * Bốn điều khoá:
 *  1. **Tung lại phải ở gần** — cầu nằm tít ngoài sân mà bấm đá là không
 *     xảy ra gì cả.
 *  2. **Cửa đá là một dải cao độ** — quá cao hay quá thấp đều đá hụt; đó
 *     là toàn bộ độ khó của trò.
 *  3. **Liên tiếp cộng dồn, chạm đất là về không** — `best` giữ đúng kỷ
 *     lục một lượt.
 *  4. **Tất định** — hướng đẩy lệch ngang là hàm của số thứ tự cú đá.
 */

const PLAYER = { x: 0, z: 0 };
const IDLE: ShuttleInput = { kick: false };

/**
 * Chờ cầu rơi vào khoảng đá được (0,5 … 1,5 m) — đúng nhịp một người chơi
 * thật chạy tới chỗ cầu rồi vung chân. Trả về state SAU cú đá.
 */
function rallyOneKick(
  state: ShuttleState,
  player: { x: number; z: number },
  tuning: ShuttleTuning = DEFAULT_SHUTTLE,
): ShuttleState {
  let current = state;

  for (let frame = 0; frame < 1200; frame += 1) {
    const inWindow =
      current.phase === "rally" &&
      current.y >= 0.5 &&
      current.y <= Math.min(1.5, tuning.kickHigh);

    if (inWindow) break;

    if (current.phase === "ready") return current;

    current = stepShuttle(current, player, IDLE, 1 / 60);
  }

  return stepShuttle(current, player, { kick: true }, 1 / 60);
}

/** Chờ cầu chạm sân (hoặc 10 giây, sao tới trước). */
function untilLanded(state: ShuttleState, player: { x: number; z: number }): ShuttleState {
  let current = state;

  for (let frame = 0; frame < 600 && current.phase === "rally"; frame += 1) {
    current = stepShuttle(current, player, IDLE, 1 / 60);
  }

  return current;
}

describe("Đá cầu — tung lại", () => {
  it("bấm đá khi đứng cạnh cầu là tung lên; đứng xa thì không xảy ra gì", () => {
    const near = stepShuttle(createShuttleState(0.4, 0), PLAYER, { kick: true }, 1 / 60);

    expect(near.phase).toBe("rally");
    expect(near.vy).toBeGreaterThan(0);
    expect(near.justKicked).toBe(true);

    const far = stepShuttle(createShuttleState(6, 6), PLAYER, { kick: true }, 1 / 60);

    expect(far.phase).toBe("ready");
    expect(far.justKicked).toBe(false);
  });

  it("`canServe` đúng bằng bán kính tung lại, và chỉ ở pha ready", () => {
    const close = createShuttleState(DEFAULT_SHUTTLE.serveReach - 0.01, 0);

    expect(canServe(close, PLAYER)).toBe(true);
    expect(canServe(createShuttleState(DEFAULT_SHUTTLE.serveReach + 0.5, 0), PLAYER)).toBe(
      false,
    );

    expect(canServe({ ...close, phase: "rally", y: 1 }, PLAYER)).toBe(false);
  });
});

describe("Đá cầu — lượt đang chạy", () => {
  it("ba cú liên tiếp rồi rơi: kỷ lục đúng, pha về ready, cầu nằm lại chỗ rơi", () => {
    let state = stepShuttle(createShuttleState(0, 0), PLAYER, { kick: true }, 1 / 60);

    for (let kick = 1; kick <= 3; kick += 1) {
      // Người chơi lý tưởng đứng ngay dưới cầu — cầu trôi đi bao nhiêu thì
      // chạy theo bấy nhiêu.
      state = rallyOneKick(state, { x: state.x, z: state.z });

      expect(state.justKicked).toBe(true);
      expect(state.combo).toBe(kick);
    }

    state = untilLanded(state, { x: state.x, z: state.z });

    expect(state.phase).toBe("ready");
    expect(state.y).toBe(0);
    expect(state.combo).toBe(0);
    expect(state.best).toBe(3);
    expect(state.justLanded).toBe(true);
  });

  it("đá hụt khi cầu quá cao — trên tầm với là không với tới", () => {
    let state = stepShuttle(createShuttleState(0, 0), PLAYER, { kick: true }, 1 / 60);

    // Chờ vượt qua cửa đá (2,1 m) — đỉnh của cú tung là ~2,5 m nên có vượt.
    for (let frame = 0; frame < 600 && state.y <= DEFAULT_SHUTTLE.kickHigh; frame += 1) {
      state = stepShuttle(state, PLAYER, IDLE, 1 / 60);
    }

    expect(state.y).toBeGreaterThan(DEFAULT_SHUTTLE.kickHigh);

    const tooHigh = stepShuttle(state, PLAYER, { kick: true }, 1 / 60);

    expect(tooHigh.justKicked).toBe(false);
    expect(tooHigh.combo).toBe(0);
  });

  it("đá hụt khi cầu quá thấp — sát mặt sân là đã lỡ nhịp", () => {
    const served = stepShuttle(createShuttleState(0, 0), PLAYER, { kick: true }, 1 / 60);

    // Giả lập một frame mà cầu đang ở 5 cm, sắp chạm đất.
    const grazing = {
      ...served,
      phase: "rally" as const,
      y: 0.05,
      vy: -2,
    };

    const tooLow = stepShuttle(grazing, PLAYER, { kick: true }, 1 / 60);

    expect(tooLow.justKicked).toBe(false);
  });

  it("liên tiếp thì càng đá càng cao, nhưng có trần", () => {
    let state = stepShuttle(createShuttleState(0, 0), PLAYER, { kick: true }, 1 / 60);

    const kicks: number[] = [];

    for (let kick = 0; kick < 40; kick += 1) {
      // Người chơi lý tưởng luôn chạy theo đúng chỗ cầu rơi.
      state = rallyOneKick(state, { x: state.x, z: state.z });

      expect(state.justKicked).toBe(true);
      kicks.push(state.vy);
    }

    const ceiling = DEFAULT_SHUTTLE.kickSpeed + DEFAULT_SHUTTLE.climbMax;

    for (const vy of kicks) expect(vy).toBeLessThanOrEqual(ceiling + 1e-9);

    // Cú thứ 20 mạnh hơn cú thứ 1 — liên tiếp phải CÓ NGHĨA trước chạm trần.
    expect(kicks[19]).toBeGreaterThan(kicks[0]);
  });

  it("mỗi cú đẩy cầu lệch hướng so le — và tất định ở mọi lượt", () => {
    const playSix = () => {
      let state = stepShuttle(createShuttleState(0, 0), PLAYER, { kick: true }, 1 / 60);

      for (let kick = 0; kick < 6; kick += 1) {
        state = rallyOneKick(state, { x: state.x, z: state.z });
      }

      return state;
    };

    const state = playSix();
    const twin = playSix();

    // Cú đá cuối cùng đẩy cầu đi — đứng yên một chỗ thì người chơi khỏi chạy.
    expect(Math.hypot(state.vx, state.vz)).toBeGreaterThan(0.01);

    // Hai lượt cho y hệt kết quả — không có số ngẫu nhiên thật.
    expect(twin.x).toBe(state.x);
    expect(twin.z).toBe(state.z);
    expect(twin.vx).toBe(state.vx);
    expect(twin.vz).toBe(state.vz);
  });

  it("dt = 0 là một bước im lặng", () => {
    const state = stepShuttle(createShuttleState(0, 0), PLAYER, { kick: true }, 0);

    expect(state.y).toBe(0);
    expect(state.t).toBe(0);
  });

  it("cầu không bao giờ chìm dưới sân hay ra khỏi tọa độ hữu hạn", () => {
    let state = createShuttleState(0, 0);

    // 10 phút bấm đá bừa bãi mọi thứ — mô hình không có đường nào vỡ được.
    for (let frame = 0; frame < 60 * 600; frame += 1) {
      state = stepShuttle(state, PLAYER, { kick: frame % 30 === 0 }, 1 / 60);

      expect(state.y).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(state.x)).toBe(true);
      expect(Number.isFinite(state.z)).toBe(true);
    }
  });
});
