import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import { progress } from "./world/progress";
import { worldGame } from "./world/WorldGame";
import "./styles/theme.css";
import "./styles/game.css";
import "./styles/dialog.css";
import "./styles/journal.css";
import "./styles/kite.css";
import "./styles/play.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.DEV) {
  // Tay nắm gỡ lỗi: mở console là soi được bối cảnh hiện tại, vị trí nhân vật,
  // sổ hồi ký… Chỉ có ở chế độ dev, không lọt vào bản build.
  const debug = window as Window & {
    worldGame?: typeof worldGame;
    progress?: typeof progress;
  };

  debug.worldGame = worldGame;
  debug.progress = progress;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    worldGame.destroy();
  });
}
