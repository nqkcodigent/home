// @vitest-environment jsdom
import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { SKY_PRESETS, Sky } from "../Sky";

describe("Sky — chạng vạng", () => {
  it("trôi DẦN về mức chạng vạng mới, không bật công tắc", () => {
    const sky = new Sky(SKY_PRESETS.goldenHour, 4);
    const scene = new THREE.Scene();

    sky.applyFog(scene);

    const dayLight = sky.sun.intensity;

    sky.setDusk(0.8);
    sky.update(1 / 60, 0);

    // Một frame sau: mới ngả một chút xíu.
    expect(sky.duskLevel).toBeGreaterThan(0);
    expect(sky.duskLevel).toBeLessThan(0.05);

    for (let index = 0; index < 60 * 20; index += 1) sky.update(1 / 60, index / 60);

    expect(sky.duskLevel).toBeCloseTo(0.8, 2);
    // Trời tối hơn, sương dày hơn.
    expect(sky.sun.intensity).toBeLessThan(dayLight);
    expect((scene.fog as THREE.FogExp2).density).toBeGreaterThan(SKY_PRESETS.goldenHour.fogDensity);

    sky.dispose();
  });

  it("đặt ngay khi vào game — không bắt người chơi xem lại cả buổi hoàng hôn", () => {
    const sky = new Sky(SKY_PRESETS.goldenHour, 4);

    sky.applyFog(new THREE.Scene());
    sky.setDusk(0.5, true);

    expect(sky.duskLevel).toBe(0.5);

    sky.dispose();
  });
});
