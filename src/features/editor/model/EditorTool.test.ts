import { describe, expect, it } from "vitest";
import {
  activateEditorTool,
  activateSelectionMode,
  createInitialEditorToolState,
  isEditorToolActive,
  isSelectionModeActive,
} from "./EditorTool";

describe("editor interaction modes", () => {
  it("starts in selection mode", () => {
    const state = createInitialEditorToolState();

    expect(isSelectionModeActive(state)).toBe(true);
    expect(state.selectedTool).toBe("brush");
  });

  it("activates the selected tool and disables selection mode", () => {
    const state = activateEditorTool("arrow");

    expect(isSelectionModeActive(state)).toBe(false);
    expect(isEditorToolActive(state, "arrow")).toBe(true);
    expect(isEditorToolActive(state, "brush")).toBe(false);
  });

  it("restores selection mode and remembers the previous tool", () => {
    const drawing = activateEditorTool("ellipse");
    const selection = activateSelectionMode(drawing);

    expect(isSelectionModeActive(selection)).toBe(true);
    expect(selection.selectedTool).toBe("ellipse");
  });

  it("does not activate an editing tool in selection mode", () => {
    const selection = createInitialEditorToolState();

    expect(isEditorToolActive(selection, "brush")).toBe(false);
  });

  it("maps tools to the correct toolbar groups", async () => {
    const { EDITOR_TOOL_GROUPS } = await import("./EditorTool");

    expect(EDITOR_TOOL_GROUPS.brush).toBe("drawing");
    expect(EDITOR_TOOL_GROUPS.rectangle).toBe("shapes");
    expect(EDITOR_TOOL_GROUPS.ellipse).toBe("shapes");
    expect(EDITOR_TOOL_GROUPS.triangle).toBe("shapes");
    expect(EDITOR_TOOL_GROUPS.line).toBe("lines");
    expect(EDITOR_TOOL_GROUPS.arrow).toBe("lines");
    expect(EDITOR_TOOL_GROUPS.text).toBe("text");
    expect(EDITOR_TOOL_GROUPS.blur).toBe("effects");
    expect(EDITOR_TOOL_GROUPS.eraser).toBe("eraser");
  });
});