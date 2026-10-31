/**
 * Information about a successfully saved screenshot.
 */
export interface CaptureResult {
  filePath: string;
  monitorId: number;
  width: number;
  height: number;
}

/**
 * Rectangle selected on a particular monitor.
 * Coordinates are relative to the monitor top-left corner.
 */
export interface CaptureRegion {
  monitorId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}
