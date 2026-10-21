import { useEffect, useState } from "react";

import { MoveHint } from "./MoveHint";
import { getInputDevice, subscribeInputDevice } from "../ui/device";

interface Props {
  hint?: boolean;
  /** Chuột đang khoá vào khung game — có thì không cần nhắc bấm để nhìn. */
  lookLocked?: boolean;
  /**
   * Mở bảng trợ giúp — CHỈ truyền khi người chơi đang cầm lái.
   *
   * Thế giới không có lời dẫn nào: hộp thoại chỉ mở khi người chơi chủ động
   * bấm nút này.
   */
  onHelp?: () => void;
}

export function GameHUD({ hint, lookLocked, onHelp }: Props) {
  const [device, setDevice] = useState(getInputDevice);

  useEffect(() => subscribeInputDevice(setDevice), []);

  return (
    <div className="hud">
      {/* Nhắc một dòng nhỏ ở đỉnh màn hình — không che cảnh, tự biến mất khi
          chuột đã khoá. Cảm ứng thì kéo ngón tay như cũ, không cần nhắc. */}
      {device === "keyboard" && !lookLocked && (
        <p className="hud__look">
          <MouseIcon />
          Bấm vào khung cảnh để nhìn quanh bằng chuột
        </p>
      )}

      <div className="hud__right">
        {onHelp && (
          <button type="button" className="hud__help" onClick={onHelp}>
            <HelpIcon />
            Trợ giúp
          </button>
        )}
      </div>

      <MoveHint visible={hint} />
    </div>
  );
}

function MouseIcon() {
  return (
    <svg className="hud__icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="6.5" y="3" width="11" height="18" rx="5.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg className="hud__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M9.4 9.2a2.7 2.7 0 015.3.9c0 1.8-2.7 2-2.7 3.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="12" cy="17.2" r="1.1" fill="currentColor" />
    </svg>
  );
}
