import Phaser from "phaser";

import { AudioManager } from "../audio/AudioManager";
import { createAudioHandler } from "../audio/createAudioHandler";
import { DreamTransition } from "../transition/DreamTransition";
import { Player } from "../objects/Player";
import { gameEvents } from "../events";
import { storyDirector } from "../story/director";

export class AdultHomeScene extends Phaser.Scene {
  private player!: Player;

  private audio!: AudioManager;

  private dreamTransition!: DreamTransition;

  private bed!: Phaser.GameObjects.Rectangle;

  private windowGlow!: Phaser.GameObjects.Rectangle;

  private breathingTween?: Phaser.Tweens.Tween;

  constructor() {
    super("AdultHomeScene");
  }

  create() {
    this.audio = new AudioManager(this);
    this.dreamTransition = new DreamTransition(this);

    this.createWorld();
    this.createPlayer();
    this.attachStage();

    gameEvents.emit("hud", { time: "23:12", chapter: "Một ngày dài" });

    gameEvents.emit("chapter", {
      index: 1,
      title: "Một ngày dài",
      subtitle: "một tối mệt nhoài giữa thành phố",
    });

    void storyDirector.play("intro");
  }

  // ============================================================
  // STORY STAGE — beats từ story.json được thực thi tại đây
  // ============================================================

  private attachStage() {
    storyDirector.attachStage({
      name: "AdultHome",

      handlers: {
        walk: (beat) => this.walkTo(beat.to, beat.duration ?? 1500),

        pan: (beat) => this.panTo(beat.to, beat.duration ?? 1200),

        zoom: (beat) => this.zoomTo(beat.level, beat.duration ?? 1500),

        audio: createAudioHandler(this.audio),

        transition: (beat) => {
          this.dreamTransition.play(beat.scene, {
            duration: beat.duration ?? 3000,
          });
        },
      },
    });
  }

  private readonly walkPoints: Record<string, () => { x: number; y: number }> =
    {
      hall: () => ({ x: this.player.x + 260, y: this.player.y }),

      bed: () => ({ x: this.bed.x - 80, y: this.bed.y }),
    };

  private readonly panPoints: Record<string, () => number> = {
    window: () => this.player.x - 240,

    room: () =>
      this.player.x - this.scale.width / this.cameras.main.zoom / 2,
  };

  private walkTo(name: string, duration: number) {
    const point = this.walkPoints[name];

    if (!point) {
      throw new Error(`AdultHome: unknown walk point "${name}"`);
    }

    const target = point();

    const direction = target.x < this.player.x ? "left" : "right";

    this.player.move(direction);

    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this.player,

        x: target.x,

        y: target.y,

        duration,

        ease: "Sine.easeInOut",

        onComplete: () => {
          this.player.halt();

          resolve();
        },
      });
    });
  }

  private panTo(name: string, duration: number) {
    const point = this.panPoints[name];

    if (!point) {
      throw new Error(`AdultHome: unknown pan point "${name}"`);
    }

    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this.cameras.main,

        scrollX: point(),

        duration,

        ease: "Sine.easeInOut",

        onComplete: () => resolve(),
      });
    });
  }

  private zoomTo(level: number, duration: number) {
    this.breathingTween?.stop();

    return new Promise<void>((resolve) => {
      this.tweens.add({
        targets: this.cameras.main,

        zoom: level,

        duration,

        ease: "Sine.easeInOut",

        onComplete: () => resolve(),
      });
    });
  }

  // ============================================================
  // WORLD
  // ============================================================

  private createWorld() {
    const { width, height } = this.scale;
    const camera = this.cameras.main;

    camera.setZoom(1);
    camera.setScroll(0, 0);
    camera.setBackgroundColor("#111827");

    // Background căn phòng
    this.add.rectangle(0, 0, width, height, 0x111827).setOrigin(0).setDepth(0);

    // Ánh sáng từ cửa sổ
    this.windowGlow = this.add
      .rectangle(width * 0.72, height * 0.28, 250, 220, 0xf4d7a1, 0.12)
      .setDepth(1);

    // Sàn nhà
    this.add
      .rectangle(0, height * 0.68, width, height * 0.32, 0x1f2937)
      .setOrigin(0)
      .setDepth(2);

    // Giường
    this.bed = this.add
      .rectangle(width * 0.58, height * 0.55, 260, 110, 0x374151)
      .setDepth(5);

    // Ánh sáng đèn ngủ
    const lampGlow = this.add
      .circle(width * 0.24, height * 0.45, 100, 0xfbbf24, 0.08)
      .setDepth(3);

    // Hiệu ứng ánh sáng nhấp nháy nhẹ
    this.tweens.add({
      targets: [this.windowGlow, lampGlow],
      alpha: { from: 0.05, to: 0.12 },
      duration: 2600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ============================================================
  // PLAYER + CAMERA MỞ ĐẦU
  // ============================================================

  private createPlayer() {
    const { width, height } = this.scale;
    const camera = this.cameras.main;

    this.player = new Player(this, width * 0.18, height * 0.67);

    this.player.setDepth(10);

    camera.setZoom(1.08);
    camera.centerOn(this.player.x, this.player.y);

    // "Nhịp thở" nhỏ của camera
    this.breathingTween = this.tweens.add({
      targets: camera,
      zoom: 1.11,
      duration: 4500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  // ============================================================
  // UTILITY
  // ============================================================

  shutdown() {
    this.audio?.destroy();
  }
}
