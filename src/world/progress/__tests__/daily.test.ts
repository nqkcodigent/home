import { describe, expect, it } from "vitest";

import { ACTIVITIES } from "../../activities";
import { DAILY_POOL, dailyTasks, todayKey } from "../daily";

/**
 * "Buổi chiều hôm nay" là lý do quay lại ngày mai, nên ba tính chất của nó
 * phải được khoá lại — không phải để test đẹp, mà vì mất một trong ba thì
 * tính năng mất luôn ý nghĩa:
 *
 *  1. **Tất định.** Cùng một ngày thì mọi máy ra cùng một buổi chiều.
 *  2. **Đủ ba chỗ chơi.** Không có ngày nào cả ba mục đều là thả diều.
 *  3. **Đổi theo ngày.** Mai phải khác hôm nay, nếu không thì "quay lại mai"
 *     chẳng có gì để quay lại.
 */

describe("buổi chiều hôm nay", () => {
  it("cùng một ngày thì cùng ba mục, gọi bao nhiêu lần cũng vậy", () => {
    const first = dailyTasks("2026-10-16").map((task) => task.id);
    const second = dailyTasks("2026-10-16").map((task) => task.id);

    expect(first).toEqual(second);
    expect(first).toHaveLength(3);
  });

  it("mỗi chỗ chơi đúng một mục, và ba mục không trùng nhau", () => {
    // Thử cả một tháng: không ngày nào được lệch cấu trúc này.
    for (let day = 1; day <= 30; day += 1) {
      const key = `2026-10-${`${day}`.padStart(2, "0")}`;
      const tasks = dailyTasks(key);

      expect(new Set(tasks.map((task) => task.name))).toEqual(new Set(ACTIVITIES));
      expect(new Set(tasks.map((task) => task.id)).size).toBe(3);
    }
  });

  it("mục nào cũng có ngưỡng dương, có chỉ thưởng, và có thật trong rổ", () => {
    for (const task of DAILY_POOL) {
      expect(task.target).toBeGreaterThan(0);
      expect(task.threads).toBeGreaterThan(0);
      expect(ACTIVITIES).toContain(task.name);
    }
  });

  it("đổi ngày thì đổi buổi chiều — một tuần phải có nhiều hơn một bộ mục", () => {
    const sets = new Set<string>();

    for (let day = 1; day <= 7; day += 1) {
      const key = `2026-10-${`${day}`.padStart(2, "0")}`;

      sets.add(dailyTasks(key).map((task) => task.id).join("|"));
    }

    expect(sets.size).toBeGreaterThan(1);
  });

  it("ngày lấy theo giờ MÁY, không theo UTC", () => {
    expect(todayKey(new Date(2026, 9, 16, 23, 30))).toBe("2026-10-16");
    expect(todayKey(new Date(2026, 0, 2, 0, 5))).toBe("2026-01-02");
  });
});
