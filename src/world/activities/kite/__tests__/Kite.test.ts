import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { kiteWorldPosition } from "../Kite";
import { describeKiteResult } from "../KiteActivity";
import { createKiteState, DEFAULT_KITE } from "../model";

import type { SkyFrame } from "../Kite";
import type { KiteState } from "../model";

function makeFrame(): SkyFrame {
  const forward = new THREE.Vector3(1, 0, 0).normalize();

  return {
    origin: new THREE.Vector3(2, 0, 5),
    forward,
    right: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize(),
  };
}

describe("kiteWorldPosition", () => {
  it("độ cao đi thẳng lên: y = mặt đất + độ cao", () => {
    const frame = makeFrame();
    const state = { ...createKiteState(), altitude: 21.5 };

    const position = kiteWorldPosition(frame, state);

    expect(position.y).toBeCloseTo(21.5, 6);
  });

  it("dây càng dài thì diều càng bay xa theo hướng đã khai báo", () => {
    const frame = makeFrame();
    const base = { ...createKiteState(), altitude: 10 };

    const near = kiteWorldPosition(frame, { ...base, lineLength: 20 });
    const far = kiteWorldPosition(frame, { ...base, lineLength: 55 });

    expect(far.x).toBeGreaterThan(near.x);
  });

  it("lạng ngang đẩy diều theo trục ngang của vùng trời", () => {
    const frame = makeFrame();
    const base = { ...createKiteState(), altitude: 12, lineLength: 40 };

    const left = kiteWorldPosition(frame, { ...base, lateral: -6 });
    const right = kiteWorldPosition(frame, { ...base, lateral: 6 });

    expect(left.distanceTo(right)).toBeCloseTo(12, 6);
  });

  it("ở trần độ cao (0,95·dây) vẫn ra toạ độ thật, không NaN", () => {
    const frame = makeFrame();

    const atCeiling: KiteState = {
      ...createKiteState(),
      lineLength: DEFAULT_KITE.lineMax,
      altitude: DEFAULT_KITE.lineMax * DEFAULT_KITE.lineCeiling,
    };

    const position = kiteWorldPosition(frame, atCeiling);

    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
    expect(Number.isFinite(position.z)).toBe(true);
  });

  it("không sửa vector truyền vào của khung trời", () => {
    const frame = makeFrame();
    const originBefore = frame.origin.clone();

    kiteWorldPosition(frame, createKiteState());

    expect(frame.origin.equals(originBefore)).toBe(true);
  });
});

describe("describeKiteResult", () => {
  const base: KiteState = { ...createKiteState(), score: 412.6, best: 38.4 };

  it("ba cách kết thúc cho ba lời khác nhau", () => {
    const titles = (["snapped", "landed", "timeout"] as const).map(
      (outcome) => describeKiteResult({ ...base, over: true, outcome }).title,
    );

    expect(new Set(titles).size).toBe(3);
  });

  it("giữ nguyên điểm và độ cao cao nhất, đã làm tròn", () => {
    const result = describeKiteResult({ ...base, over: true, outcome: "timeout" });

    expect(result.score).toBe(413);
    expect(result.bestAltitude).toBe(38);
    expect(result.outcome).toBe("timeout");
  });

  it("chưa có kết quả thì coi như hết giờ — không bao giờ trả về undefined", () => {
    const result = describeKiteResult(base);

    expect(result.outcome).toBe("timeout");
    expect(result.detail.length).toBeGreaterThan(0);
  });
});
