import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./styles.css";
import { configurePwaUpdateHandler, notifyPwaUpdateAvailable, notifyPwaUpdateFailure } from "./data/pwa-update-state";
import { i18nReady } from "./i18n";

configurePwaUpdateHandler(registerSW({
  immediate: true,
  onNeedRefresh: notifyPwaUpdateAvailable,
  onRegisterError: notifyPwaUpdateFailure,
}));

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("The application root element is missing.");

void i18nReady
  .then(() => {
    ReactDOM.createRoot(rootElement).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    console.error("Kxno Desk could not load its language resources.", error);
    rootElement.textContent = "Kxno Desk could not load its language resources. Reload when app files are available.";
  });
