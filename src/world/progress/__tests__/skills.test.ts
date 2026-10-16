import { describe, expect, it } from "vitest";

import { DEFAULT_KITE, createKiteState, stepKite } from "../../activities/kite/model";
import { DEFAULT_SHUTTLE } from "../../activities/shuttlecock/model";
import { DEFAULT_SWIM } from "../../activities/swim/model";
import { kiteTuning, shuttleTuning, swimTuning } from "../skills";

import type { KiteState, KiteTuning } from "../../activities/kite/model";

/**
 * Kỹ năng là DELTA TUNING, không phải một hệ thống mới — và đó là điều bộ test
 * này khoá lại. Hai luật:
 *
 *  1. Không có kỹ năng nào thì bộ số phải Y HỆT bộ số gốc, từng trường một.
 *  2. Kỹ năng NỚI CỬA SỔ, không phá luật. Cụ thể nhất: *Dây bền* dời ngưỡng
 *     đứt dây ra xa, nhưng thả hết dây thì dây vẫn phải đứt — nếu không thì
 *     "thả nhiều dây là liều" biến mất khỏi trò chơi.
 */

const ALL_KITE_SKILLS = [
  "kite-line-1",
  "kite-line-2",
  "kite-line-3",
  "kite-strong",
] as const;

/** Thả hết dây, không lạng: cách chơi liều nhất, và cách chắc chắn có ngày đứt. */
function timeToSnap(tuning: KiteTuning): number {
  const dt = 1 / 60;
  let state: KiteState = createKiteState(tuning);

  for (let index = 0; index < 60 * 40; index += 1) {
    state = stepKite(state, { reel: -1, steer: 0 }, dt, tuning);

    if (state.phase === "adrift") return state.t;
  }

  return Number.POSITIVE_INFINITY;
}

/** Những trường khác nhau giữa hai bộ số, xếp theo tên. */
function changedFields(base: object, next: object): string[] {
  const before = base as Record<string, unknown>;
  const after = next as Record<string, unknown>;

  return Object.keys(before)
    .filter((key) => before[key] !== after[key])
    .sort();
}

describe("kỹ năng — chỉ là con số", () => {
  it("không có kỹ năng nào thì bộ số y hệt bộ gốc, từng trường một", () => {
    expect(kiteTuning([])).toEqual(DEFAULT_KITE);
    expect(swimTuning([])).toEqual(DEFAULT_SWIM);
    expect(shuttleTuning([])).toEqual(DEFAULT_SHUTTLE);
  });

  it("mỗi cấp Dây dài nới trần dây thêm 12 m, và ba cấp là 96 m", () => {
    expect(kiteTuning(["kite-line-1"]).lineMax).toBe(72);
    expect(kiteTuning(["kite-line-1", "kite-line-2"]).lineMax).toBe(84);
    expect(kiteTuning(ALL_KITE_SKILLS).lineMax).toBe(96);
  });

  it("kỹ năng chỉ đụng vào đúng những trường của nó", () => {
    expect(changedFields(DEFAULT_KITE, kiteTuning(ALL_KITE_SKILLS))).toEqual([
      "lineMax",
      "snapGrace",
      "snapLoad",
    ]);
    expect(changedFields(DEFAULT_SWIM, swimTuning(["swim-stroke"]))).toEqual([
      "glide",
      "strokeRate",
    ]);
    expect(changedFields(DEFAULT_SWIM, swimTuning(["swim-eye"]))).toEqual(["reach"]);
    expect(changedFields(DEFAULT_SHUTTLE, shuttleTuning(["shuttle-spring"]))).toEqual([
      "reach",
    ]);
  });

  it("không sửa vào bộ số gốc — bộ gốc là của mọi người chơi mới", () => {
    const before = JSON.stringify([DEFAULT_KITE, DEFAULT_SWIM, DEFAULT_SHUTTLE]);

    kiteTuning(ALL_KITE_SKILLS);
    swimTuning(["swim-stroke", "swim-eye"]);
    shuttleTuning(["shuttle-spring"]);

    expect(JSON.stringify([DEFAULT_KITE, DEFAULT_SWIM, DEFAULT_SHUTTLE])).toBe(before);
  });
});

describe("kỹ năng — nới cửa sổ, không phá luật", () => {
  it("thả hết dây thì dây VẪN đứt, kể cả khi đã có Dây bền", () => {
    const withSkill = timeToSnap(kiteTuning(ALL_KITE_SKILLS));

    expect(Number.isFinite(withSkill)).toBe(true);
  });

  it("Dây bền dời ngưỡng đứt ra xa, chứ không bỏ nguy cơ đứt", () => {
    const plain = timeToSnap(DEFAULT_KITE);
    const tough = timeToSnap(kiteTuning(["kite-strong"]));

    expect(Number.isFinite(plain)).toBe(true);
    expect(tough).toBeGreaterThan(plain);
  });

  it("ngưỡng đứt tức thời thì kỹ năng KHÔNG đụng tới: căng quá vẫn đứt ngay", () => {
    expect(kiteTuning(ALL_KITE_SKILLS).snapTension).toBe(DEFAULT_KITE.snapTension);
  });

  it("Sải tay và Mắt nhặt không làm mất luật 'phải bơi tới gần mới nhặt được'", () => {
    const tuned = swimTuning(["swim-stroke", "swim-eye"]);

    expect(tuned.reach).toBeGreaterThan(DEFAULT_SWIM.reach);
    // Tầm nhặt vẫn là chuyện của cái ao: vài gang tay, không phải cả mặt nước.
    expect(tuned.reach).toBeLessThan(DEFAULT_SWIM.radius);
  });

  it("Cầu dẻo nới cửa sổ đá nhưng vẫn phải đúng tầm chân", () => {
    const tuned = shuttleTuning(["shuttle-spring"]);

    expect(tuned.reach).toBeGreaterThan(DEFAULT_SHUTTLE.reach);
    expect(tuned.kickHigh).toBe(DEFAULT_SHUTTLE.kickHigh);
    expect(tuned.kickLow).toBe(DEFAULT_SHUTTLE.kickLow);
  });
});
