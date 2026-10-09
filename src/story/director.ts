import { gameEvents } from "../events";

import { StoryDirector } from "./StoryDirector";

import type { StoryEmitter } from "./StoryDirector";
import type { StoryData } from "./types";

import storyData from "../data/story.json";

/**
 * StoryDirector chỉ cần một emitter "tên sự kiện + payload" rất lỏng, còn
 * `gameEvents` thì có kiểu chặt cho từng sự kiện. Ép kiểu ở ĐÚNG một chỗ —
 * ranh giới giữa hai hợp đồng — thay vì rải `any` khắp nơi gọi.
 */
const bus = gameEvents as unknown as StoryEmitter;

const emitter: StoryEmitter = {
  emit: (event, payload) => bus.emit(event, payload),

  on: (event, listener) => bus.on(event, listener),

  off: (event, listener) => bus.off(event, listener),
};

export const storyDirector = new StoryDirector({
  scripts: storyData as StoryData,

  clock: {
    delay: (ms) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      }),
  },

  emitter,
});
