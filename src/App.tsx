import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import i18n from "./i18n";

import {
  loadAppSettings,
  saveAppSettings,
  type AppLanguage,
  type AppTheme,
} from "./services/settings";

import { getMonitors } from "./services/monitors";
import { captureMonitor } from "./services/capture";
import { openCaptureOverlay } from "./services/overlay";

import type { MonitorInfo } from "./types/monitor";
import type { CaptureResult } from "./types/capture";

import "./App.css";

const MONITOR_POLL_INTERVAL_MS = 3000;

function areMonitorsEqual(
  current: MonitorInfo[],
  next: MonitorInfo[],
): boolean {
  if (current.length !== next.length) {
    return false;
  }

  return current.every((monitor, index) => {
    const candidate = next[index];

    if (!candidate) {
      return false;
    }

    return (
      monitor.id === candidate.id &&
      monitor.name === candidate.name &&
      monitor.friendlyName === candidate.friendlyName &&
      monitor.x === candidate.x &&
      monitor.y === candidate.y &&
      monitor.width === candidate.width &&
      monitor.height === candidate.height &&
      monitor.scaleFactor === candidate.scaleFactor &&
      monitor.isPrimary === candidate.isPrimary
    );
  });
}

function App() {
  const { t } = useTranslation(undefined, { i18n });

  // Application settings
  const [language, setLanguage] = useState<AppLanguage>("ru");
  const [theme, setTheme] = useState<AppTheme>("system");

  // Initialization and language switching
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [languageChanging, setLanguageChanging] = useState(false);

  // Monitor information
  const [monitors, setMonitors] = useState<MonitorInfo[]>([]);
  const [monitorsLoading, setMonitorsLoading] = useState(true);
  const [monitorsError, setMonitorsError] = useState<string | null>(null);
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);

  // Screenshot capture
  const [captureLoading, setCaptureLoading] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [overlayLoading, setOverlayLoading] = useState(false);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  // Interface labels
  const monitorLabels =
    language === "ru"
      ? {
          title: "Подключённые мониторы",
          loading: "Поиск мониторов...",
          empty: "Мониторы не обнаружены",
          error: "Не удалось получить список мониторов",
          primary: "Основной",
          secondary: "Дополнительный",
          position: "Положение",
          scale: "Масштабирование",
          resolution: "Разрешение",
          refresh: "Обновить",
          refreshing: "Обновление...",
          automatic: "Автоматическая проверка каждые 3 секунды",
          selectMonitor: "Монитор для скриншота",
          selectPlaceholder: "Выбери монитор",
          capture: "Сделать скриншот",
          capturing: "Создание скриншота...",
          captured: "Скриншот успешно сохранён",
          capturePath: "Путь к файлу",
          captureError: "Не удалось создать скриншот",
          selectRegion: "Выделить область",
          openingOverlay: "Открытие выделения...",
          overlayError: "Не удалось открыть окно выделения",
        }
      : {
          title: "Connected monitors",
          loading: "Detecting monitors...",
          empty: "No monitors detected",
          error: "Failed to retrieve monitors",
          primary: "Primary",
          secondary: "Secondary",
          position: "Position",
          scale: "Scale factor",
          resolution: "Resolution",
          refresh: "Refresh",
          refreshing: "Refreshing...",
          automatic: "Automatic check every 3 seconds",
          selectMonitor: "Monitor for screenshot",
          selectPlaceholder: "Select a monitor",
          capture: "Take screenshot",
          capturing: "Capturing screenshot...",
          captured: "Screenshot saved successfully",
          capturePath: "File path",
          captureError: "Failed to capture screenshot",
          selectRegion: "Select area",
          openingOverlay: "Opening selection...",
          overlayError: "Failed to open selection window",
        };

  // Update monitor list and preserve selection when possible
  const applyDetectedMonitors = useCallback(
    (detectedMonitors: MonitorInfo[]) => {
      setMonitors((current) =>
        areMonitorsEqual(current, detectedMonitors)
          ? current
          : detectedMonitors,
      );

      setSelectedMonitorId((current) => {
        if (
          current !== null &&
          detectedMonitors.some((monitor) => monitor.id === current)
        ) {
          return current;
        }

        return (
          detectedMonitors.find((monitor) => monitor.isPrimary)?.id ??
          detectedMonitors[0]?.id ??
          null
        );
      });
    },
    [],
  );

  // Load application settings
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

  // Manual monitor refresh
  const refreshMonitors = useCallback(async () => {
    try {
      setMonitorsLoading(true);
      setMonitorsError(null);

      const detectedMonitors = await getMonitors();

      applyDetectedMonitors(detectedMonitors);
    } catch (error) {
      console.error("Failed to load monitors:", error);

      setMonitorsError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setMonitorsLoading(false);
    }
  }, [applyDetectedMonitors]);

  // Automatic monitor detection
  useEffect(() => {
    let isMounted = true;
    let timer: number | undefined;

    let isInitialCheck = true;
    let hasLoadedMonitors = false;

    async function checkMonitors() {
      try {
        const detectedMonitors = await getMonitors();

        if (!isMounted) return;

        hasLoadedMonitors = true;

        applyDetectedMonitors(detectedMonitors);
        setMonitorsError(null);
      } catch (error) {
        if (!isMounted) return;

        console.error("Automatic monitor detection failed:", error);

        if (!hasLoadedMonitors) {
          setMonitorsError(
            error instanceof Error ? error.message : String(error),
          );
        }
      } finally {
        if (isMounted) {
          if (isInitialCheck) {
            setMonitorsLoading(false);
            isInitialCheck = false;
          }

          timer = window.setTimeout(
            () => void checkMonitors(),
            MONITOR_POLL_INTERVAL_MS,
          );
        }
      }
    }

    void checkMonitors();

    return () => {
      isMounted = false;

      if (timer !== undefined) {
        window.clearTimeout(timer);
      }
    };
  }, [applyDetectedMonitors]);

  // Capture selected monitor
  async function handleCapture() {
    if (selectedMonitorId === null || captureLoading) {
      return;
    }

    setCaptureLoading(true);
    setCaptureError(null);
    setCaptureResult(null);

    try {
      const result = await captureMonitor(selectedMonitorId);
      setCaptureResult(result);
    } catch (error) {
      console.error("Failed to capture screenshot:", error);

      setCaptureError(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setCaptureLoading(false);
    }
  }

  // Open the selection overlay on the selected monitor
  async function handleOpenOverlay() {
    if (selectedMonitorId === null || overlayLoading) return;

    setOverlayLoading(true);
    setOverlayError(null);

    try {
      await openCaptureOverlay(selectedMonitorId);
    } catch (error) {
      console.error("Failed to open capture overlay:", error);
      setOverlayError(error instanceof Error ? error.message : String(error));
    } finally {
      setOverlayLoading(false);
    }
  }

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

  // Toggle interface language
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

        <section aria-labelledby="monitors-heading">
          <div className="row">
            <h3 id="monitors-heading">{monitorLabels.title}</h3>

            <button
              type="button"
              onClick={() => void refreshMonitors()}
              disabled={monitorsLoading}
            >
              {monitorsLoading
                ? monitorLabels.refreshing
                : monitorLabels.refresh}
            </button>
          </div>

          <p>{monitorLabels.automatic}</p>

          {monitorsLoading && (
            <p>{monitorLabels.loading}</p>
          )}

          {!monitorsLoading && monitorsError && (
            <p role="alert">
              {monitorLabels.error}: {monitorsError}
            </p>
          )}

          {!monitorsLoading &&
            !monitorsError &&
            monitors.length === 0 && (
              <p>{monitorLabels.empty}</p>
            )}

          {!monitorsLoading &&
            !monitorsError &&
            monitors.length > 0 && (
              <ul>
                {monitors.map((monitor) => (
                  <li key={monitor.id}>
                    <strong>
                      {monitor.friendlyName || monitor.name}
                    </strong>

                    <span>
                      {" "}
                      —{" "}
                      {monitor.isPrimary
                        ? monitorLabels.primary
                        : monitorLabels.secondary}
                    </span>

                    <p>
                      {monitorLabels.resolution}:{" "}
                      {monitor.width} × {monitor.height} px
                    </p>

                    <p>
                      {monitorLabels.position}:{" "}
                      X: {monitor.x}, Y: {monitor.y}
                    </p>

                    <p>
                      {monitorLabels.scale}:{" "}
                      {Math.round(monitor.scaleFactor * 100)}%
                    </p>
                  </li>
                ))}
              </ul>
            )}
        </section>

        <section aria-labelledby="capture-monitor-heading">
          <h3 id="capture-monitor-heading">
            {monitorLabels.selectMonitor}
          </h3>

          <div className="row">
            <label htmlFor="capture-monitor-select">
              {monitorLabels.selectMonitor}
            </label>

            <select
              id="capture-monitor-select"
              value={selectedMonitorId ?? ""}
              disabled={monitorsLoading || monitors.length === 0 || captureLoading}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setSelectedMonitorId(value ? Number(value) : null);
                setCaptureResult(null);
                setCaptureError(null);
              }}
            >
              <option value="">
                {monitorLabels.selectPlaceholder}
              </option>

              {monitors.map((monitor) => (
                <option key={monitor.id} value={monitor.id}>
                  {monitor.friendlyName || monitor.name}
                  {monitor.isPrimary
                    ? ` (${monitorLabels.primary})`
                    : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleOpenOverlay()}
            disabled={
              monitorsLoading ||
              monitors.length === 0 ||
              selectedMonitorId === null ||
              overlayLoading ||
              captureLoading
            }
          >
            {overlayLoading ? monitorLabels.openingOverlay : monitorLabels.selectRegion}
          </button>

          <button
            type="button"
            onClick={() => void handleCapture()}
            disabled={
              monitorsLoading ||
              monitors.length === 0 ||
              selectedMonitorId === null ||
              captureLoading
            }
          >
            {captureLoading
              ? monitorLabels.capturing
              : monitorLabels.capture}
          </button>

          {overlayError && (
            <p role="alert">
              {monitorLabels.overlayError}: {overlayError}
            </p>
          )}

          {captureError && (
            <p role="alert">
              {monitorLabels.captureError}: {captureError}
            </p>
          )}

          {captureResult && (
            <div role="status" aria-live="polite">
              <p>{monitorLabels.captured}</p>

              <p>
                {captureResult.width} × {captureResult.height} px
              </p>

              <p>
                {monitorLabels.capturePath}:{" "}
                {captureResult.filePath}
              </p>
            </div>
          )}
        </section>

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
