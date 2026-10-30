import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  cleanup,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import userEvent from "@testing-library/user-event";

import App from "./App";
import i18n from "./i18n";

import {
  loadAppSettings,
  saveAppSettings,
} from "./services/settings";

// Mock persistent settings storage
vi.mock("./services/settings", () => ({
  loadAppSettings: vi.fn(),
  saveAppSettings: vi.fn().mockResolvedValue(undefined),
}));

const mockLoadSettings = vi.mocked(loadAppSettings);
const mockSaveSettings = vi.mocked(saveAppSettings);

// Wait for i18next initialization
async function waitForI18nInitialization() {
  if (i18n.isInitialized) {
    return;
  }

  await new Promise<void>((resolve) => {
    i18n.on("initialized", () => resolve());
  });
}

// Render application with production i18next instance
async function renderApp() {
  await waitForI18nInitialization();
  await i18n.changeLanguage("ru");

  return render(<App />);
}

describe("CrossShot App", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    mockLoadSettings.mockResolvedValue({
      language: "ru",
      theme: "system",
    });

    mockSaveSettings.mockResolvedValue(undefined);

    await waitForI18nInitialization();
    await i18n.changeLanguage("ru");

    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
  });

  it("loads saved language and theme on startup", async () => {
    // Arrange
    mockLoadSettings.mockResolvedValue({
      language: "en",
      theme: "dark",
    });

    // Act
    await renderApp();

    // Assert
    expect(
      await screen.findByText("Screenshots and screen recording"),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "RU" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe("en");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("switches language and saves the new setting", async () => {
    // Arrange
    const user = userEvent.setup();

    await renderApp();

    const languageButton = await screen.findByRole(
      "button",
      { name: "EN" },
    );

    await waitFor(() => {
      expect(languageButton).toBeEnabled();
    });

    // Act
    await user.click(languageButton);

    // Assert
    expect(
      await screen.findByText("Screenshots and screen recording"),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "RU" }),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe("en");

      expect(mockSaveSettings).toHaveBeenLastCalledWith({
        language: "en",
        theme: "system",
      });
    });
  });
});
