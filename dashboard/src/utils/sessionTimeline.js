import { loadJson, saveJson } from "../lib/storage.js";
import { SCENARIO_LABELS } from "../simulator.js";
import { getTesterBayId, getTesterDisplayName, isTesterRole, loadTesterRegistry } from "./testerRegistry.js";

export const TIMELINE_PREFIX = "cat_session_timeline_";
export const TIMELINE_MAX_EVENTS = 180;
export const TIMELINE_SYNC_EVENT = "cat-timeline-updated";

export const EVENT_META = {
  LEAK: { label: "LEAK", short: "Leak detected", color: "leak" },
  SSG: { label: "SSG", short: "SSG suppress", color: "ssg" },
  FAULT: { label: "FAULT", short: "Sensor fault", color: "fault" },
  DQP: { label: "DQP", short: "DQ flag", color: "dqp" },
  CHANGE: { label: "CHANGE", short: "Setpoint / scenario", color: "change" },
  STREAM: { label: "STREAM", short: "Stream", color: "stream" },
};

function timelineKey(role) {
  return `${TIMELINE_PREFIX}${role}`;
}

export function createEmptyTimeline(role) {
  return {
    role,
    displayName: getTesterDisplayName(role),
    bayId: getTesterBayId(role),
    sessionStartMs: null,
    events: [],
    updatedAt: Date.now(),
  };
}

export function loadTimeline(role) {
  if (!role || !isTesterRole(role)) return createEmptyTimeline(role || "unknown");
  return loadJson(timelineKey(role), createEmptyTimeline(role));
}

export function saveTimeline(role, timeline) {
  if (!role || !isTesterRole(role)) return;
  const payload = { ...timeline, updatedAt: Date.now() };
  saveJson(timelineKey(role), payload);
  window.dispatchEvent(new CustomEvent(TIMELINE_SYNC_EVENT, { detail: { role, updatedAt: payload.updatedAt } }));
}

export function clearTimeline(role) {
  if (!role || !isTesterRole(role)) return;
  const empty = { ...createEmptyTimeline(role), sessionStartMs: Date.now() };
  saveTimeline(role, empty);
}

/** Append a session event with optional playback frame snapshot. */
export function appendTimelineEvent(role, {
  type,
  ts = Date.now(),
  readingNo = null,
  label = null,
  summary = null,
  frame = null,
  meta = {},
}) {
  if (!role || !isTesterRole(role)) return null;
  const tl = loadTimeline(role);
  const event = {
    id: `tl-${ts}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    ts,
    readingNo,
    label: label || EVENT_META[type]?.short || type,
    summary: summary || "",
    frame,
    meta,
    role,
    bayId: getTesterBayId(role),
    displayName: getTesterDisplayName(role),
  };
  const sessionStartMs = tl.sessionStartMs || ts;
  const events = [...(tl.events || []), event].slice(-TIMELINE_MAX_EVENTS);
  saveTimeline(role, { ...tl, sessionStartMs, events });
  return event;
}

export function buildFrameSnapshot({
  reading,
  prediction,
  rca,
  opRpm,
  opLoad,
  opAmbientPressure,
  scenario,
  engine,
}) {
  if (!reading && !prediction) return null;
  return {
    reading: reading ? { ...reading } : null,
    prediction: prediction ? { ...prediction } : null,
    rca: rca ? { ...rca } : null,
    opRpm,
    opLoad,
    opAmbientPressure,
    scenario,
    engine,
  };
}

/** Merge timelines from all tester bays for head supervisor overview. */
export function mergeTimelines(registry = loadTesterRegistry()) {
  const timelines = registry
    .filter((t) => isTesterRole(t.id))
    .map((t) => loadTimeline(t.id));

  if (!timelines.length) return { sessionStartMs: Date.now(), events: [] };

  const sessionStartMs = Math.min(
    ...timelines.map((tl) => tl.sessionStartMs || Date.now()),
  );
  const events = timelines
    .flatMap((tl) => (tl.events || []).map((e) => ({
      ...e,
      role: tl.role,
      bayId: tl.bayId || getTesterBayId(tl.role),
      displayName: tl.displayName || getTesterDisplayName(tl.role),
    })))
    .sort((a, b) => a.ts - b.ts);

  return { sessionStartMs, events };
}

export function formatElapsed(ms, startMs) {
  const sec = Math.max(0, Math.floor((ms - startMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatAxisLabel(ms, startMs) {
  const sec = Math.max(0, Math.floor((ms - startMs) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m}:00`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function scenarioLabel(id) {
  return SCENARIO_LABELS[id] || id || "—";
}

/** Build markers with normalized position 0–100 on session axis. */
export function buildTimelineMarkers(events = [], sessionStartMs, endMs = Date.now()) {
  if (!events.length) return [];
  const start = sessionStartMs || events[0].ts;
  const end = Math.max(endMs, events[events.length - 1].ts, start + 60000);
  const span = Math.max(end - start, 1000);
  return events.map((e) => ({
    ...e,
    pct: ((e.ts - start) / span) * 100,
    elapsed: formatElapsed(e.ts, start),
    meta: EVENT_META[e.type] || { label: e.type, color: "change" },
  }));
}

export function loadAllTimelines(registry = loadTesterRegistry()) {
  const map = {};
  registry.filter((t) => isTesterRole(t.id)).forEach((t) => {
    map[t.id] = loadTimeline(t.id);
  });
  return map;
}
