/**
 * Chỗ ngồi rải quanh làng — nội dung khám phá mà chi phí đúng bằng dữ liệu.
 *
 * Mỗi chỗ ngồi đủ lâu (xem `NOOK_SECONDS`) thì ghi một dòng hồi ký vào Sổ.
 * Không bảng nhiệm vụ, không mũi tên chỉ đường: chỗ nào cũng có một gốc cây
 * hay một khúc gỗ đặt sẵn, nhìn là biết "ngồi được".
 */

export interface Nook {
  id: string;
  /** Tên chỗ — nhãn nổi trên đầu và tiêu đề dòng trong sổ */
  label: string;
  /** Một dòng hồi ký, hiện lên khi ngồi đủ lâu */
  line: string;
}

/** Ngồi yên ngần này giây thì chỗ đó vào sổ. */
export const NOOK_SECONDS = 4;

export const NOOK_LIST: readonly Nook[] = [
  { id: "window", label: "Bên cửa sổ", line: "Nắng xiên qua song cửa, bụi bay lấp lánh như ai rắc kim tuyến." },
  { id: "bench", label: "Ghế ngắm ao", line: "Con chuồn chuồn đậu mãi trên một cọng sen, chẳng chịu bay." },
  { id: "banyan", label: "Gốc cây đa", line: "Tựa lưng vào gốc đa, nghe lá xào xạc như ai đang kể chuyện." },
  { id: "haystack", label: "Đống rơm", line: "Rơm khô thơm mùi nắng, ngứa ran mà vẫn không muốn đứng dậy." },
  { id: "gate", label: "Ngoài cổng", line: "Ngồi đợi mẹ đi chợ về, mắt dõi theo con đường đất đỏ." },
  { id: "pond-east", label: "Bờ ao phía đông", line: "Mặt ao in cả mái nhà mình, gợn nhẹ mỗi khi cá đớp mồi." },
  { id: "slope", label: "Triền cỏ", line: "Nằm dài trên triền cỏ đếm mây, đám nào cũng giống một con vật." },
  { id: "tower", label: "Chân tháp chuông", line: "Tiếng trống trường vọng lại, bỗng thấy nhớ cái bảng đen." },
  { id: "hill", label: "Đỉnh đồi gió", line: "Từ trên đồi nhìn xuống, cả làng nhỏ xíu như đồ chơi." },
];

const NOOKS = new Map(NOOK_LIST.map((nook) => [nook.id, nook]));

export function nookItem(id: string): Nook | undefined {
  return NOOKS.get(id);
}

export function isNookId(id: string): boolean {
  return NOOKS.has(id);
}
