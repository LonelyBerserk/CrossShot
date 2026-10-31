import { invoke } from "@tauri-apps/api/core";

import type { MonitorInfo } from "../types/monitor";

/** Returns metadata for all monitors detected by the backend. */
export async function getMonitors(): Promise<MonitorInfo[]> {
  return invoke<MonitorInfo[]>("get_monitors");
}
