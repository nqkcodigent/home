import { describe, expect, it } from "vitest";

import { ACTIVITIES } from "../../world/activities";
import {
  YARD_PAN_POINTS,
  YARD_WALK_POINTS,
} from "../../world/locations/childhoodYard";
import storyData from "../../data/story.json";

import type { StoryBeat, StoryData } from "../types";

const scripts = storyData as StoryData;

const KNOWN_TYPES = new Set<StoryBeat["type"]>([
  "dialog",
  "pause",
  "walk",
  "pan",
  "zoom",
  "reveal",
  "audio",
  "controls",
  "transition",
  "activity",
]);

const beats = Object.entries(scripts).flatMap(([script, story]) =>
  story.scenes.map((beat, index) => ({ script, index, beat })),
);

/**
 * Dữ liệu truyện là dữ liệu SỐNG: nó gọi điểm đi bộ, tên trò chơi, tên slot âm
 * thanh bằng chuỗi. Gõ sai một chữ thì lỗi chỉ nổ ra lúc người chơi tới đúng
 * nhịp đó — tức là giữa buổi chơi, và ở đúng cảnh khó tái hiện nhất. Bộ test
 * này đối chiếu toàn bộ story.json với bảng tra của mã nguồn.
 */
describe("story.json", () => {
  it("có ít nhất hai chương và chương nào cũng có nhịp", () => {
    const names = Object.keys(scripts);

    expect(names).toContain("intro");
    expect(names).toContain("childhood");

    for (const name of names) {
      expect(scripts[name].scenes.length).toBeGreaterThan(0);
    }
  });

  it("mọi nhịp đều thuộc vocabulary — không có nhịp lạ lọt vào data", () => {
    for (const { beat } of beats) {
      expect(KNOWN_TYPES.has(beat.type)).toBe(true);
    }
  });

  it("id nhịp không trùng trong cùng một chương", () => {
    for (const [script, story] of Object.entries(scripts)) {
      const ids = story.scenes
        .map((beat) => beat.id)
        .filter((id): id is string => typeof id === "string");

      expect(new Set(ids).size, `chương "${script}"`).toBe(ids.length);
    }
  });

  it("lời thoại luôn có chữ, và không có dòng nào trắng", () => {
    for (const { beat, script, index } of beats) {
      if (beat.type !== "dialog") continue;

      expect(beat.text.trim().length, `${script}#${index}`).toBeGreaterThan(0);
    }
  });

  it("nhịp chờ luôn có thời lượng dương", () => {
    for (const { beat, script, index } of beats) {
      if (beat.type !== "pause") continue;

      expect(beat.duration, `${script}#${index}`).toBeGreaterThan(0);
    }
  });

  it("nhịp thả diều gọi một trò chơi CÓ THẬT trong bảng đăng ký", () => {
    const activities = beats.filter(({ beat }) => beat.type === "activity");

    expect(activities.length).toBeGreaterThan(0);

    for (const { beat, script, index } of activities) {
      if (beat.type !== "activity") continue;

      expect(ACTIVITIES as readonly string[], `${script}#${index}`).toContain(
        beat.activity,
      );
    }
  });

  it("nhịp thả diều có trần thời gian — không có ván nào chạy vô hạn", () => {
    for (const { beat, script, index } of beats) {
      if (beat.type !== "activity") continue;

      expect(beat.duration, `${script}#${index}`).toBeGreaterThan(0);
      expect(beat.duration, `${script}#${index}`).toBeLessThan(60_000);
    }
  });

  it("mọi điểm `walk` của chương tuổi thơ đều có thật trong sân", () => {
    for (const { beat, script, index } of beats) {
      if (beat.type !== "walk" || script !== "childhood") continue;

      expect(Object.keys(YARD_WALK_POINTS), `${script}#${index}`).toContain(
        beat.to,
      );
    }
  });

  it("mọi điểm `pan` của chương tuổi thơ đều có thật trong sân", () => {
    for (const { beat, script, index } of beats) {
      if (beat.type !== "pan" || script !== "childhood") continue;

      expect(Object.keys(YARD_PAN_POINTS), `${script}#${index}`).toContain(beat.to);
    }
  });

  it("chương tuổi thơ kết thúc bằng việc trả quyền điều khiển cho người chơi", () => {
    const scenes = scripts.childhood.scenes;
    const last = scenes[scenes.length - 1];

    expect(last.type).toBe("controls");
  });

  it("chương tuổi thơ đưa người chơi tới bãi cỏ trước khi thả diều", () => {
    const scenes = scripts.childhood.scenes;

    const walk = scenes.findIndex(
      (beat) => beat.type === "walk" && beat.to === "kite",
    );
    const kite = scenes.findIndex((beat) => beat.type === "activity");

    expect(walk).toBeGreaterThan(-1);
    expect(kite).toBeGreaterThan(walk);
  });
});
