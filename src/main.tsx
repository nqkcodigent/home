import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import { worldGame } from "./world/WorldGame";
import "./styles/theme.css";
import "./styles/game.css";
import "./styles/dialog.css";
import "./styles/hub.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.DEV) {
  // Tay nắm gỡ lỗi: mở console là soi được bối cảnh hiện tại, vị trí nhân vật,
  // số hồi ký… Chỉ có ở chế độ dev, không lọt vào bản build.
  (window as Window & { worldGame?: typeof worldGame }).worldGame = worldGame;
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    worldGame.destroy();
  });
}
