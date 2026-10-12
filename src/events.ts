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

/**
 * Bảng đo của một ván thả diều.
 *
 * Gửi theo dạng PATCH như `hud`: chỉ phần thay đổi, React trộn vào bảng cũ.
 * Nhờ vậy minigame chỉ phát một sự kiện mỗi lần số liệu đổi (chứ không phải
 * 60 lần mỗi giây), mà bảng vẫn luôn đúng.
 */
export interface KiteHudPayload {
  visible: boolean;
  phase?: "launch" | "flying" | "over";
  /** Điểm hiện có */
  score?: number;
  /** Độ cao của diều (mét) */
  altitude?: number;
  /** Lực căng dây, 0…1 — gần 1 là sắp đứt */
  tension?: number;
  /** Sức gió, 0…1 */
  wind?: number;
  /** Hướng gió theo độ (0 = bắc) */
  windDirection?: number;
  /** Thời gian còn lại (giây) */
  timeLeft?: number;
  /** Số nhiệt lưu đã bắt được */
  thermals?: number;
}

export interface KiteResultPayload {
  outcome: "landed" | "snapped" | "timeout";
  score: number;
  bestAltitude: number;
  title: string;
  detail: string;
}

export interface GameEventMap {
  dialog: DialogPayload;
  dialogNext: undefined;
  dialogClose: undefined;
  controls: { enabled: boolean };
  hud: HudPayload;
  chapter: ChapterPayload;
  notice: NoticePayload;
  kite: KiteHudPayload;
  kiteResult: KiteResultPayload | undefined;
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
