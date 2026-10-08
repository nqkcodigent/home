import { AudioManager } from "./AudioManager";

import { ASSET_KEYS } from "../assets/AssetKeys";

import type { StageHandlers } from "../story/StoryDirector";

function audioKey(slot: string): string {
  const key = ASSET_KEYS.audio[slot as keyof typeof ASSET_KEYS.audio];

  if (!key) {
    throw new Error(`Audio: unknown slot "${slot}"`);
  }

  return key;
}

/**
 * Shared `audio` beat handler: story data names a logical slot
 * ("city", "room", ...), this maps it to the concrete asset key.
 */
export function createAudioHandler(
  audio: AudioManager,
): NonNullable<StageHandlers["audio"]> {
  return (beat) => {
    const from = audioKey(beat.slot);

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
          audioKey(beat.to),
          beat.duration ?? 2500,
          beat.volume ?? 0.35,
        );
        return;
      }
    }
  };
}
