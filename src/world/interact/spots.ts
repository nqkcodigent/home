/**
 * Điểm tương tác — chọn "thứ đang ở ngay trước mặt" một cách thuần tuý.
 *
 * Bản Phaser cũ dùng `spots.find(...)`: phần tử ĐẦU TIÊN trong mảng mà có
 * khoảng cách nhỏ hơn bán kính. Nghe hợp lý nhưng sai khi hai điểm chồng lên
 * nhau (giếng và gốc cây gần nhau) — nó chọn theo thứ tự khai báo, không phải
 * theo cái người chơi đang đứng gần nhất.
 */

export interface Spot<P = unknown> {
  id: string;
  x: number;
  z: number;
  /** Bán kính tương tác (mét) */
  radius: number;
  label: string;
  /** Dòng thoại đọc lên khi tương tác (bỏ trống nếu điểm này mở một trò chơi) */
  payload?: P;
  /**
   * Tên trò chơi con mở ra khi tương tác, thay cho một dòng thoại (vd: `kite`).
   *
   * Điểm kiểu này KHÔNG được tính vào số hồi ký và không bao giờ "thu thập" —
   * thả diều thì chiều nào cũng thả lại được.
   */
  activity?: string;
}

export interface SpotMatch<P> {
  spot: Spot<P>;
  distance: number;
}

/**
 * Điểm gần nhất còn dùng được với vị trí người chơi.
 *
 * @param collected  id đã thu thập — bỏ qua, không hỏi lại
 */
export function findActiveSpot<P>(
  x: number,
  z: number,
  spots: readonly Spot<P>[],
  collected?: ReadonlySet<string>,
): SpotMatch<P> | undefined {
  let best: SpotMatch<P> | undefined;

  for (const spot of spots) {
    if (collected?.has(spot.id)) continue;

    const distance = Math.hypot(x - spot.x, z - spot.z);

    if (distance > spot.radius) continue;
    if (best && distance >= best.distance) continue;

    best = { spot, distance };
  }

  return best;
}
