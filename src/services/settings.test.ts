import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { load } from "@tauri-apps/plugin-store";

import {
  DEFAULT_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from "./settings";

// Mock Tauri Store Plugin
vi.mock("@tauri-apps/plugin-store", () => ({
  load: vi.fn(),
}));

// Mock Store instance
const mockStore = {
  get: vi.fn(),
  set: vi.fn(),
  save: vi.fn(),
};

const mockedLoad = vi.mocked(load);

describe("Application settings service", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock behavior
    mockStore.get.mockResolvedValue(undefined);
    mockStore.set.mockResolvedValue(undefined);
    mockStore.save.mockResolvedValue(undefined);

    mockedLoad.mockResolvedValue(
      mockStore as unknown as Awaited<ReturnType<typeof load>>,
    );
  });

  it("returns default settings when nothing is saved", async () => {
    const settings = await loadAppSettings();

    expect(settings).toEqual(DEFAULT_SETTINGS);

    expect(mockStore.get).toHaveBeenCalledWith("settings");
  });

  it("loads valid saved settings", async () => {
    mockStore.get.mockResolvedValue({
      language: "en",
      theme: "dark",
    });

    const settings = await loadAppSettings();

    expect(settings).toEqual({
      language: "en",
      theme: "dark",
    });
  });

  it("falls back to defaults for unsupported values", async () => {
    mockStore.get.mockResolvedValue({
      language: "fr",
      theme: "blue",
    });

    const settings = await loadAppSettings();

    expect(settings).toEqual({
      language: "ru",
      theme: "system",
    });
  });

  it("saves settings and commits them to the store", async () => {
    const settings: AppSettings = {
      language: "en",
      theme: "dark",
    };

    await saveAppSettings(settings);

    expect(mockStore.set).toHaveBeenCalledWith(
      "settings",
      settings,
    );

    expect(mockStore.save).toHaveBeenCalledOnce();
  });
});
