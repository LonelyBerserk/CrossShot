/** Maximum number of undoable editor actions. */
export const EDITOR_HISTORY_LIMIT = 100;

import type { EditorObject } from "../model/EditorDocument";

/**
 * Stores immutable snapshots of editor objects.
 * Source ImageData is deliberately excluded from history.
 */
export interface EditorHistoryState {
  readonly past: readonly (readonly EditorObject[])[];
  readonly present: readonly EditorObject[];
  readonly future: readonly (readonly EditorObject[])[];
}

export function createHistoryState(
  initialObjects: readonly EditorObject[] = [],
): EditorHistoryState {
  return {
    past: [],
    present: initialObjects,
    future: [],
  };
}

function areObjectListsIdentical(
  left: readonly EditorObject[],
  right: readonly EditorObject[],
): boolean {
  if (left === right) return true;
  if (left.length !== right.length) return false;

  return left.every((object, index) => object === right[index]);
}

/** Commits one completed editing action and clears the redo branch. */
export function commitHistory(
  state: EditorHistoryState,
  nextObjects: readonly EditorObject[],
): EditorHistoryState {
  if (areObjectListsIdentical(state.present, nextObjects)) {
    return state;
  }

  const nextPast = [...state.past, state.present];

  return {
    past: nextPast.slice(-EDITOR_HISTORY_LIMIT),
    present: nextObjects,
    future: [],
  };
}

/** Restores the previous object snapshot. */
export function undoHistory(state: EditorHistoryState): EditorHistoryState {
  if (state.past.length === 0) return state;

  const previous = state.past[state.past.length - 1];

  return {
    past: state.past.slice(0, -1),
    present: previous,
    future: [...state.future, state.present],
  };
}

/** Reapplies the most recently undone action. */
export function redoHistory(state: EditorHistoryState): EditorHistoryState {
  if (state.future.length === 0) return state;

  const next = state.future[state.future.length - 1];
  const nextPast = [...state.past, state.present];

  return {
    past: nextPast.slice(-EDITOR_HISTORY_LIMIT),
    present: next,
    future: state.future.slice(0, -1),
  };
}

export function canUndo(state: EditorHistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorHistoryState): boolean {
  return state.future.length > 0;
}