/**
 * Bảng tên các trò chơi con — điểm tương tác gọi trò chơi bằng TÊN
 * (`spot.activity`), và đây là chỗ biết tên nào có thật.
 */
export const ACTIVITIES = ["kite"] as const;

export type ActivityName = (typeof ACTIVITIES)[number];

export function isActivity(name: string): name is ActivityName {
  return (ACTIVITIES as readonly string[]).includes(name);
}
