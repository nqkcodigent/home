import Phaser from "phaser";

export const gameEvents = new Phaser.Events.EventEmitter();

export type GameEventMap = {
  dialog: {
    id?: string;
    speaker?: string;
    text: string;
    emotion?: string;
    portrait?: string;
  };

  dialogNext: void;

  dialogClose: void;

  interaction: {
    visible: boolean;
    text?: string;
  };

  controls: {
    enabled: boolean;
  };

  hud: {
    time?: string;
    chapter?: string;
    memories?: number;
    total?: number;
  };

  chapter: {
    index?: number;
    title: string;
    subtitle?: string;
  };
};

export const emitGameEvent = <K extends keyof GameEventMap>(
  event: K,
  payload: GameEventMap[K],
) => {
  gameEvents.emit(event, payload);
};
