/**
 * Tween nhỏ, hứa-hẹn (promise-based).
 *
 * Các nhịp truyện (`walk`, `zoom`, `pan`, `reveal`) đều là "làm gì đó trong N
 * giây rồi trả quyền lại cho director". Phaser có sẵn hệ tween; three.js thì
 * không, nên đây là phần thay thế tối thiểu: một danh sách, một hàm `update(dt)`,
 * và một Promise cho mỗi hiệu ứng.
 *
 * Cố ý không dùng thư viện ngoài: nhu cầu chỉ có ease + cập nhật một tham số.
 */

export type Easing = (t: number) => number;

export const easeInOutSine: Easing = (t) =>
  -(Math.cos(Math.PI * t) - 1) / 2;

export const easeOutCubic: Easing = (t) => 1 - (1 - t) ** 3;

export const linear: Easing = (t) => t;

export interface TweenOptions {
  /** Thời lượng (giây). <= 0 nghĩa là nhảy thẳng tới giá trị cuối. */
  duration: number;
  ease?: Easing;
  /** Nhận tiến độ 0…1 (đã qua ease). */
  onUpdate: (progress: number) => void;
}

interface RunningTween {
  elapsed: number;
  options: TweenOptions;
  ease: Easing;
  resolve: () => void;
}

export class Tweens {
  private readonly running: RunningTween[] = [];

  /** Số hiệu ứng đang chạy — dùng cho test và cho HUD debug. */
  get active(): number {
    return this.running.length;
  }

  add(options: TweenOptions): Promise<void> {
    const ease = options.ease ?? easeInOutSine;

    if (options.duration <= 0) {
      options.onUpdate(1);

      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.running.push({ elapsed: 0, options, ease, resolve });
    });
  }

  update(dt: number) {
    if (this.running.length === 0) return;

    // Sao chép trước khi lặp: listener có thể thêm hiệu ứng mới.
    for (const tween of [...this.running]) {
      tween.elapsed += dt;

      const raw = Math.min(tween.elapsed / tween.options.duration, 1);

      tween.options.onUpdate(tween.ease(raw));

      if (raw >= 1) {
        const index = this.running.indexOf(tween);

        if (index >= 0) this.running.splice(index, 1);

        tween.resolve();
      }
    }
  }

  /**
   * Bỏ hết hiệu ứng đang chạy.
   *
   * Phải resolve chứ không được bỏ mặc: nếu không, một `await` trong
   * StoryDirector sẽ treo mãi và cả đoạn truyện sau đó không bao giờ chạy —
   * đúng lỗi mà bản Phaser cũ từng mắc khi scene bị đổi giữa chừng.
   */
  clear() {
    for (const tween of this.running.splice(0, this.running.length)) {
      tween.resolve();
    }
  }
}
