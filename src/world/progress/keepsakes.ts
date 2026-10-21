/**
 * Kỷ vật tuổi thơ — tám món nhỏ rơi rớt khắp làng, phần thưởng của việc đi xa.
 *
 * Nằm lấp lánh trên cỏ, đi ngang qua là nhặt; mỗi món một dòng hồi ký và một
 * sợi chỉ. Toạ độ nằm ngay đây vì cả sân (đặt hình) lẫn Bản đồ trong Sổ
 * (đánh dấu món đã nhặt) cùng đọc — một nguồn, không lệch nhau.
 */

export interface Keepsake {
  id: string;
  label: string;
  line: string;
  /** Chỗ nằm trên bản đồ (toạ độ thế giới) — xa sân, phải đi mới gặp */
  x: number;
  z: number;
}

/** Mỗi kỷ vật là ngần này sợi chỉ. */
export const KEEPSAKE_THREADS = 1;

/** Đi tới gần ngần này (m) là nhặt — không cần bấm gì. */
export const KEEPSAKE_REACH = 1.1;

export const KEEPSAKE_LIST: readonly Keepsake[] = [
  { id: "marble", x: -20, z: 22, label: "Viên bi ve", line: "Viên bi xanh có sợi xoắn ở giữa — hồi ấy đổi được cả nắm bi đất." },
  { id: "sandal", x: 24, z: 4, label: "Chiếc dép tổ ong", line: "Đứt quai rồi vẫn tiếc, lấy que đốt chảy nhựa gắn lại dùng tiếp." },
  { id: "matchbox", x: -34, z: -14, label: "Vỏ bao diêm", line: "Nhãn bao diêm hình con hổ — cả xóm thi nhau sưu tầm." },
  { id: "old-shuttle", x: -8, z: 40, label: "Quả cầu cũ", line: "Lông gà đã xơ xác, mà vẫn là quả cầu đá xa nhất xóm." },
  { id: "paper-boat", x: 22, z: -10, label: "Thuyền giấy", line: "Gấp từ trang vở nháp, thả xuống ao rồi chạy dọc bờ đuổi theo." },
  { id: "slingshot", x: 37.5, z: -29, label: "Cái ná cao su", line: "Bố tịch thu ba lần, lần thứ tư thì giấu dưới gốc tháp chuông." },
  { id: "shell", x: 11.5, z: -55.5, label: "Vỏ ốc biển", line: "Áp vào tai nghe tiếng biển — dù làng mình chẳng ai từng ra biển." },
  { id: "top", x: -45, z: 10, label: "Con cù gỗ", line: "Quấn dây thật chặt, quăng một cái là nó quay tít cả phút." },
];

const KEEPSAKES = new Map(KEEPSAKE_LIST.map((keepsake) => [keepsake.id, keepsake]));

export function keepsakeItem(id: string): Keepsake | undefined {
  return KEEPSAKES.get(id);
}

export function isKeepsakeId(id: string): boolean {
  return KEEPSAKES.has(id);
}

/** Kỷ vật CHƯA nhặt nằm trong tầm với của (x, z), hoặc `undefined`. */
export function keepsakeWithin(
  spots: readonly Keepsake[],
  x: number,
  z: number,
  found: readonly string[],
): string | undefined {
  return spots.find(
    (spot) => !found.includes(spot.id) && Math.hypot(spot.x - x, spot.z - z) <= KEEPSAKE_REACH,
  )?.id;
}
