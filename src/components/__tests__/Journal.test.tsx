// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gameEvents } from "../../events";
import { PAGES, SKILLS, createJournal, dailyTasks, todayKey } from "../../world/progress";
import { Journal } from "../Journal";

import type { Journal as JournalData } from "../../world/progress";

function journalWith(overrides: Partial<JournalData> = {}): JournalData {
  return { ...createJournal(), ...overrides };
}

// `@testing-library/react` chỉ tự dọn DOM khi vitest bật `globals`; repo này
// không bật, nên dọn tay — không thì bảng của test trước còn nằm trong
// `document` và mọi `getByRole` đều tìm ra hai cái.
afterEach(cleanup);

// Sổ mở ra là có tiếng (như mọi cú bấm khác của người chơi). jsdom không phát
// được âm thanh, và nó ồn — chặn ở đây để log test chỉ còn thứ đáng đọc.
beforeEach(() => {
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Sổ hồi ký là bảng DUY NHẤT không tự hiện lên, nên có hai điều phải khoá:
 *
 *  1. Đóng thì không vẽ gì cả (B6: không có bảng nào che màn hình lúc chơi).
 *  2. Ba phần của sổ đọc đúng dữ liệu: việc của hôm nay, kỹ năng đã mở, và
 *     những trang còn trống — ô trống chính là câu hỏi để ngày mai quay lại.
 */

describe("Sổ hồi ký", () => {
  it("chưa mở thì không vẽ gì", () => {
    const { container } = render(<Journal open={false} journal={createJournal()} />);

    expect(container.querySelector(".journal")).toBeNull();
  });

  it("mở ra là thấy sợi chỉ, ba phần, và đúng ba việc của hôm nay", () => {
    render(<Journal open journal={journalWith({ threads: 5 })} />);

    expect(screen.getByText("Sổ hồi ký")).toBeTruthy();
    expect(screen.getByText("5")).toBeTruthy();

    for (const task of dailyTasks(todayKey())) {
      expect(screen.getByText(task.label)).toBeTruthy();
    }
  });

  it("việc đã xong có dấu, việc chưa xong thì không", () => {
    const task = dailyTasks(todayKey())[0];

    render(
      <Journal
        open
        journal={journalWith({ days: { [todayKey()]: [task.id] } })}
      />,
    );

    expect(screen.getByText("✓")).toBeTruthy();
    expect(screen.getAllByText("○")).toHaveLength(2);
  });

  it("phần Trang: trang đã mở hiện chữ, trang chưa mở hiện ô trống kèm mách nước", () => {
    render(<Journal open journal={journalWith({ entries: ["kite-thirty"] })} />);

    fireEvent.click(screen.getByRole("tab", { name: "Trang" }));

    expect(screen.getByText(PAGES["kite-thirty"].text)).toBeTruthy();
    expect(screen.getByText(PAGES["lotus-five"].hint)).toBeTruthy();
    expect(screen.getAllByText("Trang còn trống").length).toBeGreaterThan(0);
  });

  it("phần Kỹ năng: cái đã mở ghi 'đã mở', cái chưa mở ghi ngưỡng còn thiếu", () => {
    render(
      <Journal
        open
        journal={journalWith({ bests: { kite: 30 }, skills: ["kite-line-1"] })}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Kỹ năng" }));

    expect(screen.getByText(SKILLS["kite-line-1"].effect)).toBeTruthy();
    expect(screen.getByText("đã mở")).toBeTruthy();
    expect(screen.getByText(SKILLS["kite-strong"].hint)).toBeTruthy();
  });

  it("đóng bằng nút và bằng phím Esc — hai đường, cùng một sự kiện", () => {
    const closed: number[] = [];
    const off = gameEvents.on("journalClose", () => closed.push(1));

    render(<Journal open journal={createJournal()} />);

    fireEvent.click(screen.getByRole("button", { name: "Đóng sổ hồi ký" }));
    fireEvent.keyDown(window, { code: "Escape" });

    expect(closed).toHaveLength(2);

    off();
  });

  it("trang phục: đủ chỉ thì đổi được, thiếu chỉ thì nút bị khoá, đồ đã có thì bấm là mặc", () => {
    const emitted: { event: string; id: string }[] = [];
    const offBuy = gameEvents.on("journalBuy", ({ id }) => emitted.push({ event: "buy", id }));
    const offWear = gameEvents.on("journalWear", ({ id }) => emitted.push({ event: "wear", id }));

    render(
      <Journal open journal={journalWith({ threads: 4, looks: ["hair-short"], wearing: [] })} />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Trang phục" }));

    // Nón lá giá 8 chỉ, đang có 4 → không bấm được.
    const nonLa = screen.getByText("Nón lá").closest("li") as HTMLElement;

    expect(nonLa.querySelector("button")?.disabled).toBe(true);

    // Tóc bob giá 4 chỉ → đổi được.
    fireEvent.click((screen.getByText("Tóc bob").closest("li") as HTMLElement).querySelector("button") as HTMLElement);

    // Tóc ngắn đã có → nút là "Mặc".
    fireEvent.click(screen.getByRole("button", { name: "Mặc" }));

    expect(emitted).toEqual([
      { event: "buy", id: "hair-bob" },
      { event: "wear", id: "hair-short" },
    ]);

    offBuy();
    offWear();
  });
});

describe("Journal — Bản đồ", () => {
  it("chỉ vẽ nơi đã tới và kỷ vật đã nhặt; nơi chưa tới không lộ tên", () => {
    render(<Journal open journal={journalWith({ visited: ["home", "hill"], keepsakes: ["shell"] })} />);

    fireEvent.click(screen.getByRole("tab", { name: "Bản đồ" }));

    expect(screen.getByText("Đồi gió")).toBeTruthy();
    expect(screen.getByText("Nhà mình")).toBeTruthy();
    expect(screen.queryByText("Tháp chuông")).toBeNull();
    expect(screen.getByText(/2\/13 nơi · 1\/8 kỷ vật/)).toBeTruthy();
    expect(screen.getByText("★ Vỏ ốc biển")).toBeTruthy();
  });
});
