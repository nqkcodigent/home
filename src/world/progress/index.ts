import { gameEvents } from "../../events";
import { dailyTasks, todayKey } from "./daily";
import { localStorageJournal } from "./save";
import { lookItem } from "./looks";
import { nookItem } from "./nooks";
import { keepsakeItem } from "./keepsakes";
import {
  buyLook,
  grantEarned,
  normalizeJournal,
  recordKeepsake,
  recordNook,
  recordSecret,
  recordVisit,
  recordSession,
  wearLook,
} from "./store";

import type { ActivityName, SessionReport } from "../activities";
import type { DailyTask } from "./daily";
import type { Journal, JournalChange } from "./store";
import type { JournalStorage } from "./save";

/**
 * Sổ hồi ký — bản SỐNG của trò chơi.
 *
 * Ba lớp, ba việc khác nhau, và không lớp nào làm việc của lớp kia:
 *
 *   `progress/store.ts`  — luật: dữ liệu nào cộng vào đâu, ngưỡng nào mở gì.
 *   `progress/save.ts`   — cái rìa: đọc/ghi `localStorage`, nuốt mọi lỗi.
 *   file này             — vòng đời: nạp một lần, ghi khi có thay đổi thật, và
 *                          nói cho người chơi biết vừa có gì mới.
 *
 * ── Vì sao một instance, không phải một React context ─────────────────────
 * Sổ phải sống ngoài vòng đời của cây React: `WorldGame` (three.js, không có
 * React) ghi kỷ lục vào nó, còn bảng Sổ thì chỉ ĐỌC. Một instance ở module là
 * chỗ gặp nhau duy nhất, và nó cũng là thứ khiến `WorldGame.start()` gọi lại
 * lần hai (StrictMode) không sinh ra sổ thứ hai.
 */

/** Thời gian một thông báo "vừa có gì mới" nằm trên màn hình (ms). */
const NOTICE_HOLD = 3800;

/** Đơn vị kỷ lục của từng trò — con số suông thì không nói lên gì. */
const BEST_UNIT: Record<ActivityName, string> = {
  kite: "m",
  swim: "sen",
  shuttlecock: "cú",
};

export class Progress {
  private state: Journal;

  private readonly storage: JournalStorage;

  constructor(storage: JournalStorage = localStorageJournal()) {
    this.storage = storage;

    // Trang và kỹ năng đã đủ điều kiện từ lần chơi TRƯỚC vẫn phải được mở —
    // người chơi tắt máy đúng lúc vừa phá kỷ lục thì lần sau mở sổ vẫn thấy
    // trang của mình. Chỉ ghi đĩa khi có gì thật sự mới.
    const earned = grantEarned(normalizeJournal(storage.load()));

    this.state = earned.journal;

    if (earned.changed) this.storage.save(this.state);
  }

  get journal(): Journal {
    return this.state;
  }

  /** Ba mục của hôm nay, kèm id những mục đã xong. */
  today(day: string = todayKey()): {
    day: string;
    tasks: DailyTask[];
    done: string[];
  } {
    return { day, tasks: dailyTasks(day), done: this.state.days[day] ?? [] };
  }

  /**
   * Ghi một ván vừa chơi xong, rồi nói cho người chơi biết có gì mới.
   *
   * Gọi đúng MỘT chỗ (`WorldGame`, ngay sau khi `play()` trả về): nếu mỗi ván
   * con tự ghi lấy thì thêm trò thứ tư là thêm một chỗ nữa để quên.
   */
  record(session: SessionReport, day: string = todayKey()): JournalChange {
    const change = recordSession(this.state, session, day);

    this.state = change.journal;
    this.storage.save(this.state);

    gameEvents.emit("journal", this.state);

    const text = describe(change);

    if (text) gameEvents.emit("notice", { text, hold: NOTICE_HOLD });

    return change;
  }

  /** Ngồi đủ lâu ở một chỗ ngắm cảnh: ghi dòng hồi ký của chỗ đó (một lần). */
  nook(id: string): boolean {
    if (this.state.nooks.includes(id)) return false;

    const change = recordNook(this.state, id);

    if (!change.changed) return false;

    this.commit(change.journal);

    const line = nookItem(id)?.line;
    const extra = describe(change);

    gameEvents.emit("notice", {
      text: [line && `“${line}”`, extra].filter(Boolean).join(" · "),
      hold: 5200,
    });

    return true;
  }

  /** Nhặt một kỷ vật: dòng hồi ký của nó + sợi chỉ. Trả `false` nếu đã nhặt. */
  keepsake(id: string): boolean {
    if (this.state.keepsakes.includes(id)) return false;

    const change = recordKeepsake(this.state, id);

    if (!change.changed) return false;

    this.commit(change.journal);

    const item = keepsakeItem(id);
    const extra = describe(change);

    gameEvents.emit("notice", {
      text: [item && `Nhặt được ${item.label} — “${item.line}”`, extra].filter(Boolean).join(" · "),
      hold: 5200,
    });

    return true;
  }

  /** Đặt chân tới một nơi mới: bản đồ trong Sổ hiện thêm chỗ đó. */
  visit(id: string, label: string): boolean {
    const { journal, changed } = recordVisit(this.state, id);

    if (!changed) return false;

    this.commit(journal);
    gameEvents.emit("notice", { text: `Bản đồ thêm: ${label}`, hold: 1800 });

    return true;
  }

  /** Tìm ra một bí mật ngoài ván chơi. Trả `false` nếu đã tìm ra từ trước. */
  secret(id: string): boolean {
    if (this.state.secrets.includes(id)) return false;

    const change = recordSecret(this.state, id);

    if (!change.changed) return false;

    this.commit(change.journal);

    const text = describe(change);

    if (text) gameEvents.emit("notice", { text, hold: 5200 });

    return true;
  }

  /** Đổi sợi chỉ lấy một món đồ (và mặc luôn). Trả `false` nếu không đổi được. */
  buy(id: string): boolean {
    const { journal, changed } = buyLook(this.state, id);

    if (!changed) return false;

    this.commit(journal);
    gameEvents.emit("notice", { text: `Đã có: ${lookItem(id)?.label ?? id}`, hold: 2400 });

    return true;
  }

  /** Mặc (hoặc cởi) một món đã có. */
  wear(id: string): boolean {
    const { journal, changed } = wearLook(this.state, id);

    if (changed) this.commit(journal);

    return changed;
  }

  private commit(journal: Journal) {
    this.state = journal;
    this.storage.save(this.state);
    gameEvents.emit("journal", this.state);
  }
}

/**
 * Câu cho một thông báo duy nhất, thay vì bốn thông báo chồng lên nhau.
 *
 * Một ván có thể vừa phá kỷ lục, vừa xong một mục trong ngày, vừa mở một
 * trang — bốn dòng chữ nối đuôi nhau ở giữa màn hình thì không ai đọc hết.
 */
function describe(change: JournalChange): string | undefined {
  const parts: string[] = [];

  if (change.best) {
    parts.push(`Kỷ lục mới: ${change.best.value} ${BEST_UNIT[change.best.name]}`);
  }

  for (const secret of change.secrets ?? []) {
    parts.push(`Bí mật: ${secret.label} — “${secret.line}”`);
  }

  for (const page of change.pages) parts.push(`Trang mới: “${page.title}”`);

  for (const task of change.tasks) parts.push(`Xong: ${task.label}`);

  if (change.skills.length > 0) {
    parts.push(`Kỹ năng mới: ${change.skills.map((skill) => skill.label).join(", ")}`);
  }

  if (change.threads > 0) parts.push(`+${change.threads} sợi chỉ`);

  if (change.firstPage) parts.push("Rương gỗ trong nhà có sổ hồi ký");

  return parts.length > 0 ? parts.join(" · ") : undefined;
}

export const progress = new Progress();

export { DAILY_POOL, dailyTasks, todayKey } from "./daily";
export { PAGES, PAGE_LIST } from "./pages";
export { SKILLS, SKILL_LIST, kiteTuning, motionTuning, shuttleTuning, swimTuning } from "./skills";
export { NOOK_LIST, NOOK_SECONDS, nookItem } from "./nooks";
export { QUIET_SECONDS, SECRET_LIST, UNINVITED_SECONDS } from "./secrets";
export { KEEPSAKE_LIST, keepsakeWithin } from "./keepsakes";
export { PLACE_LIST, placeAt } from "./places";
export { DUSK_MAX, createJournal, duskLevel, journalValue, sessionValue } from "./store";
export { LOOK_LIST, LOOK_SLOT_LABEL, dressFor, lookItem } from "./looks";

export type { DailyTask } from "./daily";
export type { LookItem, LookSlot } from "./looks";
export type { JournalStorage } from "./save";
export type { MemoryPage, PageId } from "./pages";
export type { Skill, SkillId } from "./skills";
export type {
  Journal,
  JournalChange,
  JournalMetric,
  SessionMetric,
} from "./store";
