import { describe, expect, it, vi } from "vitest";

import { gameEvents } from "../../../events";
import { Progress } from "../index";
import { memoryJournal } from "../save";
import { createJournal } from "../store";

/**
 * `Progress` là chỗ duy nhất sổ gặp `localStorage` và gặp người chơi, nên ba
 * thứ dưới đây là ba thứ quyết định "có lý do quay lại" hay không:
 *
 *  1. Ghi rồi nạp lại thì kỷ lục còn nguyên.
 *  2. Nạp lại cũng phải mở nốt những trang đã đủ điều kiện từ lần trước.
 *  3. Khởi động mà không có gì mới thì KHÔNG ghi đĩa (StrictMode gọi hai lần,
 *     và một lần ghi rỗng có thể xoá mất sổ của người chơi).
 */

const DAY = "2026-10-16";

describe("sổ sống", () => {
  it("ghi rồi nạp lại: kỷ lục, sợi chỉ và trang đã mở vẫn còn", () => {
    const storage = memoryJournal();
    const first = new Progress(storage);
    const change = first.record({ name: "kite", score: 34, thermals: 1 }, DAY);

    expect(change.journal.bests.kite).toBe(34);
    expect(change.journal.threads).toBeGreaterThan(0);

    const second = new Progress(storage);

    expect(second.journal.bests.kite).toBe(34);
    expect(second.journal.threads).toBe(change.journal.threads);
    expect(second.journal.entries).toContain("kite-thirty");
  });

  it("khởi động mà không có gì mới thì không ghi đĩa", () => {
    const storage = memoryJournal();
    const save = vi.fn(storage.save);

    new Progress({ load: storage.load, save });
    // Sổ trống, không có trang nào đủ điều kiện: không được ghi gì cả.
    expect(save).not.toHaveBeenCalled();

    new Progress({ load: () => ({ ...createJournal(), bests: { kite: 34 } }), save });
    // Có trang đủ điều kiện thì mới ghi — và ghi đúng một lần.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("sổ để lại từ lần trước thiếu trang thì lần nạp sau mở nốt", () => {
    const storage = memoryJournal();

    // Đúng dữ liệu của một bản cũ: kỷ lục có, nhưng trang thì chưa ai mở.
    storage.save({ ...createJournal(), bests: { kite: 34 }, sessions: 3 });

    const progress = new Progress(storage);

    expect(progress.journal.entries).toContain("kite-thirty");
    expect(progress.journal.entries).toContain("first-kite");
    expect(progress.journal.threads).toBeGreaterThan(0);
    expect(progress.journal.bests.kite).toBe(34);
  });

  it("ba việc của hôm nay đọc từ sổ, và biết việc nào đã xong", () => {
    const progress = new Progress(memoryJournal());

    progress.record({ name: "kite", score: 90, thermals: 2 }, DAY);

    const today = progress.today(DAY);

    expect(today.tasks).toHaveLength(3);
    expect(today.done.length).toBeGreaterThan(0);
    expect(today.done.every((id) => today.tasks.some((task) => task.id === id))).toBe(true);
  });

  it("một ván xong là MỘT thông báo, và sổ được phát cho giao diện", () => {
    const notices: string[] = [];
    const journals: number[] = [];
    const offNotice = gameEvents.on("notice", ({ text }) => notices.push(text));
    const offJournal = gameEvents.on("journal", (data) => journals.push(data.threads));

    new Progress(memoryJournal()).record({ name: "kite", score: 34, thermals: 1 }, DAY);

    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain("Kỷ lục mới: 34 m");
    expect(journals).toHaveLength(1);

    offNotice();
    offJournal();
  });

  it("ván không có gì mới thì không có thông báo nào", () => {
    const storage = memoryJournal();
    const progress = new Progress(storage);

    progress.record({ name: "kite", score: 90, thermals: 0 }, DAY);

    const notices: string[] = [];
    const off = gameEvents.on("notice", ({ text }) => notices.push(text));

    progress.record({ name: "kite", score: 4, thermals: 0 }, DAY);

    expect(notices).toEqual([]);

    off();
  });
});
