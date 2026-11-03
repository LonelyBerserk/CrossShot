import { afterEach, describe, expect, it } from "vitest";
import { applyAppTheme } from "./theme";

describe("applyAppTheme", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("applies the dark theme", () => {
    applyAppTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the light theme", () => {
    applyAppTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("restores system theme by removing the explicit theme", () => {
    document.documentElement.dataset.theme = "dark";
    applyAppTheme("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});