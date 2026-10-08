interface Props {
  time?: string;
  chapter?: string;
  hint?: boolean;
  memories?: number;
  total?: number;
}

export function GameHUD({ time, chapter, hint, memories, total }: Props) {
  const showMemories = typeof memories === "number" && typeof total === "number";

  return (
    <div className="hud">
      {(time || chapter) && (
        <div className="hud__top">
          <div className="hud__time">{time}</div>

          <div className="hud__right">
            {showMemories && (
              <div className="hud__memoirs">
                Hồi ký {memories}/{total}
              </div>
            )}

            {chapter && <div className="hud__memory">{chapter}</div>}
          </div>
        </div>
      )}

      {hint && (
        <div className="hud__hint">
          <span className="key">W</span>
          <span className="key">A</span>
          <span className="key">S</span>
          <span className="key">D</span>

          <span className="hud__hint-text">di chuyển</span>

          <span className="key">E</span>

          <span className="hud__hint-text">tương tác</span>

          <span className="key key--wide">Space</span>

          <span className="hud__hint-text">đọc tiếp</span>
        </div>
      )}
    </div>
  );
}
