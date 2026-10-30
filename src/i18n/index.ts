import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import { ru } from "./locales/ru";
import { en } from "./locales/en";

// Available application translations
const resources = {
  ru: {
    translation: ru,
  },
  en: {
    translation: en,
  },
} as const;

// Initialize internationalization
void i18n
  .use(initReactI18next)
  .init({
    resources,

    // Default application language
    lng: "ru",

    // Fallback language when a translation is missing
    fallbackLng: "en",

    // Supported application languages
    supportedLngs: ["ru", "en"],

    // React handles escaping automatically
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
