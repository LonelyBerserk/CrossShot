import type { AppTheme } from "./settings";

/** Applies the selected application theme to the current WebView. */
export function applyAppTheme(theme: AppTheme): void {
  const root = document.documentElement;

  if (theme === "system") {
    delete root.dataset.theme;
    return;
  }

  root.dataset.theme = theme;
}