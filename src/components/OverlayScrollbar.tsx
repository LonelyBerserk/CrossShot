import { useEffect, useState } from "react";

interface OverlayScrollbarProps {
  targetId: string;
}

interface ScrollMetrics {
  top: number;
  height: number;
  visible: boolean;
}

function OverlayScrollbar({ targetId }: OverlayScrollbarProps) {
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    top: 0,
    height: 28,
    visible: false,
  });

  useEffect(() => {
    const viewport = document.getElementById(targetId);

    if (!(viewport instanceof HTMLElement)) {
      return;
    }

    let fadeTimer: number | null = null;
    let resizeObserver: ResizeObserver | null = null;

    const clearFadeTimer = () => {
      if (fadeTimer !== null) {
        window.clearTimeout(fadeTimer);
        fadeTimer = null;
      }
    };

    const refreshMetrics = (reveal: boolean) => {
      const viewportHeight = viewport.clientHeight;
      const contentHeight = viewport.scrollHeight;

      if (
        viewportHeight <= 0 ||
        contentHeight <= viewportHeight + 1
      ) {
        clearFadeTimer();
        setMetrics((previous) => ({
          ...previous,
          visible: false,
        }));
        return;
      }

      const maxScroll = contentHeight - viewportHeight;
      const thumbHeight = Math.min(
        viewportHeight,
        Math.max(28, (viewportHeight * viewportHeight) / contentHeight),
      );
      const maxThumbTop = viewportHeight - thumbHeight;
      const thumbTop = Math.min(
        maxThumbTop,
        Math.max(0, (viewport.scrollTop / maxScroll) * maxThumbTop),
      );

      setMetrics((previous) => ({
        top: thumbTop,
        height: thumbHeight,
        visible: reveal || previous.visible,
      }));

      if (reveal) {
        clearFadeTimer();
        fadeTimer = window.setTimeout(() => {
          setMetrics((previous) => ({
            ...previous,
            visible: false,
          }));
          fadeTimer = null;
        }, 1000);
      }
    };

    const handleScroll = () => refreshMetrics(true);
    const handleResize = () => refreshMetrics(false);

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleResize);

    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => refreshMetrics(false));
      resizeObserver.observe(viewport);

      Array.from(viewport.children).forEach((child) => {
        resizeObserver?.observe(child);
      });
    }

    const mutationObserver = new MutationObserver(() => {
      if (resizeObserver) {
        Array.from(viewport.children).forEach((child) => {
          resizeObserver?.observe(child);
        });
      }

      refreshMetrics(false);
    });

    mutationObserver.observe(viewport, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    refreshMetrics(false);

    return () => {
      clearFadeTimer();
      viewport.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleResize);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
    };
  }, [targetId]);

  return (
    <div
      className={`app-overlay-scrollbar${metrics.visible ? " is-visible" : ""}`}
      aria-hidden="true"
    >
      <span
        className="app-overlay-scrollbar-thumb"
        style={{
          height: `${metrics.height}px`,
          transform: `translateY(${metrics.top}px)`,
        }}
      />
    </div>
  );
}

export default OverlayScrollbar;