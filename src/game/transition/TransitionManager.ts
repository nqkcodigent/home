import Phaser from "phaser";

export class TransitionManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  dreamTo(
    nextScene: string,
    options?: {
      duration?: number;
      color?: number;
    },
  ) {
    const duration = options?.duration ?? 2200;

    const color = options?.color ?? 0x111827;

    const { width, height } = this.scene.scale;

    const overlay = this.scene.add
      .rectangle(0, 0, width, height, color, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(9999)
      .setAlpha(0);

    // ------------------------------------------------
    // Phase 1: world slowly disappears
    // ------------------------------------------------

    this.scene.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: duration * 0.55,
      ease: "Sine.easeInOut",

      onComplete: () => {
        // ------------------------------------------------
        // Phase 2: switch scene while screen is black
        // ------------------------------------------------

        this.scene.scene.start(nextScene, {
          transition: true,
        });
      },
    });
  }
}
