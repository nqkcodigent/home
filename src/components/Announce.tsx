import { useEffect, useState } from "react";

import { gameEvents } from "../events";

/**
 * Chữ lớn giữa màn hình, tự tắt sau ít lâu — theo đúng `Announce` của
 * character-threejs. Hiện dùng cho những thông báo tức thời (tắt/bật tiếng).
 */
export function Announce() {
  const [notice, setNotice] = useState<{ text: string; nonce: number }>();

  useEffect(() => {
    let timer: number | undefined;

    const off = gameEvents.on("notice", ({ text, hold }) => {
      setNotice({ text, nonce: Date.now() });

      window.clearTimeout(timer);

      timer = window.setTimeout(() => setNotice(undefined), hold ?? 1600);
    });

    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, []);

  if (!notice) return null;

  return (
    <div className="announce">
      <span key={notice.nonce} className="announce__text">
        {notice.text}
      </span>
    </div>
  );
}
