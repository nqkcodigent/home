import { describe, expect, it } from "vitest";

import { Typewriter } from "../typewriter";

describe("Typewriter", () => {
  it("hiện chữ theo tốc độ ký tự/giây", () => {
    const tw = new Typewriter("abcdef", { charsPerSecond: 10 });

    expect(tw.index).toBe(0);

    expect(tw.advance(100)).toBe(1);

    expect(tw.advance(300)).toBe(4);

    expect(tw.isComplete).toBe(false);
  });

  it("dừng ở đúng độ dài text và báo hoàn tất", () => {
    const tw = new Typewriter("abc", { charsPerSecond: 1000 });

    expect(tw.advance(1000)).toBe(3);

    expect(tw.isComplete).toBe(true);

    expect(tw.advance(1000)).toBe(3);
  });

  it("pause thêm sau dấu câu", () => {
    const tw = new Typewriter("ab.cd", {
      charsPerSecond: 100,
      punctuationPauseMs: 100,
    });

    expect(tw.advance(30)).toBe(3);

    expect(tw.holdRemaining).toBe(100);

    // trong lúc giữ nhịp, chữ không chạy tiếp
    expect(tw.advance(50)).toBe(3);

    expect(tw.advance(50)).toBe(3);

    // hết nhịp giữ thì chạy tiếp
    expect(tw.advance(10)).toBe(4);
  });

  it("dấu phẩy chỉ giữ nhịp ngắn hơn dấu chấm", () => {
    const comma = new Typewriter("a,b", { charsPerSecond: 100, punctuationPauseMs: 100 });

    comma.advance(20);

    const commaHold = comma.holdRemaining;

    const dot = new Typewriter("a.b", { charsPerSecond: 100, punctuationPauseMs: 100 });

    dot.advance(20);

    expect(commaHold).toBeGreaterThan(0);

    expect(commaHold).toBeLessThan(dot.holdRemaining);
  });

  it("fastForward tua nhanh nhưng vẫn hiện dần, không nhảy cóc", () => {
    const text = "a".repeat(40);

    const tw = new Typewriter(text, {
      charsPerSecond: 10,
      fastForwardMultiplier: 8,
    });

    tw.fastForward();

    expect(tw.isFastForwarding).toBe(true);

    // 8x tốc độ: 50ms -> 4 ký tự, không nhảy hết 40
    expect(tw.advance(50)).toBe(4);

    expect(tw.isComplete).toBe(false);

    // thêm 500ms là xong
    expect(tw.advance(500)).toBe(40);

    expect(tw.isComplete).toBe(true);
  });

  it("option undefined không được đè mất default (regression: nhịp gõ NaN)", () => {
    const explicitUndefined = new Typewriter("abcd", {
      charsPerSecond: undefined,
      fastForwardMultiplier: undefined,
      punctuationPauseMs: undefined,
    });

    // 1 giây ở 42 ký tự/giây -> hết 4 ký tự, không NaN
    expect(explicitUndefined.advance(1000)).toBe(4);

    expect(explicitUndefined.isComplete).toBe(true);

    const noOptions = new Typewriter("abcd");

    expect(noOptions.advance(1000)).toBe(4);
  });

  it("text rỗng hoàn tất ngay", () => {
    const tw = new Typewriter("");

    expect(tw.isComplete).toBe(true);

    expect(tw.advance(1000)).toBe(0);
  });

  it("index không bao giờ giảm", () => {
    const tw = new Typewriter("hello world", { charsPerSecond: 50 });

    let last = 0;

    for (const dt of [10, 5, 40, 3, 100, 0, -20]) {
      const next = tw.advance(dt);

      expect(next).toBeGreaterThanOrEqual(last);

      last = next;
    }
  });

  it("revealAll hiện hết ngay cả khi còn nhịp giữ", () => {
    const tw = new Typewriter("ab.cd", {
      charsPerSecond: 10,
      punctuationPauseMs: 500,
    });

    tw.advance(1000);

    tw.revealAll();

    expect(tw.isComplete).toBe(true);
  });
});
