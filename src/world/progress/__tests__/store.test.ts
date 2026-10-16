import { describe, expect, it } from "vitest";

import { dailyTasks } from "../daily";
import {
  DRIFT_THREAD_CAP,
  DUSK_MAX,
  buyLook,
  createJournal,
  driftThreads,
  duskLevel,
  grantEarned,
  journalValue,
  normalizeJournal,
  recordSession,
  sessionValue,
  wearLook,
} from "../store";
import { dressFor } from "../looks";
import { PAGE_LIST } from "../pages";

const PAGE_IDS = PAGE_LIST.map((page) => page.id);

/**
 * Sổ hồi ký là thứ DUY NHẤT trong game sống qua nhiều phiên chơi, nên nó cũng
 * là thứ duy nhất có thể hỏng theo cách không ai nhìn thấy: dữ liệu cũ, dữ
 * liệu sửa tay, dữ liệu của bản khác.
 *
 * Hai luật bất di bất dịch được khoá ở đây:
 *
 *  1. **Không bao giờ ném.** Đọc ra rác thì mở sổ mới và chơi bình thường.
 *  2. **Không bao giờ trả thưởng hai lần.** Trang đã mở, mục đã xong, kỷ lục
 *     đã ghi thì lần ghi sau không sinh thêm sợi chỉ nào.
 */

const DAY = "2026-10-16";

describe("sổ hồi ký — dữ liệu đã lưu", () => {
  it("rác gì cũng thành sổ mới, không ném", () => {
    const junk: unknown[] = [
      undefined,
      null,
      42,
      "sổ",
      [],
      { version: "1" },
      { version: 2, threads: 99 },
      { version: 1, threads: {} },
    ];

    for (const raw of junk) {
      expect(normalizeJournal(raw)).toEqual(createJournal());
    }
  });

  it("sổ của bản trước thiếu trường thì phần đọc được vẫn còn", () => {
    const journal = normalizeJournal({ version: 1, threads: 3, bests: { kite: 12 } });

    expect(journal.threads).toBe(3);
    expect(journal.bests.kite).toBe(12);
    expect(journal.entries).toEqual([]);
    expect(journal.days).toEqual({});
    expect(journal.lotus).toBe(0);
  });

  it("số âm, số vô hạn, id lạ và ngày không phải ngày đều bị bỏ", () => {
    const journal = normalizeJournal({
      version: 1,
      threads: -5,
      lotus: Number.POSITIVE_INFINITY,
      skills: ["kite-strong", "kỹ-năng-không-có", 7],
      entries: ["kite-thirty", "trang-không-có"],
      days: { "2026-10-16": ["kite-30"], "hôm qua": ["swim-3"] },
    });

    expect(journal.threads).toBe(0);
    expect(journal.lotus).toBe(0);
    expect(journal.skills).toEqual(["kite-strong"]);
    expect(journal.entries).toEqual(["kite-thirty"]);
    expect(journal.days).toEqual({ "2026-10-16": ["kite-30"] });
  });

  it("id trùng trong mảng chỉ tính một lần", () => {
    const journal = normalizeJournal({
      version: 1,
      entries: ["kite-thirty", "kite-thirty"],
    });

    expect(journal.entries).toEqual(["kite-thirty"]);
  });

  it("sổ dài ngày thì chỉ giữ 60 ngày mới nhất", () => {
    const days: Record<string, string[]> = {};

    for (let index = 0; index < 70; index += 1) {
      const date = new Date(Date.UTC(2026, 0, 1 + index));

      days[date.toISOString().slice(0, 10)] = ["kite-30"];
    }

    const journal = normalizeJournal({ version: 1, days });
    const kept = Object.keys(journal.days).sort();

    expect(kept).toHaveLength(60);
    expect(kept[0]).toBe("2026-01-11");
    expect(kept.at(-1)).toBe("2026-03-11");
  });
});

describe("sổ hồi ký — ghi một ván", () => {
  it("kỷ lục chỉ tăng, và ván đầu tiên của mỗi trò đã là kỷ lục", () => {
    const first = recordSession(createJournal(), { name: "kite", score: 12, thermals: 0 }, DAY);

    expect(first.journal.bests.kite).toBe(12);
    expect(first.best).toEqual({ name: "kite", value: 12 });

    const worse = recordSession(first.journal, { name: "kite", score: 8, thermals: 0 }, DAY);

    expect(worse.journal.bests.kite).toBe(12);
    expect(worse.best).toBeUndefined();
  });

  it("kỷ lục ba trò không lẫn vào nhau", () => {
    let journal = createJournal();

    journal = recordSession(journal, { name: "kite", score: 34, thermals: 1 }, DAY).journal;
    journal = recordSession(journal, { name: "swim", score: 4, thermals: 0 }, DAY).journal;
    journal = recordSession(journal, { name: "shuttlecock", score: 7, thermals: 0 }, DAY).journal;

    expect(journal.bests).toEqual({ kite: 34, swim: 4, shuttlecock: 7 });
  });

  it("ván bơi cộng sen vào tổng, ván diều cộng cột khí nóng, mọi ván cộng một lượt chơi", () => {
    let journal = createJournal();

    journal = recordSession(journal, { name: "swim", score: 5, thermals: 0 }, DAY).journal;
    journal = recordSession(journal, { name: "kite", score: 20, thermals: 3 }, DAY).journal;

    expect(journal.lotus).toBe(5);
    expect(journal.thermals).toBe(3);
    expect(journal.sessions).toBe(2);
  });

  it("mục trong ngày chỉ xong bằng ván của ĐÚNG trò đó", () => {
    const swimTask = dailyTasks(DAY).find((task) => task.name === "swim");
    const kiteTask = dailyTasks(DAY).find((task) => task.name === "kite");

    if (!swimTask || !kiteTask) throw new Error("buổi chiều hôm nay phải có đủ ba trò");

    // Ván diều điểm cao tới đâu cũng không chấm được mục của cái ao.
    const kite = recordSession(createJournal(), { name: "kite", score: 120, thermals: 5 }, DAY);

    expect(kite.journal.days[DAY]).toContain(kiteTask.id);
    expect(kite.journal.days[DAY]).not.toContain(swimTask.id);

    const swim = recordSession(kite.journal, { name: "swim", score: 5, thermals: 0 }, DAY);

    expect(swim.journal.days[DAY]).toContain(swimTask.id);
    expect(swim.tasks.map((task) => task.id)).toEqual([swimTask.id]);
  });

  it("mục đã xong không xong lần thứ hai, và không sinh sợi chỉ lần thứ hai", () => {
    // Cùng một ván, chơi lại y hệt: không kỷ lục mới, không mục mới, không
    // trang mới, không kỹ năng mới. Sổ vẫn đếm thêm một lượt chơi — đó là
    // thứ duy nhất được phép tăng.
    const first = recordSession(createJournal(), { name: "kite", score: 90, thermals: 0 }, DAY);
    const again = recordSession(first.journal, { name: "kite", score: 90, thermals: 0 }, DAY);

    expect(first.tasks.length).toBeGreaterThan(0);
    expect(first.threads).toBeGreaterThan(0);

    expect(again.tasks).toEqual([]);
    expect(again.pages).toEqual([]);
    expect(again.skills).toEqual([]);
    expect(again.threads).toBe(0);
  });

  it("trang hồi ký mở một lần, kèm sợi chỉ, và trang ĐẦU TIÊN chỉ chỗ mở sổ", () => {
    const first = recordSession(createJournal(), { name: "kite", score: 34, thermals: 1 }, DAY);

    expect(first.pages.map((page) => page.id)).toEqual([
      "first-kite",
      "kite-thirty",
      "thermal-column",
    ]);
    expect(first.firstPage).toBe(true);

    const later = recordSession(first.journal, { name: "kite", score: 90, thermals: 0 }, DAY);

    expect(later.pages).toEqual([]);
    expect(later.firstPage).toBe(false);
  });
});

describe("sổ hồi ký — ngưỡng", () => {
  it("ngưỡng trong ván chỉ đọc số của chính trò đó", () => {
    const kite = { name: "kite", score: 34, thermals: 2 } as const;

    expect(sessionValue("kiteAltitude", kite)).toBe(34);
    expect(sessionValue("kiteThermals", kite)).toBe(2);
    expect(sessionValue("swimLotus", kite)).toBe(0);
    expect(sessionValue("shuttleCombo", kite)).toBe(0);
  });

  it("kỹ năng mở bằng thành tích đã tích, không bằng tiền", () => {
    const journal = { ...createJournal(), bests: { kite: 60 }, threads: 999 };
    const change = grantEarned(journal);

    expect(change.skills.map((skill) => skill.id)).toEqual(["kite-line-1", "kite-line-2"]);
    // Sợi chỉ là phần thưởng của TRANG, không phải của kỹ năng: mở kỹ năng
    // không tốn gì và cũng không sinh thêm chỉ.
    expect(change.threads).toBe(
      change.pages.reduce((sum, page) => sum + page.threads, 0),
    );
  });

  it("mở rồi thì không mở lại, và không đụng vào sổ khi không có gì mới", () => {
    const journal = { ...createJournal(), bests: { kite: 60 } };
    const opened = grantEarned(journal);

    expect(opened.changed).toBe(true);

    const again = grantEarned(opened.journal);

    expect(again.changed).toBe(false);
    expect(again.journal).toBe(opened.journal);
    expect(again.threads).toBe(0);
  });

  it("ngưỡng đọc từ sổ đi đúng trường của nó", () => {
    const journal = {
      ...createJournal(),
      bests: { kite: 12, swim: 3, shuttlecock: 7 },
      lotus: 9,
      thermals: 4,
      sessions: 11,
    };

    expect(journalValue("bestKite", journal)).toBe(12);
    expect(journalValue("bestSwim", journal)).toBe(3);
    expect(journalValue("bestShuttle", journal)).toBe(7);
    expect(journalValue("lotusTotal", journal)).toBe(9);
    expect(journalValue("thermalsTotal", journal)).toBe(4);
    expect(journalValue("sessions", journal)).toBe(11);
  });
});

describe("chuyến lượn theo con diều đứt dây", () => {
  it("trôi càng xa càng nhiều sợi chỉ, có trần, và chỉ trò diều mới có", () => {
    expect(driftThreads({ name: "kite", score: 20, thermals: 0, drift: 0 })).toBe(0);
    expect(driftThreads({ name: "kite", score: 20, thermals: 0, drift: 46 })).toBe(3);
    expect(driftThreads({ name: "kite", score: 20, thermals: 0, drift: 9999 })).toBe(DRIFT_THREAD_CAP);
    expect(driftThreads({ name: "swim", score: 3, thermals: 0, drift: 90 })).toBe(0);
    // Dữ liệu lạ không được sinh sợi chỉ.
    expect(driftThreads({ name: "kite", score: 20, thermals: 0, drift: Number.NaN })).toBe(0);
  });

  it("sợi chỉ của chuyến trôi cộng thẳng vào sổ", () => {
    const before = createJournal();
    const change = recordSession(before, { name: "kite", score: 1, thermals: 0, drift: 31 }, DAY);

    expect(change.journal.threads - before.threads).toBeGreaterThanOrEqual(2);
    expect(change.threads).toBeGreaterThanOrEqual(2);
  });
});

describe("trang phục", () => {
  it("đổi được khi đủ chỉ, trừ đúng giá, mặc luôn; không đủ thì sổ không đổi", () => {
    const poor = { ...createJournal(), threads: 3 };

    expect(buyLook(poor, "hat-nonla").changed).toBe(false);

    const rich = { ...createJournal(), threads: 10 };
    const bought = buyLook(rich, "hat-nonla");

    expect(bought.changed).toBe(true);
    expect(bought.journal.threads).toBe(2);
    expect(bought.journal.looks).toEqual(["hat-nonla"]);
    expect(bought.journal.wearing).toEqual(["hat-nonla"]);

    // Mua lại món đã có: không trừ chỉ lần hai.
    expect(buyLook(bought.journal, "hat-nonla").changed).toBe(false);
  });

  it("mỗi ô một món: mặc món mới là thay món cũ cùng ô; bấm lại món đang mặc là cởi", () => {
    const owned = {
      ...createJournal(),
      looks: ["hat-cap", "hat-nonla", "tail-sun"],
      wearing: ["hat-cap", "tail-sun"],
    };

    const swapped = wearLook(owned, "hat-nonla").journal;

    expect(swapped.wearing.sort()).toEqual(["hat-nonla", "tail-sun"]);

    const off = wearLook(swapped, "hat-nonla").journal;

    expect(off.wearing).toEqual(["tail-sun"]);
    expect(dressFor(off.wearing)).toEqual({ patch: {}, tail: 0xffd45f });

    // Món chưa có thì không mặc được.
    expect(wearLook(owned, "hair-bob").changed).toBe(false);
  });

  it("sổ cũ thiếu trường trang phục vẫn đọc được; đồ lạ hoặc mặc đồ chưa có bị bỏ", () => {
    const old = normalizeJournal({ version: 1, threads: 5 });

    expect(old.threads).toBe(5);
    expect(old.looks).toEqual([]);
    expect(old.wearing).toEqual([]);

    const tampered = normalizeJournal({
      version: 1,
      looks: ["hat-cap", "hat-nonla", "khong-co-that"],
      wearing: ["hat-cap", "hat-nonla", "hair-bob"],
    });

    expect(tampered.looks).toEqual(["hat-cap", "hat-nonla"]);
    // Hai món cùng ô "nón mũ": chỉ giữ món đầu; tóc bob chưa đổi nên bỏ.
    expect(tampered.wearing).toEqual(["hat-cap"]);
  });
});

describe("chạng vạng theo tiến trình", () => {
  it("vài trang đầu vẫn là nắng chiều; càng nhiều trang trời càng ngả, có trần", () => {
    const withPages = (count: number) => ({
      ...createJournal(),
      entries: PAGE_IDS.slice(0, count),
    });

    expect(duskLevel(withPages(0))).toBe(0);
    expect(duskLevel(withPages(2))).toBe(0);

    const levels = [3, 4, 5, 6].map((count) => duskLevel(withPages(count)));

    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]).toBeGreaterThan(levels[index - 1]);
    }

    expect(duskLevel(withPages(PAGE_IDS.length))).toBe(DUSK_MAX);
    expect(DUSK_MAX).toBeLessThan(1);
  });
});
