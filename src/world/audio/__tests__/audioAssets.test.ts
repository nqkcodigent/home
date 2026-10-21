import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { AUDIO_SLOTS } from "../HowlerAudio";

/**
 * Âm thanh là thứ hỏng IM LẶNG.
 *
 * Một slot không có file không làm gì sập cả: Howler nuốt lỗi, và cảnh đó chỉ... thiếu
 * tiếng. Không có gì trong log,
 * không có gì trên màn hình. Bộ test này biến cái im lặng đó thành một dòng
 * đỏ: slot nào cũng phải trỏ tới một file thật, có ruột.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const PUBLIC_DIR = join(ROOT, "public");

describe("âm thanh — slot và file", () => {
  it("mọi đường dẫn trong AUDIO_SLOTS đều có file thật", () => {
    const missing = Object.entries(AUDIO_SLOTS)
      .filter(([, src]) => !existsSync(join(PUBLIC_DIR, src.replace(/^\//, ""))))
      .map(([slot, src]) => `${slot} → ${src}`);

    // Máy chủ dev trả về trang HTML cho file không tồn tại, nên "tải được
    // 200" không chứng minh gì: phải hỏi thẳng đĩa.
    expect(missing).toEqual([]);
  });

  it("file nào cũng có ruột — không phải trang HTML của máy chủ dev", () => {
    // Đúng cái bẫy đã xảy ra với kiteFly: máy chủ trả về index.html cho đường
    // dẫn không tồn tại, và nếu ai đó lỡ lưu lại phản hồi đó thành file thì
    // test “có tồn tại” ở trên vẫn xanh trong khi game câm tiếng.
    for (const [slot, src] of Object.entries(AUDIO_SLOTS)) {
      const size = statSync(join(PUBLIC_DIR, src.replace(/^\//, ""))).size;

      expect(size, `${slot} chỉ có ${size} byte`).toBeGreaterThan(1024);
    }
  });
});
