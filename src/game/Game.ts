import Phaser from "phaser";

import { gameConfig } from "./config";

/**
 * Game bootstrapping: constructor chỉ giữ kế hoạch, start() khởi tạo
 * Phaser SAU khi #phaser-container đã tồn tại (React mount xong).
 * start() idempotent — an toàn với React StrictMode double-effect.
 */
export class Game {
  private game: Phaser.Game | undefined;

  start() {
    if (this.game) {
      return;
    }

    this.game = new Phaser.Game(gameConfig);
  }

  destroy() {
    this.game?.destroy(true, false);

    this.game = undefined;
  }
}

export const game = new Game();
