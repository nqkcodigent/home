import { YARD } from "../world/layout";

/**
 * Địa danh cho Bản đồ trong Sổ — bản đồ vẽ tay hiện dần theo bước chân.
 *
 * Bước vào trong `radius` của một nơi là nơi đó hiện lên bản đồ (không thưởng
 * chỉ: tấm bản đồ đầy dần chính là phần thưởng). Toạ độ đọc từ `YARD` khi có,
 * để chỗ trên bản đồ không bao giờ lệch chỗ trong thế giới.
 */

export interface Place {
  id: string;
  label: string;
  x: number;
  z: number;
  radius: number;
}

export const PLACE_LIST: readonly Place[] = [
  { id: "home", label: "Nhà mình", ...YARD.house, radius: 6 },
  { id: "well", label: "Giếng", ...YARD.well, radius: 4 },
  { id: "pond", label: "Ao sen", ...YARD.pond, radius: 6 },
  { id: "kite-field", label: "Bãi diều", x: 6, z: 11, radius: 5 },
  { id: "shuttle-field", label: "Bãi đá cầu", x: -6, z: 6, radius: 5 },
  { id: "banyan", label: "Cây đa", ...YARD.tree, radius: 4 },
  { id: "haystacks", label: "Đống rơm", x: -11, z: -14, radius: 5 },
  { id: "gate", label: "Cổng làng", ...YARD.gate, radius: 5 },
  { id: "hill", label: "Đồi gió", x: 16, z: -48, radius: 9 },
  { id: "tower", label: "Tháp chuông", ...YARD.school, radius: 9 },
  { id: "slope", label: "Triền cỏ", x: -30, z: 32, radius: 9 },
  { id: "west-meadow", label: "Bãi cỏ phía tây", x: -45, z: 10, radius: 10 },
  { id: "south-field", label: "Cánh đồng nam", x: -8, z: 40, radius: 10 },
];

const PLACES = new Map(PLACE_LIST.map((place) => [place.id, place]));

export function isPlaceId(id: string): boolean {
  return PLACES.has(id);
}

/** Nơi CHƯA đặt chân tới mà (x, z) đang đứng trong, hoặc `undefined`. */
export function placeAt(x: number, z: number, visited: readonly string[]): Place | undefined {
  return PLACE_LIST.find(
    (place) => !visited.includes(place.id) && Math.hypot(place.x - x, place.z - z) <= place.radius,
  );
}
