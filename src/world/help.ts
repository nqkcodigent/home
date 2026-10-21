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
    id: "help-roam",
    speaker: "Trợ giúp",
    text: "Qua cổng hàng rào là cánh đồng rộng, có vành cây bao quanh — cứ đi, chẳng có gì chặn đường. Chim bay trên đầu, chim cành đậu hàng rào (tới gần là bay mất), rồi gà bới quanh đống rơm với bướm lượn bên khóm hoa. Con chó vàng ngoài hiên sẽ lẽo đẽo theo bạn khắp nơi. Đi xa thì nhìn quanh: cây đa trên đỉnh đồi phía bắc, con diều của ai đó trên tháp chuông, và khói bếp nhà mình để biết đường về. Thứ gì lấp lánh trên cỏ là một kỷ vật — đi ngang qua là nhặt; Sổ hồi ký có tấm bản đồ tự vẽ thêm mỗi khi bạn tới nơi mới. Đâu đó quanh làng có những gốc cây cụt: ngồi lại ngắm cảnh một lúc là có thêm một dòng hồi ký — ngồi đủ nhiều chỗ thì bước chân nhẹ hẳn, chạy cũng nhanh hơn.",
    emotion: "warm",
  },
  {
    id: "help-kite",
    speaker: "Trợ giúp",
    text: "Con diều nằm trên bãi cỏ phía đông nam: lại gần bấm E để thả. W và S thả - thu dây, A D hoặc mũi tên để lạng, C để đổi góc máy. Gió thổi theo nhịp: lúc HUD báo “gió giật” là lúc nên thả dây; chim lượn thành vòng ở đâu là ở đó có cột khí nóng. Di chuột để bay vòng quanh con diều, lăn chuột để lại gần hay lùi xa. Trên đỉnh đồi gió phía bắc còn một bãi diều nữa — gió ở đó mạnh và đều hơn.",
    emotion: "warm",
  },
  {
    id: "help-kite-out",
    speaker: "Trợ giúp",
    text: "Bấm R lúc nào cũng được để thu diều về. Dây có đứt thì camera cứ bay theo con diều cho tới khi bạn bấm R — và đàn chim sẽ bám theo con diều suốt lúc đó.",
    emotion: "hopeful",
  },
  {
    id: "help-swim",
    speaker: "Trợ giúp",
    text: "Bờ tây cái ao có chỗ xuống nước: bấm E để trượt xuống bơi. W đạp tới, S lùi nhẹ, A D quay người, bơi tới gần mấy bông sen là nhặt được luôn, còn đàn cá chép thì đuổi chạm được — chạm xong chúng vọt đi một quãng. Có hai bông chìm dưới đáy: giữ Shift để lặn xuống, nhả ra là nổi lên — để ý chỉ số “Hơi”, hết hơi thì phải ngoi lên thở. Bấm R để tấp vào bờ.",
    emotion: "warm",
  },
  {
    id: "help-shuttlecock",
    speaker: "Trợ giúp",
    text: "Bãi cỏ phía tây có quả cầu nằm chờ và cậu bạn áo xanh đứng đợi: lại gần bấm E để tung cầu lên, rồi bấm E đúng lúc cầu ngang tầm gối để đá sang bạn — sát chân là “Hoàn hảo”, cầu rơi ngay chỗ bạn đứng. Cậu bạn sẽ đá trả lại — chạy tới đón. Đá liên tiếp thì kỷ lục tăng dần. Bấm R để cất cầu đi.",
    emotion: "warm",
  },
  {
    id: "help-journal",
    speaker: "Trợ giúp",
    text: "Trong nhà có chiếc rương gỗ: lại gần bấm E để mở Sổ hồi ký. Sổ ghi kỷ lục ba trò, những trang đã mở, và ba việc của buổi chiều hôm nay. Sợi chỉ (từ việc trong ngày, và từ những chuyến diều đứt dây trôi xa) đổi được kiểu tóc, nón, màu áo khoác và màu đuôi diều ở trang Trang phục. Càng nhiều trang hồi ký, trời càng ngả chiều — dế kêu, đom đóm bay.",
    emotion: "warm",
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
