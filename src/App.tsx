import { useEffect, useRef, useState } from "react";

import {
  Announce,
  ChapterCard,
  DialogBox,
  GameHUD,
  Joystick,
  StartScreen,
} from "./components";
import { gameEvents } from "./events";
import { worldGame } from "./world/WorldGame";

import type { ChapterState } from "./components/ChapterCard";
import type {
  DialogPayload,
  HudPayload,
} from "./events";

/** Thời gian thẻ chương nằm trên màn hình (ms) */
const CHAPTER_CARD_MS = 4200;

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [started, setStarted] = useState(false);

  const [dialog, setDialog] = useState<DialogPayload | undefined>();

  const [hud, setHud] = useState<HudPayload | undefined>();

  const [chapter, setChapter] = useState<ChapterState | undefined>();

  const [controls, setControls] = useState(false);

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

    return () => {
      offDialog();
      offClose();
      offHud();
      offChapter();
      offControls();
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
