import { describe, expect, it } from "vitest";
import { overlaySelectionToSourceBounds } from "./coordinates";

describe("overlaySelectionToSourceBounds", () => {
  it("converts CSS coordinates into physical source pixels", () => {
    expect(overlaySelectionToSourceBounds(
      { left: 100, top: 50, width: 200, height: 100 },
      { width: 1000, height: 500 },
      { width: 3000, height: 1000 },
    )).toEqual({ x: 300, y: 100, width: 600, height: 200 });
  });

  it("clips selections to the viewport boundaries", () => {
    expect(overlaySelectionToSourceBounds(
      { left: -10, top: 10, width: 30, height: 20 },
      { width: 100, height: 100 },
      { width: 200, height: 200 },
    )).toEqual({ x: 0, y: 20, width: 40, height: 40 });
  });

  it("rejects selections outside the viewport", () => {
    expect(() => overlaySelectionToSourceBounds(
      { left: 110, top: 10, width: 20, height: 20 },
      { width: 100, height: 100 },
      { width: 200, height: 200 },
    )).toThrow("Selection does not intersect the source image.");
  });

  it("rejects invalid viewport dimensions", () => {
    expect(() => overlaySelectionToSourceBounds(
      { left: 10, top: 10, width: 20, height: 20 },
      { width: 0, height: 100 },
      { width: 200, height: 200 },
    )).toThrow("Invalid overlay viewport dimensions.");
  });
});