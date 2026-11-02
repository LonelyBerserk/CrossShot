import { useEffect, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import "./WindowTitleBar.css";

interface WindowTitleBarProps {
  language: "ru" | "en";
  children?: ReactNode;
}

function WindowTitleBar({ language, children }: WindowTitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const appWindow = getCurrentWindow();

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    const syncMaximizedState = async () => {
      try {
        const maximized = await appWindow.isMaximized();

        if (mounted) {
          setIsMaximized(maximized);
        }
      } catch (error) {
        console.error("Failed to read window maximized state:", error);
      }
    };

    void syncMaximizedState();

    void appWindow
      .onResized(() => {
        void syncMaximizedState();
      })
      .then((stopListening) => {
        if (mounted) {
          unlisten = stopListening;
        } else {
          stopListening();
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to listen for window resize:", error);
      });

    return () => {
      mounted = false;
      unlisten?.();
    };
  }, [appWindow]);

  const labels =
    language === "ru"
      ? {
          minimize: "Свернуть в трей",
          maximize: "Развернуть",
          restore: "Восстановить",
          close: "Закрыть в трей",
        }
      : {
          minimize: "Minimize to tray",
          maximize: "Maximize",
          restore: "Restore",
          close: "Close to tray",
        };

  const handleHide = async () => {
    try {
      await appWindow.hide();
    } catch (error) {
      console.error("Failed to hide CrossShot window:", error);
    }
  };

  const handleToggleMaximize = async () => {
    try {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    } catch (error) {
      console.error("Failed to toggle CrossShot window maximize state:", error);
    }
  };

  return (
    <header className="window-titlebar">
      <div className="window-titlebar-drag-region" data-tauri-drag-region>
        <span className="window-titlebar-brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2.75 21.25 12 12 21.25 2.75 12 12 2.75Z"
              stroke="currentColor"
              strokeWidth="1.6"
            />
            <path
              d="M8 12h8M12 8v8"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="window-titlebar-brand-name" data-tauri-drag-region>
          CrossShot
        </span>
      </div>

      <div className="window-titlebar-actions">
        {children && <div className="window-titlebar-extra">{children}</div>}

        <button
          type="button"
          className="window-control-button"
          aria-label={labels.minimize}
          title={labels.minimize}
          onClick={() => void handleHide()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h10" />
          </svg>
        </button>

        <button
          type="button"
          className="window-control-button"
          aria-label={isMaximized ? labels.restore : labels.maximize}
          title={isMaximized ? labels.restore : labels.maximize}
          aria-pressed={isMaximized}
          onClick={() => void handleToggleMaximize()}
        >
          {isMaximized ? (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.5 5.5V3.25h7.25v7.25H10.5" />
              <rect x="3.25" y="5.5" width="7.25" height="7.25" rx=".6" />
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" aria-hidden="true">
              <rect x="3.25" y="3.25" width="9.5" height="9.5" rx=".7" />
            </svg>
          )}
        </button>

        <button
          type="button"
          className="window-control-button window-control-close"
          aria-label={labels.close}
          title={labels.close}
          onClick={() => void handleHide()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
    </header>
  );
}

export default WindowTitleBar;