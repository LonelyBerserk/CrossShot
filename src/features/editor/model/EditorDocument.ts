/**
 * CrossShot Editor — document model.
 * All geometry is stored in original source image pixels.
 */

export interface EditorPoint {
  readonly x: number;
  readonly y: number;
}

export interface EditorBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface EditorStrokeStyle {
  readonly color: string;
  readonly width: number;
}

export interface EditorFillStyle {
  readonly color: string;
  readonly opacity: number;
}

/** A partial-erasure path applied only to its owning object. */
export interface EditorEraserPath {
  readonly points: readonly EditorPoint[];
  readonly radius: number;
}

export interface EditorObjectBase {
  readonly id: string;
  readonly erasures: readonly EditorEraserPath[];
}

export interface BrushStroke extends EditorObjectBase {
  readonly type: "brush-stroke";
  readonly points: readonly EditorPoint[];
  readonly color: string;
  readonly width: number;
}

export interface LineObject extends EditorObjectBase {
  readonly type: "line";
  readonly start: EditorPoint;
  readonly end: EditorPoint;
  readonly color: string;
  readonly width: number;
}

export interface ArrowObject extends EditorObjectBase {
  readonly type: "arrow";
  readonly start: EditorPoint;
  readonly end: EditorPoint;
  readonly color: string;
  readonly width: number;
}

export type EditorShapeKind =
  | "rectangle"
  | "ellipse"
  | "triangle";

export interface ShapeObject extends EditorObjectBase {
  readonly type: "shape";
  readonly shape: EditorShapeKind;
  readonly bounds: EditorBounds;
  readonly stroke: EditorStrokeStyle;
  readonly fill: EditorFillStyle | null;
}

export type EditorTextAlignment = "left" | "center" | "right";

export interface TextObject extends EditorObjectBase {
  readonly type: "text";
  readonly position: EditorPoint;
  readonly text: string;
  readonly color: string;
  readonly fontSize: number;
  readonly fontFamily: string;
  readonly fontWeight: "normal" | "bold";
  readonly textAlign: EditorTextAlignment;
}

export interface BlurRegion extends EditorObjectBase {
  readonly type: "blur";
  readonly bounds: EditorBounds;
  readonly radius: number;
}

export type EditorObject =
  | BrushStroke
  | LineObject
  | ArrowObject
  | ShapeObject
  | TextObject
  | BlurRegion;

export interface EditorDocument {
  readonly version: 1;
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly objects: readonly EditorObject[];
}

/** Runtime session. The original image is never modified during editing. */
export interface EditorSession {
  readonly sourceImage: ImageData;
  readonly selection: EditorBounds;
  readonly document: EditorDocument;
}