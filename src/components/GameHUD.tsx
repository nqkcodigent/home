import { MoveHint } from "./MoveHint";

interface Props {
  time?: string;
  chapter?: string;
  hint?: boolean;
  memories?: number;
  total?: number;
}

export function GameHUD({ time, chapter, hint, memories, total }: Props) {
  const showMemories =
    typeof memories === "number" && typeof total === "number" && total > 0;

  return (
    <div className="hud">
      {time && (
        <div className="hud__pill hud__pill--time">
          <ClockIcon />
          <span>{time}</span>
        </div>
      )}

      <div className="hud__right">
        {showMemories && (
          <div className="hud__pill hud__pill--memory">
            <LeafIcon />
            <span>
              Hồi ký {memories}/{total}
            </span>
          </div>
        )}

        {chapter && <div className="hud__pill hud__pill--chapter">{chapter}</div>}
      </div>

      <MoveHint visible={hint} />
    </div>
  );
}

/** Đồng hồ con — vẽ bằng SVG để không phụ thuộc font biểu tượng của hệ điều hành. */
function ClockIcon() {
  return (
    <svg className="hud__icon" viewBox="0 0 24 24" aria-hidden="true">
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

function LeafIcon() {
  return (
    <svg className="hud__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 19c0-7 4.5-12 14-13 .6 8.6-4.4 13.6-11.5 13.6L5 19z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M6 20c1.6-4 4.4-7 8.5-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
