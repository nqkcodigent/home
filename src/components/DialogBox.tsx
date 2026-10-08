import { useEffect, useRef } from "react";

import { playSfx } from "../game/audio/uiSfx";
import { gameEvents } from "../game/events";
import { getPortrait } from "../ui/portraits";
import { useTypewriter } from "../ui/useTypewriter";

interface Props {
  id?: string;
  speaker?: string;
  text: string;
  emotion?: string;
  portrait?: string;
}

const EMOTION_LABEL: Record<string, string> = {
  tired: "mệt nhoài",

  lonely: "trống trải",

  nostalgic: "hồi tưởng",

  confused: "bối rối",

  warm: "ấm áp",

  hopeful: "hi vọng",
};

const ADVANCE_KEYS = ["Space", "Enter", "ArrowRight"];

export function DialogBox({ id, speaker, text, emotion, portrait }: Props) {
  const { visible, isComplete, isFastForwarding, fastForward } = useTypewriter(
    text,
    {
      // tiếng gõ nhẹ, cách 3 ký tự một lần cho khỏi rối
      onReveal: (index) => {
        if (index % 3 === 1) {
          playSfx("type");
        }
      },
    },
  );

  const advance = () => {
    playSfx("confirm");

    if (!isComplete) {
      fastForward();

      return;
    }

    gameEvents.emit("dialogNext", undefined);
    gameEvents.emit("dialogClose", undefined);
  };

  const advanceRef = useRef(advance);

  useEffect(() => {
    advanceRef.current = advance;
  });

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (!ADVANCE_KEYS.includes(event.code)) {
        return;
      }

      event.preventDefault();

      advanceRef.current();
    };

    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const portraitStyle = getPortrait(portrait);

  const mood = emotion ? (EMOTION_LABEL[emotion] ?? emotion) : undefined;

  return (
    <div
      className={`dialog${emotion ? ` dialog--${emotion}` : ""}${
        isFastForwarding ? " dialog--fast" : ""
      }`}
      data-dialog-id={id}
      onClick={advance}
    >
      <div className="dialog__window">
        <div className="dialog__titlebar">
          <span className="dialog__title-dot" aria-hidden="true" />

          <span className="dialog__speaker">{speaker ?? "Ký ức"}</span>

          {mood && <span className="dialog__mood">{mood}</span>}

          <span className="dialog__window-buttons" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>

        <div className="dialog__body">
          {portraitStyle && (
            <div className="dialog__portrait">
              <span className="dialog__portrait-img" style={portraitStyle} />
            </div>
          )}

          <div className="dialog__content">
            <p className="dialog__text">
              {visible}

              {!isComplete && <span className="dialog__caret">▌</span>}
            </p>

            <div className="dialog__footer">
              {isComplete ? (
                <span className="dialog__next">
                  <span className="key key--small">Space</span> tiếp tục
                </span>
              ) : (
                <span className="dialog__skip">
                  {isFastForwarding ? "đang hiện nhanh…" : "bấm để hiện nhanh"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
