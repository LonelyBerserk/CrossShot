import type { CapturedRgbaFrame } from "../../../types/capture";
import type { EditorBounds, EditorDocument, EditorSession } from "./EditorDocument";

/**
 * Creates an editor session from the existing full-desktop RGBA frame.
 * The source image is shared without copying or modifying its pixels.
 * Selection coordinates must be expressed in source image pixels.
 */
export function createEditorSession(
  frame: CapturedRgbaFrame,
  selection: EditorBounds,
): EditorSession {
  const { width, height, imageData } = frame;

  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid source image dimensions.");
  }

  if (imageData.width !== width || imageData.height !== height) {
    throw new Error("RGBA frame dimensions do not match ImageData.");
  }

  const expectedByteLength = width * height * 4;
  if (!Number.isSafeInteger(expectedByteLength) || imageData.data.length !== expectedByteLength) {
    throw new Error("RGBA frame pixel buffer has an invalid size.");
  }

  if (
    !Number.isFinite(selection.x) ||
    !Number.isFinite(selection.y) ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height) ||
    selection.width <= 0 ||
    selection.height <= 0
  ) {
    throw new Error("Invalid editor selection bounds.");
  }

  const left = Math.max(0, Math.min(width, Math.round(selection.x)));
  const top = Math.max(0, Math.min(height, Math.round(selection.y)));
  const right = Math.max(0, Math.min(width, Math.round(selection.x + selection.width)));
  const bottom = Math.max(0, Math.min(height, Math.round(selection.y + selection.height)));

  if (right <= left || bottom <= top) {
    throw new Error("Editor selection does not intersect the source image.");
  }

  const normalizedSelection: EditorBounds = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };

  const document: EditorDocument = {
    version: 1,
    id: crypto.randomUUID(),
    width,
    height,
    objects: [],
  };

  return {
    sourceImage: imageData,
    selection: normalizedSelection,
    document,
  };
}