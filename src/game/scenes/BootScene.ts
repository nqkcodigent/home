import Phaser from "phaser";

import { ASSET_KEYS } from "../assets/AssetKeys";
import { ASSET_PATHS } from "../assets/AssetPaths";
import {
  PUNY_CARDINAL,
  PUNY_FRAME,
  PUNY_IDLE_CYCLE,
  PUNY_ROW,
  PUNY_WALK_CYCLE,
  punyFrameAt,
} from "../assets/punyFrames";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("BootScene");
  }

  preload() {
    // ============================================================
    // CHARACTER
    // ============================================================

    this.load.spritesheet(
      ASSET_KEYS.character.player,
      ASSET_PATHS.characters.player,
      {
        frameWidth: PUNY_FRAME.width,
        frameHeight: PUNY_FRAME.height,
      },
    );

    // ============================================================
    // ENVIRONMENT
    // ============================================================

    this.load.image(
      ASSET_KEYS.environment.grass,
      ASSET_PATHS.environment.grass,
    );

    this.load.image(
      ASSET_KEYS.environment.grass2,
      ASSET_PATHS.environment.grass2,
    );

    this.load.image(ASSET_KEYS.environment.dirt, ASSET_PATHS.environment.dirt);

    this.load.image(
      ASSET_KEYS.environment.treeSmall,
      ASSET_PATHS.environment.treeSmall,
    );

    this.load.image(
      ASSET_KEYS.environment.childhoodTileset,
      ASSET_PATHS.environment.childhoodTileset,
    );

    this.load.image(
      ASSET_KEYS.environment.house,
      ASSET_PATHS.environment.house,
    );

    this.load.image(
      ASSET_KEYS.environment.fence,
      ASSET_PATHS.environment.fence,
    );

    this.load.image(
      ASSET_KEYS.environment.treeLarge,
      ASSET_PATHS.environment.treeLarge,
    );

    this.load.image(ASSET_KEYS.environment.well, ASSET_PATHS.environment.well);

    // ============================================================
    // AUDIO
    // ============================================================

    this.load.audio(ASSET_KEYS.audio.city, ASSET_PATHS.audio.city);

    this.load.audio(ASSET_KEYS.audio.room, ASSET_PATHS.audio.room);

    this.load.audio(ASSET_KEYS.audio.village, ASSET_PATHS.audio.village);

    this.load.audio(
      ASSET_KEYS.audio.childhoodBirds,
      ASSET_PATHS.audio.childhoodBirds,
    );

    this.load.audio(ASSET_KEYS.audio.crickets, ASSET_PATHS.audio.crickets);

    this.load.audio(ASSET_KEYS.audio.schoolBell, ASSET_PATHS.audio.schoolBell);

    this.load.audio(ASSET_KEYS.audio.footsteps, ASSET_PATHS.audio.footsteps);

    this.load.audio(
      ASSET_KEYS.audio.childFootsteps,
      ASSET_PATHS.audio.childFootsteps,
    );

    this.load.audio(ASSET_KEYS.audio.doorOpen, ASSET_PATHS.audio.doorOpen);

    this.load.audio(ASSET_KEYS.audio.sleep, ASSET_PATHS.audio.sleep);
  }

  create() {
    this.createPlayerAnimations();

    this.scene.start("AdultHomeScene");
  }

  /**
   * Animation lấy từ lưới đã dò trong punyFrames: mỗi hướng là một hàng, cột
   * 0–1 là tư thế đứng và cột 2–3 là hai pha sải chân.
   */
  private createPlayerAnimations() {
    const key = ASSET_KEYS.character.player;

    for (const direction of PUNY_CARDINAL) {
      this.anims.create({
        key: `player-idle-${direction}`,

        frames: PUNY_IDLE_CYCLE.map((column) => ({
          key,
          frame: punyFrameAt(direction, column),
        })),

        frameRate: 2,
        repeat: -1,
      });

      this.anims.create({
        key: `player-walk-${direction}`,

        frames: PUNY_WALK_CYCLE.map((column) => ({
          key,
          frame: punyFrameAt(direction, column),
        })),

        frameRate: 7,
        repeat: -1,
      });
    }
  }
}
