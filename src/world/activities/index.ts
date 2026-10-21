import type { SkyFocus } from "../world/Creatures";

/**
 * Bảng tên các trò chơi con — điểm tương tác gọi trò chơi bằng TÊN
 * (`spot.activity`), và đây là chỗ biết tên nào có thật.
 */
export const ACTIVITIES = ["kite", "swim", "shuttlecock"] as const;

export type ActivityName = (typeof ACTIVITIES)[number];

/**
 * Trò chơi con GIỮ NGUYÊN quyền đi lại cho người chơi.
 *
 * Diều và bơi ao khoá input: người chơi đang đứng một chỗ mà lái (diều) hoặc
 * đang được trò chơi lái thay (bơi). Đá cầu thì ngược lại — cả ván là cuộc
 * chạy tới chỗ rơi của chiếc cầu, nên input phải sống suốt ván.
 */
export const FREE_MOVE_ACTIVITIES: readonly ActivityName[] = ["shuttlecock"];

export function isActivity(name: string): name is ActivityName {
  return (ACTIVITIES as readonly string[]).includes(name);
}

export function keepsMovement(name: ActivityName): boolean {
  return FREE_MOVE_ACTIVITIES.includes(name);
}

/**
 * Một ván đã chơi xong, nhìn từ Sổ hồi ký.
 *
 * Ván con báo lại ĐÚNG ba con số, và chúng là ba thứ khác nhau về bản chất:
 *
 *  - `score` — thứ so kỷ lục của trò này: độ cao con diều, số sen một ván,
 *    số cú liên tiếp. Kỷ lục là một con số duy nhất cho mỗi trò, nên ba trò
 *    phải quy về cùng một chỗ.
 *  - `thermals` — số cột khí nóng bắt được trong ván. Chỉ ván diều có, và
 *    cũng chỉ ván diều mới đọc con số này.
 *
 * Không có `Math.random()` và không có đồng hồ hệ thống ở đây: báo cáo là dữ
 * liệu của một ván đã chạy, không phải một nguồn sự thật mới.
 */
export interface SessionReport {
  name: ActivityName;
  /** Kỷ lục của ván — độ cao (diều), số sen (ao), số cú liên tiếp (cầu) */
  score: number;
  /** Số cột khí nóng bắt được trong ván (0 với mọi trò khác) */
  thermals: number;
  /** Quãng diều trôi tự do sau khi đứt dây (mét) — chỉ trò diều */
  drift?: number;
  /** Phía con diều lúc dây đứt — chỉ có khi ván diều kết thúc bằng đứt dây */
  snapSide?: "left" | "center" | "right";
}

/**
 * Một ván con ĐANG chạy, nhìn từ `WorldGame` — đủ để vòng lặp chính cầm cương
 * mà không cần biết đó là ván gì.
 *
 * Ba thành viên tuỳ chọn ở đây không phải cho vui; mỗi cái là một luật mà
 * vòng lặp chính phải tôn trọng:
 *
 *  - `drivesCharacter` — ván tự ghi vị trí nhân vật (bơi ao). Vòng lặp chính
 *    phải đứng ngoài, nếu không hai bên cùng ghi và nhân vật giật.
 *  - `skyFocus` — ván biết một điểm trên trời (con diều) cho đàn chim bám theo.
 *    Không khai báo thì chim cứ bay lộ trình vòng quanh sân.
 *  - `summary` — ván tự tóm tắt ván vừa xong để ghi vào Sổ hồi ký. Ai không
 *    khai báo thì không có gì để ghi, và cũng không có gì bị ghi sai.
 */
export interface RunningActivity {
  play(): Promise<unknown>;
  dispose(): void;
  drivesCharacter?: boolean;
  /** Ván lái người bạn trong sân (đá cầu) — `WorldGame` thôi cho bạn đứng chơi */
  drivesFriend?: boolean;
  skyFocus?: () => SkyFocus;
  summary?: () => SessionReport;
}
