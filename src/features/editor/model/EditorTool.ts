/** Available editor tools. Each shape is a separate selectable tool. */
export type EditorTool =
  | "brush"
  | "rectangle"
  | "ellipse"
  | "triangle"
  | "line"
  | "arrow"
  | "text"
  | "blur"
  | "eraser";

/** Groups used by the editor toolbar. */
export type EditorToolGroup =
  | "drawing"
  | "shapes"
  | "lines"
  | "text"
  | "effects"
  | "eraser";

/** Maps each concrete tool to its toolbar group. */
export const EDITOR_TOOL_GROUPS: Readonly<Record<EditorTool, EditorToolGroup>> = {
  brush: "drawing",
  rectangle: "shapes",
  ellipse: "shapes",
  triangle: "shapes",
  line: "lines",
  arrow: "lines",
  text: "text",
  blur: "effects",
  eraser: "eraser",
};

/** Current pointer interaction mode. */
export type EditorInteractionMode =
  | { readonly type: "selection" }
  | { readonly type: "tool"; readonly tool: EditorTool };

/**
 * Editor interaction state.
 * selectedTool is preserved when switching back to selection mode.
 */
export interface EditorToolState {
  readonly mode: EditorInteractionMode;
  readonly selectedTool: EditorTool;
}

export function createInitialEditorToolState(): EditorToolState {
  return {
    mode: { type: "selection" },
    selectedTool: "brush",
  };
}

/** Activates a drawing or editing tool and disables selection interaction. */
export function activateEditorTool(tool: EditorTool): EditorToolState {
  return {
    mode: { type: "tool", tool },
    selectedTool: tool,
  };
}

/** Activates selection editing without losing the previously selected tool. */
export function activateSelectionMode(
  state: EditorToolState,
): EditorToolState {
  return {
    mode: { type: "selection" },
    selectedTool: state.selectedTool,
  };
}

export function isSelectionModeActive(state: EditorToolState): boolean {
  return state.mode.type === "selection";
}

export function isEditorToolActive(
  state: EditorToolState,
  tool: EditorTool,
): boolean {
  return state.mode.type === "tool" && state.mode.tool === tool;
}