import type { ReactNode } from "react";

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
 * Ba con số người chơi cần, xếp theo đúng thứ tự họ cần: còn bao nhiêu thời
 * gian, diều đang cao bao nhiêu, và **dây căng tới đâu** — thanh căng là thứ
 * duy nhất phải liếc liên tục, nên nó to nhất và đổi màu khi gần đứt.
 *
 * Hướng gió nằm cùng hàng với thanh căng vì hai thứ đó luôn được đọc cùng
 * nhau: căng lên mà gió đang mạnh thì phải thu dây.
 */
export function KitePanel({ data, result }: Props) {
  return (
    <>
      {data?.visible && (
        <>
          <div className="kite" role="status" aria-label="Bảng thả diều">
            <div className="kite__stats">
              <Pill icon={<ClockIcon />} label={formatTime(data.timeLeft ?? 0)} />

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

              <Pill
                icon={<ThermalIcon />}
                label={`${data.thermals ?? 0} nhiệt lưu`}
                tone="warm"
              />
            </div>

            <div className="kite__row">
              <span className="kite__label">Dây</span>

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

            {(data.tension ?? 0) >= DANGER && (
              <p className="kite__warning">Dây sắp đứt — thu dây lại!</p>
            )}
          </div>

          {data.phase === "launch" && (
            <div className="kite__howto">
              <span className="kite__howto-title">Thả diều</span>
              <span>
                <kbd>A</kbd>
                <kbd>D</kbd> lạng để tìm cột khí nóng
              </span>
              <span>
                <kbd>W</kbd> thả dây cho diều lên cao
              </span>
              <span>
                <kbd>S</kbd> thu dây khi dây căng
              </span>
            </div>
          )}
        </>
      )}

      {result && (
        <div className={`kite-result kite-result--${result.outcome}`}>
          <div className="kite-result__card">
            <span className="kite-result__badge">
              {result.outcome === "snapped"
                ? "đứt dây"
                : result.outcome === "landed"
                  ? "diều xuống"
                  : "hết buổi chiều"}
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

/** Đồng hồ đếm ngược. */
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

function ThermalIcon() {
  return (
    <svg className="kite__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M8 20c0-3 3-3.4 3-6.4S8 10 8 7a4 4 0 018 0c0 3-3 3.2-3 6.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
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
  const total = Math.max(0, Math.ceil(seconds));

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
