import React from "react";
import ReactDOM from "react-dom/client";

import "./i18n";

import App from "./App";
import CaptureOverlay from "./features/capture/CaptureOverlay";

// Detect which Tauri window is loading this frontend.
const isCaptureOverlay =
  new URLSearchParams(window.location.search).get("window") ===
  "capture-overlay";

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
).render(
  <React.StrictMode>
    {isCaptureOverlay ? <CaptureOverlay /> : <App />}
  </React.StrictMode>
);
