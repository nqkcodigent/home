import { describe, expect, it } from "vitest";

import {
  createMotionState,
  shortestAngle,
  stepMotion,
  worldDirection,
  DEFAULT_MOTION,
} from "../motion";

import type { MotionState } from "../motion";

const IDLE = { forward: 0, right: 0, run: false };

/** Chạy n bước 1/60s rồi trả về trạng thái cuối. */
function simulate(
  state: MotionState,
  input: { forward: number; right: number; run: boolean },
  seconds: number,
  cameraYaw = 0,
) {
  const steps = Math.round(seconds * 60);

  for (let i = 0; i < steps; i += 1) {
    state = stepMotion(state, input, cameraYaw, 1 / 60).state;
  }

  return state;
}

describe("worldDirection", () => {
  it("đi thẳng về -Z khi camera hướng 0", () => {
    const dir = worldDirection({ forward: 1, right: 0, run: false }, 0);

    expect(dir.x).toBeCloseTo(0, 6);
    expect(dir.z).toBeCloseTo(-1, 6);
  });

  it("sang phải là +X khi camera hướng 0", () => {
    const dir = worldDirection({ forward: 0, right: 1, run: false }, 0);

    expect(dir.x).toBeCloseTo(1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it("xoay theo camera", () => {
    const quarter = Math.PI / 2;
    const dir = worldDirection({ forward: 1, right: 0, run: false }, quarter);

    expect(dir.x).toBeCloseTo(-1, 6);
    expect(dir.z).toBeCloseTo(0, 6);
  });

  it("chéo được chuẩn hoá — đi chéo không nhanh hơn đi thẳng", () => {
    const dir = worldDirection({ forward: 1, right: 1, run: false }, 0);

    expect(Math.hypot(dir.x, dir.z)).toBeCloseTo(1, 6);
  });

  it("không input thì không có hướng", () => {
    expect(worldDirection(IDLE, 1.2)).toEqual({ x: 0, z: 0 });
  });
});

describe("stepMotion", () => {
  it("đứng yên thì không di chuyển và pha bước đứng im", () => {
    const step = stepMotion(createMotionState(), IDLE, 0, 1 / 60);

    expect(step.moving).toBe(false);
    expect(step.distance).toBe(0);
    expect(step.state.gaitPhase).toBe(0);
    expect(step.state.x).toBe(0);
    expect(step.state.z).toBe(0);
  });

  it("tăng tốc dần tới tốc độ đi bộ rồi dừng ở đó", () => {
    const state = simulate(createMotionState(), { forward: 1, right: 0, run: false }, 2);

    expect(state.speed).toBeCloseTo(DEFAULT_MOTION.walkSpeed, 3);

    const travelled = Math.abs(state.z);

    expect(travelled).toBeGreaterThan(3);
  });

  it("Shift chạy nhanh hơn", () => {
    const walk = simulate(createMotionState(), { forward: 1, right: 0, run: false }, 3);
    const run = simulate(createMotionState(), { forward: 1, right: 0, run: true }, 3);

    expect(run.speed).toBeGreaterThan(walk.speed);
    expect(Math.abs(run.z)).toBeGreaterThan(Math.abs(walk.z));
  });

  it("không vượt quá tốc độ tối đa kể cả sau nhiều giây", () => {
    const state = simulate(createMotionState(), { forward: 1, right: 0, run: true }, 30);

    expect(state.speed).toBeLessThanOrEqual(DEFAULT_MOTION.runSpeed + 1e-6);
  });

  it("nhả phím thì giảm tốc về 0", () => {
    let state = simulate(createMotionState(), { forward: 1, right: 0, run: false }, 1);

    expect(state.speed).toBeGreaterThan(0);

    state = simulate(state, IDLE, 1);

    expect(state.speed).toBeCloseTo(0, 3);
  });

  it("xoay dần về hướng đi thay vì bẻ ngoặt", () => {
    const first = stepMotion(createMotionState(), { forward: 1, right: 0, run: false }, 0, 1 / 60);

    // Hướng đích là π (nhìn về -Z theo quy ước atan2) nhưng một frame chưa tới
    expect(Math.abs(shortestAngle(0, first.state.yaw))).toBeLessThanOrEqual(
      DEFAULT_MOTION.turnRate / 60 + 1e-9,
    );

    const settled = simulate(createMotionState(), { forward: 1, right: 0, run: false }, 2);

    expect(Math.abs(shortestAngle(settled.yaw, Math.PI))).toBeLessThan(0.01);
  });

  it("giữ nguyên tốc độ khi đã đúng tốc độ đi bộ", () => {
    const dt = 0.25;

    const step = stepMotion(
      { ...createMotionState(), speed: DEFAULT_MOTION.walkSpeed },
      { forward: 1, right: 0, run: false },
      0,
      dt,
    );

    expect(step.state.speed).toBeCloseTo(DEFAULT_MOTION.walkSpeed, 9);
    expect(step.distance).toBeCloseTo(DEFAULT_MOTION.walkSpeed * dt, 9);
  });

  it("pha bước chân tăng theo quãng đường đã đi, không theo thời gian", () => {
    const dt = 0.25;

    const step = stepMotion(
      { ...createMotionState(), speed: DEFAULT_MOTION.walkSpeed },
      { forward: 1, right: 0, run: false },
      0,
      dt,
    );

    expect(step.distance).toBeGreaterThan(0);
    expect(step.state.gaitPhase).toBeCloseTo(
      (step.distance * DEFAULT_MOTION.stridesPerMetre) % 1,
      9,
    );
    expect(step.state.gaitPhase).toBeGreaterThan(0);
    expect(step.state.gaitPhase).toBeLessThan(1);
  });

  it("dt âm hoặc bằng 0 không phá trạng thái", () => {
    const state = { x: 1, z: 2, yaw: 0.5, speed: 3, gaitPhase: 0.25 };

    for (const dt of [0, -1]) {
      const step = stepMotion(state, { forward: 1, right: 0, run: false }, 0, dt);

      expect(step.state.x).toBe(1);
      expect(step.state.z).toBe(2);
      expect(step.state.gaitPhase).toBe(0.25);
    }
  });
});

describe("shortestAngle", () => {
  it("đi đường ngắn khi vượt qua mốc π", () => {
    expect(shortestAngle(3.1, -3.1)).toBeCloseTo(0.0832, 3);
  });

  it("giữ nguyên khi hai góc trùng", () => {
    expect(shortestAngle(1.234, 1.234)).toBeCloseTo(0, 9);
  });
});
