import type { ReactNode } from "react";

import { gameEvents } from "../events";
import { KITE_SHOT_LABELS } from "../world/activities/kite/kiteCamera";

import type { KiteHudPayload, KiteResultPayload } from "../events";

interface Props {
  /** Số liệu đang chạy (patch đã trộn ở App) */
  data?: KiteHudPayload;
  /** Bảng kết quả, tự tắt sau ít giây */
  result?: KiteResultPayload;
}

/** Ngưỡng lực căng bắt đầu cảnh báo — khớp màu đỏ của thanh. */
const DANGER = 0.82;

/**
 * Bảng điều khiển thả diều.
 *
 * Bốn con số người chơi cần, xếp theo đúng thứ tự họ cần: đã bay bao lâu, diều
 * cao bao nhiêu, dây căng tới đâu, và bao nhiêu điểm. Thanh căng là thứ duy
 * nhất phải liếc liên tục nên nó to nhất và đổi màu khi gần đứt; hướng gió nằm
 * cùng hàng vì hai thứ đó luôn được đọc cùng nhau.
 *
 * Ba trạng thái của ván đổi hẳn bảng này, nên chúng là ba nhánh chứ không phải
 * ba lớp phủ lên nhau:
 *
 *  - `launch` — thêm bảng hướng dẫn, và nhắc luôn phím thu diều;
 *  - `adrift` — dây đã đứt: thanh căng vô nghĩa, nút đổi góc máy vô nghĩa, nên
 *    cả hai được thay bằng đúng một câu nói rõ chuyện gì đang xảy ra;
 *  - `flying`-đã-lâu (`hint`) — người chơi vẫn đang bay, chỉ được nhắc rằng
 *    bấm `R` là xong.
 */
export function KitePanel({ data, result }: Props) {
  const adrift = data?.phase === "adrift";

  return (
    <>
      {data?.visible && (
        <>
          <div className="kite" role="status" aria-label="Bảng thả diều">
            <div className="kite__stats">
              <Pill icon={<ClockIcon />} label={`${formatTime(data.elapsed ?? 0)} bay`} />

              <Pill
                icon={<ArrowUpIcon />}
                label={`${Math.round(data.altitude ?? 0)} m`}
                tone="sky"
              />

              <Pill
                icon={<StarIcon />}
                label={`${data.score ?? 0} điểm`}
                tone="gold"
              />

              {adrift && (
                <Pill
                  icon={<DriftIcon />}
                  label={`trôi ${Math.round(data.drift ?? 0)} m`}
                  tone="plain"
                />
              )}
            </div>

            {adrift ? (
              <p className="kite__snapped">
                Dây đã đứt — diều đang trôi tự do, không ai lái được nữa.
              </p>
            ) : (
              <div className="kite__row">
                <span className="kite__label">
                  Dây {Math.round(data.line ?? 0)} m
                </span>

                <div
                  className={`kite__tension${
                    (data.tension ?? 0) >= DANGER ? " is-danger" : ""
                  }`}
                >
                  <span
                    className="kite__tension-fill"
                    style={{ width: `${Math.min(100, (data.tension ?? 0) * 100)}%` }}
                  />
                </div>

                <span className="kite__label kite__label--wind">
                  Gió
                  <WindArrow degrees={data.windDirection ?? 0} />
                  <WindMeter strength={data.wind ?? 0} />
                </span>
              </div>
            )}

            <div className="kite__actions">
              <button
                type="button"
                className="kite__view"
                disabled={adrift}
                // Không để cú bấm lọt xuống khung game thành thao tác kéo dây.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => gameEvents.emit("kiteView", undefined)}
                aria-label={`Đổi góc máy (đang: ${KITE_SHOT_LABELS[data.view ?? "drift"]})`}
              >
                <CameraIcon />
                {KITE_SHOT_LABELS[data.view ?? "drift"]}
                <kbd>C</kbd>
              </button>

              <button
                type="button"
                className={`kite__exit${data.hint ? " is-due" : ""}`}
                // Không để cú bấm lọt xuống khung game.
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => gameEvents.emit("kiteExit", undefined)}
                aria-label="Thu diều và quay lại đi dạo"
              >
                <kbd>R</kbd> thu diều, quay lại đi dạo
              </button>
            </div>

            {!adrift && (data.tension ?? 0) >= DANGER && (
              <p className="kite__warning">Dây sắp đứt — thu dây lại!</p>
            )}
          </div>

          {data.phase === "launch" && (
            <div className="kite__howto">
              <span className="kite__howto-title">Thả diều</span>
              <span>
                <kbd>A</kbd>
                <kbd>D</kbd> lạng diều sang hai bên
              </span>
              <span>
                <kbd>W</kbd> thả dây cho diều lên cao
              </span>
              <span>
                <kbd>S</kbd> thu dây khi dây căng
              </span>
              <span>
                <kbd>C</kbd> đổi góc máy · di chuột để bay vòng quanh diều
              </span>
              <span className="kite__howto-out">
                bấm <kbd>R</kbd> để thu diều, thả lại lúc nào cũng được
              </span>
            </div>
          )}
        </>
      )}

      {result && (
        <div className={`kite-result kite-result--${result.outcome}`}>
          <div className="kite-result__card">
            <span className="kite-result__badge">
              {result.outcome === "snapped" ? "đứt dây" : "thu diều"}
            </span>

            <h2 className="kite-result__title">{result.title}</h2>

            <p className="kite-result__detail">{result.detail}</p>

            <div className="kite-result__score">
              <span className="kite-result__score-value">{result.score}</span>
              <span className="kite-result__score-label">
                điểm · cao nhất {result.bestAltitude} m
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Pill({
  icon,
  label,
  tone = "plain",
}: {
  icon: ReactNode;
  label: string;
  tone?: "plain" | "sky" | "gold" | "warm";
}) {
  return (
    <span className={`kite__pill kite__pill--${tone}`}>
      {icon}
      {label}
    </span>
  );
}

function CameraIcon() {
  return (
    <svg className="kite__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 8h3l2-2.5h6L17 8h3v11H4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

/** Đồng hồ đếm lên — ván diều không còn đếm ngược. */
function ClockIcon() {
  return (
    <svg className="kite__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7.5V12l3 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArrowUpIcon() {
  return (
    <svg className="kite__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 20V5m0 0l-6 6m6-6l6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg className="kite__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4l2.5 5.2 5.5.7-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.5-.7z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Con diều trôi — vệt bay ngoằn ngoèo của pha đứt dây. */
function DriftIcon() {
  return (
    <svg className="kite__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M3 17c4 0 5-11 9-11 3 0 3 5 6 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M15 14l3-3-3-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Mũi tên hướng gió, xoay theo số độ. */
function WindArrow({ degrees }: { degrees: number }) {
  return (
    <svg
      className="kite__wind-arrow"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ transform: `rotate(${degrees}deg)` }}
    >
      <path
        d="M12 4l5 15-5-4-5 4z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Sức gió: năm vạch, sáng dần theo sức. */
function WindMeter({ strength }: { strength: number }) {
  const bars = Math.round(Math.min(1, Math.max(0, strength)) * 5);

  return (
    <span className="kite__wind-meter" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <span key={index} className={index < bars ? "is-on" : undefined} />
      ))}
    </span>
  );
}

/**
 * 45,4 giây → "0:45".
 *
 * Không xuất ra ngoài: file này phải chỉ có component để Fast Refresh còn
 * hoạt động (eslint react-refresh).
 */
function formatTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
