import { load } from "@tauri-apps/plugin-store";

// Supported application languages
export type AppLanguage = "ru" | "en";

// Supported application themes
export type AppTheme = "system" | "dark" | "light";

// Application settings structure
export interface AppSettings {
  language: AppLanguage;
  theme: AppTheme;
}

// Default application settings
export const DEFAULT_SETTINGS: AppSettings = {
  language: "ru",
  theme: "system",
};

// Store configuration
const CONFIG_FILE = "config.json";
const SETTINGS_KEY = "settings";

// Store instance is initialized only once
let storePromise: ReturnType<typeof load> | null = null;

async function getStore() {
  if (!storePromise) {
    storePromise = load(CONFIG_FILE, {
      autoSave: 300,
    });
  }

  return storePromise;
}

// Load and validate application settings
export async function loadAppSettings(): Promise<AppSettings> {
  const store = await getStore();

  const savedSettings =
    await store.get<Partial<AppSettings>>(SETTINGS_KEY);

  const language: AppLanguage =
    savedSettings?.language === "en" ? "en" : "ru";

  const theme: AppTheme =
    savedSettings?.theme === "dark" ||
    savedSettings?.theme === "light"
      ? savedSettings.theme
      : "system";

  return {
    language,
    theme,
  };
}

// Save application settings
export async function saveAppSettings(
  settings: AppSettings,
): Promise<void> {
  const store = await getStore();

  await store.set(SETTINGS_KEY, settings);
  await store.save();
}
