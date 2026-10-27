import i18n, { type BackendModule } from "i18next";
import { initReactI18next } from "react-i18next";

type Language = "en" | "de";

const languageBackend: BackendModule = {
  type: "backend",
  init() {},
  read(language, namespace, callback) {
    if (namespace !== "translation") {
      callback(new Error("Unsupported translation namespace."), null);
      return;
    }
    const resource = language.startsWith("de")
      ? import("./locales/de")
      : language.startsWith("en")
        ? import("./locales/en")
        : undefined;
    if (!resource) {
      callback(new Error("Unsupported language."), null);
      return;
    }
    void resource
      .then(({ default: translation }) => callback(null, translation.translation))
      .catch((error: unknown) => callback(error instanceof Error ? error : String(error), null));
  },
};

const storedLanguage = localStorage.getItem("kxnodesk-language");
const preferredLanguage: Language = (storedLanguage ?? navigator.language).toLowerCase().startsWith("de") ? "de" : "en";

export const i18nReady = i18n.use(languageBackend).use(initReactI18next).init({
  lng: preferredLanguage,
  fallbackLng: false,
  supportedLngs: ["en", "de"],
  load: "languageOnly",
  ns: ["translation"],
  defaultNS: "translation",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  localStorage.setItem("kxnodesk-language", language);
  document.documentElement.lang = language;
});

void i18nReady.then(() => {
  document.documentElement.lang = i18n.language;
});

export { i18n };
