import Phaser from "phaser";

/**
 * Phaser 4's BaseSound typing omits setVolume() and volume, but every
 * concrete sound class (WebAudioSound, HTML5AudioSound, NoAudioSound)
 * implements both — verified in node_modules/phaser/src/sound.
 */
type FaderSound = Phaser.Sound.BaseSound & {
  setVolume(value: number): void;

  volume: number;
};

function addSound(
  scene: Phaser.Scene,
  key: string,
  config?: Phaser.Types.Sound.SoundConfig,
): FaderSound {
  return scene.sound.add(key, config) as FaderSound;
}

export class AudioManager {
  private scene: Phaser.Scene;

  private sounds = new Map<string, FaderSound>();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  play(key: string, config?: Phaser.Types.Sound.SoundConfig) {
    let sound = this.sounds.get(key);

    if (!sound) {
      sound = addSound(this.scene, key, config);

      this.sounds.set(key, sound);
    }

    if (!sound.isPlaying) {
      sound.play(config);
    }

    return sound;
  }

  stop(key: string) {
    const sound = this.sounds.get(key);

    if (!sound) return;

    sound.stop();
  }

  fadeIn(key: string, duration = 1000, volume = 1) {
    let sound = this.sounds.get(key);

    if (!sound) {
      sound = addSound(this.scene, key, {
        loop: true,
        volume: 0,
      });

      this.sounds.set(key, sound);
    }

    if (!sound.isPlaying) {
      sound.play({
        loop: true,
      });
    }

    sound.setVolume(0);

    this.scene.tweens.add({
      targets: sound,
      volume,
      duration,
      ease: "Sine.easeInOut",
    });

    return sound;
  }

  fadeOut(key: string, duration = 1000) {
    const sound = this.sounds.get(key);

    if (!sound) return;

    this.scene.tweens.add({
      targets: sound,
      volume: 0,
      duration,
      ease: "Sine.easeInOut",

      onComplete: () => {
        sound?.stop();
      },
    });
  }

  crossFade(from: string, to: string, duration = 2500, volume = 0.35) {
    this.fadeOut(from, duration);

    let next = this.sounds.get(to);

    if (!next) {
      next = addSound(this.scene, to, {
        loop: true,
        volume: 0,
      });

      this.sounds.set(to, next);
    }

    if (!next.isPlaying) {
      next.play({
        loop: true,
      });
    }

    next.setVolume(0);

    this.scene.tweens.add({
      targets: next,
      volume,
      duration,
      ease: "Sine.easeInOut",
    });
  }

  stopAll() {
    this.sounds.forEach((sound) => {
      sound.stop();
    });
  }

  destroy() {
    this.sounds.forEach((sound) => {
      sound.stop();
      sound.destroy();
    });

    this.sounds.clear();
  }
}
