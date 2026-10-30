import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import i18n from "./i18n";

import {
  loadAppSettings,
  saveAppSettings,
  type AppLanguage,
  type AppTheme,
} from "./services/settings";

import "./App.css";

function App() {
  // Explicitly bind React to the application's i18next instance
  const { t } = useTranslation(undefined, { i18n });

  // Application settings
  const [language, setLanguage] = useState<AppLanguage>("ru");
  const [theme, setTheme] = useState<AppTheme>("system");

  // Initialization and language switching states
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);

  // Load settings when application starts
  useEffect(() => {
    let isMounted = true;

    async function initializeSettings() {
      try {
        const settings = await loadAppSettings();

        if (!isMounted) return;

        await i18n.changeLanguage(settings.language);

        if (!isMounted) return;

        setLanguage(settings.language);
        setTheme(settings.theme);
      } catch (error) {
        console.error("Failed to load application settings:", error);
      } finally {
        if (isMounted) {
          setSettingsLoaded(true);
        }
      }
    }

    void initializeSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  // Apply selected theme
  useEffect(() => {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = theme;
    }
  }, [theme]);

  // Save settings whenever language or theme changes
  useEffect(() => {
    if (!settingsLoaded) return;

    void saveAppSettings({
      language,
      theme,
    }).catch((error) => {
      console.error("Failed to save application settings:", error);
    });
  }, [language, theme, settingsLoaded]);

  // Toggle between Russian and English
  async function toggleLanguage() {
    if (!settingsLoaded || languageChanging) return;

    const nextLanguage: AppLanguage =
      language === "ru" ? "en" : "ru";

    setLanguageChanging(true);

    try {
      await i18n.changeLanguage(nextLanguage);
      setLanguage(nextLanguage);
    } catch (error) {
      console.error("Failed to change application language:", error);
    } finally {
      setLanguageChanging(false);
    }
  }

  return (
    <main className="container">
      <header className="row">
        <h1>{t("app.name")}</h1>

        <button
          type="button"
          onClick={toggleLanguage}
          disabled={!settingsLoaded || languageChanging}
        >
          {languageChanging
            ? "..."
            : language === "ru"
              ? "EN"
              : "RU"}
        </button>
      </header>

      <p>{t("app.tagline")}</p>

      <section>
        <h2>{t("capture.title")}</h2>
        <p>{t("capture.area")}</p>

        <h2>{t("recording.title")}</h2>

        <h2>{t("settings.title")}</h2>

        <div className="row">
          <label htmlFor="theme-select">
            {t("settings.theme")}
          </label>

          <select
            id="theme-select"
            value={theme}
            disabled={!settingsLoaded}
            onChange={(event) =>
              setTheme(event.currentTarget.value as AppTheme)
            }
          >
            <option value="system">{t("settings.system")}</option>
            <option value="dark">{t("settings.dark")}</option>
            <option value="light">{t("settings.light")}</option>
          </select>
        </div>

        <h2>{t("about.title")}</h2>

        <p>{t("status.ready")}</p>
      </section>
    </main>
  );
}

export default App;
