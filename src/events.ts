/**
 * Kênh sự kiện giữa thế giới 3D và lớp UI React.
 *
 * Bản cũ dùng `Phaser.Events.EventEmitter` — hợp lý khi cả trò chơi là Phaser,
 * nhưng giờ chỉ cần đúng một việc: phát và nghe vài sự kiện có kiểu. Kéo cả
 * một engine vào chỉ để lấy event bus là lý do tồi để giữ Phaser lại.
 */

export interface DialogPayload {
  id?: string;
  speaker?: string;
  text: string;
  emotion?: string;
  portrait?: string;
}

export interface HudPayload {
  time?: string;
  chapter?: string;
  memories?: number;
  total?: number;
}

export interface ChapterPayload {
  index?: number;
  title: string;
  subtitle?: string;
}

export interface NoticePayload {
  text: string;
  /** Thời gian hiện (ms) */
  hold?: number;
}

export interface GameEventMap {
  dialog: DialogPayload;
  dialogNext: undefined;
  dialogClose: undefined;
  controls: { enabled: boolean };
  hud: HudPayload;
  chapter: ChapterPayload;
  notice: NoticePayload;
}

type Handler<K extends keyof GameEventMap> = (payload: GameEventMap[K]) => void;

export class GameEmitter {
  private readonly handlers = new Map<
    keyof GameEventMap,
    Set<(payload: unknown) => void>
  >();

  on<K extends keyof GameEventMap>(event: K, handler: Handler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set();

    set.add(handler as (payload: unknown) => void);

    this.handlers.set(event, set);

    return () => this.off(event, handler);
  }

  off<K extends keyof GameEventMap>(event: K, handler: Handler<K>) {
    this.handlers.get(event)?.delete(handler as (payload: unknown) => void);
  }

  emit<K extends keyof GameEventMap>(event: K, payload: GameEventMap[K]) {
    // Sao chép trước khi gọi: handler có thể tự huỷ đăng ký ngay trong lượt này.
    for (const handler of [...(this.handlers.get(event) ?? [])]) {
      handler(payload);
    }
  }
}

export const gameEvents = new GameEmitter();

export const emitGameEvent = <K extends keyof GameEventMap>(
  event: K,
  payload: GameEventMap[K],
) => {
  gameEvents.emit(event, payload);
};
