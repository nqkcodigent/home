import { describe, expect, it } from "vitest";

import { PUNY_SHEET_SIZE } from "../../game/assets/punyFrames";
import {
  PORTRAIT_CROP,
  cropToBackground,
  getPortrait,
  portraitSourceRect,
} from "../portraits";

describe("portraits", () => {
  it("cắt vùng vuông để không dãn ảnh trong khung chân dung vuông", () => {
    const rect = portraitSourceRect();

    expect(rect.size).toBe(rect.size);
    expect(rect).toEqual({
      x: PORTRAIT_CROP.x,
      y: PORTRAIT_CROP.y,
      size: PORTRAIT_CROP.size,
    });
  });

  it("vùng cắt của 'down' nằm trong frame đầu tiên", () => {
    const { x, y, size } = portraitSourceRect("down");

    expect(x + size).toBeLessThanOrEqual(32);
    expect(y + size).toBeLessThanOrEqual(32);
  });

  it("mỗi hướng cắt từ đúng hàng của mình", () => {
    expect(portraitSourceRect("down").y).toBe(6);
    expect(portraitSourceRect("left").y).toBe(2 * 32 + 6);
    expect(portraitSourceRect("up").y).toBe(4 * 32 + 6);
    expect(portraitSourceRect("right").y).toBe(6 * 32 + 6);
  });

  it("background-size phóng sheet lên đúng số lần", () => {
    expect(cropToBackground(portraitSourceRect())).toEqual({
      backgroundSize: `${(PUNY_SHEET_SIZE.width / 16) * 100}% ${
        (PUNY_SHEET_SIZE.height / 16) * 100
      }%`,
      backgroundPosition: `${(8 / (PUNY_SHEET_SIZE.width - 16)) * 100}% ${
        (6 / (PUNY_SHEET_SIZE.height - 16)) * 100
      }%`,
    });
  });

  it("vùng cắt trải đúng số pixel đã khai báo khi đặt vào khung vuông", () => {
    // Khung 512×512: mỗi pixel sheet thành 512/16 = 32 px màn hình.
    const element = 512;
    const { backgroundSize, backgroundPosition } = cropToBackground(
      portraitSourceRect(),
    );

    const scale =
      (parseFloat(String(backgroundSize)) / 100) * element / PUNY_SHEET_SIZE.width;

    const drawnWidth = PUNY_SHEET_SIZE.width * scale;

    expect(drawnWidth / PUNY_SHEET_SIZE.width).toBeCloseTo(scale);
    expect(drawnWidth * (1 / (PUNY_SHEET_SIZE.width / 16))).toBeCloseTo(
      element,
      0,
    );

    const offsetX =
      (element - drawnWidth) * (parseFloat(String(backgroundPosition)) / 100);

    // Góc trên–trái của vùng cắt rơi đúng vào góc khung.
    expect(offsetX).toBeCloseTo(-8 * scale, 4);
  });

  it("không có sheet thì không có chân dung", () => {
    expect(getPortrait(undefined)).toBeUndefined();
    expect(getPortrait("người-lạ")).toBeUndefined();
  });

  it("mỗi nhân vật lấy chân dung từ spritesheet của mình", () => {
    expect(String(getPortrait("child")?.backgroundImage)).toContain(
      "Character-Base.png",
    );
    expect(String(getPortrait("friend")?.backgroundImage)).toContain(
      "Archer-Green.png",
    );
    expect(String(getPortrait("cousin")?.backgroundImage)).toContain(
      "Soldier-Yellow.png",
    );
  });

  it("chân dung không bị lặp ảnh và giữ nét pixel", () => {
    const style = getPortrait("child");

    expect(style?.backgroundRepeat).toBe("no-repeat");
    expect(style?.imageRendering).toBe("pixelated");
  });
});
