import { ACTIVITIES } from "../activities";
import { PAGE_LIST, isPageId } from "./pages";
import { SKILL_LIST, isSkillId } from "./skills";
import { dailyTasks } from "./daily";

import { isLookId, lookItem } from "./looks";
import { isNookId } from "./nooks";
import { KEEPSAKE_THREADS, isKeepsakeId } from "./keepsakes";
import { isPlaceId } from "./places";
import { SECRET_THREADS, SKY_CEILING, SNAP_SIDES, isSecretId, secretItem } from "./secrets";

import type { ActivityName, SessionReport } from "../activities";
import type { DailyTask } from "./daily";
import type { MemoryPage, PageId } from "./pages";
import type { Skill, SkillId } from "./skills";
import type { Secret } from "./secrets";

/**
 * Sổ hồi ký — nguồn sự thật duy nhất, và là REDUCER THUẦN.
 *
 * File này không biết `window`, không biết `localStorage`, không biết three.js
 * và không biết React. Đó không phải chuyện thẩm mỹ: nó là điều kiện để test
 * chạy được trong node, và để dữ liệu tiến trình không lọt vào các file
 * `model.ts` (xem luật L1 trong GDD — mô phỏng phải tiếp tục tất định).
 *
 * ── Vì sao sổ không phải ba hệ thống ───────────────────────────────────────
 * Kỷ lục, kỹ năng, trang hồi ký và sợi chỉ đều là CÙNG một thứ nhìn từ bốn
 * phía: người chơi đã chơi gì. Để chúng ở bốn chỗ thì mỗi chỗ lại phải biết
 * ba chỗ kia, và "phá kỷ lục" ở một chỗ sẽ không mở được kỹ năng ở chỗ khác.
 */

export const JOURNAL_VERSION = 1;

/** Mỗi chừng này mét diều trôi sau khi đứt dây là một sợi chỉ. */
export const DRIFT_METRES_PER_THREAD = 15;

/** Trần sợi chỉ của một chuyến trôi — đứt dây là cái giá, không phải mỏ vàng. */
export const DRIFT_THREAD_CAP = 6;

/**
 * Chuyến lượn theo con diều đứt dây: trôi càng xa càng nhiều sợi chỉ. Muốn
 * "lượn ngắm cảnh" thì phải chấp nhận mất con diều.
 */
export function driftThreads(session: SessionReport): number {
  if (session.name !== "kite") return 0;

  return Math.min(DRIFT_THREAD_CAP, Math.floor(count(session.drift) / DRIFT_METRES_PER_THREAD));
}

/** Số ngày gần nhất còn giữ mục "buổi chiều hôm nay" — quá khứ xa không ai xem. */
const KEEP_DAYS = 60;

/** Trần mọi số đếm — dữ liệu hỏng không được biến thành một con số vô hạn. */
const MAX_COUNT = 1_000_000;

/** Ngày trong sổ: `YYYY-MM-DD`, giờ MÁY người chơi. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Một ngày không ai chơi quá 8 ván con — trần cho mảng id của một ngày. */
const MAX_TASKS_PER_DAY = 8;

export interface Journal {
  version: number;
  /** Sợi chỉ — đơn vị tiền tệ DUY NHẤT của game */
  threads: number;
  /** Kỹ năng đã mở (id trong `SKILLS`) */
  skills: SkillId[];
  /** Kỷ lục từng trò: độ cao diều, số sen một ván, số cú liên tiếp */
  bests: Partial<Record<ActivityName, number>>;
  /** Tổng sen đã nhặt */
  lotus: number;
  /** Tổng cột khí nóng đã bắt */
  thermals: number;
  /** Tổng số ván đã chơi */
  sessions: number;
  /** Trang hồi ký đã mở (id trong `PAGES`) */
  entries: PageId[];
  /** Ngày → id những mục "buổi chiều hôm nay" đã xong */
  days: Record<string, string[]>;
  /** Trang phục đã đổi bằng sợi chỉ (id trong `LOOK_LIST`) */
  looks: string[];
  /** Trang phục đang mặc — mỗi ô một món, luôn là tập con của `looks` */
  wearing: string[];
  /** Chỗ ngồi đã ngồi đủ lâu (id trong `NOOK_LIST`) */
  nooks: string[];
  /** Bí mật đã tìm ra (id trong `SECRET_LIST`) */
  secrets: string[];
  /** Những phía đã tiễn diều (`SNAP_SIDES`) — đủ ba phía là một bí mật */
  snaps: string[];
  /** Kỷ vật đã nhặt (id trong `KEEPSAKE_LIST`) */
  keepsakes: string[];
  /** Những nơi đã đặt chân tới (id trong `PLACE_LIST`) — bản đồ hiện dần */
  visited: string[];
}

/**
 * Sổ vừa đổi những gì.
 *
 * Trả về một lượt thay vì bắt lớp gọi tự so sánh: `WorldGame` cần biết VỪA mở
 * trang nào để nói với người chơi, còn giao diện thì chỉ cần biết sổ đã đổi.
 */
export interface JournalChange {
  journal: Journal;
  /** Sổ có khác gì không — không khác thì KHÔNG ghi đĩa */
  changed: boolean;
  /** Ván vừa phá kỷ lục (nếu có) */
  best?: { name: ActivityName; value: number };
  /** Sợi chỉ vừa nhận */
  threads: number;
  pages: MemoryPage[];
  tasks: DailyTask[];
  skills: Skill[];
  /** Trang ĐẦU TIÊN của sổ — lúc đó mới cần chỉ chỗ mở sổ */
  firstPage: boolean;
  /** Bí mật vừa tìm ra */
  secrets?: Secret[];
}

/** Giá trị của một ngưỡng, đọc từ trò chơi: chỉ có trong ván vừa chạy. */
export type SessionMetric =
  | "kiteAltitude"
  | "kiteThermals"
  | "swimLotus"
  | "shuttleCombo";

/** Giá trị của một ngưỡng, đọc từ sổ: thành tích đã tích lại qua các ván. */
export type JournalMetric =
  | "bestKite"
  | "bestSwim"
  | "bestShuttle"
  | "lotusTotal"
  | "thermalsTotal"
  | "nooksTotal"
  | "sessions";

export function createJournal(): Journal {
  return {
    version: JOURNAL_VERSION,
    threads: 0,
    skills: [],
    bests: {},
    lotus: 0,
    thermals: 0,
    sessions: 0,
    entries: [],
    days: {},
    looks: [],
    wearing: [],
    nooks: [],
    secrets: [],
    snaps: [],
    keepsakes: [],
    visited: [],
  };
}

// ── Đọc dữ liệu đã lưu ──────────────────────────────────────────────────────

/**
 * Dữ liệu đã lưu → sổ dùng được.
 *
 * Không bao giờ ném. Bốn thứ có thật ngoài đời đều đi qua đây: JSON của một
 * bản cũ thiếu trường, số âm do ai đó sửa tay, `version` lạ, và một object
 * hoàn toàn không phải sổ. Gặp cái nào cũng chỉ có một kết cục đúng: **mở sổ
 * mới và chơi bình thường** — người chơi mất phần đã ghi, chứ không gặp một
 * màn hình trắng.
 */
export function normalizeJournal(raw: unknown): Journal {
  const fresh = createJournal();

  if (typeof raw !== "object" || raw === null) return fresh;

  const source = raw as Record<string, unknown>;

  // Bản khác phiên bản thì không đoán: đoán sai một trường nghĩa là ghi đè
  // dữ liệu của người chơi bằng một con số bịa.
  if (source.version !== JOURNAL_VERSION) return fresh;

  const bests: Partial<Record<ActivityName, number>> = {};
  const rawBests = source.bests;

  if (typeof rawBests === "object" && rawBests !== null) {
    for (const name of ACTIVITIES) {
      const value = count((rawBests as Record<string, unknown>)[name]);

      if (value > 0) bests[name] = value;
    }
  }

  return {
    version: JOURNAL_VERSION,
    threads: count(source.threads),
    skills: ids(source.skills).filter(isSkillId),
    bests,
    lotus: count(source.lotus),
    thermals: count(source.thermals),
    sessions: count(source.sessions),
    entries: ids(source.entries).filter(isPageId),
    days: normalizeDays(source.days),
    // Hai trường này ra đời sau bản đầu của sổ: sổ cũ thiếu thì là mảng rỗng,
    // chứ không phải sổ hỏng — không cần nâng `version`.
    ...normalizeLooks(source.looks, source.wearing),
    nooks: ids(source.nooks).filter(isNookId),
    secrets: ids(source.secrets).filter(isSecretId),
    snaps: ids(source.snaps).filter((side) => (SNAP_SIDES as readonly string[]).includes(side)),
    keepsakes: ids(source.keepsakes).filter(isKeepsakeId),
    visited: ids(source.visited).filter(isPlaceId),
  };
}

/** Đồ đã đổi phải có thật; đồ đang mặc phải là đồ đã đổi, mỗi ô một món. */
function normalizeLooks(rawLooks: unknown, rawWearing: unknown): Pick<Journal, "looks" | "wearing"> {
  const looks = ids(rawLooks).filter(isLookId);
  const slots = new Set<string>();
  const wearing: string[] = [];

  for (const id of ids(rawWearing)) {
    const item = lookItem(id);

    if (!item || !looks.includes(id) || slots.has(item.slot)) continue;

    slots.add(item.slot);
    wearing.push(id);
  }

  return { looks, wearing };
}

// ── Trang phục ───────────────────────────────────────────────────────────────

/**
 * Đổi sợi chỉ lấy một món đồ, rồi mặc luôn — đổi xong mà phải bấm thêm một
 * lần nữa mới thấy mình mặc thì niềm vui bị chia đôi.
 *
 * Không đủ chỉ, món không có thật, hoặc đã có rồi → sổ không đổi.
 */
export function buyLook(state: Journal, id: string): { journal: Journal; changed: boolean } {
  const item = lookItem(id);

  if (!item || state.looks.includes(id) || state.threads < item.cost) {
    return { journal: state, changed: false };
  }

  const bought: Journal = {
    ...state,
    threads: state.threads - item.cost,
    looks: [...state.looks, id],
  };

  return { journal: wearLook(bought, id).journal, changed: true };
}

/**
 * Mặc một món đã có (thay món cùng ô), hoặc cởi ra nếu đang mặc — về dáng
 * mặc định của ô đó.
 */
export function wearLook(state: Journal, id: string): { journal: Journal; changed: boolean } {
  const item = lookItem(id);

  if (!item || !state.looks.includes(id)) return { journal: state, changed: false };

  const others = state.wearing.filter((worn) => lookItem(worn)?.slot !== item.slot);
  const wearing = state.wearing.includes(id) ? others : [...others, id];

  return { journal: { ...state, wearing }, changed: true };
}

/** Số đếm từ dữ liệu chưa tin được: hữu hạn, không âm, không quá to. */
function count(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;

  return Math.min(MAX_COUNT, Math.max(0, Math.round(value)));
}

/** Mảng id: chỉ nhận chuỗi, bỏ trùng, giữ thứ tự. */
function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return [
    ...new Set(
      value.filter((item): item is string => typeof item === "string"),
    ),
  ];
}

function normalizeDays(value: unknown): Record<string, string[]> {
  if (typeof value !== "object" || value === null) return {};

  const days: Record<string, string[]> = {};

  for (const [key, items] of Object.entries(value as Record<string, unknown>)) {
    if (!DAY_PATTERN.test(key)) continue;

    days[key] = ids(items).slice(0, MAX_TASKS_PER_DAY);
  }

  return pruneDays(days);
}

/** Giữ `KEEP_DAYS` ngày mới nhất — khoá `YYYY-MM-DD` xếp theo thứ tự thời gian. */
function pruneDays(days: Record<string, string[]>): Record<string, string[]> {
  const keys = Object.keys(days).sort();

  if (keys.length <= KEEP_DAYS) return days;

  const kept: Record<string, string[]> = {};

  for (const key of keys.slice(-KEEP_DAYS)) kept[key] = days[key];

  return kept;
}

// ── Đọc ngưỡng ──────────────────────────────────────────────────────────────

/**
 * Ngưỡng trên một ván VỪA chạy.
 *
 * Trò nào chỉ đọc được số của chính nó: một ván bơi không bao giờ đọc ra số
 * cột khí nóng của ván diều, nên mục "hai cột khí nóng" không thể tự xong khi
 * người chơi đang ở dưới ao.
 */
export function sessionValue(metric: SessionMetric, session: SessionReport): number {
  const score = count(session.score);

  switch (metric) {
    case "kiteAltitude":
      return session.name === "kite" ? score : 0;
    case "kiteThermals":
      return session.name === "kite" ? count(session.thermals) : 0;
    case "swimLotus":
      return session.name === "swim" ? score : 0;
    case "shuttleCombo":
      return session.name === "shuttlecock" ? score : 0;
  }
}

/** Từ trang hồi ký thứ mấy thì trời bắt đầu ngả chiều, và tới trang nào thì chạng vạng hẳn. */
const DUSK_FROM = 2;
const DUSK_FULL = 6;

/** Chạng vạng tối đa — hoàng hôn tím, không phải đêm đen: vẫn thả diều, vẫn bơi được. */
export const DUSK_MAX = 0.8;

/**
 * Trời ngả chiều theo TIẾN TRÌNH, không theo đồng hồ thật: càng nhiều trang
 * hồi ký thì buổi chiều càng muộn. Không lệch múi giờ, không cần `Date.now()`,
 * và người chơi thấy mình đã làm gì đó mà trời đổi.
 */
export function duskLevel(journal: Journal): number {
  const progress = (journal.entries.length - DUSK_FROM) / (DUSK_FULL - DUSK_FROM);

  return Math.min(DUSK_MAX, Math.max(0, progress * DUSK_MAX));
}

/** Ngưỡng đọc từ sổ — thành tích đã tích qua nhiều ván. */
export function journalValue(metric: JournalMetric, journal: Journal): number {
  switch (metric) {
    case "bestKite":
      return journal.bests.kite ?? 0;
    case "bestSwim":
      return journal.bests.swim ?? 0;
    case "bestShuttle":
      return journal.bests.shuttlecock ?? 0;
    case "lotusTotal":
      return journal.lotus;
    case "thermalsTotal":
      return journal.thermals;
    case "nooksTotal":
      return journal.nooks.length;
    case "sessions":
      return journal.sessions;
  }
}

// ── Ghi ─────────────────────────────────────────────────────────────────────

/**
 * Mở hết những trang và kỹ năng mà sổ ĐÃ đủ điều kiện mở nhưng chưa mở.
 *
 * Chạy cả lúc nạp sổ, không chỉ lúc chơi: người chơi tắt máy đúng lúc vừa phá
 * kỷ lục vẫn thấy trang của mình ở lần mở sau. Idempotent — trang đã mở thì
 * không mở lại, nên gọi bao nhiêu lần cũng không sinh sợi chỉ giả.
 */
export function grantEarned(state: Journal): JournalChange {
  const pages = PAGE_LIST.filter(
    (page) =>
      !state.entries.includes(page.id) &&
      journalValue(page.metric, state) >= page.target,
  );

  const skills = SKILL_LIST.filter(
    (skill) =>
      !state.skills.includes(skill.id) &&
      journalValue(skill.metric, state) >= skill.target,
  );

  if (pages.length === 0 && skills.length === 0) {
    return {
      journal: state,
      changed: false,
      threads: 0,
      pages: [],
      tasks: [],
      skills: [],
      firstPage: false,
    };
  }

  const threads = pages.reduce((sum, page) => sum + page.threads, 0);

  return {
    journal: {
      ...state,
      entries: [...state.entries, ...pages.map((page) => page.id)],
      skills: [...state.skills, ...skills.map((skill) => skill.id)],
      threads: state.threads + threads,
    },
    changed: true,
    threads,
    pages,
    tasks: [],
    skills,
    firstPage: false,
  };
}

/**
 * Một ván đã xong → sổ mới.
 *
 * Bốn việc, đúng theo thứ tự: cộng dồn ván này vào sổ, chấm những mục "buổi
 * chiều hôm nay" mà ván này vừa đạt, mở trang/kỹ năng đã đủ điều kiện, rồi
 * trả về TẤT CẢ trong một lượt. Không chỗ nào ghi thẳng vào sổ cũ.
 */
export function recordSession(
  state: Journal,
  session: SessionReport,
  day: string,
): JournalChange {
  const score = count(session.score);
  const previous = state.bests[session.name] ?? 0;
  const record = score > previous;

  const bests = record
    ? { ...state.bests, [session.name]: score }
    : state.bests;

  const done = state.days[day] ?? [];
  const tasks = dailyTasks(day).filter(
    (task) =>
      !done.includes(task.id) && sessionValue(task.metric, session) >= task.target,
  );

  const dayThreads =
    tasks.reduce((sum, task) => sum + task.threads, 0) + driftThreads(session);

  const side = session.name === "kite" ? session.snapSide : undefined;
  const snaps = side && !state.snaps.includes(side) ? [...state.snaps, side] : state.snaps;

  const grown: Journal = {
    ...state,
    snaps,
    bests,
    lotus: state.lotus + (session.name === "swim" ? score : 0),
    thermals: state.thermals + count(session.thermals),
    sessions: state.sessions + 1,
    threads: state.threads + dayThreads,
    days:
      tasks.length === 0
        ? state.days
        : pruneDays({
            ...state.days,
            [day]: [...done, ...tasks.map((task) => task.id)],
          }),
  };

  // Bí mật đọc từ ván vừa chạy: chạm trần trời, hoặc đã tiễn diều đủ ba phía.
  const found = [
    session.name === "kite" && score >= SKY_CEILING ? "sky-ceiling" : undefined,
    snaps.length >= SNAP_SIDES.length ? "three-farewells" : undefined,
  ].filter((id): id is string => id !== undefined && !grown.secrets.includes(id));

  const earned = grantEarned({
    ...grown,
    secrets: [...grown.secrets, ...found],
    threads: grown.threads + found.length * SECRET_THREADS,
  });
  const secretThreads = found.length * SECRET_THREADS;

  return {
    journal: earned.journal,
    changed: true,
    secrets: found.map((id) => secretItem(id)).filter((item): item is Secret => item !== undefined),
    best: record ? { name: session.name, value: score } : undefined,
    threads: dayThreads + earned.threads + secretThreads,
    pages: earned.pages,
    tasks,
    skills: earned.skills,
    firstPage: state.entries.length === 0 && earned.pages.length > 0,
  };
}

/** Mỗi chỗ ngồi mới là một sợi chỉ — đi dạo cũng là chơi. */
export const NOOK_THREADS = 1;

/**
 * Ngồi đủ lâu ở một chỗ → chỗ đó vào sổ (+1 sợi chỉ), rồi mở kỹ năng đã đủ
 * điều kiện. Chỗ đã ngồi rồi hoặc không có thật → sổ không đổi.
 */
export function recordNook(state: Journal, id: string): JournalChange {
  if (!isNookId(id) || state.nooks.includes(id)) return grantEarned(state);

  const earned = grantEarned({
    ...state,
    nooks: [...state.nooks, id],
    threads: state.threads + NOOK_THREADS,
  });

  return { ...earned, changed: true, threads: earned.threads + NOOK_THREADS };
}

/** Tìm ra một bí mật ngoài ván chơi (ngồi yên, chim sẻ) → +sợi chỉ, một lần. */
export function recordSecret(state: Journal, id: string): JournalChange {
  const secret = secretItem(id);

  if (!secret || state.secrets.includes(id)) return grantEarned(state);

  const earned = grantEarned({
    ...state,
    secrets: [...state.secrets, id],
    threads: state.threads + SECRET_THREADS,
  });

  return {
    ...earned,
    changed: true,
    threads: earned.threads + SECRET_THREADS,
    secrets: [secret],
  };
}

/** Nhặt một kỷ vật → +1 sợi chỉ, một lần. */
export function recordKeepsake(state: Journal, id: string): JournalChange {
  if (!isKeepsakeId(id) || state.keepsakes.includes(id)) return grantEarned(state);

  const earned = grantEarned({
    ...state,
    keepsakes: [...state.keepsakes, id],
    threads: state.threads + KEEPSAKE_THREADS,
  });

  return { ...earned, changed: true, threads: earned.threads + KEEPSAKE_THREADS };
}

/** Đặt chân tới một nơi mới → bản đồ hiện thêm một chỗ. Không thưởng chỉ. */
export function recordVisit(state: Journal, id: string): { journal: Journal; changed: boolean } {
  if (!isPlaceId(id) || state.visited.includes(id)) return { journal: state, changed: false };

  return { journal: { ...state, visited: [...state.visited, id] }, changed: true };
}
