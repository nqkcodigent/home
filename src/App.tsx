import { useEffect, useRef, useState } from "react";

import {
  Announce,
  DialogBox,
  GameHUD,
  Joystick,
  KitePanel,
  StartScreen,
} from "./components";
import { gameEvents } from "./events";
import { worldGame } from "./world/WorldGame";

import type { DialogPayload, KiteHudPayload, KiteResultPayload } from "./events";

/** Thời gian bảng kết quả ván diều nằm trên màn hình (ms) */
const KITE_RESULT_MS = 5200;

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);

  const [dialog, setDialog] = useState<DialogPayload | undefined>();

  const [controls, setControls] = useState(false);

  const [kite, setKite] = useState<KiteHudPayload | undefined>();

  const [kiteResult, setKiteResult] = useState<KiteResultPayload | undefined>();

  const [lookLocked, setLookLocked] = useState(false);

  // Chế độ ngắm cảnh: ẩn hết giao diện, chỉ còn thế giới (phím H hoặc nút mắt).
  const [scenic, setScenic] = useState(false);

  useEffect(() => {
    if (!started) return undefined;

    const handleKey = (event: KeyboardEvent) => {
      if (event.code === "KeyH" && !event.repeat) setScenic((value) => !value);
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [started]);

  // Báo bằng lời mỗi lần bật/tắt — giao diện biến mất mà không nói gì thì
  // người chơi tưởng game hỏng.
  const firstScenic = useRef(true);

  useEffect(() => {
    if (firstScenic.current) {
      firstScenic.current = false;

      return;
    }

    gameEvents.emit("notice", {
      text: scenic ? "Chế độ ngắm cảnh · H để hiện lại giao diện" : "Đã hiện lại giao diện",
      hold: scenic ? 2400 : 1400,
    });
  }, [scenic]);

  // Dựng engine NGAY khi bấm Bắt đầu: một cú bấm là điều kiện để trình duyệt
  // cho phát âm thanh, nên thế giới chỉ khởi động sau đó.
  useEffect(() => {
    const container = containerRef.current;

    if (!started || !container) return;

    worldGame.start(container);
  }, [started]);

  // Bảng kết quả ván diều tự tắt — và cũng do đây
  // quyết định chứ không nằm trong minigame: minigame không nên biết UI hiển
  // thị bao lâu.
  useEffect(() => {
    if (!kiteResult) {
      return undefined;
    }

    const timer = window.setTimeout(
      () => setKiteResult(undefined),
      KITE_RESULT_MS,
    );

    return () => window.clearTimeout(timer);
  }, [kiteResult]);

  useEffect(() => {
    const offDialog = gameEvents.on("dialog", (data) => setDialog(data));

    const offClose = gameEvents.on("dialogClose", () => setDialog(undefined));

    const offControls = gameEvents.on("controls", (data) =>
      setControls(data.enabled),
    );

    // Số liệu thả diều cũng là patch: minigame chỉ gửi phần đổi.
    const offKite = gameEvents.on("kite", (data) =>
      setKite((previous) => ({ ...previous, ...data })),
    );

    const offKiteResult = gameEvents.on("kiteResult", (data) =>
      setKiteResult(data),
    );

    const offLook = gameEvents.on("look", ({ locked }) => setLookLocked(locked));

    return () => {
      offDialog();
      offClose();
      offControls();
      offKite();
      offKiteResult();
      offLook();
    };
  }, []);

  return (
    <main className={`game${scenic ? " is-scenic" : ""}`}>
      <div className="game__world" ref={containerRef} />

      <div className="game__vignette" aria-hidden="true" />

      <GameHUD
        hint={controls}
        lookLocked={lookLocked}
        // Nút Trợ giúp chỉ có khi người chơi đang cầm lái: xem chú thích trong
        // `GameHUD`.
        onHelp={controls ? () => gameEvents.emit("help", undefined) : undefined}
      />

      <Announce />

      {started && (
        <button
          type="button"
          className={`scenic-toggle${scenic ? " is-on" : ""}`}
          onClick={() => setScenic((value) => !value)}
          aria-pressed={scenic}
          aria-label={scenic ? "Hiện lại giao diện" : "Chế độ ngắm cảnh: ẩn giao diện"}
          title="Ngắm cảnh (H)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
          </svg>
        </button>
      )}

      <KitePanel data={kite} result={kiteResult} />

      <Joystick />

      {/* Hộp thoại CHỈ hiện khi người chơi tự gọi: bấm nút Trợ giúp. */}
      {dialog && (
        <DialogBox
          id={dialog.id}
          speaker={dialog.speaker}
          text={dialog.text}
          emotion={dialog.emotion}
          portrait={dialog.portrait}
        />
      )}

      {!started && <StartScreen onStart={() => setStarted(true)} />}
    </main>
  );
}
