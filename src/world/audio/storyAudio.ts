import { isAudioSlot } from "./HowlerAudio";

import type { HowlerAudio } from "./HowlerAudio";
import type { StageHandlers } from "../../story/StoryDirector";

/**
 * Nhịp `audio` trong story.json gọi tên một slot ("city", "room"…), còn lớp
 * âm thanh chỉ biết file. Đây là chỗ nối hai bên, và cũng là chỗ bắt lỗi gõ
 * sai tên slot ngay lập tức thay vì im lặng không phát gì.
 */
export function createStoryAudioHandler(
  audio: HowlerAudio,
): NonNullable<StageHandlers["audio"]> {
  const slot = (name: string) => {
    if (!isAudioSlot(name)) {
      throw new Error(`Audio: unknown slot "${name}"`);
    }

    return name;
  };

  return (beat) => {
    const from = slot(beat.slot);

    switch (beat.op) {
      case "play":
        audio.play(from, { volume: beat.volume ?? 1 });
        return;

      case "stop":
        audio.stop(from);
        return;

      case "fadeIn":
        audio.fadeIn(from, beat.duration ?? 1000, beat.volume ?? 0.3);
        return;

      case "fadeOut":
        audio.fadeOut(from, beat.duration ?? 1000);
        return;

      case "crossFade": {
        if (!beat.to) {
          throw new Error(
            `Audio: crossFade beat "${beat.id ?? beat.slot}" needs "to"`,
          );
        }

        audio.crossFade(
          from,
          slot(beat.to),
          beat.duration ?? 2500,
          beat.volume ?? 0.35,
        );
        return;
      }
    }
  };
}
