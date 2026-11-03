import type { EditorBounds } from "./EditorDocument";

export interface OverlaySelectionRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

export interface SourceImageSize {
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Converts a selection from CSS viewport coordinates into source image pixels.
 * X and Y are scaled independently to support different display scaling factors.
 */
export function overlaySelectionToSourceBounds(
  selection: OverlaySelectionRect,
  viewport: ViewportSize,
  source: SourceImageSize,
): EditorBounds {
  if (
    !Number.isFinite(viewport.width) ||
    !Number.isFinite(viewport.height) ||
    viewport.width <= 0 ||
    viewport.height <= 0
  ) {
    throw new Error("Invalid overlay viewport dimensions.");
  }

  if (
    !Number.isSafeInteger(source.width) ||
    !Number.isSafeInteger(source.height) ||
    source.width <= 0 ||
    source.height <= 0
  ) {
    throw new Error("Invalid source image dimensions.");
  }

  const selectionRight = selection.left + selection.width;
  const selectionBottom = selection.top + selection.height;

  if (
    !Number.isFinite(selection.left) ||
    !Number.isFinite(selection.top) ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height) ||
    !Number.isFinite(selectionRight) ||
    !Number.isFinite(selectionBottom) ||
    selection.width <= 0 ||
    selection.height <= 0
  ) {
    throw new Error("Invalid overlay selection bounds.");
  }

  const scaleX = source.width / viewport.width;
  const scaleY = source.height / viewport.height;

  const left = Math.round(clamp(selection.left, 0, viewport.width) * scaleX);
  const top = Math.round(clamp(selection.top, 0, viewport.height) * scaleY);
  const right = Math.round(clamp(selectionRight, 0, viewport.width) * scaleX);
  const bottom = Math.round(clamp(selectionBottom, 0, viewport.height) * scaleY);

  const x = clamp(left, 0, source.width);
  const y = clamp(top, 0, source.height);
  const endX = clamp(right, 0, source.width);
  const endY = clamp(bottom, 0, source.height);

  if (endX <= x || endY <= y) {
    throw new Error("Selection does not intersect the source image.");
  }

  return {
    x,
    y,
    width: endX - x,
    height: endY - y,
  };
}