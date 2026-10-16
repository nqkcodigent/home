import type { AvatarLook } from "../character/avatar";

/**
 * Trang phục — chỗ tiêu DUY NHẤT của sợi chỉ.
 *
 * Thuần thị giác, không có chỉ số: kiểu tóc, nón mũ, màu áo len, màu đuôi
 * diều. Mỗi món thuộc một "ô" (slot), và mỗi ô chỉ mặc được một món một lúc —
 * mặc món mới là thay món cũ cùng ô. Mọi giá trị đều là dữ liệu ĐÃ CÓ trong
 * `AVATAR_LOOKS` và `Kite.ts`; file này chỉ đặt tên và đặt giá.
 */

export type LookSlot = "hair" | "hat" | "sweater" | "tail";

export interface LookItem {
  id: string;
  slot: LookSlot;
  label: string;
  /** Giá bằng sợi chỉ */
  cost: number;
  /** Đè lên dáng mặc định của nhân vật */
  patch?: Partial<AvatarLook>;
  /** Màu giấy đuôi diều */
  tail?: number;
}

export const LOOK_LIST: readonly LookItem[] = [
  { id: "hair-short", slot: "hair", label: "Tóc cắt ngắn", cost: 3, patch: { hairStyle: "short" } },
  { id: "hair-bob", slot: "hair", label: "Tóc bob", cost: 4, patch: { hairStyle: "bob" } },
  { id: "hair-pony", slot: "hair", label: "Tóc đuôi ngựa", cost: 5, patch: { hairStyle: "pony" } },
  { id: "hat-headband", slot: "hat", label: "Băng đô", cost: 3, patch: { accessory: "headband" } },
  { id: "hat-cap", slot: "hat", label: "Mũ lưỡi trai", cost: 5, patch: { accessory: "cap" } },
  { id: "hat-nonla", slot: "hat", label: "Nón lá", cost: 8, patch: { accessory: "nonLa" } },
  { id: "sweater-sky", slot: "sweater", label: "Áo len xanh trời", cost: 6, patch: { shirt: 0xbcd8ec } },
  { id: "sweater-peach", slot: "sweater", label: "Áo len hồng đào", cost: 6, patch: { shirt: 0xf2c6b8 } },
  { id: "sweater-moss", slot: "sweater", label: "Áo len xanh rêu", cost: 7, patch: { shirt: 0xb9c99a } },
  { id: "tail-sun", slot: "tail", label: "Đuôi diều vàng nắng", cost: 4, tail: 0xffd45f },
  { id: "tail-sky", slot: "tail", label: "Đuôi diều xanh trời", cost: 4, tail: 0x8fcdf0 },
  { id: "tail-rose", slot: "tail", label: "Đuôi diều hồng", cost: 5, tail: 0xf59ab0 },
];

export const LOOK_SLOT_LABEL: Record<LookSlot, string> = {
  hair: "Kiểu tóc",
  hat: "Nón mũ",
  sweater: "Áo len",
  tail: "Đuôi diều",
};

const LOOKS = new Map(LOOK_LIST.map((item) => [item.id, item]));

export function lookItem(id: string): LookItem | undefined {
  return LOOKS.get(id);
}

export function isLookId(id: string): boolean {
  return LOOKS.has(id);
}

/** Đồ đang mặc → dáng nhân vật + màu đuôi diều. Ô trống thì giữ mặc định. */
export function dressFor(wearing: readonly string[]): {
  patch: Partial<AvatarLook>;
  tail?: number;
} {
  const patch: Partial<AvatarLook> = {};
  let tail: number | undefined;

  for (const id of wearing) {
    const item = LOOKS.get(id);

    if (!item) continue;

    Object.assign(patch, item.patch);

    if (item.tail !== undefined) tail = item.tail;
  }

  return { patch, tail };
}
