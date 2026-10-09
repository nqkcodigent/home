import { Howl, Howler } from "howler";

import type { HowlOptions } from "howler";

/**
 * Âm thanh thế giới, chạy trên Howler (giống character-threejs).
 *
 * Vì sao đổi khỏi hệ thống sound của Phaser: game không còn Phaser. Nhưng lý do
 * thật sự là không gian — Howler cho `pos()` và panner HRTF, nên tiếng trống
 * trường ở xa nghe đúng là ở xa, còn tiếng dế thì ở quanh mình. Bản 2D cũ chỉ
 * có thể chỉnh âm lượng, và cái giếng ở góc sân nghe y hệt cái ở ngay chân.
 *
 * Giao diện giữ nguyên hình dạng của AudioManager cũ (play/stop/fadeIn/fadeOut/
 * crossFade) để nhịp `audio` trong story.json không phải viết lại.
 */

export const AUDIO_SLOTS = {
  city: "/assets/audio/ambience/city.mp3",
  room: "/assets/audio/ambience/room.mp3",
  village: "/assets/audio/ambience/village.mp3",
  childhoodBirds: "/assets/audio/ambience/childhood-birds.mp3",
  crickets: "/assets/audio/ambience/crickets.mp3",

  footsteps: "/assets/audio/sfx/footsteps.mp3",
  childFootsteps: "/assets/audio/sfx/child-footsteps.mp3",
  doorOpen: "/assets/audio/sfx/door-open.mp3",
  sleep: "/assets/audio/sfx/sleep.mp3",
  schoolBell: "/assets/audio/sfx/school-bell.mp3",
} as const;

export type AudioSlot = keyof typeof AUDIO_SLOTS;

export function isAudioSlot(slot: string): slot is AudioSlot {
  return slot in AUDIO_SLOTS;
}

export interface PlayOptions {
  volume?: number;
  loop?: boolean;
}

/** Tay điều khiển một tiếng đã phát trong không gian. */
export interface SpatialVoice {
  move: (position: { x: number; y: number; z: number }) => void;
  stop: () => void;
}

/** Bán kính nghe rõ của âm thanh có vị trí (mét). */
const REFERENCE_DISTANCE = 7;

/**
 * Howler đọc các tham số không gian ở khoá LỒNG `pannerAttr`
 * (howler.core.js: `_pannerAttr = {...mặc định, ...o.pannerAttr}`), nhưng
 * @types/howler lại khai báo chúng ở mức phẳng. Nối lại ở đây, một lần.
 */
const PANNER = {
  pannerAttr: {
    panningModel: "HRTF",
    distanceModel: "inverse",
    refDistance: REFERENCE_DISTANCE,
    rolloffFactor: 1.3,
    maxDistance: 60,
  },
} as unknown as HowlOptions;

export class HowlerAudio {
  private readonly sounds = new Map<string, Howl>();

  private muted = false;

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    Howler.mute(muted);
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);

    return this.muted;
  }

  play(slot: AudioSlot, options: PlayOptions = {}) {
    const sound = this.resolve(slot, options.loop ?? false);

    sound.volume(options.volume ?? 1);

    if (!sound.playing()) sound.play();

    return sound;
  }

  /**
   * Phát tại một điểm trong không gian, và tự cập nhật khi nguồn động.
   *
   * Trả về tay điều khiển của tiếng này: `move()` để dính theo nhân vật (tiếng
   * bước chân), `stop()` để tắt. Quên `stop()` là tiếng bước chân còn mãi sau
   * khi nhân vật đứng lại.
   */
  playAt(
    slot: AudioSlot,
    position: { x: number; y: number; z: number },
    options: PlayOptions & { id?: string } = {},
  ): SpatialVoice {
    const key = `at:${options.id ?? slot}`;

    let sound = this.sounds.get(key);

    if (!sound) {
      sound = new Howl({
        ...PANNER,
        src: [AUDIO_SLOTS[slot]],
        loop: options.loop ?? true,
        volume: 0,
      });

      this.sounds.set(key, sound);
    }

    sound.pos(position.x, position.y, position.z);

    if (!sound.playing()) sound.play();

    sound.fade(sound.volume(), options.volume ?? 0.5, 400);

    return {
      move: (next) => sound?.pos(next.x, next.y, next.z),

      stop: () => {
        sound?.fade(sound.volume(), 0, 220);
        sound?.once("fade", () => sound?.stop());
      },
    };
  }

  stop(slot: AudioSlot) {
    const sound = this.sounds.get(slot);

    if (!sound) return;

    sound.stop();
  }

  fadeIn(slot: AudioSlot, duration = 1000, volume = 0.3) {
    const sound = this.resolve(slot, true);

    if (!sound.playing()) {
      sound.volume(0);
      sound.play();
    }

    sound.fade(sound.volume(), volume, duration);

    return sound;
  }

  fadeOut(slot: AudioSlot, duration = 1000) {
    const sound = this.sounds.get(slot);

    if (!sound || !sound.playing()) return;

    sound.fade(sound.volume(), 0, duration);
    sound.once("fade", () => sound.stop());
  }

  crossFade(
    from: AudioSlot,
    to: AudioSlot,
    duration = 2500,
    volume = 0.35,
  ) {
    this.fadeOut(from, duration);
    this.fadeIn(to, duration, volume);
  }

  /** Vị trí + hướng của người nghe — gọi mỗi frame cùng lúc với camera. */
  setListener(
    position: { x: number; y: number; z: number },
    forward: { x: number; y: number; z: number },
  ) {
    Howler.pos(position.x, position.y, position.z);
    Howler.orientation(forward.x, forward.y, forward.z, 0, 1, 0);
  }

  stopAll() {
    for (const sound of this.sounds.values()) sound.stop();
  }

  dispose() {
    for (const sound of this.sounds.values()) {
      sound.stop();
      sound.unload();
    }

    this.sounds.clear();
  }

  private resolve(slot: AudioSlot, loop: boolean): Howl {
    let sound = this.sounds.get(slot);

    if (!sound) {
      sound = new Howl({
        src: [AUDIO_SLOTS[slot]],
        loop,
        volume: 0,
      });

      this.sounds.set(slot, sound);
    }

    return sound;
  }
}
