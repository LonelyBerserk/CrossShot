import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { EditorSession } from "./model/EditorDocument";
import type { EditorTool } from "./model/EditorTool";
import {
  activateEditorSelection,
  activateEditorTool,
  createEditorState,
} from "./model/EditorState";
import EditorCanvas from "./components/EditorCanvas";
import EditorToolbar from "./components/EditorToolbar";
import { calculateToolbarPlacement, snapToolbarToNearestEdge, type ToolbarPlacement } from "./components/toolbarLayout";

import "./Editor.css";

interface EditorProps {
  readonly session: EditorSession;
}

/** Main screenshot editor workspace. */
function Editor({ session }: EditorProps) {
  const [state, setState] = useState(() => createEditorState(session));
  const [toolbarPlacement, setToolbarPlacement] = useState<ToolbarPlacement | null>(null);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const toolbarDragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);
  const manualToolbarPositionRef = useRef(false);

  const selection = state.session.selection;
  const width = state.session.document.width;
  const height = state.session.document.height;

  const handleSelectTool = (tool: EditorTool) => {
    setState((current) => activateEditorTool(current, tool));
  };

  const handleSelectArea = () => {
    setState((current) => activateEditorSelection(current));
  };

  const handleToolbarDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current;
    const toolbar = toolbarRef.current?.querySelector<HTMLElement>(".editor-toolbar");

    if (!stage || !toolbar) return;

    const toolbarBounds = toolbar.getBoundingClientRect();

    if (toolbarBounds.width <= 0 || toolbarBounds.height <= 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    manualToolbarPositionRef.current = true;
    toolbarDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - toolbarBounds.left,
      offsetY: event.clientY - toolbarBounds.top,
    };
  };

  const handleToolbarDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolbarDragRef.current;
    const stage = stageRef.current;
    const toolbar = toolbarRef.current?.querySelector<HTMLElement>(".editor-toolbar");

    if (!drag || drag.pointerId !== event.pointerId || !stage || !toolbar) return;

    const stageBounds = stage.getBoundingClientRect();
    const toolbarBounds = toolbar.getBoundingClientRect();
    const maxX = Math.max(0, stageBounds.width - toolbarBounds.width);
    const maxY = Math.max(0, stageBounds.height - toolbarBounds.height);
    const x = Math.max(0, Math.min(maxX, event.clientX - stageBounds.left - drag.offsetX));
    const y = Math.max(0, Math.min(maxY, event.clientY - stageBounds.top - drag.offsetY));

    setToolbarPlacement((current) => current ? { ...current, x, y } : current);
  };

  const handleToolbarDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = toolbarDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    toolbarDragRef.current = null;

    const stage = stageRef.current;
    const toolbar = toolbarRef.current?.querySelector<HTMLElement>(".editor-toolbar");

    if (!stage || !toolbar) return;

    const stageBounds = stage.getBoundingClientRect();
    const toolbarBounds = toolbar.getBoundingClientRect();

    if (stageBounds.width <= 0 || stageBounds.height <= 0 || toolbarBounds.width <= 0 || toolbarBounds.height <= 0) return;

    const measuredSize = { width: toolbarBounds.width, height: toolbarBounds.height };
    const dimensions = toolbar.dataset.orientation === "vertical"
      ? {
          horizontal: { width: measuredSize.height, height: measuredSize.width },
          vertical: measuredSize,
        }
      : {
          horizontal: measuredSize,
          vertical: { width: measuredSize.height, height: measuredSize.width },
        };

    const selectionBounds = {
      x: (selection.x / width) * stageBounds.width,
      y: (selection.y / height) * stageBounds.height,
      width: (selection.width / width) * stageBounds.width,
      height: (selection.height / height) * stageBounds.height,
    };

    const nextPlacement = snapToolbarToNearestEdge(
      {
        x: event.clientX - stageBounds.left - drag.offsetX,
        y: event.clientY - stageBounds.top - drag.offsetY,
      },
      selectionBounds,
      { width: stageBounds.width, height: stageBounds.height },
      dimensions,
    );

    setToolbarPlacement(nextPlacement);
  };

  // Position the toolbar using its actual rendered dimensions.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    const toolbarHost = toolbarRef.current;
    const toolbar = toolbarHost?.querySelector<HTMLElement>(".editor-toolbar");

    if (!stage || !toolbar) return;

    const updatePlacement = () => {
      if (manualToolbarPositionRef.current) return;
      const stageBounds = stage.getBoundingClientRect();
      const toolbarBounds = toolbar.getBoundingClientRect();

      if (
        stageBounds.width <= 0 ||
        stageBounds.height <= 0 ||
        toolbarBounds.width <= 0 ||
        toolbarBounds.height <= 0
      ) {
        return;
      }

      const measuredSize = {
        width: toolbarBounds.width,
        height: toolbarBounds.height,
      };

      const orientation = toolbar.dataset.orientation;
      const dimensions = orientation === "vertical"
        ? {
            horizontal: { width: measuredSize.height, height: measuredSize.width },
            vertical: measuredSize,
          }
        : {
            horizontal: measuredSize,
            vertical: { width: measuredSize.height, height: measuredSize.width },
          };

      const nextPlacement = calculateToolbarPlacement(
        {
          x: (selection.x / width) * stageBounds.width,
          y: (selection.y / height) * stageBounds.height,
          width: (selection.width / width) * stageBounds.width,
          height: (selection.height / height) * stageBounds.height,
        },
        {
          width: stageBounds.width,
          height: stageBounds.height,
        },
        dimensions,
      );

      setToolbarPlacement((current) => {
        if (
          current?.side === nextPlacement.side &&
          current.orientation === nextPlacement.orientation &&
          Math.abs(current.x - nextPlacement.x) < 0.5 &&
          Math.abs(current.y - nextPlacement.y) < 0.5
        ) {
          return current;
        }

        return nextPlacement;
      });
    };

    updatePlacement();

    const observer = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(updatePlacement)
      : null;

    observer?.observe(stage);
    observer?.observe(toolbar);
    window.addEventListener("resize", updatePlacement);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updatePlacement);
    };
  }, [
    selection.x,
    selection.y,
    selection.width,
    selection.height,
    width,
    height,
    toolbarPlacement?.orientation,
  ]);

  return (
    <main className="editor">
      <div ref={stageRef} className="editor__stage">
        <EditorCanvas
          sourceImage={state.session.sourceImage}
          objects={state.session.document.objects}
        />

        <div
          className="editor__selection"
          aria-hidden="true"
          style={{
            left: `${(selection.x / width) * 100}%`,
            top: `${(selection.y / height) * 100}%`,
            width: `${(selection.width / width) * 100}%`,
            height: `${(selection.height / height) * 100}%`,
          }}
        />
      </div>

      <div
        ref={toolbarRef}
        className="editor__toolbar"
        onPointerDown={(event) => event.stopPropagation()}
        onPointerMove={handleToolbarDragMove}
        onPointerUp={handleToolbarDragEnd}
        onPointerCancel={handleToolbarDragEnd}
        style={{
          position: "absolute",
          left: toolbarPlacement ? toolbarPlacement.x : "50%",
          top: toolbarPlacement ? toolbarPlacement.y : "auto",
          bottom: toolbarPlacement ? "auto" : 24,
          zIndex: 20,
          transform: toolbarPlacement ? "none" : "translateX(-50%)",
        }}
      >
        <EditorToolbar
          state={state.toolState}
          orientation={toolbarPlacement?.orientation ?? "horizontal"}
          onSelectTool={handleSelectTool}
          onSelectArea={handleSelectArea}
          onDragStart={handleToolbarDragStart}
        />
      </div>
    </main>
  );
}

export default Editor;