import { useCallback, useEffect, useRef, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

import {
  listenForCaptureNotifications,
  revealScreenshotInFolder,
} from "../../services/notifications";
import type { CaptureNotificationPayload } from "../../types/notification";

import "./CaptureToast.css";

async function playSuccessTone(): Promise<void> {
  const context = new AudioContext();

  try {
    if (context.state === "suspended") {
      await context.resume();
    }

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(740, now);
    oscillator.frequency.exponentialRampToValueAtTime(1040, now + 0.11);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.065, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.23);

    oscillator.connect(gain);
    gain.connect(context.destination);

    await new Promise<void>((resolve) => {
      oscillator.onended = () => resolve();
      oscillator.start(now);
      oscillator.stop(now + 0.24);
    });
  } finally {
    await context.close();
  }
}

function CaptureToast() {
  const [payload, setPayload] = useState<CaptureNotificationPayload | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);
  const exitTimerRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);

  const hideNotification = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setIsExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      setIsVisible(false);
      setIsExiting(false);
      setPayload(null);
      void getCurrentWindow().hide().catch((error: unknown) => {
        console.error("Failed to hide capture notification:", error);
      });
    }, 280);
  }, []);

  const scheduleDismiss = useCallback(() => {
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
    }
    dismissTimerRef.current = window.setTimeout(hideNotification, 2000);
  }, [hideNotification]);

  useEffect(() => {
    let mounted = true;
    let unlisten: (() => void) | undefined;

    void listenForCaptureNotifications((nextPayload) => {
      if (!mounted) return;

      clearTimers();
      setIsHovered(false);

      if (nextPayload.kind === "success" && nextPayload.playSuccessSound) {
        void playSuccessTone().catch((error: unknown) => {
          console.error("Failed to play capture success sound:", error);
        });
      }

      const shouldShow =
        nextPayload.kind === "error" || nextPayload.showSuccessNotification;

      if (!shouldShow) return;

      setPayload(nextPayload);
      setIsExiting(false);
      setIsVisible(true);
      scheduleDismiss();
    })
      .then((stopListening) => {
        if (mounted) {
          unlisten = stopListening;
        } else {
          stopListening();
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to listen for capture notifications:", error);
      });

    return () => {
      mounted = false;
      clearTimers();
      unlisten?.();
    };
  }, [clearTimers, scheduleDismiss]);

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
      setIsExiting(false);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (payload && isVisible) scheduleDismiss();
  };

  const handleClick = () => {
    if (payload?.kind !== "success" || !payload.filePath) return;

    void revealScreenshotInFolder(payload.filePath)
      .then(() => hideNotification())
      .catch((error: unknown) => {
        console.error("Failed to open screenshot location:", error);
      });
  };

  const isError = payload?.kind === "error";

  return (
    <main className="capture-toast-root" aria-live="polite">
      {payload && isVisible && (
      <button
        type="button"
        className={`capture-toast-card${isHovered ? " is-expanded" : ""}${isExiting ? " is-exiting" : ""}${isError ? " is-error" : " is-success"}`}
        aria-label={isError ? "Capture error" : "Open screenshot folder"}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        <span className="capture-toast-icon" aria-hidden="true">
          {isError ? (
            <svg viewBox="0 0 48 48" fill="none">
              <path d="M24 5.5 44 40H4L24 5.5Z" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/>
              <path d="M24 17V27" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round"/>
              <circle cx="24" cy="33" r="1.8" fill="currentColor"/>
            </svg>
          ) : (
            <svg viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="19" stroke="currentColor" strokeWidth="3"/>
              <path d="m14 24 7 7 14-15" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </span>

        <span className="capture-toast-content">
          {isError ? (
            <>
              <strong>Ошибка захвата</strong>
              <span className="capture-toast-error-code">
                {payload.errorCode || "UNKNOWN_ERROR"}
              </span>
            </>
          ) : (
            <>
              <strong>Открыть папку со скриншотом</strong>
              <span className="capture-toast-separator">или</span>
              <span className="capture-toast-shortcut">
                <kbd>CTRL+V</kbd>  вставить скопированное изображение
              </span>
            </>
          )}
        </span>
      </button>
      )}
    </main>
  );
}

export default CaptureToast;