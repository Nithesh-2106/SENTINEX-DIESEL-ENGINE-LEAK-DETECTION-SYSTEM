import { useCallback, useEffect, useRef, useState } from "react";

function IconFullscreen({ exit }) {
  if (exit) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 3H5a2 2 0 00-2 2v4M15 3h4a2 2 0 012 2v4M9 21H5a2 2 0 01-2-2v-4M15 21h4a2 2 0 002-2v-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M8 21H5a2 2 0 01-2-2v-3M16 21h3a2 2 0 002-2v-3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export default function FLPanelShell({
  title,
  subtitle,
  children,
  className = "",
  actions = null,
  showFullscreen = true,
}) {
  const shellRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => {
      setIsFullscreen(document.fullscreenElement === shellRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement === el) {
        await document.exitFullscreen();
      } else {
        await el.requestFullscreen();
      }
    } catch {
      // ignore unsupported fullscreen
    }
  }, []);

  return (
    <div
      ref={shellRef}
      className={`fl-panel-shell ${isFullscreen ? "fl-panel-shell--fullscreen" : ""} ${className}`}
    >
      <div className="fl-section-header fl-panel-shell__header">
        <div className="fl-section-header__titles">
          <span className="fl-section-title">{title}</span>
          {subtitle && <span className="fl-section-sub">{subtitle}</span>}
        </div>
        <div className="fl-panel-shell__actions">
          {actions}
          {showFullscreen && (
            <button
              type="button"
              className="fl-panel-shell__fs-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              <IconFullscreen exit={isFullscreen} />
            </button>
          )}
        </div>
      </div>
      <div className="fl-panel-shell__body">{children}</div>
    </div>
  );
}
