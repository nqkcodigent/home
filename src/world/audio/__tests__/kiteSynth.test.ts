import { describe, expect, it } from "vitest";

import { KiteSynth, kiteSoundParams } from "../kiteSynth";

describe("kiteSynth — ánh xạ âm thanh", () => {
  it("diều càng cao thì gió càng to và sáo càng cao", () => {
    const low = kiteSoundParams({ altitude: 10, wind: 0.5, tension: 0.3 });
    const high = kiteSoundParams({ altitude: 50, wind: 0.5, tension: 0.3 });

    expect(high.windGain).toBeGreaterThan(low.windGain);
    expect(high.fluteFreq).toBeGreaterThan(low.fluteFreq);
    expect(high.fluteGain).toBeGreaterThan(low.fluteGain);
  });

  it("diều sát đất thì sáo chưa kêu", () => {
    expect(kiteSoundParams({ altitude: 1, wind: 1, tension: 0 }).fluteGain).toBe(0);
  });

  it("không có AudioContext thì synth im lặng, không ném lỗi", () => {
    const synth = new KiteSynth();

    expect(() => {
      synth.start();
      synth.update({ altitude: 20, wind: 0.5, tension: 0.5 });
      synth.stop();
    }).not.toThrow();
  });
});
