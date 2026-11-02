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
import { captureFullVirtualDesktopImage, captureVirtualDesktopRegion } from "../../services/capture";
import { displayCaptureNotification } from "../../services/notifications";
import { loadAppSettings } from "../../services/settings";
import {
  closeCaptureOverlay,
  listenForCaptureSessionReady,
  markCaptureOverlayFrontendReady,
} from "../../services/overlay";
import { getMonitors } from "../../services/monitors";
import type { CapturedImage } from "../../types/capture";
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
  const captureInProgressRef = useRef(false);

  const capturedImageRef = useRef<CapturedImage | null>(null);
  const [capturedImage, setCapturedImage] = useState<CapturedImage | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

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

  // Each Rust session event requests a fresh screenshot image.
  useEffect(() => {
    let isMounted = true;
    let unlisten: (() => void) | undefined;
    let sessionGeneration = 0;

    const handleCaptureSessionReady = () => {
      const currentGeneration = ++sessionGeneration;
      const imageStartedAt = performance.now();

      console.info("[PERF][Frontend] capture-session-ready event received");

      // Release the previous preview before loading the next session.
      const previousImage = capturedImageRef.current;
      capturedImageRef.current = null;

      if (previousImage) {
        URL.revokeObjectURL(previousImage.url);
      }

      // Reset all selection state for the new capture session.
      setCapturedImage(null);
      setCaptureError(null);
      setStartPoint(null);
      setCurrentPoint(null);
      setIsSelecting(false);
      setIsMoving(false);
      setResizeHandle(null);
      setLabelPosition(null);

      captureInProgressRef.current = false;
      moveOriginRef.current = null;
      resizeOriginRef.current = null;

      void captureFullVirtualDesktopImage()
        .then((image) => {
          if (!isMounted || currentGeneration !== sessionGeneration) {
            URL.revokeObjectURL(image.url);
            return;
          }

          capturedImageRef.current = image;
          setCapturedImage(image);

          console.info("[PERF][Frontend] capture session image ready", {
            totalMs: Number((performance.now() - imageStartedAt).toFixed(1)),
            width: image.width,
            height: image.height,
          });
        })
        .catch((error: unknown) => {
          if (!isMounted || currentGeneration !== sessionGeneration) return;

          const message = error instanceof Error ? error.message : String(error);
          setCaptureError(message);

          console.error("Failed to load capture session image:", error);
        });
    };

    void (async () => {
      const stopListening = await listenForCaptureSessionReady(
        handleCaptureSessionReady,
      );

      if (!isMounted) {
        stopListening();
        return;
      }

      unlisten = stopListening;

      await markCaptureOverlayFrontendReady();

      console.info("[PERF][Frontend] capture overlay frontend is ready");
    })().catch((error: unknown) => {
      console.error(
        "Failed to initialize capture overlay event listener:",
        error,
      );
    });

    return () => {
      isMounted = false;
      sessionGeneration += 1;
      unlisten?.();

      const currentImage = capturedImageRef.current;
      capturedImageRef.current = null;

      if (currentImage) {
        URL.revokeObjectURL(currentImage.url);
      }
    };
  }, []);



  useLayoutEffect(() => {
    if (!capturedImage) return;

    console.info("[PERF][Frontend] screenshot committed to DOM", {
      width: capturedImage.width,
      height: capturedImage.height,
    });
  }, [capturedImage]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        void closeCaptureOverlay().catch((error: unknown) => {
          console.error("Failed to close capture overlay:", error);
        });
        return;
      }

      const isCopyShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
      if (event.key !== "Enter" && !isCopyShortcut) return;

      event.preventDefault();

      if (captureInProgressRef.current || !selection || isSelecting || isMoving || resizeHandle) return;
      if (selection.width < 1 || selection.height < 1) return;

      captureInProgressRef.current = true;

      void (async () => {
        try {
          const monitors = monitorsRef.current.length > 0 ? monitorsRef.current : await getMonitors();
          monitorsRef.current = monitors;

          if (monitors.length === 0) throw new Error("No monitors are available");

          const bounds = overlayRef.current?.getBoundingClientRect();
          if (!bounds || bounds.width <= 0 || bounds.height <= 0) {
            throw new Error("Overlay dimensions are unavailable");
          }

          const minX = Math.min(...monitors.map((monitor) => monitor.x));
          const minY = Math.min(...monitors.map((monitor) => monitor.y));
          const maxX = Math.max(...monitors.map((monitor) => monitor.x + monitor.width));
          const maxY = Math.max(...monitors.map((monitor) => monitor.y + monitor.height));
          const scaleX = (maxX - minX) / bounds.width;
          const scaleY = (maxY - minY) / bounds.height;

          if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
            throw new Error("Invalid virtual desktop scaling");
          }

          const left = Math.round(selection.left * scaleX);
          const top = Math.round(selection.top * scaleY);
          const right = Math.round((selection.left + selection.width) * scaleX);
          const bottom = Math.round((selection.top + selection.height) * scaleY);
          const physicalWidth = right - left;
          const physicalHeight = bottom - top;

          if (physicalWidth <= 0 || physicalHeight <= 0) {
            throw new Error("Selected capture region is too small");
          }

          const result = await captureVirtualDesktopRegion(
            minX + left,
            minY + top,
            physicalWidth,
            physicalHeight,
          );

          const settings = await loadAppSettings().catch((settingsError: unknown) => {
            console.error("Failed to load notification settings:", settingsError);
            return { playSuccessSound: true, showCaptureNotification: true };
          });

          if (result.clipboardCopied) {
            console.info("Screenshot saved and copied to clipboard:", result.filePath);
            await displayCaptureNotification({
              kind: "success",
              filePath: result.filePath,
              playSuccessSound: settings.playSuccessSound,
              showSuccessNotification: settings.showCaptureNotification,
            }).catch((notificationError: unknown) => {
              console.error("Failed to display success notification:", notificationError);
            });
          } else {
            console.error("Screenshot saved, but clipboard copy failed:", result.clipboardError, result.filePath);
            await displayCaptureNotification({
              kind: "error",
              filePath: result.filePath,
              errorCode: `CLIPBOARD_COPY_FAILED: ${result.clipboardError ?? "Unknown clipboard error"}`,
              playSuccessSound: false,
              showSuccessNotification: true,
            }).catch((notificationError: unknown) => {
              console.error("Failed to display clipboard error notification:", notificationError);
            });
          }

          await closeCaptureOverlay().catch((closeError: unknown) => {
            console.error("Failed to close capture overlay after notification:", closeError);
          });
        } catch (error) {
          captureInProgressRef.current = false;
          console.error("Failed to capture screenshot:", error);
          const errorCode = `CAPTURE_FAILED: ${error instanceof Error ? error.message : String(error)}`;
          await displayCaptureNotification({
            kind: "error",
            errorCode,
            playSuccessSound: false,
            showSuccessNotification: true,
          }).catch((notificationError: unknown) => {
            console.error("Failed to display capture error notification:", notificationError);
          });
          await closeCaptureOverlay().catch((closeError: unknown) => {
            console.error("Failed to close overlay after capture error:", closeError);
          });
        }
      })();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, isSelecting, isMoving, resizeHandle]);

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
    if (!capturedImage || event.button !== 0) return;
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
    if (!capturedImage) return;

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
    if (!capturedImage) return;

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
      className={`capture-overlay${selection ? " capture-overlay--has-selection" : ""}${isMoving ? " capture-overlay--moving" : ""}${resizeHandle ? " capture-overlay--resizing" : ""}${!capturedImage ? " capture-overlay--loading" : ""}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onContextMenu={handleContextMenu}
    >
      {capturedImage && (
        <img
          className="capture-overlay__screenshot"
          src={capturedImage.url}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      )}
      {!selection && (
        <section className="capture-overlay__hint">
          <span className="capture-overlay__brand">CrossShot</span>
          <h1>{t("capture.area")}</h1>
          <p>
  {captureError
    ? `Screenshot unavailable: ${captureError}`
    : capturedImage
      ? "Drag to select an area. Press Esc or right-click to cancel."
      : "Preparing screenshot..."}
</p>
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
