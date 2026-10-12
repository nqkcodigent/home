import { useEffect, useState } from "react";

import { InputGlyph } from "./InputGlyph";
import { getInputDevice, subscribeInputDevice } from "../ui/device";
import { moveKeys } from "./glyph";

interface Props {
  onStart: () => void;
}

/**
 * Màn hình mở đầu.
 *
 * Không chỉ để đẹp: trình duyệt chặn phát âm thanh cho tới khi người dùng tương
 * tác, nên một cú bấm ở đây là thứ mở khoá tiếng chim, tiếng sáo diều và tiếng
 * bước chân của cả trò chơi.
 *
 * Không có cốt truyện nào: ba dòng ở cuối chỉ nói thế giới có gì để chạm vào,
 * còn đi đâu, làm gì trước là việc của người chơi.
 */
export function StartScreen({ onStart }: Props) {
  const [device, setDevice] = useState(getInputDevice);

  useEffect(() => subscribeInputDevice(setDevice), []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.code === "Space" || event.code === "Enter") {
        event.preventDefault();
        onStart();
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [onStart]);

  return (
    <div className="cover">
      <div className="cover__glow" aria-hidden="true" />

      <div className="cover__content">
        <p className="cover__kicker">một chuyến về tuổi thơ</p>

        <h1 className="cover__title">Hồi ký sân nhà</h1>

        <p className="cover__lede">
          Một căn nhà nhỏ, một khoảng sân vườn, một buổi chiều chẳng có gì phải vội.
        </p>

        <button type="button" className="cover__start" onClick={onStart}>
          Bắt đầu
          <InputGlyph action="confirm" />
        </button>

        <div className="cover__controls">
          {moveKeys(device).map((key) => (
            <span key={key} className="glyph glyph--key">
              {key}
            </span>
          ))}

          <span className="cover__controls-text">đi lại</span>

          <span className="glyph glyph--key glyph--wide">Chuột</span>
          <span className="cover__controls-text">di để nhìn quanh · Esc thả chuột</span>
        </div>

        <ol className="cover__steps">
          <li>
            Bạn tỉnh dậy trong nhà. Lại gần đồ vật bấm <InputGlyph action="interact" /> để
            chạm vào — cánh cửa gỗ dẫn ra sân.
          </li>
          <li>
            Con diều nằm trên bãi cỏ: bấm <InputGlyph action="interact" /> để thả, bấm R
            để thu về.
          </li>
          <li>Không có nhiệm vụ nào cả. Cần thì bấm Trợ giúp.</li>
        </ol>
      </div>
    </div>
  );
}
