// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTypewriter } from "../useTypewriter";

// ---------------------------------------------------------------
// Đồng hồ + rAF giả để test tất định (không phụ thuộc frame thật)
// ---------------------------------------------------------------

let frames: FrameRequestCallback[] = [];

let now = 0;

function pump(frameCount: number, dtMs: number) {
  for (let i = 0; i < frameCount; i++) {
    now += dtMs;

    const pending = frames;

    frames = [];

    pending.forEach((callback) => callback(now));
  }
}

beforeEach(() => {
  frames = [];

  now = 1000;

  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    frames.push(callback);

    return frames.length;
  });

  vi.stubGlobal("cancelAnimationFrame", (id: number) => {
    frames = frames.filter((_, index) => index + 1 !== id);
  });

  vi.spyOn(performance, "now").mockImplementation(() => now);
});

afterEach(() => {
  vi.unstubAllGlobals();

  vi.restoreAllMocks();
});

// ---------------------------------------------------------------

describe("useTypewriter", () => {
  it("hiện dần chữ theo từng frame", async () => {
    const { result } = renderHook(() =>
      useTypewriter("abcdef", { charsPerSecond: 100 }),
    );

    expect(result.current.visible).toBe("");

    await act(async () => {
      pump(3, 10); // 30ms -> 3 ký tự
    });

    expect(result.current.visible).toBe("abc");

    expect(result.current.isComplete).toBe(false);

    await act(async () => {
      pump(3, 10);
    });

    expect(result.current.visible).toBe("abcdef");

    expect(result.current.isComplete).toBe(true);
  });

  it("fastForward tua nhanh dần chứ không nhảy hết một frame", async () => {
    const text = "a".repeat(40);

    const { result } = renderHook(() =>
      useTypewriter(text, { charsPerSecond: 100, fastForwardMultiplier: 8 }),
    );

    await act(async () => {
      pump(4, 10); // 40ms -> 4 ký tự
    });

    expect(result.current.visible).toHaveLength(4);

    await act(async () => {
      result.current.fastForward();
    });

    await act(async () => {
      pump(2, 50); // 100ms ở 800 ký tự/giây -> xong 40 ký tự
    });

    // 8x tốc độ: 100ms đủ cho phần còn lại, và phải đi qua nhiều frame
    expect(result.current.visible.length).toBeGreaterThan(4);
  });

  it("option undefined vẫn gõ đúng nhịp (regression: text đứng im)", async () => {
    const { result } = renderHook(() =>
      useTypewriter("xin chao", {
        charsPerSecond: undefined,
        fastForwardMultiplier: undefined,
        punctuationPauseMs: undefined,
      }),
    );

    await act(async () => {
      pump(30, 20); // 600ms ở default 42 ký tự/giây
    });

    expect(result.current.visible).toBe("xin chao");

    expect(result.current.isComplete).toBe(true);
  });

  it("đổi câu thoại thì bắt đầu gõ lại từ đầu", async () => {
    const { result, rerender } = renderHook(
      ({ text }: { text: string }) => useTypewriter(text, { charsPerSecond: 100 }),
      { initialProps: { text: "cau thu nhat" } },
    );

    await act(async () => {
      pump(10, 100);
    });

    expect(result.current.visible).toBe("cau thu nhat");

    rerender({ text: "cau hai" });

    expect(result.current.visible).toBe("");

    await act(async () => {
      pump(10, 100);
    });

    expect(result.current.visible).toBe("cau hai");
  });
});
