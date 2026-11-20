import React from "react";

/** Animated Ops Chat mark — speech bubbles + signal pulse */
export default function OpsChatLogo({ size = 36, className = "" }) {
  return (
    <div className={`ops-chat-logo ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 40 40" width={size} height={size} className="ops-chat-logo__svg">
        <defs>
          <linearGradient id="opsChatGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0DB8F0" />
            <stop offset="55%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#10FFAA" />
          </linearGradient>
        </defs>
        <circle className="ops-chat-logo__ring" cx="20" cy="20" r="17" fill="none" stroke="url(#opsChatGrad)" strokeWidth="1.2" opacity="0.45" />
        <path
          className="ops-chat-logo__bubble ops-chat-logo__bubble--back"
          d="M8 14a3 3 0 013-3h12a3 3 0 013 3v7a3 3 0 01-3 3h-8l-3 2.5V24a3 3 0 01-3-3v-7z"
          fill="rgba(13,184,240,0.22)"
          stroke="url(#opsChatGrad)"
          strokeWidth="1.2"
        />
        <path
          className="ops-chat-logo__bubble ops-chat-logo__bubble--front"
          d="M14 18a3 3 0 013-3h12a3 3 0 013 3v7a3 3 0 01-3 3h-8l-3 2.5V28a3 3 0 01-3-3v-7z"
          fill="rgba(99,102,241,0.28)"
          stroke="url(#opsChatGrad)"
          strokeWidth="1.4"
        />
        <circle className="ops-chat-logo__dot ops-chat-logo__dot--1" cx="20" cy="22" r="1.4" fill="#10FFAA" />
        <circle className="ops-chat-logo__dot ops-chat-logo__dot--2" cx="25" cy="22" r="1.4" fill="#0DB8F0" />
        <circle className="ops-chat-logo__dot ops-chat-logo__dot--3" cx="30" cy="22" r="1.4" fill="#A855F7" />
      </svg>
    </div>
  );
}
