import { describe, expect, it } from "vitest";
import type { EditorObject } from "../model/EditorDocument";
import {
  canRedo,
  canUndo,
  commitHistory,
  createHistoryState,
  EDITOR_HISTORY_LIMIT,
  redoHistory,
  undoHistory,
} from "./HistoryManager";

function createObject(id: string): EditorObject {
  return {
    id,
    type: "brush-stroke",
    points: [{ x: 0, y: 0 }],
    color: "#000000",
    width: 1,
    erasures: [],
  };
}

describe("Editor HistoryManager", () => {
  it("starts with empty undo and redo history", () => {
    const state = createHistoryState();

    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(false);
    expect(state.present).toEqual([]);
  });

  it("commits a new snapshot without copying existing objects", () => {
    const initial = createHistoryState();
    const objects = [createObject("brush-1")];
    const next = commitHistory(initial, objects);

    expect(next.present).toBe(objects);
    expect(next.past[0]).toBe(initial.present);
    expect(canUndo(next)).toBe(true);
    expect(canRedo(next)).toBe(false);
  });

  it("undoes and redoes an action", () => {
    const initial = createHistoryState();
    const edited = commitHistory(initial, [createObject("brush-1")]);

    const undone = undoHistory(edited);
    expect(undone.present).toEqual([]);
    expect(canUndo(undone)).toBe(false);
    expect(canRedo(undone)).toBe(true);

    const redone = redoHistory(undone);
    expect(redone.present).toEqual([createObject("brush-1")]);
    expect(canUndo(redone)).toBe(true);
    expect(canRedo(redone)).toBe(false);
  });

  it("clears the redo branch after a new action", () => {
    const first = commitHistory(createHistoryState(), [createObject("first")]);
    const second = commitHistory(first, [createObject("second")]);
    const undone = undoHistory(second);
    const branched = commitHistory(undone, [createObject("third")]);

    expect(branched.present).toEqual([createObject("third")]);
    expect(canRedo(branched)).toBe(false);
  });

  it("does not record an unchanged object list", () => {
    const state = commitHistory(createHistoryState(), [createObject("brush-1")]);
    const unchanged = commitHistory(state, [...state.present]);

    expect(unchanged).toBe(state);
  });

  it("limits undo history to 100 actions", () => {
    let state = createHistoryState();

    for (let index = 0; index < EDITOR_HISTORY_LIMIT + 5; index += 1) {
      state = commitHistory(state, [createObject(`action-${index}`)]);
    }

    expect(state.past).toHaveLength(EDITOR_HISTORY_LIMIT);

    for (let index = 0; index < EDITOR_HISTORY_LIMIT; index += 1) {
      state = undoHistory(state);
    }

    expect(state.present).toEqual([createObject("action-4")]);
    expect(canUndo(state)).toBe(false);
    expect(canRedo(state)).toBe(true);
  });

  it("keeps state unchanged when undo or redo is unavailable", () => {
    const state = createHistoryState();

    expect(undoHistory(state)).toBe(state);
    expect(redoHistory(state)).toBe(state);
  });
});