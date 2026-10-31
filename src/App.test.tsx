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

import { getMonitors } from "./services/monitors";
import { captureMonitor } from "./services/capture";
import { openCaptureOverlay } from "./services/overlay";

import type { MonitorInfo } from "./types/monitor";

vi.mock("./services/settings", () => ({
  loadAppSettings: vi.fn(),
  saveAppSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./services/monitors", () => ({
  getMonitors: vi.fn(),
}));

vi.mock("./services/capture", () => ({
  captureMonitor: vi.fn(),
}));

vi.mock("./services/overlay", () => ({
  openCaptureOverlay: vi.fn(),
}));

const mockLoadSettings = vi.mocked(loadAppSettings);
const mockSaveSettings = vi.mocked(saveAppSettings);
const mockGetMonitors = vi.mocked(getMonitors);
const mockCaptureMonitor = vi.mocked(captureMonitor);
const mockOpenCaptureOverlay = vi.mocked(openCaptureOverlay);

const mockMonitors: MonitorInfo[] = [
  {
    id: 3606617,
    name: "\\\\.\\DISPLAY1",
    friendlyName: "SUN-M27BF102",
    x: 0,
    y: 0,
    width: 1920,
    height: 1080,
    scaleFactor: 1,
    isPrimary: true,
  },
  {
    id: 546768481,
    name: "\\\\.\\DISPLAY2",
    friendlyName: "bbk TV",
    x: 0,
    y: -1080,
    width: 1920,
    height: 1080,
    scaleFactor: 1.5,
    isPrimary: false,
  },
];

async function waitForI18nInitialization() {
  if (i18n.isInitialized) {
    return;
  }

  await new Promise<void>((resolve) => {
    i18n.on("initialized", () => resolve());
  });
}

async function renderApp() {
  await waitForI18nInitialization();
  await i18n.changeLanguage("ru");

  return render(<App />);
}

describe("CrossShot App", () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    mockLoadSettings.mockResolvedValue({
      language: "ru",
      theme: "system",
    });

    mockSaveSettings.mockResolvedValue(undefined);
    mockGetMonitors.mockResolvedValue(mockMonitors);
    mockOpenCaptureOverlay.mockResolvedValue(undefined);

    mockCaptureMonitor.mockResolvedValue({
      filePath: "C:\\Users\\berserk\\Pictures\\CrossShot\\crossshot_test.png",
      monitorId: 3606617,
      width: 1920,
      height: 1080,
    });

    await waitForI18nInitialization();
    await i18n.changeLanguage("ru");

    delete document.documentElement.dataset.theme;
  });

  afterEach(() => {
    cleanup();
    delete document.documentElement.dataset.theme;
  });

  it("loads saved language and theme on startup", async () => {
    mockLoadSettings.mockResolvedValue({
      language: "en",
      theme: "dark",
    });

    await renderApp();

    expect(
      await screen.findByText("Screenshots and screen recording"),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("button", { name: "RU" }),
    ).toBeInTheDocument();

    expect(
      await screen.findByText("SUN-M27BF102"),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: "bbk TV" }),
    ).toBeInTheDocument();

    expect(mockGetMonitors).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      expect(i18n.resolvedLanguage).toBe("en");
      expect(document.documentElement.dataset.theme).toBe("dark");
    });
  });

  it("switches language and saves the new setting", async () => {
    const user = userEvent.setup();

    await renderApp();

    const languageButton = await screen.findByRole(
      "button",
      { name: "EN" },
    );

    await waitFor(() => {
      expect(languageButton).toBeEnabled();
    });

    await user.click(languageButton);

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

  it("refreshes the monitor list when requested", async () => {
    const user = userEvent.setup();

    mockGetMonitors
      .mockResolvedValueOnce(mockMonitors)
      .mockResolvedValueOnce([mockMonitors[0]]);

    await renderApp();

    expect(
      await screen.findByRole("option", { name: "bbk TV" }),
    ).toBeInTheDocument();

    const refreshButton = await screen.findByRole(
      "button",
      { name: "Обновить" },
    );

    await user.click(refreshButton);

    await waitFor(() => {
      expect(mockGetMonitors).toHaveBeenCalledTimes(2);
      expect(screen.queryByText("bbk TV")).not.toBeInTheDocument();
    });

    expect(
      screen.getByText("SUN-M27BF102"),
    ).toBeInTheDocument();
  });

  it("captures the selected monitor and displays the result", async () => {
    const user = userEvent.setup();

    await renderApp();

    expect(
      await screen.findByRole("option", { name: "bbk TV" }),
    ).toBeInTheDocument();

    const monitorSelect = screen.getByRole(
      "combobox",
      { name: "Монитор для скриншота" },
    );

    await user.selectOptions(
      monitorSelect,
      String(mockMonitors[1].id),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Сделать скриншот",
      }),
    );

    await waitFor(() => {
      expect(mockCaptureMonitor).toHaveBeenCalledWith(
        mockMonitors[1].id,
      );
    });

    expect(
      await screen.findByText(
        "Скриншот успешно сохранён",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/crossshot_test\.png/),
    ).toBeInTheDocument();
  });

  it("opens the selection overlay on the selected monitor", async () => {
    const user = userEvent.setup();

    await renderApp();

    await screen.findByRole("option", { name: "bbk TV" });

    const monitorSelect = screen.getByRole("combobox", {
      name: "Монитор для скриншота",
    });

    await user.selectOptions(monitorSelect, String(mockMonitors[1].id));

    await user.click(
      screen.getByRole("button", { name: "Выделить область" }),
    );

    await waitFor(() => {
      expect(mockOpenCaptureOverlay).toHaveBeenCalledWith(
        mockMonitors[1].id,
      );
    });
  });
});
