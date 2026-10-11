import { useEffect, useRef, useState } from "react";

import {
  Announce,
  ChapterCard,
  DialogBox,
  GameHUD,
  Joystick,
  KitePanel,
  StartScreen,
} from "./components";
import { gameEvents } from "./events";
import { worldGame } from "./world/WorldGame";

import type { ChapterState } from "./components/ChapterCard";
import type {
  DialogPayload,
  HudPayload,
  KiteHudPayload,
  KiteResultPayload,
} from "./events";

/** Thời gian thẻ chương nằm trên màn hình (ms) */
const CHAPTER_CARD_MS = 4200;

/** Thời gian bảng kết quả ván diều nằm trên màn hình (ms) */
const KITE_RESULT_MS = 5200;

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);

  const [dialog, setDialog] = useState<DialogPayload | undefined>();

  const [hud, setHud] = useState<HudPayload | undefined>();

  const [chapter, setChapter] = useState<ChapterState | undefined>();

  const [controls, setControls] = useState(false);

  const [kite, setKite] = useState<KiteHudPayload | undefined>();

  const [kiteResult, setKiteResult] = useState<KiteResultPayload | undefined>();

  // Dựng engine NGAY khi bấm Bắt đầu: một cú bấm là điều kiện để trình duyệt
  // cho phát âm thanh, nên thế giới chỉ khởi động sau đó.
  useEffect(() => {
    const container = containerRef.current;

    if (!started || !container) return;

    worldGame.start(container);
  }, [started]);

  // Thẻ chương tự tắt sau ít giây
  useEffect(() => {
    if (!chapter) {
      return undefined;
    }

    const timer = window.setTimeout(() => setChapter(undefined), CHAPTER_CARD_MS);

    return () => window.clearTimeout(timer);
  }, [chapter]);

  // Bảng kết quả ván diều tự tắt — cùng nhịp với thẻ chương, và cũng do đây
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

    // hud là patch: chỉ gửi phần thay đổi (vd: số hồi ký)
    const offHud = gameEvents.on("hud", (data) =>
      setHud((previous) => ({ ...previous, ...data })),
    );

    const offChapter = gameEvents.on("chapter", (data) => setChapter(data));

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

    return () => {
      offDialog();
      offClose();
      offHud();
      offChapter();
      offControls();
      offKite();
      offKiteResult();
    };
  }, []);

  return (
    <main className="game">
      <div className="game__world" ref={containerRef} />

      <div className="game__vignette" aria-hidden="true" />

      <GameHUD
        time={hud?.time}
        chapter={hud?.chapter}
        hint={controls}
        memories={hud?.memories}
        total={hud?.total}
      />

      <ChapterCard card={chapter} />

      <Announce />

      <KitePanel data={kite} result={kiteResult} />

      <Joystick />

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
