import { gameEvents } from "../events";

import { StoryDirector } from "./StoryDirector";

import type { StoryEmitter } from "./StoryDirector";

import storyData from "../../data/story.json";

import type { StoryData } from "./types";

const emitter: StoryEmitter = {
  emit: (event, payload) => gameEvents.emit(event, payload),

  on: (event, listener) => gameEvents.on(event, listener),

  off: (event, listener) => gameEvents.off(event, listener),
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
