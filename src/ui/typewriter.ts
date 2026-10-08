export interface TypewriterOptions {
  /** Ký tự hiện ra mỗi giây khi gõ bình thường */
  charsPerSecond?: number;

  /** Hệ số tăng tốc khi người chơi bấm để tua (không nhảy thẳng) */
  fastForwardMultiplier?: number;

  /** Thời gian dừng thêm sau dấu câu (ms) */
  punctuationPauseMs?: number;
}

const DEFAULT_OPTIONS: Required<TypewriterOptions> = {
  charsPerSecond: 42,

  fastForwardMultiplier: 8,

  punctuationPauseMs: 150,
};

const SHORT_PAUSE = ",;:";

const LONG_PAUSE = ".!?…";

/**
 * Nhịp hiện chữ thuần tuý: nhận thời gian trôi qua, trả về số ký tự đã hiện.
 * Không biết gì về React/DOM nên test được trực tiếp theo từng mili-giây.
 */
export class Typewriter {
  private readonly text: string;

  private readonly options: Required<TypewriterOptions>;

  private revealed = 0;

  private holdMs = 0;

  private fast = false;

  constructor(text: string, options: TypewriterOptions = {}) {
    this.text = text;

    // spread trần sẽ để `undefined` đè mất default (bug NaN nhịp gõ)
    this.options = {
      charsPerSecond: options.charsPerSecond ?? DEFAULT_OPTIONS.charsPerSecond,

      fastForwardMultiplier:
        options.fastForwardMultiplier ?? DEFAULT_OPTIONS.fastForwardMultiplier,

      punctuationPauseMs:
        options.punctuationPauseMs ?? DEFAULT_OPTIONS.punctuationPauseMs,
    };
  }

  get index(): number {
    return Math.min(Math.floor(this.revealed), this.text.length);
  }

  get isComplete(): boolean {
    return this.index >= this.text.length;
  }

  get isFastForwarding(): boolean {
    return this.fast;
  }

  /** Tua nhanh phần còn lại — vẫn hiện dần chứ không nhảy cóc */
  fastForward() {
    this.fast = true;
  }

  /** Hiện hết ngay (dùng khi kết thúc đoạn) */
  revealAll() {
    this.revealed = this.text.length;

    this.holdMs = 0;
  }

  /** Thời gian dừng còn lại sau dấu câu (ms) — hữu ích cho test */
  get holdRemaining(): number {
    return this.holdMs;
  }

  advance(dtMs: number): number {
    if (this.isComplete || dtMs <= 0) {
      return this.index;
    }

    let dt = dtMs;

    if (this.holdMs > 0) {
      const used = Math.min(this.holdMs, dt);

      this.holdMs -= used;

      dt -= used;

      if (dt <= 0) {
        return this.index;
      }
    }

    const before = this.index;

    const rate =
      this.options.charsPerSecond *
      (this.fast ? this.options.fastForwardMultiplier : 1);

    this.revealed = Math.min(this.text.length, this.revealed + (rate * dt) / 1000);

    const after = this.index;

    if (after > before) {
      const char = this.text[after - 1];

      if (SHORT_PAUSE.includes(char)) {
        this.holdMs = this.options.punctuationPauseMs * 0.6;
      } else if (LONG_PAUSE.includes(char)) {
        this.holdMs = this.options.punctuationPauseMs;
      }
    }

    return this.index;
  }
}
