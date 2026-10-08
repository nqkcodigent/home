import Phaser from "phaser";
import { ASSET_KEYS } from "../assets/AssetKeys";

export type PlayerDirection = "up" | "down" | "left" | "right";

export class Player extends Phaser.Physics.Arcade.Sprite {
  readonly speed = 150;

  private direction: PlayerDirection = "down";

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, ASSET_KEYS.character.player, 0);

    scene.add.existing(this);
    scene.physics.add.existing(this);

    // Frame nguồn 32×32 và nhân vật chỉ chiếm ~14×13 px ở giữa frame, nên cần
    // phóng lên để ngang tầm một ô đất 16 px trong làng.
    this.setScale(2.2);
    this.setDepth(100);
    this.setCollideWorldBounds(true);

    // Toạ độ body tính theo pixel của frame nguồn (Phaser tự nhân với scale):
    // một khối nhỏ ngay dưới chân nhân vật.
    const body = this.body as Phaser.Physics.Arcade.Body;

    body.setSize(11, 6);
    body.setOffset(10, 17);

    this.play("player-idle-down");
  }

  move(direction: PlayerDirection): this {
    this.direction = direction;

    switch (direction) {
      case "up":
        this.setVelocity(0, -this.speed);
        break;

      case "down":
        this.setVelocity(0, this.speed);
        break;

      case "left":
        this.setVelocity(-this.speed, 0);
        break;

      case "right":
        this.setVelocity(this.speed, 0);
        break;
    }

    this.play(`player-walk-${direction}`, true);

    return this;
  }

  halt(): this {
    this.setVelocity(0);
    this.play(`player-idle-${this.direction}`, true);

    return this;
  }

  face(direction: PlayerDirection): this {
    this.direction = direction;

    this.setVelocity(0);
    this.play(`player-idle-${direction}`, true);

    return this;
  }

  getDirection(): PlayerDirection {
    return this.direction;
  }
}
