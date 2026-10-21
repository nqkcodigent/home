/**
 * Nhiệm vụ ẩn — không có bảng nào liệt kê chúng (GDD §3.4).
 *
 * Sổ chỉ in những bí mật ĐÃ tìm ra, kèm một con số "còn n điều chưa biết".
 * Bảng nhiệm vụ ẩn mà nhìn thấy được thì không còn ẩn.
 */

export interface Secret {
  id: string;
  label: string;
  /** Dòng hồi ký hiện lên khi tìm ra */
  line: string;
}

/** Mỗi bí mật là ngần này sợi chỉ. */
export const SECRET_THREADS = 3;

/** Ngồi yên trong chế độ ngắm cảnh ngần này giây là "một phút không làm gì". */
export const QUIET_SECONDS = 60;

/** Độ cao một ván diều phải chạm để "chạm trần trời" (m). */
export const SKY_CEILING = 85;

/** Rời chỗ chim đậu rồi quay lại sau ngần này giây là "khách không mời". */
export const UNINVITED_SECONDS = 60;

export const SECRET_LIST: readonly Secret[] = [
  {
    id: "quiet-minute",
    label: "Một phút không làm gì",
    line: "Có những buổi chiều chẳng cần làm gì cả. Chỉ ngồi đó, nghe gió.",
  },
  {
    id: "sky-ceiling",
    label: "Chạm trần trời",
    line: "Con diều nhỏ như hạt đậu, dây căng như muốn kéo mình lên mây theo.",
  },
  {
    id: "three-farewells",
    label: "Ba lần tiễn diều",
    line: "Ba con diều, ba phương trời. Không biết giờ chúng đậu ở mái nhà ai.",
  },
  {
    id: "uninvited",
    label: "Khách không mời",
    line: "Con chim sẻ ấy lại về chỗ cũ. Hoá ra nó chỉ đợi mình đi khỏi.",
  },
];

const SECRETS = new Map(SECRET_LIST.map((secret) => [secret.id, secret]));

export function secretItem(id: string): Secret | undefined {
  return SECRETS.get(id);
}

export function isSecretId(id: string): boolean {
  return SECRETS.has(id);
}

/** Ba phía tiễn diều: trái, giữa, phải — theo chỗ con diều lúc dây đứt. */
export const SNAP_SIDES = ["left", "center", "right"] as const;

export type SnapSide = (typeof SNAP_SIDES)[number];
