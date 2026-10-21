import { useEffect, useState } from "react";

import { gameEvents } from "../events";
import { YARD } from "../world/world/layout";
import {
  KEEPSAKE_LIST,
  LOOK_LIST,
  LOOK_SLOT_LABEL,
  NOOK_LIST,
  PAGE_LIST,
  PLACE_LIST,
  SECRET_LIST,
  SKILL_LIST,
  dailyTasks,
  journalValue,
  todayKey,
} from "../world/progress";
import { playSfx } from "../ui/sfx";

import type {
  DailyTask,
  Journal as JournalData,
  LookItem,
  LookSlot,
  MemoryPage,
  Skill,
} from "../world/progress";

interface Props {
  open: boolean;
  /** Sổ hiện tại — bảng này chỉ ĐỌC, không tự cộng gì */
  journal: JournalData;
}

type Tab = "today" | "skills" | "pages" | "map" | "looks";

const TABS: readonly { id: Tab; label: string }[] = [
  { id: "today", label: "Hôm nay" },
  { id: "skills", label: "Kỹ năng" },
  { id: "pages", label: "Trang" },
  { id: "map", label: "Bản đồ" },
  { id: "looks", label: "Trang phục" },
];

const LOOK_SLOTS: readonly LookSlot[] = ["hair", "hat", "sweater", "tail"];

const FAMILIES: readonly Skill["family"][] = ["kite", "swim", "shuttlecock", "walk"];

const FAMILY_LABEL: Record<Skill["family"], string> = {
  kite: "Thả diều",
  swim: "Bơi ao",
  shuttlecock: "Đá cầu",
  walk: "Dạo chơi",
};

/**
 * Sổ hồi ký — bảng duy nhất trong game KHÔNG tự hiện lên.
 *
 * Mở từ Rương gỗ trong nhà (xem `WorldGame.openJournal`), đóng bằng Esc hoặc
 * nút dưới đáy. Trong lúc mở, quyền điều khiển đã bị khoá từ phía thế giới,
 * nên ở đây không có gì phải tạm dừng — bảng này chỉ vẽ.
 *
 * Ba phần, và chúng là ba câu trả lời khác nhau cho "chơi để làm gì":
 *
 *  - **Hôm nay** — ba việc của buổi chiều nay, mỗi chỗ chơi một việc. Đây là
 *    lý do mở game lên, và cũng là lý do quay lại ngày mai: mai sẽ là ba việc
 *    khác. Hôm nay không chơi thì chỉ là hôm nay không có việc mới.
 *  - **Kỹ năng** — cái gì đã nới ra, và còn phải chơi tới đâu thì nới tiếp.
 *  - **Trang** — những trang hồi ký đã mở. Trang chưa mở hiện ra như một ô
 *    trống kèm một dòng mách nước: một câu hỏi để ngày mai trả lời, chứ không
 *    phải một ô trong danh sách việc cần làm.
 */
export function Journal({ open, journal }: Props) {
  const [tab, setTab] = useState<Tab>("today");

  useEffect(() => {
    if (!open) return undefined;

    // Mở sổ là một cú bấm của người chơi, nên đây là chỗ được phép phát tiếng.
    playSfx("chime");

    const handleKey = (event: KeyboardEvent) => {
      // `E` đóng sổ vì `E` cũng là phím mở nó — cùng một phím, cùng một thứ.
      // `Esc` là đường thứ hai cho người chơi quen tay.
      if (event.code === "Escape" || event.code === "KeyE") {
        event.preventDefault();

        gameEvents.emit("journalClose", undefined);
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  if (!open) return null;

  const day = todayKey();

  return (
    <div className="journal" role="dialog" aria-modal="true" aria-label="Sổ hồi ký">
      <div className="journal__card">
        <header className="journal__head">
          <div>
            <p className="journal__kicker">{formatDay(day)}</p>
            <h2 className="journal__title">Sổ hồi ký</h2>
          </div>

          <span className="journal__threads">
            <b>{journal.threads}</b> sợi chỉ
          </span>
        </header>

        <div className="journal__tabs" role="tablist" aria-label="Phần của sổ">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab === entry.id}
              className={`journal__tab${tab === entry.id ? " is-on" : ""}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </div>

        <div className="journal__body">
          {tab === "today" && <TodayTab tasks={dailyTasks(day)} done={journal.days[day] ?? []} />}
          {tab === "skills" && <SkillsTab journal={journal} />}
          {tab === "pages" && <PagesTab journal={journal} />}
          {tab === "map" && <MapTab journal={journal} />}
          {tab === "looks" && <LooksTab journal={journal} />}
        </div>

        <footer className="journal__foot">
          <span className="journal__records">{recordsLine(journal)}</span>

          <button
            type="button"
            className="journal__close"
            onClick={() => gameEvents.emit("journalClose", undefined)}
            aria-label="Đóng sổ hồi ký"
          >
            <kbd>Esc</kbd> gấp sổ lại
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Ba việc của buổi chiều nay — một cho mỗi chỗ chơi. */
function TodayTab({ tasks, done }: { tasks: readonly DailyTask[]; done: readonly string[] }) {
  const left = tasks.filter((task) => !done.includes(task.id)).length;

  return (
    <section className="journal__section" aria-label="Buổi chiều hôm nay">
      <h3 className="journal__heading">Buổi chiều hôm nay</h3>

      <ul className="journal__list">
        {tasks.map((task) => {
          const finished = done.includes(task.id);

          return (
            <li key={task.id} className={`journal__task${finished ? " is-done" : ""}`}>
              <span className="journal__mark" aria-hidden="true">
                {finished ? "✓" : "○"}
              </span>

              <span className="journal__task-text">{task.label}</span>

              <span className="journal__pill">+{task.threads} chỉ</span>
            </li>
          );
        })}
      </ul>

      <p className="journal__note">
        {left === 0
          ? "Xong cả ba rồi. Mai lại có ba việc khác — cứ thư thả."
          : "Không phải làm hết cũng được: việc nào chưa xong thì tối nay vẫn còn đó."}
      </p>
    </section>
  );
}

/** Kỹ năng — mở bằng chính thành tích của trò, không bán bằng chỉ. */
function SkillsTab({ journal }: { journal: JournalData }) {
  return (
    <section className="journal__section" aria-label="Kỹ năng">
      {FAMILIES.map((family) => (
        <div key={family} className="journal__group">
          <h3 className="journal__heading">{FAMILY_LABEL[family]}</h3>

          <ul className="journal__list">
            {SKILL_LIST.filter((skill) => skill.family === family).map((skill) => {
              const unlocked = journal.skills.includes(skill.id);
              const current = journalValue(skill.metric, journal);

              return (
                <li key={skill.id} className={`journal__skill${unlocked ? " is-open" : ""}`}>
                  <div className="journal__skill-head">
                    <span className="journal__skill-name">{skill.label}</span>

                    <span className="journal__pill">
                      {unlocked ? "đã mở" : `${current}/${skill.target} ${skill.unit}`}
                    </span>
                  </div>

                  <p className="journal__skill-effect">{skill.effect}</p>

                  {!unlocked && <p className="journal__skill-hint">{skill.hint}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <p className="journal__note">
        Kỹ năng nới cửa sổ chứ không phá luật: dây căng quá thì vẫn đứt, và con diều vẫn
        phải nhờ gió.
      </p>
    </section>
  );
}

/** Những trang đã mở, và những ô còn trống. */
function PagesTab({ journal }: { journal: JournalData }) {
  const opened = PAGE_LIST.filter((page) => journal.entries.includes(page.id));

  return (
    <section className="journal__section" aria-label="Trang hồi ký">
      <h3 className="journal__heading">
        {opened.length}/{PAGE_LIST.length} trang đã mở
      </h3>

      <ul className="journal__list">
        {PAGE_LIST.map((page) => {
          const shown = journal.entries.includes(page.id);

          return (
            <li key={page.id} className={`journal__page${shown ? " is-open" : ""}`}>
              {shown ? <OpenedPage page={page} /> : <EmptyPage page={page} />}
            </li>
          );
        })}
      </ul>

      <h3 className="journal__heading">
        Chỗ ngồi ngắm cảnh · {journal.nooks.length}/{NOOK_LIST.length}
      </h3>

      <ul className="journal__list">
        {NOOK_LIST.map((nook) =>
          journal.nooks.includes(nook.id) ? (
            <li key={nook.id} className="journal__page is-open">
              <p className="journal__page-title">{nook.label}</p>
              <p className="journal__page-text">{nook.line}</p>
            </li>
          ) : null,
        )}
      </ul>

      {journal.secrets.length > 0 && (
        <>
          <h3 className="journal__heading">Bí mật</h3>

          <ul className="journal__list">
            {SECRET_LIST.filter((secret) => journal.secrets.includes(secret.id)).map((secret) => (
              <li key={secret.id} className="journal__page is-open">
                <p className="journal__page-title">{secret.label}</p>
                <p className="journal__page-text">{secret.line}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Không liệt kê bí mật chưa tìm ra — chỉ một con số. */}
      {journal.secrets.length < SECRET_LIST.length && (
        <p className="journal__note">
          Buổi chiều này còn {SECRET_LIST.length - journal.secrets.length} điều chưa ai kể.
        </p>
      )}

      {journal.nooks.length < NOOK_LIST.length && (
        <p className="journal__note">
          Còn {NOOK_LIST.length - journal.nooks.length} chỗ chưa ngồi — gốc cây, bờ ruộng, đỉnh
          đồi… cứ thấy khúc gỗ nào là ghé lại.
        </p>
      )}
    </section>
  );
}

function OpenedPage({ page }: { page: MemoryPage }) {
  return (
    <>
      <p className="journal__page-title">{page.title}</p>
      <p className="journal__page-text">{page.text}</p>
    </>
  );
}

function EmptyPage({ page }: { page: MemoryPage }) {
  return (
    <>
      <p className="journal__page-title">
        <span className="journal__blank" aria-hidden="true">
          ?
        </span>
        Trang còn trống
      </p>
      <p className="journal__page-text journal__page-text--hint">{page.hint}</p>
    </>
  );
}

/**
 * Bản đồ vẽ tay — hiện dần theo bước chân. Nơi chưa tới thì chưa có trên bản
 * đồ (chỉ một con số), kỷ vật đã nhặt thì đánh dấu sao. Bắc ở trên: trục Z của
 * thế giới chạy từ trên xuống, nên toạ độ SVG chính là (x, z).
 */
function MapTab({ journal }: { journal: JournalData }) {
  const visited = PLACE_LIST.filter((place) => journal.visited.includes(place.id));
  const found = KEEPSAKE_LIST.filter((item) => journal.keepsakes.includes(item.id));
  const path = YARD.path.map(({ x, z }) => `${x},${z}`).join(" ");

  return (
    <section className="journal__section" aria-label="Bản đồ">
      <h3 className="journal__heading">
        Đã đặt chân {visited.length}/{PLACE_LIST.length} nơi · {found.length}/{KEEPSAKE_LIST.length} kỷ vật
      </h3>

      <svg className="journal__map" viewBox="-72 -72 144 144" role="img" aria-label="Bản đồ làng">
        {/* Vành cây ngoài cùng — bìa làng. */}
        <circle cx={0} cy={0} r={63} className="journal__map-edge" />
        <polyline points={path} className="journal__map-path" />
        <line
          x1={YARD.fence.from}
          y1={YARD.fence.z}
          x2={YARD.fence.to}
          y2={YARD.fence.z}
          className="journal__map-fence"
        />

        {visited.map((place) => (
          <g key={place.id} transform={`translate(${place.x} ${place.z})`}>
            <circle r={1.6} className="journal__map-dot" />
            <text y={-3} className="journal__map-label">
              {place.label}
            </text>
          </g>
        ))}

        {found.map((item) => (
          <text key={item.id} x={item.x} y={item.z} className="journal__map-star">
            ★
          </text>
        ))}

        <text x={YARD.house.x} y={YARD.house.z + 6} className="journal__map-here">
          bạn đang ở đây
        </text>
      </svg>

      {found.length > 0 && (
        <ul className="journal__list">
          {found.map((item) => (
            <li key={item.id} className="journal__page is-open">
              <p className="journal__page-title">★ {item.label}</p>
              <p className="journal__page-text">{item.line}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="journal__note">
        Bản đồ tự vẽ thêm mỗi khi bạn tới một nơi mới. Thứ gì lấp lánh trên cỏ thì cứ lại gần.
      </p>
    </section>
  );
}

/**
 * Trang phục — chỗ tiêu sợi chỉ. Thuần thị giác: đổi rồi mặc ngay, nhân vật
 * thay đồ tức thì ngay cạnh rương. Mỗi ô một món; bấm món đang mặc là cởi ra.
 */
function LooksTab({ journal }: { journal: JournalData }) {
  return (
    <section className="journal__section" aria-label="Trang phục">
      {LOOK_SLOTS.map((slot) => (
        <div key={slot} className="journal__group">
          <h3 className="journal__heading">{LOOK_SLOT_LABEL[slot]}</h3>

          <ul className="journal__looks">
            {LOOK_LIST.filter((item) => item.slot === slot).map((item) => (
              <LookCard key={item.id} item={item} journal={journal} />
            ))}
          </ul>
        </div>
      ))}

      <p className="journal__note">
        Sợi chỉ có được từ việc trong ngày và từ những chuyến diều đứt dây trôi xa.
      </p>
    </section>
  );
}

function LookCard({ item, journal }: { item: LookItem; journal: JournalData }) {
  const owned = journal.looks.includes(item.id);
  const worn = journal.wearing.includes(item.id);
  const affordable = journal.threads >= item.cost;
  const swatch = item.tail ?? item.patch?.shirt;

  const action = owned
    ? () => gameEvents.emit("journalWear", { id: item.id })
    : () => gameEvents.emit("journalBuy", { id: item.id });

  return (
    <li className={`journal__look${worn ? " is-worn" : ""}`}>
      {swatch !== undefined && (
        <span
          className="journal__swatch"
          style={{ background: `#${swatch.toString(16).padStart(6, "0")}` }}
          aria-hidden="true"
        />
      )}

      <span className="journal__look-name">{item.label}</span>

      <button
        type="button"
        className="journal__look-button"
        disabled={!owned && !affordable}
        onClick={action}
      >
        {worn ? "Đang mặc" : owned ? "Mặc" : `${item.cost} chỉ`}
      </button>
    </li>
  );
}

/** Kỷ lục ba trò, chỉ in những con số đã có. */
function recordsLine(journal: JournalData): string {
  const parts: string[] = [];
  const kite = journal.bests.kite ?? 0;
  const swim = journal.bests.swim ?? 0;
  const shuttle = journal.bests.shuttlecock ?? 0;

  if (kite > 0) parts.push(`Diều ${kite} m`);
  if (swim > 0) parts.push(`Bơi ${swim} sen`);
  if (shuttle > 0) parts.push(`Cầu ${shuttle} cú`);

  return parts.length > 0
    ? `Kỷ lục: ${parts.join(" · ")}`
    : "Chưa có kỷ lục nào — ra sân thử một ván.";
}

/** `2026-10-16` → `Ngày 16 tháng 10`. */
function formatDay(day: string): string {
  const [, month, date] = day.split("-");

  return `Ngày ${Number(date)} tháng ${Number(month)}`;
}
