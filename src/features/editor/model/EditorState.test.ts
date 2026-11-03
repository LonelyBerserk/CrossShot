import { describe, expect, it } from "vitest";
import type { BrushStroke, EditorObject, EditorSession } from "./EditorDocument";
import {
  activateEditorSelection,
  activateEditorTool,
  canRedoEditor,
  canUndoEditor,
  commitEditorObjects,
  createEditorState,
  redoEditor,
  undoEditor,
  updateEditorSelection,
} from "./EditorState";

function createSession(): EditorSession {
  return {
    sourceImage: {
      width: 100,
      height: 100,
      data: new Uint8ClampedArray(100 * 100 * 4),
    } as ImageData,
    selection: { x: 10, y: 10, width: 50, height: 50 },
    document: {
      version: 1,
      id: "test-document",
      width: 100,
      height: 100,
      objects: [],
    },
  };
}

function createStroke(id: string): BrushStroke {
  return {
    id,
    type: "brush-stroke",
    points: [{ x: 10, y: 10 }, { x: 20, y: 20 }],
    color: "#ff0000",
    width: 3,
    erasures: [],
  };
}

describe("EditorState", () => {
  it("creates a synchronized initial state", () => {
    const session = createSession();
    const state = createEditorState(session);

    expect(state.session).toBe(session);
    expect(state.session.document.objects).toBe(state.history.present);
    expect(canUndoEditor(state)).toBe(false);
    expect(canRedoEditor(state)).toBe(false);
  });

  it("updates selection without adding history actions", () => {
    const state = createEditorState(createSession());
    const next = updateEditorSelection(state, {
      x: -10, y: 20, width: 40, height: 120,
    });

    expect(next.session.selection).toEqual({ x: 0, y: 20, width: 30, height: 80 });
    expect(next.history).toBe(state.history);
    expect(canUndoEditor(next)).toBe(false);
  });

  it("rejects invalid or out-of-bounds selections", () => {
    const state = createEditorState(createSession());

    expect(() => updateEditorSelection(state, {
      x: 150, y: 10, width: 20, height: 20,
    })).toThrow("Editor selection does not intersect the source image.");

    expect(() => updateEditorSelection(state, {
      x: 10, y: 10, width: 0, height: 20,
    })).toThrow("Invalid editor selection bounds.");
  });

  it("switches between drawing and selection modes", () => {
    const state = createEditorState(createSession());
    const drawing = activateEditorTool(state, "arrow");
    const selection = activateEditorSelection(drawing);

    expect(drawing.toolState.mode).toEqual({ type: "tool", tool: "arrow" });
    expect(selection.toolState.mode).toEqual({ type: "selection" });
    expect(selection.toolState.selectedTool).toBe("arrow");
  });

  it("commits objects without modifying the source image", () => {
    const state = createEditorState(createSession());
    const originalImage = state.session.sourceImage;
    const objects: EditorObject[] = [createStroke("stroke-1")];
    const next = commitEditorObjects(state, objects);

    expect(next.session.sourceImage).toBe(originalImage);
    expect(next.session.document.objects).toBe(next.history.present);
    expect(next.session.document.objects).toEqual(objects);
    expect(canUndoEditor(next)).toBe(true);
  });

  it("keeps document objects synchronized through undo and redo", () => {
    const state = createEditorState(createSession());
    const edited = commitEditorObjects(state, [createStroke("stroke-1")]);
    const undone = undoEditor(edited);

    expect(undone.session.document.objects).toEqual([]);
    expect(canUndoEditor(undone)).toBe(false);
    expect(canRedoEditor(undone)).toBe(true);

    const redone = redoEditor(undone);
    expect(redone.session.document.objects).toEqual([createStroke("stroke-1")]);
    expect(canUndoEditor(redone)).toBe(true);
    expect(canRedoEditor(redone)).toBe(false);
  });

  it("clears redo after committing a new editing branch", () => {
    const initial = createEditorState(createSession());
    const first = commitEditorObjects(initial, [createStroke("first")]);
    const undone = undoEditor(first);
    const branched = commitEditorObjects(undone, [createStroke("second")]);

    expect(branched.session.document.objects).toEqual([createStroke("second")]);
    expect(canRedoEditor(branched)).toBe(false);
  });

  it("does not create a history action for an unchanged object list", () => {
    const state = createEditorState(createSession());
    const next = commitEditorObjects(state, state.history.present);

    expect(next).toBe(state);
  });
});