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

describe("kiteSoundParams — giật và gần đứt", () => {
  const base = { altitude: 40, wind: 0.5, tension: 0.5 };

  it("cơn giật làm gió rít to và cao hơn", () => {
    const calm = kiteSoundParams(base);
    const gust = kiteSoundParams({ ...base, gust: 1 });

    expect(gust.windGain).toBeGreaterThan(calm.windGain);
    expect(gust.windFreq).toBeGreaterThan(calm.windFreq);
  });

  it("dây gần đứt thì sáo vút lên rõ rệt (> 100 Hz so với lúc căng vừa)", () => {
    const easy = kiteSoundParams({ ...base, tension: 0.7 });
    const strained = kiteSoundParams({ ...base, tension: 1 });

    expect(strained.fluteFreq - easy.fluteFreq).toBeGreaterThan(100);
  });
});
