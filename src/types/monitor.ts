/**
 * Information about a physical display detected by the operating system.
 * Coordinates use the virtual desktop coordinate space.
 */
export interface MonitorInfo {
  id: number;
  name: string;
  friendlyName: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
  isPrimary: boolean;
}
