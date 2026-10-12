/**
 * Bảng tên các trò chơi con.
 *
 * Cốt truyện gọi trò chơi bằng TÊN trong story.json (`type: "activity"`), còn
 * bên đây biết tên nào có thật. Hai bên khớp nhau qua đúng module này — nếu chỉ
 * để tên nằm trong một câu `if` của WorldGame thì một lỗi gõ sai trong data sẽ
 * chỉ lộ ra lúc người chơi tới đúng nhịp đó, giữa buổi chơi.
 *
 * Module này cố ý KHÔNG import three.js: nhờ vậy test đọc story.json kiểm tra
 * được mọi tên trò chơi mà không phải dựng cả engine trong môi trường Node.
 */
export const ACTIVITIES = ["kite"] as const;

export type ActivityName = (typeof ACTIVITIES)[number];

export function isActivity(name: string): name is ActivityName {
  return (ACTIVITIES as readonly string[]).includes(name);
}
