export interface ToolbarRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ToolbarViewport {
  readonly width: number;
  readonly height: number;
}

export interface ToolbarSize {
  readonly width: number;
  readonly height: number;
}

export interface ToolbarDimensions {
  readonly horizontal: ToolbarSize;
  readonly vertical: ToolbarSize;
}

export interface ToolbarPosition {
  readonly x: number;
  readonly y: number;
}

export type ToolbarEdge = "top" | "bottom" | "left" | "right";
export type ToolbarSide = ToolbarEdge | `inside-${ToolbarEdge}`;
export type ToolbarOrientation = "horizontal" | "vertical";

export interface ToolbarPlacement {
  readonly side: ToolbarSide;
  readonly orientation: ToolbarOrientation;
  readonly x: number;
  readonly y: number;
}

const DEFAULT_GAP = 12;
const DEFAULT_PADDING = 12;
const EDGES: readonly ToolbarEdge[] = ["top", "bottom", "left", "right"];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampToViewport(value: number, viewportSize: number, elementSize: number, padding: number): number {
  const minimum = Math.min(padding, Math.max(0, viewportSize - elementSize));
  const maximum = Math.max(minimum, viewportSize - padding - elementSize);
  return clamp(value, minimum, maximum);
}

function centerWithinSelection(center: number, selectionStart: number, selectionSize: number, elementSize: number, padding: number, viewportSize: number): number {
  const minimum = selectionStart + padding;
  const maximum = selectionStart + selectionSize - padding - elementSize;

  if (maximum >= minimum) {
    return clamp(center - elementSize / 2, minimum, maximum);
  }

  return clampToViewport(center - elementSize / 2, viewportSize, elementSize, padding);
}

function fitsViewport(x: number, y: number, size: ToolbarSize, viewport: ToolbarViewport, padding: number): boolean {
  return x >= padding && y >= padding &&
    x + size.width <= viewport.width - padding &&
    y + size.height <= viewport.height - padding;
}

function validateToolbarInputs(selection: ToolbarRect, viewport: ToolbarViewport, dimensions: ToolbarDimensions, gap: number, padding: number): void {
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error("Invalid toolbar viewport dimensions.");
  }

  if (
    !Number.isFinite(selection.x) || !Number.isFinite(selection.y) ||
    !Number.isFinite(selection.width) || !Number.isFinite(selection.height) ||
    !Number.isFinite(selection.x + selection.width) || !Number.isFinite(selection.y + selection.height) ||
    selection.width <= 0 || selection.height <= 0 ||
    selection.x < 0 || selection.y < 0 ||
    selection.x + selection.width > viewport.width ||
    selection.y + selection.height > viewport.height
  ) {
    throw new Error("Invalid toolbar selection bounds.");
  }

  for (const size of [dimensions.horizontal, dimensions.vertical]) {
    if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
      throw new Error("Invalid toolbar dimensions.");
    }
  }

  if (!Number.isFinite(gap) || gap < 0 || !Number.isFinite(padding) || padding < 0) {
    throw new Error("Invalid toolbar spacing.");
  }
}

/** Selects the first available automatic toolbar position. */
export function calculateToolbarPlacement(selection: ToolbarRect, viewport: ToolbarViewport, dimensions: ToolbarDimensions, gap = DEFAULT_GAP, padding = DEFAULT_PADDING): ToolbarPlacement {
  validateToolbarInputs(selection, viewport, dimensions, gap, padding);

  const horizontal = dimensions.horizontal;
  const vertical = dimensions.vertical;
  const centerX = selection.x + selection.width / 2;
  const centerY = selection.y + selection.height / 2;
  const horizontalX = centerWithinSelection(centerX, selection.x, selection.width, horizontal.width, padding, viewport.width);
  const verticalY = centerWithinSelection(centerY, selection.y, selection.height, vertical.height, padding, viewport.height);

  const bottomY = selection.y + selection.height + gap;
  if (fitsViewport(horizontalX, bottomY, horizontal, viewport, padding)) {
    return { side: "bottom", orientation: "horizontal", x: horizontalX, y: bottomY };
  }

  const topY = selection.y - gap - horizontal.height;
  if (fitsViewport(horizontalX, topY, horizontal, viewport, padding)) {
    return { side: "top", orientation: "horizontal", x: horizontalX, y: topY };
  }

  const leftX = selection.x - gap - vertical.width;
  if (fitsViewport(leftX, verticalY, vertical, viewport, padding)) {
    return { side: "left", orientation: "vertical", x: leftX, y: verticalY };
  }

  const rightX = selection.x + selection.width + gap;
  if (fitsViewport(rightX, verticalY, vertical, viewport, padding)) {
    return { side: "right", orientation: "vertical", x: rightX, y: verticalY };
  }

  const insideY = clampToViewport(selection.y + selection.height - padding - horizontal.height, viewport.height, horizontal.height, padding);
  return {
    side: "inside-bottom",
    orientation: "horizontal",
    x: horizontalX,
    y: insideY,
  };
}

/**
 * Places a manually positioned toolbar against the requested selection edge.
 * Uses the outside position when possible; otherwise pins it inside the selection.
 */
export function calculateManualToolbarPlacement(selection: ToolbarRect, viewport: ToolbarViewport, dimensions: ToolbarDimensions, edge: ToolbarEdge, gap = DEFAULT_GAP, padding = DEFAULT_PADDING): ToolbarPlacement {
  validateToolbarInputs(selection, viewport, dimensions, gap, padding);

  const centerX = selection.x + selection.width / 2;
  const centerY = selection.y + selection.height / 2;
  const horizontal = dimensions.horizontal;
  const vertical = dimensions.vertical;

  if (edge === "top" || edge === "bottom") {
    const x = centerWithinSelection(centerX, selection.x, selection.width, horizontal.width, padding, viewport.width);
    const outsideY = edge === "top"
      ? selection.y - gap - horizontal.height
      : selection.y + selection.height + gap;

    if (fitsViewport(x, outsideY, horizontal, viewport, padding)) {
      return { side: edge, orientation: "horizontal", x, y: outsideY };
    }

    const insideY = edge === "top"
      ? selection.y + padding
      : selection.y + selection.height - padding - horizontal.height;

    return {
      side: `inside-${edge}` as ToolbarSide,
      orientation: "horizontal",
      x,
      y: clampToViewport(insideY, viewport.height, horizontal.height, padding),
    };
  }

  const y = centerWithinSelection(centerY, selection.y, selection.height, vertical.height, padding, viewport.height);
  const outsideX = edge === "left"
    ? selection.x - gap - vertical.width
    : selection.x + selection.width + gap;

  if (fitsViewport(outsideX, y, vertical, viewport, padding)) {
    return { side: edge, orientation: "vertical", x: outsideX, y };
  }

  const insideX = edge === "left"
    ? selection.x + padding
    : selection.x + selection.width - padding - vertical.width;

  return {
    side: `inside-${edge}` as ToolbarSide,
    orientation: "vertical",
    x: clampToViewport(insideX, viewport.width, vertical.width, padding),
    y,
  };
}

/** Snaps a dropped toolbar to the nearest of the four selection edges. */
export function snapToolbarToNearestEdge(proposed: ToolbarPosition, selection: ToolbarRect, viewport: ToolbarViewport, dimensions: ToolbarDimensions, gap = DEFAULT_GAP, padding = DEFAULT_PADDING): ToolbarPlacement {
  if (!Number.isFinite(proposed.x) || !Number.isFinite(proposed.y)) {
    throw new Error("Invalid proposed toolbar position.");
  }

  const candidates = EDGES.map((edge) =>
    calculateManualToolbarPlacement(selection, viewport, dimensions, edge, gap, padding),
  );

  let nearest = candidates[0];
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const deltaX = candidate.x - proposed.x;
    const deltaY = candidate.y - proposed.y;
    const distance = deltaX * deltaX + deltaY * deltaY;

    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }

  return nearest;
}