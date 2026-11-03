import type { EditorBounds, EditorObject, EditorSession } from "./EditorDocument";
import {
  activateEditorTool as activateToolMode,
  activateSelectionMode,
  createInitialEditorToolState,
  type EditorTool,
  type EditorToolState,
} from "./EditorTool";
import {
  canRedo as historyCanRedo,
  canUndo as historyCanUndo,
  commitHistory,
  createHistoryState,
  redoHistory,
  undoHistory,
  type EditorHistoryState,
} from "../history/HistoryManager";

export interface EditorState {
  readonly session: EditorSession;
  readonly toolState: EditorToolState;
  readonly history: EditorHistoryState;
}

/** Creates one synchronized editor state from an existing session. */
export function createEditorState(session: EditorSession): EditorState {
  return {
    session,
    toolState: createInitialEditorToolState(),
    history: createHistoryState(session.document.objects),
  };
}

/** Updates selection without creating an undoable document action. */
export function updateEditorSelection(
  state: EditorState,
  selection: EditorBounds,
): EditorState {
  const { width, height } = state.session.document;

  if (
    !Number.isFinite(selection.x) ||
    !Number.isFinite(selection.y) ||
    !Number.isFinite(selection.width) ||
    !Number.isFinite(selection.height) ||
    !Number.isFinite(selection.x + selection.width) ||
    !Number.isFinite(selection.y + selection.height) ||
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

  const normalized: EditorBounds = {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };

  const current = state.session.selection;
  if (
    current.x === normalized.x &&
    current.y === normalized.y &&
    current.width === normalized.width &&
    current.height === normalized.height
  ) {
    return state;
  }

  return {
    ...state,
    session: {
      ...state.session,
      selection: normalized,
    },
  };
}

/** Activates a tool and disables selection manipulation. */
export function activateEditorTool(
  state: EditorState,
  tool: EditorTool,
): EditorState {
  return {
    ...state,
    toolState: activateToolMode(tool),
  };
}

/** Activates selection manipulation and remembers the previous tool. */
export function activateEditorSelection(state: EditorState): EditorState {
  return {
    ...state,
    toolState: activateSelectionMode(state.toolState),
  };
}

function synchronizeHistory(
  state: EditorState,
  history: EditorHistoryState,
): EditorState {
  if (history === state.history) return state;

  return {
    ...state,
    history,
    session: {
      ...state.session,
      document: {
        ...state.session.document,
        objects: history.present,
      },
    },
  };
}

/** Commits one complete editing operation. */
export function commitEditorObjects(
  state: EditorState,
  objects: readonly EditorObject[],
): EditorState {
  return synchronizeHistory(state, commitHistory(state.history, objects));
}

export function undoEditor(state: EditorState): EditorState {
  return synchronizeHistory(state, undoHistory(state.history));
}

export function redoEditor(state: EditorState): EditorState {
  return synchronizeHistory(state, redoHistory(state.history));
}

export function canUndoEditor(state: EditorState): boolean {
  return historyCanUndo(state.history);
}

export function canRedoEditor(state: EditorState): boolean {
  return historyCanRedo(state.history);
}