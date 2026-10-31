import React from "react";
import ReactDOM from "react-dom/client";

import "./i18n";

import App from "./App";
import CaptureOverlay from "./features/capture/CaptureOverlay";
import CaptureToast from "./features/notifications/CaptureToast";

// Detect which Tauri window is loading this frontend.
const windowType = new URLSearchParams(window.location.search).get("window");
const isCaptureOverlay = windowType === "capture-overlay";
const isCaptureToast = windowType === "capture-toast";

ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement,
).render(
  <React.StrictMode>
    {isCaptureOverlay ? <CaptureOverlay /> : isCaptureToast ? <CaptureToast /> : <App />}
  </React.StrictMode>
);
