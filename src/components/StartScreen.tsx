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
 * tác, nên một cú bấm ở đây là thứ mở khoá toàn bộ tiếng dế, tiếng trống trường
 * và tiếng bước chân của cả trò chơi.
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
          Một ngày dài ở thành phố, một giấc mơ dẫn về sân nhà ngày ấy.
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
          <span className="cover__controls-text">kéo để xoay</span>
        </div>
      </div>
    </div>
  );
}
