import { useEffect, useState } from "react";

import { getInputDevice, subscribeInputDevice } from "../ui/device";
import { inputGlyphMarkup } from "./glyph";

import type { InputAction } from "./glyph";

interface Props {
  action?: InputAction;
}

/**
 * Phím tắt đúng theo thiết bị đang dùng.
 *
 * Markup do `inputGlyphMarkup()` sinh ra, và nó CHỈ chứa SVG cố định trong mã
 * nguồn cùng một chuỗi nhãn nằm trong bảng tra — không có dữ liệu người dùng
 * nào đi qua `dangerouslySetInnerHTML` này.
 */
export function InputGlyph({ action = "interact" }: Props) {
  const [device, setDevice] = useState(getInputDevice);

  useEffect(() => subscribeInputDevice(setDevice), []);

  return (
    <span
      className="glyph-host"
      dangerouslySetInnerHTML={{ __html: inputGlyphMarkup(action, device) }}
    />
  );
}
