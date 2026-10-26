import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
import { configurePwaUpdateHandler, notifyPwaUpdateAvailable, notifyPwaUpdateFailure } from "./data/pwa-update-state";

configurePwaUpdateHandler(registerSW({
  immediate: true,
  onNeedRefresh: notifyPwaUpdateAvailable,
  onRegisterError: notifyPwaUpdateFailure,
}));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
