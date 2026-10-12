import { gameEvents } from "../events";

import type { DialogPayload } from "../events";

/**
 * Trợ giúp — thứ DUY NHẤT trong game còn dùng hộp thoại.
 *
 * Không có cốt truyện nào dẫn dắt: người chơi tự đi, tự tìm. Hộp thoại chỉ mở
 * khi họ chủ động bấm nút Trợ giúp, và nội dung chỉ nói về phím bấm — không kể
 * chuyện, không gợi ý phải đi đâu.
 */
export const HELP_LINES: readonly DialogPayload[] = [
  {
    id: "help-move",
    speaker: "Trợ giúp",
    text: "Đi bằng W A S D, hoặc cần điều khiển ở góc dưới bên trái. Giữ Shift để chạy. Bấm vào màn hình một lần rồi cứ di chuột là nhìn quanh — không cần giữ nút; Esc để thả chuột ra.",
    emotion: "warm",
  },
  {
    id: "help-explore",
    speaker: "Trợ giúp",
    text: "Lại gần đồ vật có nhãn rồi bấm E để chạm vào nó. Cánh cửa gỗ dẫn ra sân vườn — cứ mở ra mà đi. Ghế đẩu cạnh cửa sổ và băng ghế bên ao thì bấm E để ngồi ngắm cảnh; E lần nữa hoặc bước đi là đứng dậy.",
    emotion: "warm",
  },
  {
    id: "help-kite",
    speaker: "Trợ giúp",
    text: "Con diều nằm trên bãi cỏ phía đông nam: lại gần bấm E để thả. W và S thả - thu dây, A D hoặc mũi tên để lạng, C để đổi góc máy. Di chuột để bay vòng quanh con diều, lăn chuột để lại gần hay lùi xa.",
    emotion: "warm",
  },
  {
    id: "help-kite-out",
    speaker: "Trợ giúp",
    text: "Bấm R lúc nào cũng được để thu diều về. Dây có đứt thì camera cứ bay theo con diều cho tới khi bạn bấm R.",
    emotion: "hopeful",
  },
  {
    id: "help-audio",
    speaker: "Trợ giúp",
    text: "Bấm H (hoặc nút hình con mắt) để ẩn hết giao diện mà ngắm cảnh, bấm lại để hiện. M để tắt hoặc bật tiếng. Thư thả nhé.",
    emotion: "warm",
  },
];

/** Đọc lần lượt từng dòng; mỗi dòng chờ người chơi bấm "đọc tiếp". */
export async function readLines(lines: readonly DialogPayload[]): Promise<void> {
  for (const line of lines) {
    await new Promise<void>((resolve) => {
      const off = gameEvents.on("dialogNext", () => {
        off();
        resolve();
      });

      gameEvents.emit("dialog", line);
    });
  }
}
