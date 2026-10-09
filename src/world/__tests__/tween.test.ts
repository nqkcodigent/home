import { describe, expect, it, vi } from "vitest";

import { easeInOutSine, easeOutCubic, linear, Tweens } from "../Tween";

describe("Tweens", () => {
  it("gọi onUpdate đều đặn và kết thúc ở đúng 1", async () => {
    const tweens = new Tweens();
    const seen: number[] = [];

    const done = tweens.add({
      duration: 1,
      ease: linear,
      onUpdate: (t) => seen.push(t),
    });

    for (let i = 0; i < 4; i += 1) tweens.update(0.25);

    await done;

    expect(seen).toEqual([0.25, 0.5, 0.75, 1]);
    expect(tweens.active).toBe(0);
  });

  it("không chạy quá thời lượng dù dt lớn", async () => {
    const tweens = new Tweens();
    const onUpdate = vi.fn();

    const done = tweens.add({ duration: 0.5, onUpdate });

    tweens.update(10);

    await done;

    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onUpdate).toHaveBeenCalledWith(1);
  });

  it("duration <= 0 thì hoàn tất ngay lập tức", async () => {
    const tweens = new Tweens();
    const onUpdate = vi.fn();

    await tweens.add({ duration: 0, onUpdate });

    expect(onUpdate).toHaveBeenCalledWith(1);
    expect(tweens.active).toBe(0);
  });

  it("clear() giải phóng các promise đang chờ — không treo story", async () => {
    const tweens = new Tweens();
    const onUpdate = vi.fn();

    const done = tweens.add({ duration: 5, onUpdate });

    tweens.update(0.1);
    tweens.clear();

    await expect(done).resolves.toBeUndefined();
    expect(tweens.active).toBe(0);
  });

  it("ease nhận 0…1 và giữ đúng hai đầu", () => {
    for (const ease of [linear, easeInOutSine, easeOutCubic]) {
      expect(ease(0)).toBeCloseTo(0, 9);
      expect(ease(1)).toBeCloseTo(1, 9);
    }
  });
});
