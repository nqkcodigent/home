import type { CSSProperties } from "react";

import {
  PUNY_COLUMN,
  PUNY_FRAME,
  PUNY_SHEET_SIZE,
  punyColumnOf,
  punyFrameAt,
  punyRowOf,
  type PunyDirection,
} from "./punyFrames";

/**
 * Chân dung dialog lấy trực tiếp từ spritesheet nhân vật (768×256, frame 32×32,
 * lưới 24 cột × 8 hàng) — không cần thêm ảnh mới, chỉ crop bằng CSS.
 */
const SHEETS = {
  child: "/assets/characters/child/Puny-Characters/Character-Base.png",

  friend: "/assets/characters/child/Puny-Characters/Archer-Green.png",

  cousin: "/assets/characters/child/Puny-Characters/Soldier-Yellow.png",
} as const;

export type PortraitKey = keyof typeof SHEETS;

export interface SourceRect {
  x: number;

  y: number;

  size: number;
}

/**
 * Vùng cắt trong frame 32×32: đầu + thân trên.
 *
 * Sprite chỉ chiếm khoảng x9–22, y10–22 của frame; khung chân dung là hình
 * vuông (xem `.dialog__portrait-img`), nên vùng cắt cũng phải vuông để ảnh
 * không bị dãn.
 */
export const PORTRAIT_CROP = { x: 8, y: 6, size: 16 } as const;

/** Vùng pixel lấy từ sheet cho một hướng: tư thế đứng yên của hướng đó. */
export function portraitSourceRect(
  facing: PunyDirection = "down",
  crop: SourceRect = PORTRAIT_CROP,
): SourceRect {
  const frame = punyFrameAt(facing, PUNY_COLUMN.idle);

  return {
    x: punyColumnOf(frame) * PUNY_FRAME.width + crop.x,

    y: punyRowOf(frame) * PUNY_FRAME.height + crop.y,

    size: crop.size,
  };
}

/**
 * Đổi vùng cắt thành cặp `background-size` / `background-position` của CSS:
 * phóng toàn sheet lên `sheet / crop` lần rồi kéo đúng góc vùng cắt vào góc
 * trên–trái của khung.
 */
export function cropToBackground(
  rect: SourceRect,
): Pick<CSSProperties, "backgroundSize" | "backgroundPosition"> {
  return {
    backgroundSize: `${(PUNY_SHEET_SIZE.width / rect.size) * 100}% ${
      (PUNY_SHEET_SIZE.height / rect.size) * 100
    }%`,

    backgroundPosition: `${(rect.x / (PUNY_SHEET_SIZE.width - rect.size)) * 100}% ${
      (rect.y / (PUNY_SHEET_SIZE.height - rect.size)) * 100
    }%`,
  };
}

export function getPortrait(
  key?: string,
  facing: PunyDirection = "down",
): CSSProperties | undefined {
  const sheet = SHEETS[key as PortraitKey];

  if (!sheet) {
    return undefined;
  }

  return {
    backgroundImage: `url("${sheet}")`,

    backgroundRepeat: "no-repeat",

    imageRendering: "pixelated",

    ...cropToBackground(portraitSourceRect(facing)),
  };
}
