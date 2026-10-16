/**
 * Kênh sự kiện giữa thế giới 3D và lớp UI React.
 *
 * Bản cũ dùng `Phaser.Events.EventEmitter` — hợp lý khi cả trò chơi là Phaser,
 * nhưng giờ chỉ cần đúng một việc: phát và nghe vài sự kiện có kiểu. Kéo cả
 * một engine vào chỉ để lấy event bus là lý do tồi để giữ Phaser lại.
 */

import type { KiteShotMode } from "./world/activities/kite/kiteCamera";
import type { Journal } from "./world/progress/store";

export interface DialogPayload {
  id?: string;
  speaker?: string;
  text: string;
  emotion?: string;
  portrait?: string;
}

export interface NoticePayload {
  text: string;
  /** Thời gian hiện (ms) */
  hold?: number;
}

/**
 * Bảng đo của một ván thả diều.
 *
 * Gửi theo dạng PATCH: chỉ phần thay đổi, React trộn vào bảng cũ.
 * Nhờ vậy minigame chỉ phát một sự kiện mỗi lần số liệu đổi (chứ không phải
 * 60 lần mỗi giây), mà bảng vẫn luôn đúng.
 */
export interface KiteHudPayload {
  visible: boolean;
  /** `adrift` = dây đã đứt, diều đang trôi tự do */
  phase?: "launch" | "flying" | "adrift" | "over";
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
  /** Đang có cơn gió giật — lúc nên thả dây */
  gust?: boolean;
  /** Dây đang thả (mét) */
  line?: number;
  /** Đã bay bao lâu (giây) — ván diều không đếm ngược, chỉ đếm lên */
  elapsed?: number;
  /** Quãng đường diều đã trôi ngang sau khi đứt dây (mét) */
  drift?: number;
  /** Số nhiệt lưu đã bắt được */
  thermals?: number;
  /** Góc máy ĐANG dùng — có thể bị khoá bởi màn mở đầu hoặc lúc đứt dây */
  view?: KiteShotMode;
  /** Ván đã bay đủ lâu để nhắc người chơi cất diều (bấm phím thoát) */
  hint?: boolean;
}

export interface KiteResultPayload {
  outcome: "snapped" | "stowed";
  score: number;
  bestAltitude: number;
  title: string;
  detail: string;
}

/**
 * Bảng số liệu của các trò chơi con nhỏ (bơi ao, đá cầu…).
 *
 * Gửi theo dạng PATCH giống bảng diều: trò chơi chỉ phát sự kiện khi số liệu
 * đổi, React trộn vào bảng cũ. `stats` là danh sách cố định theo từng trò —
 * mỗi trò biết mình có mấy con số, còn bảng chỉ việc in chúng ra.
 */
export interface PlayHudPayload {
  visible: boolean;
  /** Tên trò chơi, ví dụ "Bơi ao" */
  title: string;
  stats: { label: string; value: string }[];
  /** Dòng nhắc việc nên làm tiếp theo */
  hint?: string;
}

export interface GameEventMap {
  dialog: DialogPayload;
  dialogNext: undefined;
  dialogClose: undefined;
  /** UI bấm nút Trợ giúp — xem `HELP_LINES` */
  help: undefined;
  /** Con trỏ chuột đang khoá vào khung game (nhìn bằng chuột) hay không */
  look: { locked: boolean };
  controls: { enabled: boolean };
  notice: NoticePayload;
  kite: KiteHudPayload;
  kiteResult: KiteResultPayload | undefined;
  /** UI bấm nút đổi góc máy diều (bàn phím đi đường `Input`) */
  kiteView: undefined;
  /** Số liệu của các trò chơi con nhỏ (bơi ao, đá cầu…) */
  play: PlayHudPayload;
  /**
   * Sổ hồi ký vừa đổi — giao diện đọc lại để vẽ.
   *
   * Sổ sống ở lớp tiến trình chứ không ở React (xem `world/progress`), nên
   * bảng sổ chỉ là một NGƯỜI ĐỌC: nó không giữ trạng thái, không tự cộng
   * điểm, và không bao giờ là nguồn sự thật thứ hai.
   */
  journal: Journal;
  /** Người chơi mở/đóng bảng sổ (mở từ Rương gỗ, đóng bằng nút hoặc Esc) */
  journalView: { open: boolean };
  /** Sổ: đổi sợi chỉ lấy một món đồ */
  journalBuy: { id: string };
  /** Sổ: mặc / cởi một món đã có */
  journalWear: { id: string };
  /** UI bấm nút đóng sổ — bản của bàn phím là phím Esc */
  journalClose: undefined;
  /**
   * UI bấm nút "thoát trò chơi" — bản cảm ứng của phím `R`.
   *
   * Cả hai cửa đều gộp về đúng một hàng đợi trong `Input`, nên ván con không
   * cần biết người chơi vừa bấm bàn phím hay chạm màn hình. Tên chung vì mọi
   * ván con (diều, bơi, đá cầu) đều dùng đúng một lối ra này.
   */
  exitActivity: undefined;
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
