import Phaser from "phaser";

import { BootScene, AdultHomeScene, ChildhoodScene } from "./scenes";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,

  parent: "phaser-container",

  backgroundColor: "#111827",

  scale: {
    mode: Phaser.Scale.RESIZE,

    autoCenter: Phaser.Scale.CENTER_BOTH,

    width: "100%",

    height: "100%",
  },

  render: {
    antialias: true,

    pixelArt: true,

    roundPixels: true,
  },

  physics: {
    default: "arcade",

    arcade: {
      gravity: {
        x: 0,
        y: 0,
      },

      debug: false,
    },
  },

  input: {
    activePointers: 3,
  },

  scene: [BootScene, AdultHomeScene, ChildhoodScene],
};
