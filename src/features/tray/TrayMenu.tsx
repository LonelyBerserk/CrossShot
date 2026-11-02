import { getCurrentWindow } from "@tauri-apps/api/window";

import { openCaptureOverlay } from "../../services/overlay";

import "./TrayMenu.css";

function TrayMenu() {
  const handleCapture = async () => {
    try {
      await getCurrentWindow().hide();
      await openCaptureOverlay(0);
    } catch (error) {
      console.error("Failed to start capture from tray popup:", error);
    }
  };

  return (
    <main className="tray-popup-root">
      <div className="tray-popup-card">
        <button
          type="button"
          className="tray-popup-action tray-popup-capture"
          aria-label="Сделать скриншот"
          title="Сделать скриншот"
          onClick={() => void handleCapture()}
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 8.5h3l1.65-2.25h6.7L17 8.5h3v10H4v-10Z"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinejoin="round"
            />
            <circle
              cx="12"
              cy="13.5"
              r="3.1"
              stroke="currentColor"
              strokeWidth="1.65"
            />
            <path
              d="M17.4 11h.01"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <button
          type="button"
          className="tray-popup-action tray-popup-record"
          aria-label="Запись экрана  скоро"
          title="Запись экрана  скоро"
          disabled
        >
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect
              x="3"
              y="6.5"
              width="13"
              height="11"
              rx="2"
              stroke="currentColor"
              strokeWidth="1.65"
            />
            <path
              d="m16 10 5-2.5v9L16 14"
              stroke="currentColor"
              strokeWidth="1.65"
              strokeLinejoin="round"
            />
            <circle
              cx="9.5"
              cy="12"
              r="2"
              stroke="currentColor"
              strokeWidth="1.4"
            />
          </svg>
          <span className="tray-popup-coming-soon">SOON</span>
        </button>
      </div>
    </main>
  );
}

export default TrayMenu;