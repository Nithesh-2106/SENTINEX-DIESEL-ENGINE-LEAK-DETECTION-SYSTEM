/**
 * Header.jsx — Premium dashboard header with live status indicators.
 */
import React, { useEffect, useState } from "react";

export default function Header({
  isStreaming,
  readingCount,
  role,
  onLogout,
  activeEngine = "CAT_C13",
  engineDisplayName = "CAT C13 — 12.5L",
  onGenerateReport,
  hasReadings = false,
}) {
  const [now, setNow] = useState(() => new Date());
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(id);
  }, [activeEngine, engineDisplayName]);

  const timeStr = now.toLocaleTimeString("en-GB", { hour12: false });
  const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <header className="relative shrink-0 border-b border-hud-border bg-gradient-to-r from-hud-bg0 via-[#0a1020] to-hud-bg0">
      {/* Ambient glow line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-hud-cyan/30 to-transparent" />

      <div className="mx-auto flex max-w-[1920px] items-center justify-between gap-4 px-5 py-3">

        {/* LEFT — Brand */}
        <div className="flex items-center gap-3.5 min-w-0">
          {/* CAT yellow accent */}
          <div className="relative">
            <div className="h-9 w-1 rounded-full bg-gradient-to-b from-[#FFB800] to-[#FF8C00]" />
            <div className="absolute inset-0 blur-sm bg-[#FFB800]/50 rounded-full" />
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-black tracking-tight text-white">CATERPILLAR</span>
              <span className="text-[10px] font-bold tracking-[0.2em] text-hud-cyan uppercase">HUD</span>
            </div>
            <div className="text-[10px] font-medium text-slate-400">
              Diesel Engine Leak Detection — Real-Time Monitor
            </div>
          </div>
        </div>

        {/* CENTRE — Status chips */}
        <div className="flex items-center gap-2 flex-wrap justify-center">

          {/* Live / Paused status */}
          <div className={`flex items-center gap-2 rounded-full border px-3 py-1.5 transition-all duration-300 ${
            isStreaming
              ? "border-emerald-500/30 bg-emerald-900/20 text-emerald-300"
              : "border-slate-700/50 bg-slate-800/30 text-slate-500"
          }`}>
            <span className={`h-1.5 w-1.5 rounded-full ${isStreaming ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
            <span className="text-[10px] font-black uppercase tracking-widest">
              {isStreaming ? "Live Monitoring" : "Paused"}
            </span>
          </div>

          {/* Engine badge */}
          <div className={`flex items-center gap-1.5 rounded-full border border-hud-border/60 bg-hud-bg1/60 px-3 py-1.5 transition-all duration-300 ${
            flash ? "border-[#FFB800]/60 bg-[#FFB800]/10" : ""
          }`}>
            <svg className="h-3 w-3 text-[#FFB800]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd"/>
            </svg>
            <span className={`text-[10px] font-bold tabular-nums transition-colors ${flash ? "text-[#FFB800]" : "text-white/90"}`}>
              {engineDisplayName}
            </span>
          </div>

          {/* Test cell */}
          <div className="flex items-center gap-1.5 rounded-full border border-hud-border/40 bg-hud-bg1/40 px-3 py-1.5">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Cell</span>
            <span className="text-[10px] font-bold text-slate-300">TC-03</span>
          </div>

          {/* Reading count */}
          <div className="flex items-center gap-1.5 rounded-full border border-hud-purple/20 bg-hud-purple/10 px-3 py-1.5">
            <span className="text-[10px] text-hud-purple/60 uppercase tracking-wider">Reading</span>
            <span className="font-mono text-[10px] font-bold text-hud-purple">#{readingCount}</span>
          </div>
        </div>

        {/* RIGHT — Actions + clock */}
        <div className="flex items-center gap-3">
          {role && (
            <span className="rounded-full border border-hud-border/50 bg-hud-bg1/50 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-white/70">
              {role === "tester" ? "🔧 Tester" : "👁 Test Head"}
            </span>
          )}

          {onGenerateReport && (
            <button
              type="button"
              onClick={onGenerateReport}
              disabled={!hasReadings}
              className="flex items-center gap-1.5 rounded-lg border border-[#FFB800]/50 bg-[#FFB800]/10 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-[#FFB800] transition hover:bg-[#FFB800]/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Report
            </button>
          )}

          {/* Clock */}
          <div className="flex flex-col items-end">
            <span className="font-mono text-sm font-bold text-white/90 tabular-nums">{timeStr}</span>
            <span className="text-[9px] text-slate-500">{dateStr}</span>
          </div>

          {role && onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-lg border border-hud-border/50 bg-hud-bg1/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition hover:border-red-500/40 hover:text-red-400"
            >
              Logout
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
