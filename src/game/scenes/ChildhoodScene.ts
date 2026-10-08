import Phaser from "phaser";

import { ASSET_KEYS } from "../assets/AssetKeys";
import { AudioManager } from "../audio/AudioManager";
import { createAudioHandler } from "../audio/createAudioHandler";
import { playSfx } from "../audio/uiSfx";
import { Player } from "../objects/Player";
import { gameEvents } from "../events";
import { storyDirector } from "../story/director";

import type { StoryLine } from "../story/StoryDirector";

const TILE_SIZE = 16;

const MAP_WIDTH = 100;

const MAP_HEIGHT = 70;

interface MemorySpot {
  name: string;
  x: number;

  y: number;

  radius: number;

  label: string;

  line: StoryLine;
}

export class ChildhoodScene extends Phaser.Scene {
  private player!: Player;

  private audio!: AudioManager;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;

  private keyW!: Phaser.Input.Keyboard.Key;
  private keyA!: Phaser.Input.Keyboard.Key;
  private keyS!: Phaser.Input.Keyboard.Key;
  private keyD!: Phaser.Input.Keyboard.Key;
  private keyE!: Phaser.Input.Keyboard.Key;

  private controlsEnabled = false;

  private activeSpot: MemorySpot | undefined;

  private readonly collected = new Set<string>();

  private readonly spots: MemorySpot[] = [
    {
      name: "well",
      x: 1080,
      y: 620,
      radius: 110,
      label: "Cái giếng",
      line: {
        id: "memory-well",
        speaker: "Bạn",
        text: "Cái giếng này... hóa ra mình vẫn nhớ như in cái cảm giác mát rượi.",
        emotion: "nostalgic",
        portrait: "child",
      },
    },
    {
      name: "door",
      x: 800,
      y: 320,
      radius: 120,
      label: "Cửa nhà",
      line: {
        id: "memory-door",
        speaker: "Bạn",
        text: "Mẹ vẫn hay đứng ở đúng cái cửa này gọi mình vào ăn cơm.",
        emotion: "warm",
        portrait: "child",
      },
    },
    {
      name: "tree",
      x: 420,
      y: 215,
      radius: 130,
      label: "Gốc cây",
      line: {
        id: "memory-tree",
        speaker: "Bạn",
        text: "Cả lũ từng trèo lên đây, rồi bị mắng cho một trận.",
        emotion: "nostalgic",
        portrait: "friend",
      },
    },
  ];

  constructor() {
    super("ChildhoodScene");
  }

  create(data?: { fromDream?: boolean }) {
    this.audio = new AudioManager(this);
    this.activeSpot = undefined;
    this.collected.clear();

    this.createWorld();
    this.createEnvironment();
    this.createPlayer(data?.fromDream === true);
    this.createInput();

    this.createCamera(data?.fromDream !== true);

    this.attachStage();

    gameEvents.emit("hud", { time: "17:42", chapter: "Ngày ấy" });

    gameEvents.emit("chapter", {
      index: 2,
      title: "Ngày ấy",
      subtitle: "một chiều tuổi thơ chưa tắt nắng",
    });

    gameEvents.emit("hud", { memories: 0, total: this.spots.length });

    if (data?.fromDream) {
      this.controlsEnabled = false;

      void storyDirector.play("childhood");
    } else {
      this.controlsEnabled = true;
    }
  }

  // ============================================================
  // STORY STAGE — beats từ story.json được thực thi tại đây
  // ============================================================

  private attachStage() {
    storyDirector.attachStage({
      name: "Childhood",

      handlers: {
        audio: createAudioHandler(this.audio),

        reveal: (beat) =>
          new Promise<void>((resolve) => {
            this.tweens.add({
              targets: this.player,

              alpha: 1,

              duration: beat.duration ?? 1500,

              ease: "Sine.easeOut",

              onComplete: () => resolve(),
            });
          }),

        zoom: async (beat) => {
          await new Promise<void>((resolve) => {
            this.cameras.main.zoomTo(
              beat.level,
              beat.duration ?? 2000,
              "Sine.easeOut",
              true,

              (_camera, progress) => {
                if (progress >= 1) {
                  resolve();
                }
              },
            );
          });

          if (beat.follow) {
            this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
          }
        },

        controls: (beat) => {
          this.setControls(beat.enabled);
        },
      },
    });
  }

  private setControls(enabled: boolean) {
    this.controlsEnabled = enabled;

    if (enabled) {
      this.player.halt();
    }

    gameEvents.emit("controls", { enabled });
  }

  // ============================================================
  // WORLD
  // ============================================================

  private createWorld() {
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      width: MAP_WIDTH,
      height: MAP_HEIGHT,
    });

    const tileset = map.addTilesetImage(
      ASSET_KEYS.environment.grass,
      ASSET_KEYS.environment.grass,
      TILE_SIZE,
      TILE_SIZE,
      0,
      0,
    );

    if (!tileset) {
      throw new Error("Grass tileset failed");
    }

    const ground = map.createBlankLayer("Ground", tileset);

    if (!ground) {
      throw new Error("Ground layer failed");
    }

    ground.fill(0, 0, 0, MAP_WIDTH, MAP_HEIGHT);

    ground.setDepth(-100);

    this.physics.world.setBounds(
      0,
      0,
      MAP_WIDTH * TILE_SIZE,
      MAP_HEIGHT * TILE_SIZE,
    );
  }

  // ============================================================
  // ENVIRONMENT
  // ============================================================

  private createEnvironment() {
    const house = this.add.image(800, 300, ASSET_KEYS.environment.house);

    house.setOrigin(0.5, 1).setDepth(30);

    // ----------------------------------------
    // Trees
    // ----------------------------------------

    const treePositions = [
      [180, 200],
      [420, 170],
      [1150, 190],
      [1400, 260],
      [1650, 180],
      [240, 760],
      [1200, 720],
      [1500, 680],
    ];

    treePositions.forEach(([x, y], index) => {
      const tree = this.add.image(x, y, ASSET_KEYS.environment.treeLarge);

      tree.setOrigin(0.5, 1).setDepth(35);

      this.animateTree(tree, index);
    });

    // ----------------------------------------
    // Fence
    // ----------------------------------------

    [
      [550, 420],
      [665, 420],
      [780, 420],
    ].forEach(([x, y]) => {
      this.add
        .image(x, y, ASSET_KEYS.environment.fence)
        .setOrigin(0.5, 1)
        .setDepth(30);
    });

    // ----------------------------------------
    // Well
    // ----------------------------------------

    this.add
      .image(1080, 600, ASSET_KEYS.environment.well)
      .setScale(2)
      .setOrigin(0.5, 1)
      .setDepth(30);
  }

  // ============================================================
  // TREE ANIMATION
  // ============================================================

  private animateTree(tree: Phaser.GameObjects.Image, index: number) {
    this.tweens.add({
      targets: tree,

      angle: index % 2 === 0 ? 1.2 : -1.2,

      duration: 1800 + index * 170,

      yoyo: true,

      repeat: -1,

      ease: "Sine.easeInOut",

      delay: index * 130,
    });
  }

  // ============================================================
  // PLAYER
  // ============================================================

  private createPlayer(fromDream: boolean) {
    this.player = new Player(this, 500, 600);

    if (fromDream) {
      this.player.setAlpha(0);
    }
  }

  // ============================================================
  // CAMERA
  // ============================================================

  private createCamera(follow: boolean) {
    const camera = this.cameras.main;

    camera.setBounds(0, 0, MAP_WIDTH * TILE_SIZE, MAP_HEIGHT * TILE_SIZE);

    camera.setZoom(follow ? 1.35 : 1.45);

    if (follow) {
      camera.startFollow(this.player, true, 0.08, 0.08);
    } else {
      // Đánh thức: camera đứng yên trên người chơi, script sẽ zoom ra sau
      camera.stopFollow();

      camera.centerOn(this.player.x, this.player.y);
    }
  }

  // ============================================================
  // INPUT
  // ============================================================

  private createInput() {
    this.cursors = this.input.keyboard!.createCursorKeys();

    this.keyW = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W);

    this.keyA = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A);

    this.keyS = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S);

    this.keyD = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D);

    this.keyE = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E);
  }

  // ============================================================
  // MOVEMENT
  // ============================================================

  update() {
    if (!this.controlsEnabled) {
      return;
    }

    this.checkInteraction();

    if (this.cursors.left.isDown || this.keyA.isDown) {
      this.player.move("left");

      this.playFootsteps();

      return;
    }

    if (this.cursors.right.isDown || this.keyD.isDown) {
      this.player.move("right");

      this.playFootsteps();

      return;
    }

    if (this.cursors.up.isDown || this.keyW.isDown) {
      this.player.move("up");

      this.playFootsteps();

      return;
    }

    if (this.cursors.down.isDown || this.keyS.isDown) {
      this.player.move("down");

      this.playFootsteps();

      return;
    }

    this.player.halt();

    this.audio.stop(ASSET_KEYS.audio.childFootsteps);
  }

  private playFootsteps() {
    this.audio.play(ASSET_KEYS.audio.childFootsteps, {
      loop: true,
      volume: 0.12,
    });
  }

  // ============================================================
  // INTERACTION — điểm ký ức quanh sân
  // ============================================================

  private checkInteraction() {
    const spot = this.spots.find((candidate) => {
      if (this.collected.has(candidate.name)) {
        return false;
      }

      const distance = Phaser.Math.Distance.Between(
        this.player.x,
        this.player.y,
        candidate.x,
        candidate.y,
      );

      return distance < candidate.radius;
    });

    if (spot?.name !== this.activeSpot?.name) {
      this.activeSpot = spot;

      gameEvents.emit("interaction", {
        visible: Boolean(spot),
        text: spot?.label,
      });
    }

    if (spot && Phaser.Input.Keyboard.JustDown(this.keyE)) {
      this.remember(spot);
    }
  }

  private remember(spot: MemorySpot) {
    this.setControls(false);

    this.activeSpot = undefined;

    gameEvents.emit("interaction", { visible: false });

    void storyDirector.say(spot.line).then(() => {
      if (!this.scene.isActive()) {
        return;
      }

      playSfx("chime");

      this.collected.add(spot.name);

      gameEvents.emit("hud", {
        memories: this.collected.size,
        total: this.spots.length,
      });

      this.setControls(true);
    });
  }

  shutdown() {
    this.audio?.destroy();
  }
}
