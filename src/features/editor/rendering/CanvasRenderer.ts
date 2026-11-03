import type { EditorEraserPath, EditorObject, EditorPoint } from "../model/EditorDocument";

function drawPolyline(context: CanvasRenderingContext2D, points: readonly EditorPoint[], color: string, width: number): void {
  if (points.length === 0) return;
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(0.1, width);
  context.lineCap = "round";
  context.lineJoin = "round";

  if (points.length === 1) {
    context.beginPath();
    context.arc(points[0].x, points[0].y, Math.max(0.05, width / 2), 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index += 1) {
    context.lineTo(points[index].x, points[index].y);
  }
  context.stroke();
}

function drawArrow(context: CanvasRenderingContext2D, object: Extract<EditorObject, { type: "arrow" }>): void {
  const { start, end, color, width } = object;
  drawPolyline(context, [start, end], color, width);

  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  if (length < 1) return;

  const headLength = Math.min(Math.max(width * 4, 8), length * 0.4);
  const wingAngle = Math.PI / 6;
  const left = {
    x: end.x - headLength * Math.cos(angle - wingAngle),
    y: end.y - headLength * Math.sin(angle - wingAngle),
  };
  const right = {
    x: end.x - headLength * Math.cos(angle + wingAngle),
    y: end.y - headLength * Math.sin(angle + wingAngle),
  };

  drawPolyline(context, [left, end, right], color, width);
}

function drawShape(context: CanvasRenderingContext2D, object: Extract<EditorObject, { type: "shape" }>): void {
  const { bounds, shape, stroke, fill } = object;
  const x = Math.min(bounds.x, bounds.x + bounds.width);
  const y = Math.min(bounds.y, bounds.y + bounds.height);
  const width = Math.abs(bounds.width);
  const height = Math.abs(bounds.height);

  if (width <= 0 || height <= 0) return;

  context.beginPath();

  if (shape === "rectangle") {
    context.rect(x, y, width, height);
  } else if (shape === "ellipse") {
    context.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  } else {
    context.moveTo(x + width / 2, y);
    context.lineTo(x + width, y + height);
    context.lineTo(x, y + height);
    context.closePath();
  }

  if (fill) {
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, fill.opacity));
    context.fillStyle = fill.color;
    context.fill();
    context.restore();
  }

  context.strokeStyle = stroke.color;
  context.lineWidth = Math.max(0.1, stroke.width);
  context.lineJoin = "round";
  context.stroke();
}

function drawText(context: CanvasRenderingContext2D, object: Extract<EditorObject, { type: "text" }>): void {
  context.fillStyle = object.color;
  context.font = `${object.fontWeight} ${Math.max(1, object.fontSize)}px ${object.fontFamily}`;
  context.textAlign = object.textAlign;
  context.textBaseline = "top";

  const lines = object.text.split("\n");
  const lineHeight = Math.max(1, object.fontSize) * 1.2;

  lines.forEach((line, index) => {
    context.fillText(line, object.position.x, object.position.y + index * lineHeight);
  });
}

function drawObject(context: CanvasRenderingContext2D, object: EditorObject): boolean {
  context.save();

  switch (object.type) {
    case "brush-stroke":
      drawPolyline(context, object.points, object.color, object.width);
      break;
    case "line":
      drawPolyline(context, [object.start, object.end], object.color, object.width);
      break;
    case "arrow":
      drawArrow(context, object);
      break;
    case "shape":
      drawShape(context, object);
      break;
    case "text":
      drawText(context, object);
      break;
    case "blur":
      context.restore();
      return false;
    default:
      return assertNever(object);
  }

  context.restore();
  return true;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported editor object: ${JSON.stringify(value)}`);
}

/** Applies eraser paths to one object without affecting other annotations. */
function applyErasures(context: CanvasRenderingContext2D, erasures: readonly EditorEraserPath[]): void {
  for (const erasure of erasures) {
    if (!Number.isFinite(erasure.radius) || erasure.radius <= 0 || erasure.points.length === 0) continue;

    context.save();
    context.globalCompositeOperation = "destination-out";
    context.lineWidth = erasure.radius * 2;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#000000";
    context.fillStyle = "#000000";

    if (erasure.points.length === 1) {
      const point = erasure.points[0];
      context.beginPath();
      context.arc(point.x, point.y, erasure.radius, 0, Math.PI * 2);
      context.fill();
    } else {
      context.beginPath();
      context.moveTo(erasure.points[0].x, erasure.points[0].y);
      for (let index = 1; index < erasure.points.length; index += 1) {
        context.lineTo(erasure.points[index].x, erasure.points[index].y);
      }
      context.stroke();
    }

    context.restore();
  }
}

/** Renders annotations while isolating each object erasure mask. */
export function renderEditorObjects(
  targetContext: CanvasRenderingContext2D,
  objects: readonly EditorObject[],
  scratchCanvas: HTMLCanvasElement,
): void {
  const width = targetContext.canvas.width;
  const height = targetContext.canvas.height;

  if (width <= 0 || height <= 0) return;
  if (scratchCanvas === targetContext.canvas) throw new Error("Scratch canvas must be different from the target canvas.");

  if (scratchCanvas.width !== width) scratchCanvas.width = width;
  if (scratchCanvas.height !== height) scratchCanvas.height = height;

  const scratchContext = scratchCanvas.getContext("2d");
  if (!scratchContext) throw new Error("Editor scratch Canvas 2D context is unavailable.");

  targetContext.clearRect(0, 0, width, height);

  for (const object of objects) {
    if (object.type === "blur") continue;

    scratchContext.clearRect(0, 0, width, height);
    scratchContext.globalCompositeOperation = "source-over";

    if (!drawObject(scratchContext, object)) continue;

    applyErasures(scratchContext, object.erasures);
    targetContext.drawImage(scratchCanvas, 0, 0);
  }
}