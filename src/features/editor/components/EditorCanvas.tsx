import { useLayoutEffect, useRef } from "react";
import type { EditorObject } from "../model/EditorDocument";
import { renderEditorObjects } from "../rendering/CanvasRenderer";

import "./EditorCanvas.css";

interface EditorCanvasProps {
  readonly sourceImage: ImageData;
  readonly objects: readonly EditorObject[];
}

/**
 * Three-layer rendering surface for the screenshot editor.
 * Source pixels remain unchanged during editing.
 * Effects and annotations are rendered on independent transparent layers.
 */
function EditorCanvas({ sourceImage, objects }: EditorCanvasProps) {
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const effectsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const annotationCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize the source and effects layers.
  useLayoutEffect(() => {
    const sourceCanvas = sourceCanvasRef.current;
    const effectsCanvas = effectsCanvasRef.current;
    const annotationCanvas = annotationCanvasRef.current;

    if (!sourceCanvas || !effectsCanvas || !annotationCanvas) return;

    const { width, height } = sourceImage;
    const canvases = [sourceCanvas, effectsCanvas, annotationCanvas];

    for (const canvas of canvases) {
      if (canvas.width !== width) canvas.width = width;
      if (canvas.height !== height) canvas.height = height;
    }

    const sourceContext = sourceCanvas.getContext("2d");
    const effectsContext = effectsCanvas.getContext("2d");

    if (!sourceContext || !effectsContext) {
      console.error("Editor Canvas 2D context is unavailable.");
      return;
    }

    sourceContext.putImageData(sourceImage, 0, 0);
    effectsContext.clearRect(0, 0, width, height);
  }, [sourceImage]);

  // Render annotations whenever the document objects change.
  useLayoutEffect(() => {
    const annotationCanvas = annotationCanvasRef.current;
    if (!annotationCanvas) return;

    const context = annotationCanvas.getContext("2d");
    if (!context) {
      console.error("Editor annotation Canvas 2D context is unavailable.");
      return;
    }

    if (!scratchCanvasRef.current) {
      scratchCanvasRef.current = document.createElement("canvas");
    }

    try {
      renderEditorObjects(context, objects, scratchCanvasRef.current);
    } catch (error) {
      console.error("Failed to render editor annotations:", error);
    }
  }, [objects, sourceImage.width, sourceImage.height]);

  return (
    <div className="editor-canvas" aria-label="Screenshot editing workspace">
      <canvas
        ref={sourceCanvasRef}
        className="editor-canvas__source"
        aria-hidden="true"
      />
      <canvas
        ref={effectsCanvasRef}
        className="editor-canvas__effects"
        aria-hidden="true"
      />
      <canvas
        ref={annotationCanvasRef}
        className="editor-canvas__annotations"
        aria-hidden="true"
      />
    </div>
  );
}

export default EditorCanvas;