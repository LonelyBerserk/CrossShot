import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CapturedRgbaFrame } from "../../../types/capture";
import { createEditorSession } from "./createEditorSession";

function createFrame(width = 4, height = 3): CapturedRgbaFrame {
  const imageData = {
    width,
    height,
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData;

  return { imageData, width, height };
}

describe("createEditorSession", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: () => "test-document-id" });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("preserves the original ImageData reference", () => {
    const frame = createFrame();
    const session = createEditorSession(frame, { x: 1, y: 1, width: 2, height: 1 });

    expect(session.sourceImage).toBe(frame.imageData);
    expect(session.document.width).toBe(frame.width);
    expect(session.document.height).toBe(frame.height);
    expect(session.document.objects).toEqual([]);
    expect(session.document.version).toBe(1);
    expect(session.document.id).toBe("test-document-id");
  });

  it("normalizes selection coordinates to integer source pixels", () => {
    const session = createEditorSession(createFrame(), {
      x: 1.2,
      y: 0.7,
      width: 2.4,
      height: 1.8,
    });

    expect(session.selection).toEqual({ x: 1, y: 1, width: 3, height: 2 });
  });

  it("clips selection to source image boundaries", () => {
    const session = createEditorSession(createFrame(), {
      x: -2,
      y: 1,
      width: 4,
      height: 10,
    });

    expect(session.selection).toEqual({ x: 0, y: 1, width: 2, height: 2 });
  });

  it("rejects mismatched frame dimensions", () => {
    const frame = createFrame();

    expect(() => createEditorSession(
      { ...frame, width: 3 },
      { x: 0, y: 0, width: 2, height: 2 },
    )).toThrow("RGBA frame dimensions do not match ImageData.");
  });

  it("rejects an invalid pixel buffer", () => {
    const frame = {
      width: 2,
      height: 2,
      imageData: {
        width: 2,
        height: 2,
        data: new Uint8ClampedArray(3),
      } as ImageData,
    };

    expect(() => createEditorSession(
      frame,
      { x: 0, y: 0, width: 1, height: 1 },
    )).toThrow("RGBA frame pixel buffer has an invalid size.");
  });

  it("rejects selections outside the source image", () => {
    expect(() => createEditorSession(
      createFrame(),
      { x: 10, y: 10, width: 2, height: 2 },
    )).toThrow("Editor selection does not intersect the source image.");
  });
});