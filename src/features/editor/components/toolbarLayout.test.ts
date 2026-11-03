import { describe, expect, it } from "vitest";
import { calculateManualToolbarPlacement, calculateToolbarPlacement, snapToolbarToNearestEdge } from "./toolbarLayout";

const viewport = { width: 1000, height: 800 };
const dimensions = {
  horizontal: { width: 300, height: 48 },
  vertical: { width: 48, height: 300 },
};

describe("calculateToolbarPlacement", () => {
  it("places the toolbar below the selection when space is available", () => {
    expect(calculateToolbarPlacement({ x: 200, y: 100, width: 400, height: 200 }, viewport, dimensions))
      .toEqual({ side: "bottom", orientation: "horizontal", x: 250, y: 312 });
  });

  it("moves the toolbar above the selection when the bottom is unavailable", () => {
    expect(calculateToolbarPlacement({ x: 300, y: 600, width: 400, height: 150 }, viewport, dimensions))
      .toEqual({ side: "top", orientation: "horizontal", x: 350, y: 540 });
  });

  it("uses a vertical toolbar on the left when top and bottom are unavailable", () => {
    expect(calculateToolbarPlacement({ x: 500, y: 10, width: 300, height: 780 }, viewport, dimensions))
      .toEqual({ side: "left", orientation: "vertical", x: 440, y: 250 });
  });

  it("uses the right side when the left side is unavailable", () => {
    expect(calculateToolbarPlacement({ x: 10, y: 10, width: 500, height: 780 }, viewport, dimensions))
      .toEqual({ side: "right", orientation: "vertical", x: 522, y: 250 });
  });

  it("places the toolbar inside the selection as a fallback", () => {
    expect(calculateToolbarPlacement({ x: 0, y: 0, width: 1000, height: 800 }, viewport, dimensions))
      .toEqual({ side: "inside-bottom", orientation: "horizontal", x: 350, y: 740 });
  });

  it("rejects selections outside the viewport", () => {
    expect(() => calculateToolbarPlacement({ x: 900, y: 100, width: 200, height: 100 }, viewport, dimensions))
      .toThrow("Invalid toolbar selection bounds.");
  });

  it("rejects invalid toolbar dimensions", () => {
    expect(() => calculateToolbarPlacement({ x: 100, y: 100, width: 200, height: 100 }, viewport, { horizontal: { width: 0, height: 48 }, vertical: dimensions.vertical }))
      .toThrow("Invalid toolbar dimensions.");
  });
});

describe("calculateManualToolbarPlacement", () => {
  it("pins the toolbar outside the requested bottom edge when space is available", () => {
    expect(calculateManualToolbarPlacement({ x: 200, y: 100, width: 400, height: 200 }, viewport, dimensions, "bottom"))
      .toEqual({ side: "bottom", orientation: "horizontal", x: 250, y: 312 });
  });

  it("pins the toolbar inside the top edge when there is no outside space", () => {
    expect(calculateManualToolbarPlacement({ x: 0, y: 0, width: 1000, height: 800 }, viewport, dimensions, "top"))
      .toEqual({ side: "inside-top", orientation: "horizontal", x: 350, y: 12 });
  });

  it("pins the toolbar inside the left edge and switches to vertical orientation", () => {
    expect(calculateManualToolbarPlacement({ x: 0, y: 0, width: 1000, height: 800 }, viewport, dimensions, "left"))
      .toEqual({ side: "inside-left", orientation: "vertical", x: 12, y: 250 });
  });

  it("pins the toolbar inside the right edge", () => {
    expect(calculateManualToolbarPlacement({ x: 0, y: 0, width: 1000, height: 800 }, viewport, dimensions, "right"))
      .toEqual({ side: "inside-right", orientation: "vertical", x: 940, y: 250 });
  });
});

describe("snapToolbarToNearestEdge", () => {
  it("snaps a dropped toolbar to the nearest outside edge", () => {
    expect(snapToolbarToNearestEdge({ x: 610, y: 205 }, { x: 200, y: 200, width: 400, height: 300 }, viewport, dimensions))
      .toEqual({ side: "right", orientation: "vertical", x: 612, y: 200 });
  });

  it("snaps a toolbar inside a full-screen selection to the nearest edge", () => {
    expect(snapToolbarToNearestEdge({ x: 10, y: 300 }, { x: 0, y: 0, width: 1000, height: 800 }, viewport, dimensions))
      .toEqual({ side: "inside-left", orientation: "vertical", x: 12, y: 250 });
  });

  it("rejects a non-finite dragged position", () => {
    expect(() => snapToolbarToNearestEdge({ x: Number.NaN, y: 100 }, { x: 0, y: 0, width: 1000, height: 800 }, viewport, dimensions))
      .toThrow("Invalid proposed toolbar position.");
  });
});