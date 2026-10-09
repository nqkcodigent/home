import { useEffect, useState } from "react";

import { InputGlyph } from "./InputGlyph";
import { getInputDevice, subscribeInputDevice } from "../ui/device";
import { moveKeys } from "./glyph";

interface Props {
  visible?: boolean;
}

/**
 * Nhãn điều khiển ở góc dưới trái.
 *
 * Việc tự tắt KHÔNG dùng hẹn giờ trong React: chỉ cần `visible` bật là phần tử
 * được mount, và CSS tự mờ nó đi sau vài giây (`hintOut` trong game.css). Khi
 * điều khiển bị khoá rồi mở lại (mỗi lần đọc thoại), phần tử được mount lại
 * nên animation chạy lại từ đầu — đúng ý "nhắc lại sau mỗi lần bị ngắt".
 */
export function MoveHint({ visible }: Props) {
  const [device, setDevice] = useState(getInputDevice);

  useEffect(() => subscribeInputDevice(setDevice), []);

  if (!visible) return null;

  return (
    <div className="move-hint">
      {moveKeys(device).map((key) => (
        <span key={key} className="glyph glyph--key">
          {key}
        </span>
      ))}

      <span className="move-hint__text">di chuyển</span>

      <InputGlyph action="sprint" />
      <span className="move-hint__text">chạy</span>

      <InputGlyph action="interact" />
      <span className="move-hint__text">tương tác</span>
    </div>
  );
}
