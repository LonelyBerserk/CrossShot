import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";

import i18n from "../../i18n";
import { closeCaptureOverlay } from "../../services/overlay";
import { getMonitors } from "../../services/monitors";
import type { MonitorInfo } from "../../types/monitor";

import "./CaptureOverlay.css";

interface Point {
  x: number;
  y: number;
}

interface MoveOrigin {
  pointer: Point;
  start: Point;
  current: Point;
}

type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface ResizeOrigin {
  handle: ResizeHandle;
  pointer: Point;
  start: Point;
  current: Point;
}

const RESIZE_HANDLES: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
interface SelectionRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface LabelPosition {
  left: number;
  top: number;
}

function getDimensionLabelPosition(
  viewportWidth: number,
  viewportHeight: number,
  selection: SelectionRect,
  labelWidth: number,
  labelHeight: number,
  startPoint: Point,
  endPoint: Point,
): LabelPosition {
  const gap = 8;
  const left = selection.left;
  const top = selection.top;
  const right = left + selection.width;
  const bottom = top + selection.height;
  const endIsLeft = endPoint.x <= startPoint.x;
  const endIsTop = endPoint.y <= startPoint.y;

  const aboveLeft = { left, top: top - labelHeight - gap };
  const aboveRight = { left: right - labelWidth, top: top - labelHeight - gap };
  const belowLeft = { left, top: bottom + gap };
  const belowRight = { left: right - labelWidth, top: bottom + gap };
  const leftTop = { left: left - labelWidth - gap, top };
  const leftBottom = { left: left - labelWidth - gap, top: bottom - labelHeight };
  const rightTop = { left: right + gap, top };
  const rightBottom = { left: right + gap, top: bottom - labelHeight };

  let candidates: LabelPosition[];

  if (endIsLeft && endIsTop) {
    candidates = [aboveLeft, leftTop, aboveRight, leftBottom, belowLeft, rightTop, rightBottom, belowRight];
  } else if (!endIsLeft && endIsTop) {
    candidates = [aboveRight, rightTop, aboveLeft, rightBottom, belowRight, leftTop, leftBottom, belowLeft];
  } else if (endIsLeft && !endIsTop) {
    candidates = [belowLeft, leftBottom, belowRight, leftTop, aboveLeft, rightBottom, rightTop, aboveRight];
  } else {
    candidates = [belowRight, rightBottom, belowLeft, rightTop, aboveRight, leftBottom, leftTop, aboveLeft];
  }

  const available = candidates.find((candidate) =>
    candidate.left >= 0 &&
    candidate.top >= 0 &&
    candidate.left + labelWidth <= viewportWidth &&
    candidate.top + labelHeight <= viewportHeight,
  );

  if (available) return available;

  const desiredLeft = endIsLeft ? left + gap : right - labelWidth - gap;
  const desiredTop = endIsTop ? top + gap : bottom - labelHeight - gap;

  return {
    left: Math.max(0, Math.min(Math.max(0, viewportWidth - labelWidth), desiredLeft)),
    top: Math.max(0, Math.min(Math.max(0, viewportHeight - labelHeight), desiredTop)),
  };
}

interface MonitorEdges {
  xEdges: number[];
  yEdges: number[];
}

const SNAP_DISTANCE = 5;

function getMonitorEdges(
  monitors: MonitorInfo[],
  viewportWidth: number,
  viewportHeight: number,
): MonitorEdges {
  if (monitors.length === 0) return { xEdges: [], yEdges: [] };

  const minX = Math.min(...monitors.map((monitor) => monitor.x));
  const maxX = Math.max(...monitors.map((monitor) => monitor.x + monitor.width));
  const minY = Math.min(...monitors.map((monitor) => monitor.y));
  const maxY = Math.max(...monitors.map((monitor) => monitor.y + monitor.height));

  if (maxX <= minX || maxY <= minY) return { xEdges: [], yEdges: [] };

  const scaleX = viewportWidth / (maxX - minX);
  const scaleY = viewportHeight / (maxY - minY);

  const xEdges = Array.from(new Set(monitors.flatMap((monitor) => [
    (monitor.x - minX) * scaleX,
    (monitor.x + monitor.width - minX) * scaleX,
  ]))).sort((a, b) => a - b);

  const yEdges = Array.from(new Set(monitors.flatMap((monitor) => [
    (monitor.y - minY) * scaleY,
    (monitor.y + monitor.height - minY) * scaleY,
  ]))).sort((a, b) => a - b);

  return { xEdges, yEdges };
}

function snapCoordinate(value: number, edges: number[], min: number, max: number): number {
  let result = value;
  let nearestDistance = SNAP_DISTANCE + 1;

  for (const edge of edges) {
    const distance = Math.abs(edge - value);
    if (distance <= SNAP_DISTANCE && distance < nearestDistance) {
      result = edge;
      nearestDistance = distance;
    }
  }

  return Math.max(min, Math.min(max, result));
}

function snapAxisDelta(
  delta: number,
  leading: number,
  trailing: number,
  edges: number[],
  minDelta: number,
  maxDelta: number,
): number {
  let snappedDelta = delta;
  let nearestDistance = SNAP_DISTANCE + 1;

  for (const edge of edges) {
    const offsets = [
      edge - (leading + delta),
      edge - (trailing + delta),
    ];

    for (const offset of offsets) {
      const distance = Math.abs(offset);
      if (distance <= SNAP_DISTANCE && distance < nearestDistance) {
        nearestDistance = distance;
        snappedDelta = delta + offset;
      }
    }
  }

  return Math.max(minDelta, Math.min(maxDelta, snappedDelta));
}

function CaptureOverlay() {
  const { t } = useTranslation(undefined, { i18n });

  useLayoutEffect(() => {
    document.documentElement.classList.add("capture-overlay-window");

    return () => {
      document.documentElement.classList.remove("capture-overlay-window");
    };
  }, []);
  const overlayRef = useRef<HTMLElement | null>(null);
  const dimensionsRef = useRef<HTMLSpanElement | null>(null);
  const [startPoint, setStartPoint] = useState<Point | null>(null);
  const [currentPoint, setCurrentPoint] = useState<Point | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const resizeOriginRef = useRef<ResizeOrigin | null>(null);
  const moveOriginRef = useRef<MoveOrigin | null>(null);
  const monitorsRef = useRef<MonitorInfo[]>([]);
  const [labelPosition, setLabelPosition] = useState<LabelPosition | null>(null);

  const selection = useMemo<SelectionRect | null>(() => {
    if (!startPoint || !currentPoint) return null;
    return {
      left: Math.min(startPoint.x, currentPoint.x),
      top: Math.min(startPoint.y, currentPoint.y),
      width: Math.abs(currentPoint.x - startPoint.x),
      height: Math.abs(currentPoint.y - startPoint.y),
    };
  }, [startPoint, currentPoint]);

  useEffect(() => {
    let isMounted = true;

    void getMonitors()
      .then((monitors) => {
        if (isMounted) monitorsRef.current = monitors;
      })
      .catch((error: unknown) => {
        console.error("Failed to load monitors for edge snapping:", error);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      void closeCaptureOverlay().catch((error: unknown) => {
        console.error("Failed to close capture overlay:", error);
      });
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useLayoutEffect(() => {
    if (!selection || !startPoint || !currentPoint || !overlayRef.current || !dimensionsRef.current) {
      setLabelPosition(null);
      return;
    }
    const overlayBounds = overlayRef.current.getBoundingClientRect();
    const labelBounds = dimensionsRef.current.getBoundingClientRect();
    setLabelPosition(getDimensionLabelPosition(overlayBounds.width, overlayBounds.height, selection, labelBounds.width, labelBounds.height, startPoint, currentPoint));
  }, [selection, startPoint, currentPoint]);

  const getPoint = (event: ReactPointerEvent<HTMLElement>): Point => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const rawX = event.clientX - bounds.left;
    const rawY = event.clientY - bounds.top;
    return {
      x: rawX >= bounds.width - 1 ? bounds.width : Math.max(0, Math.min(bounds.width, rawX)),
      y: rawY >= bounds.height - 1 ? bounds.height : Math.max(0, Math.min(bounds.height, rawY)),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = getPoint(event);
    const target = event.target as HTMLElement;
    const handleValue = target.closest<HTMLElement>("[data-resize-handle]")?.dataset.resizeHandle;
    const activeHandle = handleValue as ResizeHandle | undefined;

    if (activeHandle && selection && startPoint && currentPoint) {
      resizeOriginRef.current = { handle: activeHandle, pointer: point, start: startPoint, current: currentPoint };
      moveOriginRef.current = null;
      setIsSelecting(false);
      setIsMoving(false);
      setResizeHandle(activeHandle);
      return;
    }

    resizeOriginRef.current = null;
    setResizeHandle(null);

    if (
      selection &&
      startPoint &&
      currentPoint &&
      selection.width > 0 &&
      selection.height > 0 &&
      point.x >= selection.left &&
      point.x <= selection.left + selection.width &&
      point.y >= selection.top &&
      point.y <= selection.top + selection.height
    ) {
      moveOriginRef.current = { pointer: point, start: startPoint, current: currentPoint };
      setIsSelecting(false);
      setIsMoving(true);
      return;
    }

    moveOriginRef.current = null;
    setIsMoving(false);
    setStartPoint(point);
    setCurrentPoint(point);
    setIsSelecting(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const point = getPoint(event);
    const bounds = event.currentTarget.getBoundingClientRect();

    if (resizeHandle && resizeOriginRef.current) {
      const origin = resizeOriginRef.current;
      const baseLeft = Math.min(origin.start.x, origin.current.x);
      const baseRight = Math.max(origin.start.x, origin.current.x);
      const baseTop = Math.min(origin.start.y, origin.current.y);
      const baseBottom = Math.max(origin.start.y, origin.current.y);
      const deltaX = point.x - origin.pointer.x;
      const deltaY = point.y - origin.pointer.y;
      const edges = getMonitorEdges(monitorsRef.current, bounds.width, bounds.height);
      let nextLeft = baseLeft;
      let nextRight = baseRight;
      let nextTop = baseTop;
      let nextBottom = baseBottom;

      if (origin.handle.includes("w")) {
        nextLeft = snapCoordinate(Math.max(0, Math.min(baseRight - 1, baseLeft + deltaX)), edges.xEdges, 0, baseRight - 1);
      }
      if (origin.handle.includes("e")) {
        nextRight = snapCoordinate(Math.max(baseLeft + 1, Math.min(bounds.width, baseRight + deltaX)), edges.xEdges, baseLeft + 1, bounds.width);
      }
      if (origin.handle.includes("n")) {
        nextTop = snapCoordinate(Math.max(0, Math.min(baseBottom - 1, baseTop + deltaY)), edges.yEdges, 0, baseBottom - 1);
      }
      if (origin.handle.includes("s")) {
        nextBottom = snapCoordinate(Math.max(baseTop + 1, Math.min(bounds.height, baseBottom + deltaY)), edges.yEdges, baseTop + 1, bounds.height);
      }

      const startIsLeft = origin.start.x <= origin.current.x;
      const startIsTop = origin.start.y <= origin.current.y;
      setStartPoint({ x: startIsLeft ? nextLeft : nextRight, y: startIsTop ? nextTop : nextBottom });
      setCurrentPoint({ x: startIsLeft ? nextRight : nextLeft, y: startIsTop ? nextBottom : nextTop });
      return;
    }

    const moveOrigin = moveOriginRef.current;
    if (isMoving && moveOrigin) {
      const baseLeft = Math.min(moveOrigin.start.x, moveOrigin.current.x);
      const baseRight = Math.max(moveOrigin.start.x, moveOrigin.current.x);
      const baseTop = Math.min(moveOrigin.start.y, moveOrigin.current.y);
      const baseBottom = Math.max(moveOrigin.start.y, moveOrigin.current.y);
      const minDeltaX = -baseLeft;
      const maxDeltaX = bounds.width - baseRight;
      const minDeltaY = -baseTop;
      const maxDeltaY = bounds.height - baseBottom;
      let moveX = Math.max(minDeltaX, Math.min(maxDeltaX, point.x - moveOrigin.pointer.x));
      let moveY = Math.max(minDeltaY, Math.min(maxDeltaY, point.y - moveOrigin.pointer.y));
      const edges = getMonitorEdges(monitorsRef.current, bounds.width, bounds.height);
      moveX = snapAxisDelta(moveX, baseLeft, baseRight, edges.xEdges, minDeltaX, maxDeltaX);
      moveY = snapAxisDelta(moveY, baseTop, baseBottom, edges.yEdges, minDeltaY, maxDeltaY);
      setStartPoint({ x: moveOrigin.start.x + moveX, y: moveOrigin.start.y + moveY });
      setCurrentPoint({ x: moveOrigin.current.x + moveX, y: moveOrigin.current.y + moveY });
      return;
    }

    if (!isSelecting) return;
    setCurrentPoint(point);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLElement>) => {
    if (resizeHandle) {
      setResizeHandle(null);
      resizeOriginRef.current = null;
      return;
    }
    if (isMoving) {
      setIsMoving(false);
      moveOriginRef.current = null;
      return;
    }
    if (!isSelecting) return;
    setCurrentPoint(getPoint(event));
    setIsSelecting(false);
  };

  const handlePointerCancel = () => {
    setIsSelecting(false);
    setIsMoving(false);
    setResizeHandle(null);
    moveOriginRef.current = null;
    resizeOriginRef.current = null;
  };
  const handleContextMenu = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    void closeCaptureOverlay().catch((error: unknown) => {
      console.error("Failed to close capture overlay:", error);
    });
  };

  return (
    <main
      ref={overlayRef}
      className={`capture-overlay${selection ? " capture-overlay--has-selection" : ""}${isMoving ? " capture-overlay--moving" : ""}${resizeHandle ? " capture-overlay--resizing" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
    >
      {!selection && (
        <section className="capture-overlay__hint">
          <span className="capture-overlay__brand">CrossShot</span>
          <h1>{t("capture.area")}</h1>
          <p>Drag to select an area. Press Esc or right-click to cancel.</p>
        </section>
      )}

      {selection && (
        <div
          className="capture-overlay__selection"
          style={{ left: selection.left, top: selection.top, width: selection.width, height: selection.height }}
        >
          {!isSelecting && RESIZE_HANDLES.map((handle) => (
            <span
              key={handle}
              data-resize-handle={handle}
              className={`capture-overlay__handle capture-overlay__handle--${handle}`}
            />
          ))}
        </div>
      )}

      {selection && (
        <span
          ref={dimensionsRef}
          className="capture-overlay__dimensions"
          style={{
            left: labelPosition?.left ?? 0,
            top: labelPosition?.top ?? 0,
            visibility: labelPosition ? "visible" : "hidden",
          }}
        >
          {Math.round(selection.width)} x {Math.round(selection.height)} px
        </span>
      )}
    </main>
  );
}

export default CaptureOverlay;
