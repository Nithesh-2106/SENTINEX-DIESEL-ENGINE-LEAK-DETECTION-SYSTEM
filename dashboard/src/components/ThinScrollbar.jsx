import React, { useState, useEffect, useCallback } from "react";

export default function ThinScrollbar() {
  const [thumbPos, setThumbPos] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(60);
  const [isDragging, setIsDragging] = useState(false);
  const [visible, setVisible] = useState(false);

  const updateThumb = useCallback(() => {
    const scrollH = document.documentElement.scrollHeight - window.innerHeight;
    if (scrollH <= 4) {
      setVisible(false);
      return;
    }
    setVisible(true);
    const pct = window.scrollY / scrollH;
    const trackH = window.innerHeight;
    const th = Math.max(40, (window.innerHeight / document.documentElement.scrollHeight) * trackH);
    setThumbHeight(th);
    setThumbPos(pct * (trackH - th));
  }, []);

  useEffect(() => {
    updateThumb();
    window.addEventListener("scroll", updateThumb, { passive: true });
    window.addEventListener("resize", updateThumb);
    return () => {
      window.removeEventListener("scroll", updateThumb);
      window.removeEventListener("resize", updateThumb);
    };
  }, [updateThumb]);

  useEffect(() => {
    if (!isDragging) return undefined;

    const onMove = (e) => {
      const scrollH = document.documentElement.scrollHeight - window.innerHeight;
      const trackH = window.innerHeight - thumbHeight;
      const y = Math.max(0, Math.min(e.clientY - thumbHeight / 2, trackH));
      const pct = y / trackH;
      window.scrollTo(0, pct * scrollH);
    };

    const onUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, thumbHeight]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        right: 0,
        top: 0,
        width: 6,
        height: "100vh",
        background: "rgba(255,255,255,0.05)",
        zIndex: 1000,
        borderRadius: "3px 0 0 3px",
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          const scrollH = document.documentElement.scrollHeight - window.innerHeight;
          const trackH = window.innerHeight - thumbHeight;
          const pct = Math.max(0, Math.min(e.clientY / window.innerHeight, 1));
          window.scrollTo(0, pct * scrollH);
        }
      }}
    >
      <div
        style={{
          position: "absolute",
          top: thumbPos,
          width: 6,
          height: thumbHeight,
          background: isDragging ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.2)",
          borderRadius: 3,
          cursor: "pointer",
          transition: isDragging ? "none" : "background 0.15s",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsDragging(true);
        }}
      />
    </div>
  );
}
