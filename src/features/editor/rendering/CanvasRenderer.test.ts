import { describe, expect, it, vi } from "vitest";
import type { BrushStroke, EditorObject } from "../model/EditorDocument";
import { renderEditorObjects } from "./CanvasRenderer";

function createMockContext(width = 100, height = 100) {
  const canvas = { width, height } as HTMLCanvasElement;
  const context = {
    canvas,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    ellipse: vi.fn(),
    closePath: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  return context;
}

function createScratchCanvas(context: CanvasRenderingContext2D): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
}

function createBrush(erasures: BrushStroke["erasures"] = []): BrushStroke {
  return {
    id: "brush-1",
    type: "brush-stroke",
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    color: "#ff0000",
    width: 4,
    erasures,
  };
}

describe("renderEditorObjects", () => {
  it("renders annotations through an isolated scratch canvas", () => {
    const target = createMockContext();
    const scratch = createMockContext();
    const scratchCanvas = createScratchCanvas(scratch);

    renderEditorObjects(target, [createBrush()], scratchCanvas);

    expect(target.clearRect).toHaveBeenCalledWith(0, 0, 100, 100);
    expect(scratch.stroke).toHaveBeenCalledTimes(1);
    expect(target.drawImage).toHaveBeenCalledTimes(1);
  });

  it("applies erasure masks to the object scratch canvas only", () => {
    const target = createMockContext();
    const scratch = createMockContext();
    const scratchCanvas = createScratchCanvas(scratch);
    const brush = createBrush([{
      points: [{ x: 15, y: 15 }, { x: 18, y: 18 }],
      radius: 5,
    }]);

    renderEditorObjects(target, [brush], scratchCanvas);

    expect(scratch.stroke).toHaveBeenCalledTimes(2);
    expect(scratch.save).toHaveBeenCalledTimes(2);
    expect(scratch.restore).toHaveBeenCalledTimes(2);
    expect(target.drawImage).toHaveBeenCalledTimes(1);
  });

  it("does not draw blur objects on the annotation layer", () => {
    const target = createMockContext();
    const scratch = createMockContext();
    const blur: EditorObject = {
      id: "blur-1",
      type: "blur",
      bounds: { x: 1, y: 1, width: 20, height: 20 },
      radius: 8,
      erasures: [],
    };

    renderEditorObjects(target, [blur], createScratchCanvas(scratch));

    expect(target.drawImage).not.toHaveBeenCalled();
    expect(scratch.stroke).not.toHaveBeenCalled();
  });

  it("rejects an unavailable scratch context", () => {
    const target = createMockContext();
    const scratchCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => null),
    } as unknown as HTMLCanvasElement;

    expect(() => renderEditorObjects(target, [createBrush()], scratchCanvas))
      .toThrow("Editor scratch Canvas 2D context is unavailable.");
  });

  it("rejects using the target canvas as its own scratch canvas", () => {
    const target = createMockContext();
    const sameCanvas = target.canvas;

    expect(() => renderEditorObjects(target, [createBrush()], sameCanvas))
      .toThrow("Scratch canvas must be different from the target canvas.");
  });
});