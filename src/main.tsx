import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";

import { game } from "./game/Game";
import "./styles/game.css";
import "./styles/dialog.css";
import "./styles/hub.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy();
  });
}
