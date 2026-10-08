import { useEffect, useState } from "react";
import { gameEvents } from "./game/events";
import { game } from "./game/Game";
import { ChapterCard } from "./components/ChapterCard";
import { DialogBox } from "./components/DialogBox";
import { GameHUD } from "./components/GameHUD";

import type { ChapterState } from "./components/ChapterCard";

interface DialogState {
  id?: string;
  speaker?: string;
  text: string;
  emotion?: string;
  portrait?: string;
}

interface InteractionState {
  visible: boolean;
  text?: string;
}

interface HudState {
  time?: string;
  chapter?: string;
  memories?: number;
  total?: number;
}

/** Thời gian thẻ chương nằm trên màn hình (ms) */
const CHAPTER_CARD_MS = 4200;

export default function App() {
  const [dialog, setDialog] = useState<DialogState | undefined>();

  const [interaction, setInteraction] = useState<InteractionState | undefined>();

  const [hud, setHud] = useState<HudState | undefined>();

  const [chapter, setChapter] = useState<ChapterState | undefined>();

  const [controls, setControls] = useState(false);

  // Khởi tạo Phaser SAU khi #phaser-container đã render
  useEffect(() => {
    game.start();
  }, []);

  // Thẻ chương tự tắt sau ít giây
  useEffect(() => {
    if (!chapter) {
      return undefined;
    }

    const timer = window.setTimeout(() => setChapter(undefined), CHAPTER_CARD_MS);

    return () => window.clearTimeout(timer);
  }, [chapter]);

  useEffect(() => {
    const handleDialog = (data: DialogState) => setDialog(data);

    const handleClose = () => setDialog(undefined);

    const handleInteraction = (data: InteractionState) => setInteraction(data);

    // hud là patch: scene chỉ gửi phần thay đổi (vd: số hồi ký)
    const handleHud = (data: HudState) =>
      setHud((previous) => ({ ...previous, ...data }));

    const handleChapter = (data: ChapterState) => setChapter(data);

    const handleControls = (data: { enabled: boolean }) =>
      setControls(data.enabled);

    gameEvents.on("dialog", handleDialog);
    gameEvents.on("dialogClose", handleClose);
    gameEvents.on("interaction", handleInteraction);
    gameEvents.on("hud", handleHud);
    gameEvents.on("chapter", handleChapter);
    gameEvents.on("controls", handleControls);

    return () => {
      gameEvents.off("dialog", handleDialog);
      gameEvents.off("dialogClose", handleClose);
      gameEvents.off("interaction", handleInteraction);
      gameEvents.off("hud", handleHud);
      gameEvents.off("chapter", handleChapter);
      gameEvents.off("controls", handleControls);
    };
  }, []);

  return (
    <main className="game">
      <div id="phaser-container" className="game__canvas" />

      <ChapterCard card={chapter} />

      <GameHUD
        time={hud?.time}
        chapter={hud?.chapter}
        hint={controls}
        memories={hud?.memories}
        total={hud?.total}
      />

      {interaction?.visible && !dialog && (
        <div className="interaction">
          <span className="key">E</span>

          <span>{interaction.text ?? "Tương tác"}</span>
        </div>
      )}

      {dialog && (
        <DialogBox
          id={dialog.id}
          speaker={dialog.speaker}
          text={dialog.text}
          emotion={dialog.emotion}
          portrait={dialog.portrait}
        />
      )}
    </main>
  );
}
