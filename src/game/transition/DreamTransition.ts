import Phaser from "phaser";

interface DreamTransitionOptions {
  duration?: number;
  color?: number;
}

export class DreamTransition {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  play(nextScene: string, options: DreamTransitionOptions = {}) {
    const duration = options.duration ?? 3000;

    const color = options.color ?? 0x111827;

    const { width, height } = this.scene.scale;

    const overlay = this.scene.add.rectangle(0, 0, width, height, color, 1);

    overlay.setOrigin(0).setScrollFactor(0).setDepth(9999).setAlpha(0);

    // ----------------------------------
    // PHASE 1
    // World slowly disappears
    // ----------------------------------

    this.scene.tweens.add({
      targets: overlay,
      alpha: 1,
      duration: duration * 0.65,
      ease: "Sine.easeInOut",

      onComplete: () => {
        // ----------------------------------
        // PHASE 2
        // Scene changes while black
        // ----------------------------------

        this.scene.scene.start(nextScene, {
          fromDream: true,
        });
      },
    });
  }
}
