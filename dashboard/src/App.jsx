import axios from "axios";
import React, { useCallback, useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import AlertBanner from "./components/AlertBanner.jsx";
import PredictionPanel from "./components/PredictionPanel.jsx";
import ManualInputPanel from "./components/ManualInputPanel.jsx";
import ValidationDemoPanel from "./components/ValidationDemoPanel.jsx";
import PressureChart from "./components/PressureChart.jsx";
import BaselinePanel from "./components/BaselinePanel.jsx";
import SensorGrid from "./components/SensorGrid.jsx";
import SensorHealthDashboard from "./components/SensorHealthDashboard.jsx";
import ShapPanel from "./components/ShapPanel.jsx";
import DataQualityPanel from "./components/DataQualityPanel.jsx";
import SteadyStatePanel from "./components/SteadyStatePanel.jsx";
import JudgeSummaryCard from "./components/JudgeSummaryCard.jsx";
import OperatingPointBar from "./components/OperatingPointBar.jsx";
import OperationsPanel from "./components/OperationsPanel.jsx";
import CellCommsPage from "./components/CellCommsPage.jsx";
import IntroTriggerBtn from "./components/IntroTriggerBtn.jsx";
import ChangeRequestAlert from "./components/ChangeRequestAlert.jsx";
import CommsNotifyBar from "./components/CommsNotifyBar.jsx";
import HeadOpsNotifyBar from "./components/HeadOpsNotifyBar.jsx";
import { useChangeRequestAlerts } from "./hooks/useChangeRequestAlerts.js";
import { useSensorHealth } from "./hooks/useSensorHealth.js";
import ReportPreview from "./components/ReportPreview.jsx";
import DigitalTwinTopBar from "./components/DigitalTwinTopBar.jsx";
import TesterAccountDashboard from "./components/TesterAccountDashboard.jsx";
import TopBar from "./components/layout/TopBar.jsx";
import MainNav from "./components/layout/MainNav.jsx";
import PipelineBreadcrumb from "./components/layout/PipelineBreadcrumb.jsx";
import LeftSidebar from "./components/layout/LeftSidebar.jsx";
import StatusBar from "./components/layout/StatusBar.jsx";
import MetricCard from "./components/layout/MetricCard.jsx";
import { activeModelLabel, displayModelName, DEMO_MODEL_SELECTION } from "./utils/modelSelection.js";
import { getMockPrediction } from "./mockPredictions.js";
import { generateSessionReport } from "./utils/generatePdf.js";
import { loadReportSnapshot } from "./utils/sessionReportShare.js";
import {
  closeScenarioSegments,
  createInitialSessionLog,
  DEMO_SESSION_LOG,
  ENGINE_SERIAL,
  serializeRcaSnapshot,
} from "./utils/sessionReport.js";
import { getSystemState } from "./lib/systemState.js";
import {
  generateReading,
  SCENARIO_LABELS,
  ENGINE_BASELINES,
  ENGINE_DISPLAY,
  ENGINE_HAS_SCR,
  canFaultInjectForScenario,
  getFaultInjectionForScenario,
} from "./simulator.js";
import { getActiveLeakDetails, stabilizeActiveLeaks } from "./utils/multiLeak.js";
import { isLeakActivePrediction, isSensorFaultActive } from "./lib/systemState.js";
import {
  isOperatorOnlyTab,
  readOperatorViewPreference,
  writeOperatorViewPreference,
} from "./constants/dashboardViewMode.js";
import { loadJson, saveJson, uid, appendJsonArray } from "./lib/storage.js";
import { REGISTRY_CHANGE_EVENT } from "./utils/testerRegistry.js";
import { computeDynamicSeverity, actionForSeverity } from "./utils/dynamicSeverity.js";
import { computeRCA } from "./utils/rootCauseEngine.js";
import RcaPanel from "./components/RcaPanel.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import AmbientParticles from "./components/spline/AmbientParticles.jsx";
import DataStreamBg from "./components/spline/DataStreamBg.jsx";
import CellActivityPanel, { TesterLiveBoard } from "./components/CellActivityPanel.jsx";
import TesterViewSelector from "./components/TesterViewSelector.jsx";
import { useTesterPresence } from "./hooks/useTesterPresence.js";
import { useTesterSnapshots } from "./hooks/useTesterSnapshots.js";
import { isMirrorLive } from "./utils/testerPresence.js";
import {
  defaultMessagesReadAt,
  defaultOpsReadAt,
  getTesterDisplayName,
  getTesterBayId,
  getCellPillLabel,
  isHeadRole,
  isTesterRole,
  loadTesterRegistry,
} from "./utils/testerRegistry.js";
import { logCellActivity, loadTesterSession, saveTesterSession, isSnapshotUsable, clearPresence } from "./utils/testerPresence.js";
import { publishTesterSnapshot, applySetpointsToTesterSnapshot, publishOfflineSnapshot } from "./utils/testerSnapshot.js";
import { buildTesterBoard } from "./utils/testerBoard.js";
import {
  loadAppliedHeadOpsIds,
  loadAppliedRequestIds,
  markAppliedHeadOpsId,
  markAppliedRequestId,
} from "./utils/testerApplyState.js";
import CellCommunityDashboard from "./components/CellCommunityDashboard.jsx";
import HeadCellOverview, { computeCellStats } from "./components/HeadCellOverview.jsx";
import HeadCellAggregateSummary from "./components/HeadCellAggregateSummary.jsx";
import AnomalyTimeline from "./components/AnomalyTimeline.jsx";
import { useSessionTimeline } from "./hooks/useSessionTimeline.js";
import {
  appendTimelineEvent,
  buildFrameSnapshot,
  clearTimeline,
  scenarioLabel,
} from "./utils/sessionTimeline.js";
import {
  loadThreadMessages,
  listThreadsForRole,
  migrateLegacyMessages,
  unreadCountForRole,
} from "./utils/cellChat.js";
import { buildCellTesterSummaries } from "./utils/ariaCellContext.js";
import { fetchChatPeers } from "./api/chatPeers.js";
import { isSupabaseConfigured } from "./lib/supabaseClient.js";
import { getAppRole, clearAuthSession } from "./lib/authSession.js";
import { signOut } from "./lib/supabaseAuth.js";
import {
  appendSessionRecord,
  endTestSessionInDb,
  flushBayLiveStatePersist,
  queueBayLiveStatePersist,
  startTestSessionInDb,
} from "./lib/supabasePersistence.js";
import { createChangeRequest, decideChangeRequest, fetchChangeRequests } from "./lib/supabaseRequests.js";
import { loadUserPreferences } from "./lib/supabasePreferences.js";
import { uploadSessionReport } from "./lib/supabaseReports.js";
import { fetchHeadOpsEvents, createHeadOpsEvent } from "./lib/supabaseHeadOps.js";
import { fetchAuditEvents, insertAuditEvent, toLegacyAuditEvent } from "./lib/supabaseAudit.js";
import { syncChatFromDb } from "./lib/supabaseChatMessages.js";

const FederatedLearningPanel = lazy(() => import("./components/FederatedLearningPanel.jsx"));
const DigitalTwin = lazy(() => import("./components/DigitalTwin.jsx"));

export default function App() {
  const navigate = useNavigate();
  const [role, setRole] = useState(() => getAppRole());
  const [headViewingTester, setHeadViewingTester] = useState(null);
  const [headApplyTargets, setHeadApplyTargets] = useState([]);
  const [ariaFocusTester, setAriaFocusTester] = useState(null);
  const [chatTick, setChatTick] = useState(0);
  const [registryTick, setRegistryTick] = useState(0);
  const [chatPeers, setChatPeers] = useState([]);

  const [currentScenario, setCurrentScenario] = useState("normal");
  const scenarioRef = useRef(currentScenario);
  scenarioRef.current = currentScenario;

  const [activeEngine, setActiveEngine] = useState("CAT_C13");
  const activeEngineRef = useRef(activeEngine);
  activeEngineRef.current = activeEngine;

  const [engineBaselines, setEngineBaselines] = useState(ENGINE_BASELINES.CAT_C13);
  const [engineSwitching, setEngineSwitching] = useState(false);
  const [engineSwitchDetails, setEngineSwitchDetails] = useState(null);

  const [switchingLabel, setSwitchingLabel] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const isStreamingRef = useRef(false);
  isStreamingRef.current = isStreaming;
  const loggingOutRef = useRef(false);
  const [intervalMs, setIntervalMs] = useState(1000);

  const [faultInjectionActive, setFaultInjectionActive] = useState(false);
  const faultInjectionRef = useRef(false);
  faultInjectionRef.current = faultInjectionActive;

  const readingCountRef = useRef(0);
  const [readingCount, setReadingCount] = useState(0);

  const [latestReading, setLatestReading] = useState(null);
  const latestReadingRef = useRef(null);
  latestReadingRef.current = latestReading;
  const [latestPrediction, setLatestPrediction] = useState(null);
  const latestPredictionRef = useRef(null);
  latestPredictionRef.current = latestPrediction;
  const [latestRca, setLatestRca] = useState(null);
  const latestRcaRef = useRef(null);
  latestRcaRef.current = latestRca;
  const [latestSecondaryRca, setLatestSecondaryRca] = useState(null);
  const [latestMultiRca, setLatestMultiRca] = useState([]);
  const latestMultiRcaRef = useRef([]);
  latestMultiRcaRef.current = latestMultiRca;
  const [chartBuffer, setChartBuffer] = useState([]);
  const [recentReadings, setRecentReadings] = useState([]);

  const [apiOnline, setApiOnline] = useState(true);
  const [modelSelection, setModelSelection] = useState(DEMO_MODEL_SELECTION);
  const modelSelectionRef = useRef(DEMO_MODEL_SELECTION);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [baselineOpen, setBaselineOpen] = useState(true);
  const [pipelineStats, setPipelineStats] = useState(null);

  const [requests, setRequests] = useState(() => loadJson("cat_requests", []));
  const [auditEvents, setAuditEvents] = useState([]);
  const [notifications, setNotifications] = useState(() => loadJson("cat_notify", []));
  const [messagesReadAt, setMessagesReadAt] = useState(() => loadJson("cat_messages_read_at", defaultMessagesReadAt()));
  const [opsReadAt, setOpsReadAt] = useState(() => loadJson("cat_ops_read_at", defaultOpsReadAt()));
  const [headOpsEvents, setHeadOpsEvents] = useState([]);

  const [leakStartMs, setLeakStartMs] = useState(null);
  const [leakAtReadingNo, setLeakAtReadingNo] = useState(null);

  const prevLeakRef = useRef(false);
  const prevSensorFaultRef = useRef(false);
  const wasSuppressedRef = useRef(false);

  const [sessionLog, setSessionLog] = useState(() =>
    createInitialSessionLog("CAT_C13", ENGINE_DISPLAY.CAT_C13)
  );
  const sessionLogRef = useRef(sessionLog);
  sessionLogRef.current = sessionLog;
  const persistedLeaksRef = useRef(0);
  const persistedFaultsRef = useRef(0);
  const prevStreamingRef = useRef(false);
  const [showReport, setShowReport] = useState(false);
  const [reportSessionLog, setReportSessionLog] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [previousTab, setPreviousTab] = useState("dashboard");
  const [flSubView, setFlSubView] = useState("architecture");
  const [twinPresentMode, setTwinPresentMode] = useState(false);
  const [operatorView, setOperatorView] = useState(() => readOperatorViewPreference());
  const [highlightedRequestId, setHighlightedRequestId] = useState(null);
  const [commsBannerDismissedId, setCommsBannerDismissedId] = useState(null);
  const [commsInitialThreadId, setCommsInitialThreadId] = useState(null);
  const [pendingReportShare, setPendingReportShare] = useState(null);
  const [headOpsBannerDismissedId, setHeadOpsBannerDismissedId] = useState(null);
  const [playbackEvent, setPlaybackEvent] = useState(null);

  const {
    alerts: changeRequestAlerts,
    dismissAlert: dismissChangeRequestAlert,
  } = useChangeRequestAlerts({ role, requests });

  useEffect(() => {
    if (!role) {
      setChatPeers([]);
      return;
    }
    fetchChatPeers()
      .then(setChatPeers)
      .catch(() => setChatPeers([]));
  }, [role, registryTick]);

  const activeTesterRegistry = useMemo(() => {
    if (isSupabaseConfigured() && chatPeers.length > 0) {
      return chatPeers.filter((t) => t.isActive !== false);
    }
    return loadTesterRegistry();
  }, [chatPeers, registryTick]);

  const chatRegistry = useMemo(() => chatPeers, [chatPeers]);

  const { snapshots: testerSnapshots } = useTesterSnapshots(Boolean(role), {
    useSupabase: isSupabaseConfigured() && Boolean(role),
    registry: activeTesterRegistry,
  });

  const boardTesters = useMemo(
    () => buildTesterBoard(testerSnapshots, activeTesterRegistry),
    [testerSnapshots, activeTesterRegistry],
  );

  const cellTesterSummaries = useMemo(
    () => buildCellTesterSummaries(boardTesters),
    [boardTesters],
  );

  useEffect(() => {
    if (!isHeadRole(role)) return;
    if (headViewingTester) {
      setHeadApplyTargets([headViewingTester]);
      return;
    }
    setHeadApplyTargets((prev) => {
      if (prev.length > 0) return prev;
      return boardTesters.filter((t) => t.online).map((t) => t.id);
    });
  }, [role, headViewingTester, boardTesters]);

  useEffect(() => {
    if (!isHeadRole(role) || !headViewingTester) return;
    const snap = testerSnapshots[headViewingTester];
    if (!snap) return;
    setTargetRpm(snap.spRpm ?? snap.targetRpm ?? 1800);
    setTargetLoad(snap.spLoad ?? snap.targetLoad ?? 75);
    setTargetAmbientPressure(snap.spAmbient ?? snap.targetAmbientPressure ?? 101.3);
  }, [role, headViewingTester, testerSnapshots]);

  useTesterPresence({
    role,
    activeTab,
    activeEngine,
    currentScenario,
    isStreaming,
    readingCount,
    latestPrediction,
    snapshots: testerSnapshots,
  });

  const appliedRequestIdsRef = useRef(new Set());
  const appliedHeadOpsIdsRef = useRef(new Set());
  const lastSnapshotPublishRef = useRef(0);
  const roleRef = useRef(role);
  roleRef.current = role;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const chartBufferRef = useRef(chartBuffer);
  chartBufferRef.current = chartBuffer;
  const recentReadingsRef = useRef(recentReadings);
  recentReadingsRef.current = recentReadings;
  const leakStartMsRef = useRef(leakStartMs);
  leakStartMsRef.current = leakStartMs;
  const leakAtReadingNoRef = useRef(leakAtReadingNo);
  leakAtReadingNoRef.current = leakAtReadingNo;
  const engineBaselinesRef = useRef(engineBaselines);
  engineBaselinesRef.current = engineBaselines;
  const apiOnlineRef = useRef(apiOnline);
  apiOnlineRef.current = apiOnline;
  const pipelineStatsRef = useRef(pipelineStats);
  pipelineStatsRef.current = pipelineStats;

  const navigateToComms = useCallback(() => {
    setActiveTab("comms");
  }, []);

  const closeChat = useCallback(() => {
    setActiveTab(previousTab === "chat" ? "dashboard" : previousTab);
  }, [previousTab]);

  const navigateToChangeRequests = useCallback((requestId) => {
    setActiveTab("operations");
    setHighlightedRequestId(requestId);
    const matching = changeRequestAlerts.find((a) => a.request.id === requestId);
    if (matching) dismissChangeRequestAlert(matching.key);
    window.setTimeout(() => {
      const panel = document.getElementById("change-requests-panel");
      const scrollRoot = document.querySelector(".operations-scroll") || document.getElementById("main-scroll");
      if (panel) {
        if (scrollRoot) {
          const top = panel.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - 24;
          scrollRoot.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        } else {
          panel.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      window.setTimeout(() => setHighlightedRequestId(null), 6000);
    }, 120);
  }, [changeRequestAlerts, dismissChangeRequestAlert]);

  const openTesterAccount = useCallback(() => {
    setPreviousTab(activeTabRef.current);
    setActiveTab("account");
  }, []);

  const closeTesterAccount = useCallback(() => {
    setActiveTab(previousTab === "account" ? "dashboard" : previousTab);
  }, [previousTab]);

  const handleTabChange = useCallback((tab) => {
    setPreviousTab(activeTabRef.current);
    if (tab === "federated") {
      setFlSubView("architecture");
    }
    setActiveTab(tab);
  }, []);

  const handleOperatorViewChange = useCallback((next) => {
    writeOperatorViewPreference(next);
    setOperatorView(next);
    if (!next && isOperatorOnlyTab(activeTabRef.current)) {
      setActiveTab("dashboard");
    }
  }, []);

  useEffect(() => {
    if (!operatorView && isOperatorOnlyTab(activeTab)) {
      setActiveTab("dashboard");
    }
  }, [operatorView, activeTab]);

  const openFlGlobe = useCallback(() => {
    setPreviousTab(activeTabRef.current);
    setActiveTab("federated");
    setFlSubView("globe");
  }, []);

  const setFlSubViewFromPanel = useCallback((subView) => {
    setFlSubView(subView);
  }, []);

  const openManageBays = useCallback(() => {
    setActiveTab("operations");
    window.setTimeout(() => {
      const panel = document.getElementById("tester-console-mgmt");
      const scrollRoot = document.querySelector(".operations-scroll") || document.getElementById("main-scroll");
      if (panel) {
        if (scrollRoot) {
          const top = panel.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - 16;
          scrollRoot.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
        } else {
          panel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }, 120);
  }, []);

  const handleOpenSharedReport = useCallback((attachment) => {
    const snap = loadReportSnapshot(attachment?.sessionId);
    if (snap) {
      setReportSessionLog(snap);
      setShowReport(true);
    }
  }, []);

  const handleShareReportToComms = useCallback((log) => {
    if (!role || !log) return;
    setPendingReportShare({ ...log, endTime: log.endTime || new Date() });
    setActiveTab("comms");
    setShowReport(false);
  }, [role]);

  // Manual disturbance controls model a real test cell:
  // the operator adjusts SETPOINTS, while ACTUAL signals settle gradually.
  const setpointRampRef = useRef(null);

  const [targetRpm, setTargetRpm] = useState(1800); // setpoint target
  const [targetLoad, setTargetLoad] = useState(75); // setpoint target
  const [targetAmbientPressure, setTargetAmbientPressure] = useState(101.3);
  const targetRpmRef = useRef(targetRpm);
  targetRpmRef.current = targetRpm;
  const targetLoadRef = useRef(targetLoad);
  targetLoadRef.current = targetLoad;
  const targetAmbientPressureRef = useRef(targetAmbientPressure);
  targetAmbientPressureRef.current = targetAmbientPressure;
  const [disturbanceMode, setDisturbanceMode] = useState("step"); // "step" | "ramp"
  const [rampSeconds, setRampSeconds] = useState(5);
  const [changeReason, setChangeReason] = useState("Ramp Test");

  const plantRef = useRef({
    rpm_sp: 1800,
    load_sp: 75,
    p_amb: 101.3,
    rpm_act: 1800,
    load_act: 75,
  });

  const [opRpm, setOpRpm] = useState(1800); // actual (display/debug)
  const [opLoad, setOpLoad] = useState(75); // actual (display/debug)
  const [opAmbientPressure, setOpAmbientPressure] = useState(101.3);
  const [spRpm, setSpRpm] = useState(1800);
  const [spLoad, setSpLoad] = useState(75);
  const [spAmbient, setSpAmbient] = useState(101.3);
  const opRpmRef = useRef(opRpm);
  opRpmRef.current = opRpm;
  const opLoadRef = useRef(opLoad);
  opLoadRef.current = opLoad;
  const opAmbientPressureRef = useRef(opAmbientPressure);
  opAmbientPressureRef.current = opAmbientPressure;
  const severityHistoryRef = useRef([]);
  const spRpmRef = useRef(spRpm);
  spRpmRef.current = spRpm;
  const spLoadRef = useRef(spLoad);
  spLoadRef.current = spLoad;
  const spAmbientRef = useRef(spAmbient);
  spAmbientRef.current = spAmbient;

  useEffect(() => {
    saveJson("cat_notify", notifications);
  }, [notifications]);
  useEffect(() => {
    saveJson("cat_messages_read_at", messagesReadAt);
  }, [messagesReadAt]);
  useEffect(() => {
    saveJson("cat_ops_read_at", opsReadAt);
  }, [opsReadAt]);

  useEffect(() => {
    if (!role) return undefined;
    let cancelled = false;
    axios
      .get("/api/model-selection", { timeout: 8000 })
      .then((res) => {
        if (cancelled) return;
        modelSelectionRef.current = res.data;
        setModelSelection(res.data);
      })
      .catch(() => {
        if (cancelled) return;
        modelSelectionRef.current = DEMO_MODEL_SELECTION;
        setModelSelection(DEMO_MODEL_SELECTION);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  useEffect(() => {
    if (!role) return undefined;

    let alive = true;
    const loadRequests = async () => {
      const next = await fetchChangeRequests();
      if (alive) setRequests(next);
    };

    void loadRequests();
    const pollId = window.setInterval(loadRequests, 2000);
    return () => {
      alive = false;
      clearInterval(pollId);
    };
  }, [role]);

  useEffect(() => {
    if (!role) return undefined;

    let alive = true;
    const loadAudit = async () => {
      const rows = await fetchAuditEvents();
      if (alive) setAuditEvents(rows.map(toLegacyAuditEvent));
    };

    void loadAudit();
    const pollId = window.setInterval(loadAudit, 2500);
    return () => {
      alive = false;
      clearInterval(pollId);
    };
  }, [role]);

  useEffect(() => {
    if (!role) return undefined;

    let alive = true;
    const loadHeadOps = async () => {
      const rows = await fetchHeadOpsEvents();
      if (alive) setHeadOpsEvents(rows);
    };

    void loadHeadOps();
    const pollId = window.setInterval(loadHeadOps, 1500);
    return () => {
      alive = false;
      clearInterval(pollId);
    };
  }, [role]);

  useEffect(() => {
    if (!role) return undefined;
    let active = true;
    void loadUserPreferences().then((prefs) => {
      if (!active || !prefs) return;
      if (typeof prefs.operatorView === "boolean") {
        setOperatorView(prefs.operatorView);
      }
    });
    return () => {
      active = false;
    };
  }, [role]);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "cat_notify") setNotifications(loadJson("cat_notify", []));
      if (e.key === "cat_cell_threads" || e.key === "cat_cell_messages") setChatTick((n) => n + 1);
      if (e.key === "cat_messages_read_at") setMessagesReadAt(loadJson("cat_messages_read_at", defaultMessagesReadAt()));
      if (e.key === "cat_ops_read_at") setOpsReadAt(loadJson("cat_ops_read_at", defaultOpsReadAt()));
    };
    const onRegistry = () => setRegistryTick((n) => n + 1);
    window.addEventListener("storage", onStorage);
    window.addEventListener(REGISTRY_CHANGE_EVENT, onRegistry);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(REGISTRY_CHANGE_EVENT, onRegistry);
    };
  }, []);

  const logEvent = useCallback((type, message) => {
    void insertAuditEvent({ type, message, role }).then((row) => {
      if (!row) return;
      setAuditEvents((prev) => [toLegacyAuditEvent(row), ...prev.filter((e) => e.id !== row.id)].slice(0, 120));
    });
  }, [role]);

  const notify = useCallback((subjectOrPayload) => {
    const base = {
      id: uid("msg"),
      ts: Date.now(),
      channel: "CELL-OPS",
    };
    let item = base;
    if (typeof subjectOrPayload === "string") {
      const s = subjectOrPayload;
      if (/REQUEST SUBMITTED/i.test(s)) {
        item = { ...base, type: "submitted", title: "Change request submitted", summary: s.replace(/^REQUEST SUBMITTED\s*/i, "").replace(/— pending.*/i, "").trim(), detail: "Awaiting Test Head approval" };
      } else if (/PENDING APPROVAL/i.test(s)) {
        item = { ...base, type: "pending", title: "Pending approval", summary: s.replace(/^PENDING APPROVAL:\s*/i, "").trim(), detail: "Test Head inbox" };
      } else if (/^APPROVED/i.test(s)) {
        item = { ...base, type: "approved", title: "Request approved", summary: s.replace(/^APPROVED:\s*/i, "").trim(), detail: "Setpoints applied" };
      } else if (/^REJECTED/i.test(s)) {
        const parts = s.replace(/^REJECTED:\s*/i, "").split(" — ");
        item = { ...base, type: "rejected", title: "Request rejected", summary: parts[0]?.trim(), detail: parts[1]?.trim() };
      } else {
        item = { ...base, type: "info", title: "Cell update", summary: s };
      }
      item.subject = s;
    } else {
      item = { ...base, ...subjectOrPayload };
    }
    setNotifications((prev) => [item, ...prev].slice(0, 50));
  }, []);

  const applySetpoints = useCallback((to, mode, rampSec) => {
    setTargetRpm(to.rpm);
    setTargetLoad(to.load);
    setTargetAmbientPressure(to.p);

    if (isTesterRole(role)) {
      appendTimelineEvent(role, {
        type: "CHANGE",
        readingNo: readingCountRef.current,
        label: "Setpoint change",
        summary: `SP ${to.rpm.toFixed(0)} RPM / ${to.load.toFixed(0)}% / ${to.p.toFixed(1)} kPa (${mode})`,
        frame: buildFrameSnapshot({
          reading: latestReadingRef.current,
          prediction: latestPredictionRef.current,
          rca: latestRcaRef.current,
          opRpm: plantRef.current.rpm_act,
          opLoad: plantRef.current.load_act,
          opAmbientPressure: plantRef.current.p_amb,
          scenario: scenarioRef.current,
          engine: activeEngineRef.current,
        }),
        meta: { to, mode, rampSec },
      });
    }

    if (mode === "step") {
      const p = plantRef.current;
      p.rpm_sp = to.rpm;
      p.load_sp = to.load;
      p.p_amb = to.p;
      setSpRpm(to.rpm);
      setSpLoad(to.load);
      setSpAmbient(to.p);
      setpointRampRef.current = null;
    } else {
      const startMs = Date.now();
      setpointRampRef.current = {
        startMs,
        endMs: startMs + rampSec * 1000,
        from: {
          rpm_sp: plantRef.current.rpm_sp,
          load_sp: plantRef.current.load_sp,
          p_amb: plantRef.current.p_amb,
        },
        to: { rpm_sp: to.rpm, load_sp: to.load, p_amb: to.p },
      };
      setSpRpm(to.rpm);
      setSpLoad(to.load);
      setSpAmbient(to.p);
    }
    axios.post("/api/data-quality/reset").catch(() => {});
  }, [role]);

  const emitHeadOpsEvent = useCallback((type, message, sp, { targets = [], mode = "step", rampSeconds: rampSec = 5 } = {}) => {
    void createHeadOpsEvent({
      type,
      message,
      sp,
      targets,
      mode,
      rampSeconds: rampSec,
    })
      .then((evt) => {
        setHeadOpsEvents((prev) => [evt, ...prev.filter((item) => item.id !== evt.id)].slice(0, 80));
        window.dispatchEvent(new CustomEvent("cat-head-ops-event", { detail: evt }));
      })
      .catch((err) => {
        console.warn("[SENTINEX] head ops event:", err);
      });
  }, []);

  const createRequest = useCallback(async () => {
    if (!isTesterRole(role)) return;
    const displayName = getTesterDisplayName(role);
    const r = await createChangeRequest({
      reason: changeReason,
      mode: disturbanceMode,
      rampSeconds,
      sessionId: sessionLogRef.current?.sessionId ?? null,
      from: {
        rpm: plantRef.current.rpm_sp,
        load: plantRef.current.load_sp,
        p: plantRef.current.p_amb,
      },
      to: { rpm: targetRpm, load: targetLoad, p: targetAmbientPressure },
    });
    setRequests((prev) => [r, ...prev.filter((item) => item.id !== r.id)].slice(0, 50));
    logEvent(
      "REQUEST_CREATED",
      `${displayName} requested SP ${r.to.rpm.toFixed(0)} RPM / ${r.to.load.toFixed(0)}% / ${r.to.p.toFixed(1)} kPa (${r.mode.toUpperCase()})`
    );
    notify(`REQUEST SUBMITTED ${new Date(r.createdAt).toLocaleTimeString("en-GB", { hour12: false })}: ${r.to.rpm.toFixed(0)} RPM / ${r.to.load.toFixed(0)}% — pending head approval`);
    window.dispatchEvent(new CustomEvent("cat-request-created", { detail: r }));
  }, [role, changeReason, disturbanceMode, rampSeconds, targetRpm, targetLoad, targetAmbientPressure, logEvent, notify]);

  const approveRequest = useCallback(async (id) => {
    const req = requests.find((x) => x.id === id);
    if (!req) return;
    setHighlightedRequestId((cur) => (cur === id ? null : cur));
    dismissChangeRequestAlert(id);
    const updated = await decideChangeRequest(id, { status: "approved" });
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? updated : r))
    );

    // Setpoints apply on the requesting tester's console (cross-tab via event + storage).
    applySetpointsToTesterSnapshot(req.requestedBy, req.to, {
      mode: req.mode,
      rampSeconds: req.rampSeconds,
    });
    window.dispatchEvent(new CustomEvent("cat-request-decided", { detail: updated }));

    logEvent("REQUEST_APPROVED", `Test Head approved ${req.requestedByName || req.requestedBy}'s request ${id}.`);
    notify(`APPROVED: Applying ${req.to.rpm.toFixed(0)} RPM / ${req.to.load.toFixed(0)}%`);
  }, [requests, logEvent, notify, dismissChangeRequestAlert]);

  const rejectRequest = useCallback(async (id, rejectionReason = "Rejected by Test Head") => {
    const req = requests.find((x) => x.id === id);
    if (!req) return;
    setHighlightedRequestId((cur) => (cur === id ? null : cur));
    dismissChangeRequestAlert(id);
    const updated = await decideChangeRequest(id, { status: "rejected", rejectionReason });
    setRequests((prev) =>
      prev.map((r) => (r.id === id ? updated : r))
    );
    logEvent("REQUEST_REJECTED", `Test Head rejected request ${id}. Cause: ${rejectionReason}`);
    notify(`REJECTED: ${req.to.rpm.toFixed(0)} RPM / ${req.to.load.toFixed(0)}% — ${rejectionReason}`);
    window.dispatchEvent(new CustomEvent("cat-request-decided", { detail: updated }));
  }, [requests, logEvent, notify, dismissChangeRequestAlert]);

  const applyDisturbance = useCallback(() => {
    if (role !== "head") return;
    if (headApplyTargets.length === 0) {
      notify("Select at least one tester bay before applying");
      return;
    }
    const to = { rpm: targetRpm, load: targetLoad, p: targetAmbientPressure };
    const targetLabel = headApplyTargets.map((id) => getTesterDisplayName(id)).join(", ");
    const msg = `Test Head applied ${to.rpm.toFixed(0)} RPM / ${to.load.toFixed(0)}% / ${to.p.toFixed(1)} kPa (${disturbanceMode.toUpperCase()})`;
    logEvent("HEAD_APPLY", `${msg} → ${targetLabel}`);
    notify(`HEAD APPLY → ${targetLabel}: ${to.rpm.toFixed(0)} RPM / ${to.load.toFixed(0)}% / ${to.p.toFixed(1)} kPa`);
    emitHeadOpsEvent("apply", msg, to, {
      targets: headApplyTargets,
      mode: disturbanceMode,
      rampSeconds,
    });
    headApplyTargets.forEach((id) => {
      applySetpointsToTesterSnapshot(id, to, { mode: disturbanceMode, rampSeconds });
    });
  }, [role, headApplyTargets, targetRpm, targetLoad, targetAmbientPressure, disturbanceMode, rampSeconds, logEvent, notify, emitHeadOpsEvent]);

  const returnToSteady = useCallback(() => {
    setTargetRpm(1800);
    setTargetLoad(75);
    setTargetAmbientPressure(101.3);
    const p = plantRef.current;
    p.rpm_sp = 1800;
    p.load_sp = 75;
    p.p_amb = 101.3;
    setSpRpm(1800);
    setSpLoad(75);
    setSpAmbient(101.3);
    setpointRampRef.current = null;
    if (role === "head") {
      if (headApplyTargets.length === 0) {
        notify("Select at least one tester bay before returning to steady");
        return;
      }
      const targetLabel = headApplyTargets.map((id) => getTesterDisplayName(id)).join(", ");
      const msg = "Test Head returned cell to reference steady (1800 RPM / 75% / 101.3 kPa)";
      logEvent("RETURN_STEADY", `${msg} → ${targetLabel}`);
      notify(`HEAD STEADY → ${targetLabel}: Returned to reference steady state`);
      emitHeadOpsEvent("steady", msg, { rpm: 1800, load: 75, p: 101.3 }, {
        targets: headApplyTargets,
        mode: "step",
        rampSeconds: 5,
      });
      const steady = { rpm: 1800, load: 75, p: 101.3 };
      headApplyTargets.forEach((id) => {
        applySetpointsToTesterSnapshot(id, steady, { mode: "step", rampSeconds: 5 });
      });
    } else {
      logEvent("RETURN_STEADY", "Operator returned setpoints to reference steady.");
    }
  }, [role, headApplyTargets, logEvent, notify, emitHeadOpsEvent]);

  /** Single bay focus for head — dashboard VIEW BAY drives ARIA, Digital Twin, etc. */
  const handleBayFocusChange = useCallback((id, { keepPlayback = false } = {}) => {
    setHeadViewingTester(id);
    setAriaFocusTester(id);
    if (!keepPlayback) setPlaybackEvent(null);
  }, []);

  useEffect(() => {
    if (!isHeadRole(role) || !headViewingTester) return;
    if (ariaFocusTester !== headViewingTester) {
      setAriaFocusTester(headViewingTester);
    }
  }, [role, headViewingTester, ariaFocusTester, activeTab]);

  const sendCellMessage = useCallback(() => {
    setChatTick((n) => n + 1);
  }, []);

  const markCommsThreadRead = useCallback((threadId) => {
    if (!role || !threadId) return;
    const ts = Date.now();
    setMessagesReadAt((prev) => ({
      ...prev,
      [role]: ts,
      [`${role}:${threadId}`]: ts,
    }));
  }, [role]);

  const unreadMessageCount = useMemo(() => {
    migrateLegacyMessages();
    return unreadCountForRole(role, messagesReadAt, chatRegistry);
  }, [role, messagesReadAt, chatTick, chatRegistry]);

  const latestUnreadMessage = useMemo(() => {
    if (!role) return null;
    migrateLegacyMessages();
    const lastRead = messagesReadAt[role] || 0;
    const threadIds = listThreadsForRole(role, chatRegistry).map((t) => t.id);
    const unread = loadThreadMessages()
      .filter((m) => threadIds.includes(m.threadId) && m.from !== role && m.ts > lastRead)
      .sort((a, b) => a.ts - b.ts);
    return unread[unread.length - 1] || null;
  }, [role, messagesReadAt, chatTick, chatRegistry]);

  const showCommsNotifyBar = Boolean(
    latestUnreadMessage &&
    activeTab !== "comms" &&
    latestUnreadMessage.id !== commsBannerDismissedId
  );

  const opsTabBadgeCount = useMemo(() => {
    if (!role) return 0;
    if (role === "head") {
      return requests.filter((r) => r.status === "pending").length;
    }
    const lastRead = opsReadAt[role] || 0;
    const unreadDecisions = requests.filter(
      (r) =>
        (r.status === "approved" || r.status === "rejected") &&
        (r.decidedAt || 0) > lastRead
    ).length;
    const unreadHeadOps = headOpsEvents.filter(
      (e) => e.ts > lastRead && (!e.targets?.length || e.targets.includes(role)),
    ).length;
    return unreadDecisions + unreadHeadOps;
  }, [role, requests, opsReadAt, headOpsEvents]);

  const latestUnreadHeadOpsEvent = useMemo(() => {
    if (!isTesterRole(role)) return null;
    const lastRead = opsReadAt[role] || 0;
    const unread = headOpsEvents
      .filter((e) => e.ts > lastRead && (!e.targets?.length || e.targets.includes(role)))
      .sort((a, b) => a.ts - b.ts);
    return unread[unread.length - 1] || null;
  }, [role, opsReadAt, headOpsEvents]);

  const showHeadOpsNotifyBar = Boolean(
    isTesterRole(role) &&
    latestUnreadHeadOpsEvent &&
    latestUnreadHeadOpsEvent.id !== headOpsBannerDismissedId
  );

  useEffect(() => {
    if (!role) return undefined;
    migrateLegacyMessages();

    const bumpChat = () => setChatTick((n) => n + 1);
    bumpChat();
    const syncRemoteChat = () => {
      const threadIds = listThreadsForRole(role, chatRegistry).map((thread) => thread.id);
      void syncChatFromDb(threadIds).then(bumpChat);
    };
    void syncRemoteChat();
    const pollId = window.setInterval(syncRemoteChat, 2500);

    window.addEventListener("cat-cell-message", bumpChat);
    window.addEventListener("cat-cell-messages-updated", bumpChat);
    const onStorage = (e) => {
      if (e.key === "cat_cell_threads" || e.key === "cat_cell_messages") bumpChat();
    };
    window.addEventListener("storage", onStorage);

    return () => {
      clearInterval(pollId);
      window.removeEventListener("cat-cell-message", bumpChat);
      window.removeEventListener("cat-cell-messages-updated", bumpChat);
      window.removeEventListener("storage", onStorage);
    };
  }, [role, chatRegistry]);

  useEffect(() => {
    if (!role || activeTab !== "comms") return;
    setMessagesReadAt((prev) => ({ ...prev, [role]: Date.now() }));
  }, [role, activeTab, chatTick]);

  useEffect(() => {
    if (!role || activeTab !== "operations") return;
    setOpsReadAt((prev) => ({ ...prev, [role]: Date.now() }));
  }, [role, activeTab]);

  // Restore per-tester session when a tester console logs in.
  useEffect(() => {
    if (!isTesterRole(role)) return;

    appliedRequestIdsRef.current = loadAppliedRequestIds(role);
    appliedHeadOpsIdsRef.current = loadAppliedHeadOpsIds(role);

    const saved = loadTesterSession(role);
    const spR = saved?.spRpm ?? saved?.targetRpm ?? 1800;
    const spL = saved?.spLoad ?? saved?.targetLoad ?? 75;
    const spP = saved?.spAmbient ?? saved?.targetAmbientPressure ?? 101.3;
    const opR = saved?.opRpm ?? spR;
    const opL = saved?.opLoad ?? spL;
    const opP = saved?.opAmbientPressure ?? spP;

    plantRef.current = {
      rpm_sp: spR,
      load_sp: spL,
      p_amb: spP,
      rpm_act: opR,
      load_act: opL,
    };
    setpointRampRef.current = null;
    setTargetRpm(saved?.targetRpm ?? spR);
    setTargetLoad(saved?.targetLoad ?? spL);
    setTargetAmbientPressure(saved?.targetAmbientPressure ?? spP);
    setSpRpm(spR);
    setSpLoad(spL);
    setSpAmbient(spP);
    setOpRpm(opR);
    setOpLoad(opL);
    setOpAmbientPressure(opP);

    setActiveEngine(saved?.activeEngine || "CAT_C13");
    setCurrentScenario(saved?.currentScenario || "normal");
    setIsStreaming(saved?.isStreaming ?? false);
    if (!saved?.isStreaming) {
      setLatestPrediction(null);
      setLatestReading(null);
      setLatestRca(null);
      setChartBuffer([]);
      setRecentReadings([]);
      setReadingCount(0);
      readingCountRef.current = 0;
      setLeakStartMs(null);
      setLeakAtReadingNo(null);
    }
  }, [role]);

  // Persist each tester console's independent engine/scenario stream state.
  useEffect(() => {
    if (!isTesterRole(role)) return;
    saveTesterSession(role, {
      activeEngine,
      currentScenario,
      isStreaming,
      targetRpm,
      targetLoad,
      targetAmbientPressure,
      spRpm,
      spLoad,
      spAmbient,
      opRpm,
      opLoad,
      opAmbientPressure,
      updatedAt: Date.now(),
    });
  }, [role, activeEngine, currentScenario, isStreaming, targetRpm, targetLoad, targetAmbientPressure, spRpm, spLoad, spAmbient, opRpm, opLoad, opAmbientPressure]);

  // Apply approved setpoints on the requesting tester's tab (same or other browser tab).
  useEffect(() => {
    if (!isTesterRole(role)) return undefined;

    const tryApplyApproved = (req) => {
      if (!req || req.requestedBy !== role || req.status !== "approved") return;
      if (appliedRequestIdsRef.current.has(req.id)) return;
      appliedRequestIdsRef.current.add(req.id);
      markAppliedRequestId(role, req.id);
      applySetpoints(req.to, req.mode, req.rampSeconds);
      logCellActivity({
        role,
        displayName: getTesterDisplayName(role),
        type: "REQUEST_APPROVED",
        message: `Setpoints applied locally: ${req.to.rpm.toFixed(0)} RPM / ${req.to.load.toFixed(0)}%`,
      });
    };

    const onDecided = (e) => tryApplyApproved(e.detail);
    requests.forEach(tryApplyApproved);

    window.addEventListener("cat-request-decided", onDecided);
    return () => {
      window.removeEventListener("cat-request-decided", onDecided);
    };
  }, [role, requests, applySetpoints]);

  // Apply head manual disturbances on targeted tester tabs only.
  useEffect(() => {
    if (!isTesterRole(role)) return undefined;

    const tryApplyHeadOps = (evt) => {
      if (!evt?.sp) return;
      if (evt.targets?.length && !evt.targets.includes(role)) return;
      if (appliedHeadOpsIdsRef.current.has(evt.id)) return;
      appliedHeadOpsIdsRef.current.add(evt.id);
      markAppliedHeadOpsId(role, evt.id);
      applySetpoints(evt.sp, evt.mode || "step", evt.rampSeconds ?? 5);
      logCellActivity({
        role,
        displayName: getTesterDisplayName(role),
        type: evt.type === "steady" ? "RETURN_STEADY" : "HEAD_APPLY",
        message: `Head setpoints applied locally: ${evt.sp.rpm.toFixed(0)} RPM / ${evt.sp.load.toFixed(0)}% / ${evt.sp.p.toFixed(1)} kPa`,
      });
    };

    headOpsEvents.forEach(tryApplyHeadOps);

    const onHeadOps = (e) => tryApplyHeadOps(e.detail);
    window.addEventListener("cat-head-ops-event", onHeadOps);
    return () => {
      window.removeEventListener("cat-head-ops-event", onHeadOps);
    };
  }, [role, headOpsEvents, applySetpoints]);

  const handleToggleFaultInjection = useCallback(() => {
    if (!isStreamingRef.current) return;
    const scenario = scenarioRef.current;
    if (!canFaultInjectForScenario(scenario)) return;

    const next = !faultInjectionRef.current;
    const preset = getFaultInjectionForScenario(scenario);
    setFaultInjectionActive(next);

    const readingNum = readingCountRef.current;
    const ts = new Date().toLocaleTimeString("en-IN");
    setSessionLog((prev) => ({
      ...prev,
      faultInjectionEvents: [
        ...(prev.faultInjectionEvents || []),
        {
          action: next ? "on" : "off",
          timestamp: ts,
          readingNumber: readingNum,
          scenarioId: scenario,
          scenarioLabel: SCENARIO_LABELS[scenario] || scenario,
          sensor: preset?.sensor || null,
          sensorLabel: preset?.label || null,
        },
      ],
    }));

    if (isTesterRole(roleRef.current)) {
      appendTimelineEvent(roleRef.current, {
        type: "FAULT",
        readingNo: readingNum,
        label: next ? "Fault injection ON" : "Fault injection OFF",
        summary: next
          ? `Simulated bad ${(preset?.label || preset?.sensor || "sensor").replace(/_/g, " ")}`
          : "Returned to scenario leak physics",
        frame: buildFrameSnapshot({
          reading: latestReadingRef.current,
          prediction: latestPredictionRef.current,
          rca: latestRcaRef.current,
          opRpm: plantRef.current.rpm_act,
          opLoad: plantRef.current.load_act,
          opAmbientPressure: plantRef.current.p_amb,
          scenario,
          engine: activeEngineRef.current,
        }),
        meta: { faultInjection: next, sensor: preset?.sensor },
      });
    }

    notify(
      next
        ? `SFI DEMO: Injecting fault on ${preset?.label || "primary sensor"} — ML may alarm, SFI should override`
        : "Fault injection cleared — resume normal scenario physics"
    );
  }, [notify]);

  const handleScenarioChange = useCallback((id) => {
    setFaultInjectionActive(false);
    setCurrentScenario(id);
    setSwitchingLabel(SCENARIO_LABELS[id] || id);
    if (isTesterRole(role)) {
      appendTimelineEvent(role, {
        type: "CHANGE",
        readingNo: readingCountRef.current,
        label: "Scenario change",
        summary: scenarioLabel(id),
        frame: buildFrameSnapshot({
          reading: latestReadingRef.current,
          prediction: latestPredictionRef.current,
          rca: latestRcaRef.current,
          opRpm: plantRef.current.rpm_act,
          opLoad: plantRef.current.load_act,
          opAmbientPressure: plantRef.current.p_amb,
          scenario: id,
          engine: activeEngineRef.current,
        }),
        meta: { scenario: id },
      });
    }
    setLeakStartMs(null);
    setLeakAtReadingNo(null);
    prevLeakRef.current = false;
    prevSensorFaultRef.current = false;
    wasSuppressedRef.current = false;
    setBannerDismissed(false);
    if (isStreaming) {
      axios
        .post(`/api/sensor-health/reset/${activeEngineRef.current}`)
        .catch(() => {});
    }
    if (!isStreaming) {
      setLatestPrediction(null);
      setLatestReading(null);
      setLatestRca(null);
      setChartBuffer([]);
      setReadingCount(0);
      readingCountRef.current = 0;
    }
    window.setTimeout(() => setSwitchingLabel(null), 1500);
    axios.post("/api/data-quality/reset").catch(() => {});
    setSessionLog((prev) => {
      const label = SCENARIO_LABELS[id] || id;
      const history = prev.scenarioHistory || [];
      const historyNext =
        history[history.length - 1] === label ? history : [...history, label];

      let scenarioSegments = prev.scenarioSegments || [];
      if (isStreaming) {
        scenarioSegments = closeScenarioSegments(scenarioSegments, prev.totalReadings);
        scenarioSegments = [
          ...scenarioSegments,
          {
            scenarioId: id,
            label,
            startReading: prev.totalReadings + 1,
            endReading: null,
          },
        ];
      }

      if (historyNext === history && !isStreaming) return prev;
      return { ...prev, scenarioHistory: historyNext, scenarioSegments };
    });
  }, [isStreaming, role]);

  const buildReportSnapshot = useCallback((log, endTime = new Date()) => {
    const useDemoLog = !apiOnlineRef.current && log.totalReadings === 0;
    const finalized = { ...log, endTime };
    return useDemoLog ? { ...DEMO_SESSION_LOG, endTime } : finalized;
  }, []);

  const handleGenerateReport = useCallback(() => {
    if (isStreaming) return;
    const log = sessionLogRef.current;
    if (log.totalReadings === 0 && apiOnline) return;
    const snapshot = reportSessionLog || buildReportSnapshot(log, log.endTime || new Date());
    setReportSessionLog(snapshot);
    setShowReport(true);
  }, [isStreaming, reportSessionLog, buildReportSnapshot, apiOnline]);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    prevStreamingRef.current = isStreaming;

    if (isStreaming && !wasStreaming) {
      setShowReport(false);
      setReportSessionLog(null);
      setFaultInjectionActive(false);

      if (isTesterRole(role)) {
        clearTimeline(role);
        appendTimelineEvent(role, {
          type: "STREAM",
          readingNo: 0,
          label: "Stream started",
          summary: `${scenarioLabel(currentScenario)} · ${ENGINE_DISPLAY[activeEngine] || activeEngine}`,
          frame: null,
        });
      }
      axios
        .post(`/api/sensor-health/reset/${activeEngineRef.current}`)
        .catch(() => {});

      const initialScenario = SCENARIO_LABELS[currentScenario] || currentScenario;
      const newLog = {
        sessionId: `TC2026-${Date.now()}`,
        startTime: new Date(),
        endTime: null,
        engineId: activeEngineRef.current,
        engineName: ENGINE_DISPLAY[activeEngineRef.current] || activeEngineRef.current,
        engineSerial: ENGINE_SERIAL[activeEngineRef.current] || "N/A",
        testCellId: "TC-CELL-03",
        testerName: getTesterDisplayName(role),
        testerRole: role || null,
        bayId: getTesterBayId(role) || null,
        activeModelId: modelSelectionRef.current?.active_model_id ?? null,
        activeModelName: displayModelName(
          modelSelectionRef.current?.active_model_id,
          modelSelectionRef.current?.active_model_name
        ),
        activeModelAccuracy: modelSelectionRef.current?.active_leak_location_accuracy ?? null,
        totalReadings: 0,
        leakEvents: [],
        sensorFaults: [],
        dqpEvents: [],
        ssgEvents: [],
        faultInjectionEvents: [],
        scenarioHistory: [initialScenario],
        scenarioSegments: [
          {
            scenarioId: currentScenario,
            label: initialScenario,
            startReading: 1,
            endReading: null,
          },
        ],
      };
      setSessionLog(newLog);
      persistedLeaksRef.current = 0;
      persistedFaultsRef.current = 0;
      startTestSessionInDb(newLog);
      readingCountRef.current = 0;
      setReadingCount(0);
      prevLeakRef.current = false;
      prevSensorFaultRef.current = false;
      wasSuppressedRef.current = false;
      return;
    }

    if (!isStreaming && wasStreaming) {
      setFaultInjectionActive(false);
      const end = new Date();
      const log = sessionLogRef.current;
      const closedSegments = closeScenarioSegments(
        log.scenarioSegments || [],
        log.totalReadings
      );
      const finalized = { ...log, endTime: end, scenarioSegments: closedSegments };
      setSessionLog(finalized);
      endTestSessionInDb(finalized);
      flushBayLiveStatePersist({
        role,
        displayName: getTesterDisplayName(role),
        activeTab: activeTabRef.current,
        activeEngine: activeEngineRef.current,
        currentScenario: scenarioRef.current,
        isStreaming: false,
        readingCount: finalized.totalReadings ?? readingCountRef.current,
        latestReading: latestReadingRef.current,
        latestPrediction: latestPredictionRef.current,
        latestRca: latestRcaRef.current,
        latestMultiRca: latestMultiRcaRef.current,
        opRpm: opRpmRef.current,
        opLoad: opLoadRef.current,
        opAmbientPressure: opAmbientPressureRef.current,
        spRpm: spRpmRef.current,
        spLoad: spLoadRef.current,
        spAmbient: spAmbientRef.current,
        targetRpm: targetRpmRef.current,
        targetLoad: targetLoadRef.current,
        targetAmbientPressure: targetAmbientPressureRef.current,
        leakActive: false,
        sensorFaultActive: false,
        apiOnline: apiOnlineRef.current,
        sessionId: finalized.sessionId ?? null,
      });
      if (finalized.totalReadings > 0 || !apiOnlineRef.current) {
        const snapshot = buildReportSnapshot(finalized, end);
        setReportSessionLog(snapshot);
        setShowReport(true);
      }
    }
  }, [isStreaming, buildReportSnapshot, role, currentScenario, activeEngine]);

  useEffect(() => {
    const log = sessionLog;
    if (!log?.sessionId) return;

    const leaks = log.leakEvents || [];
    if (leaks.length > persistedLeaksRef.current) {
      const evt = leaks[leaks.length - 1];
      appendSessionRecord({
        sessionId: log.sessionId,
        recordType: "leak",
        readingNumber: evt.readingNumber,
        scenarioId: evt.scenarioId,
        payload: evt,
      });
      persistedLeaksRef.current = leaks.length;
    }

    const faults = log.sensorFaults || [];
    if (faults.length > persistedFaultsRef.current) {
      const evt = faults[faults.length - 1];
      appendSessionRecord({
        sessionId: log.sessionId,
        recordType: "sensor_fault",
        readingNumber: evt.readingNumber,
        scenarioId: scenarioRef.current,
        payload: evt,
      });
      persistedFaultsRef.current = faults.length;
    }
  }, [sessionLog.leakEvents, sessionLog.sensorFaults, sessionLog.sessionId]);

  useEffect(() => {
    setSessionLog((prev) => ({
      ...prev,
      engineId: activeEngine,
      engineName: ENGINE_DISPLAY[activeEngine] || activeEngine,
      engineSerial: ENGINE_SERIAL[activeEngine] || "N/A",
    }));
  }, [activeEngine]);

  useEffect(() => {
    axios
      .get(`/api/engine-baseline?engine_id=${activeEngine}`, { timeout: 5000 })
      .then((res) => {
        if (res.data?.pipeline_baselines) {
          setEngineBaselines(res.data.pipeline_baselines);
        }
      })
      .catch(() => {
        setEngineBaselines(ENGINE_BASELINES[activeEngine] || ENGINE_BASELINES.CAT_C13);
      });
  }, [activeEngine]);

  const handleEngineSwitch = useCallback(async (engineId) => {
    if (engineId === activeEngineRef.current) return;
    setEngineSwitching(true);
    setIsStreaming(false);

    try {
      const res = await axios.post(
        `/api/engine/switch?engine_id=${encodeURIComponent(engineId)}`,
        null,
        { timeout: 10000 }
      );
      setEngineSwitchDetails(res.data.key_changes || null);
      window.setTimeout(() => {
        setEngineSwitchDetails(null);
        setActiveEngine(engineId);
        setEngineSwitching(false);
        setCurrentScenario("normal");
        setIsStreaming(true);
      }, 2000);
    } catch {
      setEngineBaselines(ENGINE_BASELINES[engineId] || ENGINE_BASELINES.CAT_C13);
      setActiveEngine(engineId);
      setEngineSwitching(false);
      setCurrentScenario("normal");
      setIsStreaming(true);
    }
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await axios.get("/api/data-quality", { timeout: 5000 });
        setPipelineStats(res.data.pipeline_stats);
      } catch {
        /* demo mode — stats from mock prediction only */
      }
    };
    fetchStats();
    const interval = window.setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const runTick = useCallback(async () => {
    if (loggingOutRef.current || !isStreamingRef.current) return;
    const scenario = scenarioRef.current;
    const engineId = activeEngineRef.current;
    const reading = generateReading(scenario, engineId, {
      faultInjection: faultInjectionRef.current,
    });

    // 1) Update SETPOINTS (step or ramp) — operator command.
    const now = Date.now();
    const plant = plantRef.current;

    if (setpointRampRef.current) {
      const { startMs, endMs, from, to } = setpointRampRef.current;
      const t = Math.min(1, Math.max(0, (now - startMs) / (endMs - startMs)));
      const lerp = (a, b) => a + (b - a) * t;
      plant.rpm_sp = lerp(from.rpm_sp, to.rpm_sp);
      plant.load_sp = lerp(from.load_sp, to.load_sp);
      plant.p_amb = lerp(from.p_amb, to.p_amb);
      if (t >= 1) setpointRampRef.current = null;
    }

    // 2) Plant dynamics: ACTUAL signals settle toward setpoints.
    // First-order lag approximates controller + inertia.
    // At 1 Hz, alpha≈0.28 yields ~4–6s settling; adjust mildly with interval.
    const dt = Math.max(0.25, intervalMs / 1000);
    const alpha = 1 - Math.exp(-dt / 1.8); // time constant ~1.8s

    const rpmErr = plant.rpm_sp - plant.rpm_act;
    const loadErr = plant.load_sp - plant.load_act;

    // Overshoot/oscillation only when there IS a meaningful transient to settle.
    // Once settled (error < 0.5%) the oscillation term is zero — otherwise the
    // ±2% amplitude permanently exceeds the SSG 3% tracking tolerance and the
    // guard never clears even at steady operating point.
    const rpmRelErr = Math.abs(rpmErr) / Math.max(1, plant.rpm_sp);
    const loadRelErr = Math.abs(loadErr) / Math.max(0.1, plant.load_sp);
    const osc = (rpmRelErr > 0.005 || loadRelErr > 0.005)
      ? Math.sin((now / 1000) * 8) * 0.02
      : 0;
    plant.rpm_act  = plant.rpm_act  + alpha * rpmErr  * (1 + osc);
    plant.load_act = plant.load_act + alpha * loadErr * (1 + osc);

    // Keep within physical bounds.
    plant.rpm_act  = Math.min(2600, Math.max(600,  plant.rpm_act));
    plant.load_act = Math.min(100,  Math.max(0,    plant.load_act));


    // Update UI display values.
    setOpRpm(plant.rpm_act);
    setOpLoad(plant.load_act);
    setOpAmbientPressure(plant.p_amb);
    setSpRpm(plant.rpm_sp);
    setSpLoad(plant.load_sp);
    setSpAmbient(plant.p_amb);

    // Write both setpoint and actual into the ML request payload.
    reading.Engine_Speed_Setpoint_RPM = plant.rpm_sp;
    reading.Engine_Speed_Actual_RPM = plant.rpm_act;
    reading.Engine_Load_Setpoint_Pct = plant.load_sp;
    reading.Engine_Load_Actual_Pct = plant.load_act;
    reading.Ambient_Pressure_kPa = plant.p_amb;
    reading.Intake_Ambient_Pressure_kPa = plant.p_amb;

    setLatestReading(reading);
    setRecentReadings((prev) => [...prev, reading].slice(-3));

    readingCountRef.current += 1;
    const n = readingCountRef.current;
    setReadingCount(n);

    let prediction;
    try {
      const payload = {
        ...reading,
        demo_scenario: scenario,
        engine_id: engineId,
      };
      console.log("POST /api/predict", payload);
      const res = await axios.post("/api/predict", payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      });
      prediction = res.data;
      if (!prediction.Model_Selection) {
        prediction = {
          ...prediction,
          Model_Selection: modelSelectionRef.current,
        };
      }
      console.log("API prediction response", prediction);
      setApiOnline(true);
    } catch (err) {
      console.error("Predict API error — switching to DEMO MODE", err);
      /* DEMO MODE */
      prediction = getMockPrediction(scenario, engineId, {
        faultInjection: faultInjectionRef.current,
      });
      console.log("DEMO MODE mock prediction", prediction);
      setApiOnline(false);
    }

    if (prediction.Leak_Present === 0 || prediction.Suppressed) {
      severityHistoryRef.current = [];
    }

    // Physics severity — backend per-location when API online; client mirror in demo mode
    if (prediction.Leak_Present === 1 && !prediction.Suppressed) {
      const backendLeaks = getActiveLeakDetails(prediction);
      const hasBackendSeverity = backendLeaks.length > 0 && prediction.Physics_Severity;

      if (hasBackendSeverity) {
        severityHistoryRef.current.push(prediction.Leak_Severity);
        if (severityHistoryRef.current.length > 5) {
          severityHistoryRef.current.shift();
        }
      } else {
        const baseline = engineBaselines || prediction.Dynamic_Baseline || {};
        const sfiConfirmed = prediction.Sensor_Fault_Isolation?.is_confirmed_leak !== false;

        let rawSeverity;
        if (prediction.Physics_Severity) {
          const ps = prediction.Physics_Severity;
          rawSeverity = {
            severity: ps.severity,
            recommendedAction: ps.recommended_action,
            performance_impact_pct: ps.performance_impact_pct ?? 0,
            impact_basis: ps.impact_basis ?? "",
            score: ps.blend_score ?? 0,
          };
        } else {
          rawSeverity = computeDynamicSeverity(
            reading,
            baseline,
            prediction.Leak_Location,
            { sfiConfirmed }
          );
        }

        severityHistoryRef.current.push(rawSeverity.severity);
        if (severityHistoryRef.current.length > 5) {
          severityHistoryRef.current.shift();
        }

        let stableSeverity = rawSeverity.severity;
        const history = severityHistoryRef.current;
        if (rawSeverity.severity === "Severe" || rawSeverity.severity === "Critical") {
          const highCount = history.filter((s) => s === "Severe" || s === "Critical").length;
          if (highCount < 3) {
            stableSeverity = "Moderate";
          }
        }

        const physicsPayload = {
          severity: stableSeverity,
          recommended_action: actionForSeverity(stableSeverity),
          performance_impact_pct: rawSeverity.performance_impact_pct,
          impact_basis: rawSeverity.impact_basis,
          blend_score: rawSeverity.score,
          severity_method: prediction.Physics_Severity?.severity_method ?? "physics_rules_v1",
        };

        prediction = {
          ...prediction,
          Leak_Severity: stableSeverity,
          Recommended_Action: actionForSeverity(stableSeverity),
          Physics_Severity: physicsPayload,
        };
      }
    }

    setLatestPrediction(prediction);

    const multiPattern = prediction?.Multi_Pattern ?? null;
    const activeLeaks = stabilizeActiveLeaks(prediction, scenario);

    // ── Root Cause Analysis (per active leak from backend SHAP) ───────────
    let rca = null;
    let secondaryRca = null;
    let multiRca = [];
    try {
      if (activeLeaks.length > 0) {
        multiRca = activeLeaks.map((leak) =>
          computeRCA(
            {
              ...prediction,
              Leak_Location: leak.location,
              Leak_Severity: leak.severity,
              Physics_Severity: leak.physics_severity,
              top_5_sensors_driving_prediction:
                leak.top_5_sensors_driving_prediction || [],
            },
            reading
          )
        );
        rca = multiRca[0] ?? null;
        secondaryRca = multiRca[1] ?? null;
      } else {
        rca = computeRCA(prediction, reading);
        if (multiPattern?.is_multi_leak && multiPattern.secondary_location) {
          secondaryRca = computeRCA(
            {
              ...prediction,
              Leak_Location: multiPattern.secondary_location,
              Leak_Severity: prediction.Leak_Severity,
            },
            reading
          );
        }
      }
      setLatestRca(rca);
      setLatestSecondaryRca(secondaryRca);
      setLatestMultiRca(multiRca);
    } catch (rcaErr) {
      console.warn("RCA computation failed", rcaErr);
    }

    const leakNow = prediction.Leak_Present === 1;
    const wasLeaking = prevLeakRef.current;
    let snapLeakStart = null;
    let snapLeakAt = null;
    if (leakNow && !wasLeaking) {
      snapLeakStart = Date.now();
      snapLeakAt = n;
      leakStartMsRef.current = snapLeakStart;
      leakAtReadingNoRef.current = snapLeakAt;
      setLeakStartMs(snapLeakStart);
      setLeakAtReadingNo(snapLeakAt);
      setBannerDismissed(false);
    } else if (leakNow) {
      snapLeakStart = leakStartMsRef.current;
      snapLeakAt = leakAtReadingNoRef.current;
    } else {
      leakStartMsRef.current = null;
      leakAtReadingNoRef.current = null;
      setLeakStartMs(null);
      setLeakAtReadingNo(null);
    }
    prevLeakRef.current = leakNow;

    const sfi = prediction.Sensor_Fault_Isolation;
    const sensorFaultNow = Boolean(sfi?.is_sensor_fault);
    const wasSensorFault = prevSensorFaultRef.current;
    const dqp = prediction.Data_Quality;
    const significantFlags = (dqp?.flags || []).filter(
      (f) => f.severity === "CRITICAL" || f.severity === "WARNING"
    );
    const nowSuppressed = prediction?.Suppressed === true;

    setSessionLog((prev) => {
      const readingNum = prev.totalReadings + 1;
      const updated = {
        ...prev,
        totalReadings: readingNum,
        engineId: engineId,
        engineName: ENGINE_DISPLAY[engineId] || engineId,
        engineSerial: ENGINE_SERIAL[engineId] || "N/A",
      };

      if (prediction.Leak_Present === 1 && !wasLeaking) {
        const corrDev = sfi?.correlated_deviating ?? 0;
        const corrReq = sfi?.correlated_required ?? 2;
        const isMultiLeak = Boolean(
          prediction.Is_Multi_Leak ||
            prediction.Multi_Pattern?.is_multi_leak ||
            activeLeaks.length >= 2
        );
        updated.leakEvents = [
          ...prev.leakEvents,
          {
            eventId: `EVT-${String(prev.leakEvents.length + 1).padStart(3, "0")}`,
            timestamp: new Date().toLocaleTimeString("en-IN"),
            readingNumber: readingNum,
            leakLocation: prediction.Leak_Location,
            leakSeverity: prediction.Leak_Severity,
            performanceImpactPct: prediction.Physics_Severity?.performance_impact_pct ?? 0,
            impactBasis: prediction.Physics_Severity?.impact_basis ?? "",
            confidence: (prediction.Confidence_Score || 0) * 100,
            recommendedAction: prediction.Recommended_Action,
            engineId,
            sfiConfirmed: sfi?.is_confirmed_leak ?? false,
            sfiPatternCheck: sfi
              ? `${corrDev} / ${corrReq} correlated sensors deviating`
              : "",
            sfiPhysicalBasis: sfi?.fault_reason || "",
            shapDrivers: (prediction.top_5_sensors_driving_prediction || []).map(
              (d) => ({
                sensor: d.sensor,
                yourValue: d.your_value,
                baseline: d.normal_baseline,
                deviation_pct: d.deviation_pct,
              })
            ),
            multiPattern: prediction.Multi_Pattern ?? null,
            isMultiLeak,
            activeLeakDetails: activeLeaks.map((leak) => ({
              location: leak.location,
              severity: leak.severity,
              confidence: (leak.confidence ?? prediction.Confidence_Score ?? 0) * 100,
              shapDrivers: (leak.top_5_sensors_driving_prediction || []).map((d) => ({
                sensor: d.sensor,
                yourValue: d.your_value,
                baseline: d.normal_baseline,
                deviation_pct: d.deviation_pct,
              })),
            })),
            multiRcaResults: multiRca.map((r) => ({
              leakLocation: r.leakLocation,
              severity: r.severity,
              shapPatternSummary: r.shapPatternSummary,
              topCause: r.rankedCauses?.[0]?.label,
              topCausePct: r.rankedCauses?.[0]?.probabilityPct,
              rankedCauses: (r.rankedCauses || []).slice(0, 3).map((c) => ({
                label: c.label,
                probabilityPct: c.probabilityPct,
              })),
            })),
            rcaResult: !isMultiLeak ? serializeRcaSnapshot(rca) : null,
            scenarioId: scenario,
            scenarioLabel: SCENARIO_LABELS[scenario] || scenario,
            dqpScore: dqp?.score ?? 100,
            dqpSummary: dqp?.summary || "Clean",
            engineRpm: reading.Engine_Speed_Actual_RPM ?? 1800,
            engineLoad: reading.Engine_Load_Actual_Pct ?? 75,
            ambientTemp: reading.Ambient_Temp_C ?? 32,
          },
        ];
      }

      if (sensorFaultNow && !wasSensorFault) {
        updated.sensorFaults = [
          ...prev.sensorFaults,
          {
            eventId: `FLT-${String(prev.sensorFaults.length + 1).padStart(3, "0")}`,
            timestamp: new Date().toLocaleTimeString("en-IN"),
            readingNumber: readingNum,
            faultType: "ISOLATED_DEVIATION",
            faultedSensor: sfi?.faulty_sensor,
            faultReason: sfi?.fault_reason || "",
            actionTaken: prediction.Recommended_Action || "Inspect_Sensor_Hardware",
            confidence: prediction.Confidence_Score ?? 0,
            scenarioId: scenario,
            scenarioLabel: SCENARIO_LABELS[scenario] || scenario,
          },
        ];
      }

      if (significantFlags.length > 0) {
        updated.dqpEvents = [
          ...prev.dqpEvents,
          {
            timestamp: new Date().toLocaleTimeString("en-IN"),
            readingNumber: readingNum,
            flags: significantFlags,
            score: dqp?.score ?? 100,
          },
        ];
      }

      return updated;
    });

    if (nowSuppressed && !wasSuppressedRef.current) {
      setSessionLog((prev) => ({
        ...prev,
        ssgEvents: [
          ...prev.ssgEvents,
          {
            timestamp: new Date().toLocaleTimeString("en-IN"),
            readingNumber: n,
            reason: prediction.Suppression_Reason || "Transient state",
          },
        ],
      }));
    }

    const tickFrame = buildFrameSnapshot({
      reading,
      prediction,
      rca,
      opRpm: plant.rpm_act,
      opLoad: plant.load_act,
      opAmbientPressure: plant.p_amb,
      scenario,
      engine: engineId,
    });
    const tickRole = roleRef.current;
    if (isTesterRole(tickRole) && !loggingOutRef.current) {
      if (leakNow && !wasLeaking) {
        appendTimelineEvent(tickRole, {
          type: "LEAK",
          readingNo: n,
          label: (prediction.Leak_Location || "Leak").replace(/_/g, " "),
          summary: `${prediction.Leak_Severity || "—"} · ${((prediction.Confidence_Score || 0) * 100).toFixed(1)}%`,
          frame: tickFrame,
        });
      }
      if (nowSuppressed && !wasSuppressedRef.current) {
        appendTimelineEvent(tickRole, {
          type: "SSG",
          readingNo: n,
          label: "SSG suppress",
          summary: prediction.Suppression_Reason || "Transient state",
          frame: tickFrame,
        });
      }
      if (sensorFaultNow && !wasSensorFault) {
        appendTimelineEvent(tickRole, {
          type: "FAULT",
          readingNo: n,
          label: "Sensor fault",
          summary: (sfi?.faulty_sensor || "Isolated deviation").replace(/_/g, " "),
          frame: tickFrame,
        });
      }
      if (significantFlags.length > 0) {
        appendTimelineEvent(tickRole, {
          type: "DQP",
          readingNo: n,
          label: "DQ flag",
          summary: significantFlags.map((f) => f.flag || f.severity).join(", ") || `DQ ${dqp?.score ?? "—"}`,
          frame: tickFrame,
        });
      }
    }

    wasSuppressedRef.current = nowSuppressed;

    prevSensorFaultRef.current = sensorFaultNow;

    setChartBuffer((prev) => {
      const row = {
        readingNo: n,
        preComp: Number(reading.Pre_Compressor_Pressure_kPa),
        postComp: Number(reading.Post_Compressor_Pressure_kPa),
        preTurbo: Number(reading.Pre_Turbine_Pressure_kPa),
        postTurbo: Number(reading.Post_Turbine_Pressure_kPa),
      };
      return [...prev, row].slice(-30);
    });

    // Push live snapshot immediately so head mirror gets fresh sensor values.
    const publishRole = roleRef.current;
    if (loggingOutRef.current || !isTesterRole(publishRole)) return;
    const leak = prediction.Leak_Present === 1 && !prediction.Suppressed;
      const chartRow = {
        readingNo: n,
        preComp: Number(reading.Pre_Compressor_Pressure_kPa),
        postComp: Number(reading.Post_Compressor_Pressure_kPa),
        preTurbo: Number(reading.Pre_Turbine_Pressure_kPa),
        postTurbo: Number(reading.Post_Turbine_Pressure_kPa),
      };
      const curChart = chartBufferRef.current || [];
      const curRecent = recentReadingsRef.current || [];
      publishTesterSnapshot(publishRole, {
        displayName: getTesterDisplayName(publishRole),
        activeTab: activeTabRef.current,
        activeEngine: engineId,
        currentScenario: scenario,
        faultInjectionActive: faultInjectionRef.current,
        isStreaming: true,
        readingCount: n,
        latestReading: reading,
        latestPrediction: prediction,
        latestRca: rca,
        latestMultiRca: multiRca,
        chartBuffer: [...curChart.slice(-29), chartRow],
        recentReadings: [...curRecent.slice(-2), reading],
        opRpm: plant.rpm_act,
        opLoad: plant.load_act,
        opAmbientPressure: plant.p_amb,
        spRpm: plant.rpm_sp,
        spLoad: plant.load_sp,
        spAmbient: plant.p_amb,
        targetRpm: plant.rpm_sp,
        targetLoad: plant.load_sp,
        targetAmbientPressure: plant.p_amb,
        leakStartMs: snapLeakStart,
        leakAtReadingNo: snapLeakAt,
        leakActive: leak,
        sensorFaultActive: isSensorFaultActive(prediction),
        engineBaselines: engineBaselinesRef.current,
        apiOnline: apiOnlineRef.current,
        pipelineStats: dqp
          ? { flag_rate_pct: dqp.flag_rate_pct ?? pipelineStatsRef.current?.flag_rate_pct }
          : pipelineStatsRef.current,
        sessionId: sessionLogRef.current?.sessionId ?? null,
      });
      queueBayLiveStatePersist({
        role: publishRole,
        displayName: getTesterDisplayName(publishRole),
        activeTab: activeTabRef.current,
        activeEngine: engineId,
        currentScenario: scenario,
        faultInjectionActive: faultInjectionRef.current,
        isStreaming: true,
        readingCount: n,
        latestReading: reading,
        latestPrediction: prediction,
        latestRca: rca,
        latestMultiRca: multiRca,
        chartBuffer: [...curChart.slice(-29), chartRow],
        recentReadings: [...curRecent.slice(-2), reading],
        opRpm: plant.rpm_act,
        opLoad: plant.load_act,
        opAmbientPressure: plant.p_amb,
        spRpm: plant.rpm_sp,
        spLoad: plant.load_sp,
        spAmbient: plant.p_amb,
        targetRpm: plant.rpm_sp,
        targetLoad: plant.load_sp,
        targetAmbientPressure: plant.p_amb,
        leakStartMs: snapLeakStart,
        leakAtReadingNo: snapLeakAt,
        leakActive: leak,
        sensorFaultActive: isSensorFaultActive(prediction),
        engineBaselines: engineBaselinesRef.current,
        apiOnline: apiOnlineRef.current,
        pipelineStats: dqp
          ? { flag_rate_pct: dqp.flag_rate_pct ?? pipelineStatsRef.current?.flag_rate_pct }
          : pipelineStatsRef.current,
        sessionId: sessionLogRef.current?.sessionId ?? null,
      });
      lastSnapshotPublishRef.current = Date.now();
  }, [intervalMs]);

  const pushTesterSnapshot = useCallback(() => {
    const publishRole = roleRef.current;
    if (loggingOutRef.current || !isTesterRole(publishRole)) return;
    const now = Date.now();
    if (now - lastSnapshotPublishRef.current < 400) return;
    lastSnapshotPublishRef.current = now;
    const prediction = latestPredictionRef.current;
    const sensorFault = isSensorFaultActive(prediction);
    const leak = isLeakActivePrediction(prediction);
    const payload = {
      displayName: getTesterDisplayName(publishRole),
      activeTab: activeTabRef.current,
      activeEngine: activeEngineRef.current,
      currentScenario: scenarioRef.current,
      faultInjectionActive: faultInjectionRef.current,
      isStreaming: isStreamingRef.current,
      readingCount: readingCountRef.current,
      latestReading: latestReadingRef.current,
      latestPrediction: prediction,
      latestRca: latestRcaRef.current,
      latestMultiRca: latestMultiRcaRef.current,
      chartBuffer: (chartBufferRef.current || []).slice(-30),
      recentReadings: recentReadingsRef.current || [],
      opRpm: opRpmRef.current,
      opLoad: opLoadRef.current,
      opAmbientPressure: opAmbientPressureRef.current,
      spRpm: spRpmRef.current,
      spLoad: spLoadRef.current,
      spAmbient: spAmbientRef.current,
      targetRpm: targetRpmRef.current,
      targetLoad: targetLoadRef.current,
      targetAmbientPressure: targetAmbientPressureRef.current,
      leakStartMs: leakStartMsRef.current,
      leakAtReadingNo: leakAtReadingNoRef.current,
      leakActive: leak,
      sensorFaultActive: sensorFault,
      engineBaselines: engineBaselinesRef.current,
      apiOnline: apiOnlineRef.current,
      pipelineStats: pipelineStatsRef.current,
      sessionId: sessionLogRef.current?.sessionId ?? null,
    };
    publishTesterSnapshot(publishRole, payload);
    queueBayLiveStatePersist({ role: publishRole, ...payload });
  }, []);

  useEffect(() => {
    if (!isTesterRole(role)) return undefined;
    pushTesterSnapshot();
    const id = window.setInterval(pushTesterSnapshot, 1500);
    return () => clearInterval(id);
  }, [role, pushTesterSnapshot, activeTab]);

  useEffect(() => {
    if (!isTesterRole(role)) return;
    pushTesterSnapshot();
  }, [isStreaming, role, pushTesterSnapshot]);

  useEffect(() => {
    if (!isStreaming) return undefined;
    void runTick();
    const id = window.setInterval(() => {
      void runTick();
    }, intervalMs);
    return () => clearInterval(id);
  }, [isStreaming, intervalMs, runTick]);

  useEffect(() => {
    if (latestPrediction?.Leak_Present === 0) {
      setBannerDismissed(false);
    }
  }, [latestPrediction?.Leak_Present]);

  const observingHead = isHeadRole(role) && Boolean(headViewingTester);
  const headOverviewMode = isHeadRole(role) && !headViewingTester;
  const headOverviewStats = useMemo(
    () => (headOverviewMode ? computeCellStats(boardTesters) : null),
    [headOverviewMode, boardTesters],
  );
  const { markers: timelineMarkers, sessionStartMs: timelineStartMs } = useSessionTimeline({
    role,
    headViewingTester,
    headOverviewMode,
  });
  const playbackActive = Boolean(playbackEvent?.frame);
  const remoteSnap = observingHead ? testerSnapshots[headViewingTester] : null;
  const snapUsable = remoteSnap && isSnapshotUsable(remoteSnap);
  const viewedBay = useMemo(
    () => (headViewingTester ? boardTesters.find((t) => t.id === headViewingTester) : null),
    [boardTesters, headViewingTester],
  );
  /** Mirror when snapshot exists and is actively ticking (streaming) or recently updated. */
  const mirrorReady = observingHead && isMirrorLive(remoteSnap);
  const mirrorStale = observingHead && snapUsable && !mirrorReady;
  const mirrorActive = mirrorReady || mirrorStale;

  const displayPrediction = !observingHead ? latestPrediction : (mirrorActive ? remoteSnap.latestPrediction : null);
  const displayReading = !observingHead ? latestReading : (mirrorActive ? remoteSnap.latestReading : null);
  const displayRca = !observingHead ? latestRca : (mirrorActive ? remoteSnap.latestRca : null);
  const displayChartBuffer = !observingHead ? chartBuffer : (mirrorActive ? (remoteSnap.chartBuffer || []) : []);
  const displayRecentReadings = !observingHead ? recentReadings : (mirrorActive ? (remoteSnap.recentReadings || []) : []);
  const displayEngine = !observingHead ? activeEngine : (mirrorActive ? remoteSnap.activeEngine : null);
  const displayScenario = !observingHead ? currentScenario : (mirrorActive ? remoteSnap.currentScenario : null);
  const displayStreaming = !observingHead ? isStreaming : (mirrorReady ? remoteSnap.isStreaming : false);
  const displayFaultInjectionActive = !observingHead
    ? faultInjectionActive
    : (mirrorActive ? Boolean(remoteSnap.faultInjectionActive) : false);
  const displayReadingCount = !observingHead ? readingCount : (mirrorActive ? remoteSnap.readingCount : 0);
  const displayOpRpm = !observingHead ? opRpm : (mirrorActive ? remoteSnap.opRpm : null);
  const displayOpLoad = !observingHead ? opLoad : (mirrorActive ? remoteSnap.opLoad : null);
  const displayOpAmbient = !observingHead ? opAmbientPressure : (mirrorActive ? remoteSnap.opAmbientPressure : null);
  const displaySpRpm = !observingHead ? spRpm : (mirrorActive ? remoteSnap.spRpm : null);
  const displaySpLoad = !observingHead ? spLoad : (mirrorActive ? remoteSnap.spLoad : null);
  const displaySpAmbient = !observingHead ? spAmbient : (mirrorActive ? remoteSnap.spAmbient : null);
  const displayEngineBaselines = !observingHead ? engineBaselines : (mirrorActive ? (remoteSnap.engineBaselines || engineBaselines) : ENGINE_BASELINES.CAT_C13);
  const displayLeakStartMs = !observingHead ? leakStartMs : (mirrorActive ? remoteSnap.leakStartMs : null);
  const displayLeakAtReadingNo = !observingHead ? leakAtReadingNo : (mirrorActive ? remoteSnap.leakAtReadingNo : null);
  const displayApiOnline = !observingHead ? apiOnline : (mirrorActive ? remoteSnap.apiOnline : true);
  const playbackFrame = playbackEvent?.frame || null;
  const effectivePrediction = playbackFrame?.prediction ?? displayPrediction;
  const effectiveReading = playbackFrame?.reading ?? displayReading;
  const effectiveRca = playbackFrame?.rca ?? displayRca;
  const displaySecondaryRca = !observingHead
    ? latestSecondaryRca
    : (mirrorActive ? (remoteSnap.latestSecondaryRca ?? remoteSnap.latestMultiRca?.[1] ?? null) : null);
  const displayMultiRca = !observingHead ? latestMultiRca : (mirrorActive ? (remoteSnap.latestMultiRca || []) : []);
  const effectiveSecondaryRca = playbackFrame?.secondaryRca ?? displaySecondaryRca;
  const effectiveMultiRca = playbackFrame?.multiRca ?? displayMultiRca;
  const effectiveMultiPattern = effectivePrediction?.Multi_Pattern ?? null;
  const effectiveOpRpm = playbackFrame?.opRpm ?? displayOpRpm;
  const effectiveOpLoad = playbackFrame?.opLoad ?? displayOpLoad;
  const effectiveOpAmbient = playbackFrame?.opAmbientPressure ?? displayOpAmbient;
  const sidebarReadOnly = observingHead;
  // Waiting/offline means no usable mirrored snapshot at all.
  const mirrorWaiting = observingHead && !mirrorActive;
  const twinHeadMonitor = isHeadRole(role);
  const twinMirrorWaiting = twinHeadMonitor && (!headViewingTester || mirrorWaiting);

  const chatBayRole = isHeadRole(role) ? (headViewingTester ?? ariaFocusTester) : role;
  const headBayFocus = isHeadRole(role) ? (headViewingTester ?? ariaFocusTester) : null;
  const chatBaySnap = chatBayRole ? testerSnapshots[chatBayRole] : null;
  const chatBayUsable = chatBaySnap && isSnapshotUsable(chatBaySnap);
  const chatBayHasData = chatBaySnap && (chatBaySnap.latestPrediction || chatBaySnap.latestReading);
  const chatPrediction = mirrorReady
    ? displayPrediction
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.latestPrediction
      : (isHeadRole(role) ? null : latestPrediction);
  const chatReading = mirrorReady
    ? displayReading
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.latestReading
      : (isHeadRole(role) ? null : latestReading);
  const chatRca = mirrorReady
    ? displayRca
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.latestRca
      : (isHeadRole(role) ? null : latestRca);
  const chatMultiRca = mirrorReady
    ? effectiveMultiRca
    : (isHeadRole(role) && chatBayHasData)
      ? (chatBaySnap.latestMultiRca || [])
      : (isHeadRole(role) ? [] : latestMultiRca);
  const chatEngine = mirrorReady
    ? displayEngine
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.activeEngine
      : (isHeadRole(role) ? activeEngine : activeEngine);
  const chatStreaming = mirrorReady
    ? displayStreaming
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.isStreaming
      : (isHeadRole(role) ? false : isStreaming);
  const chatReadingCount = mirrorReady
    ? displayReadingCount
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.readingCount
      : (isHeadRole(role) ? 0 : readingCount);
  const chatOpRpm = mirrorReady
    ? displayOpRpm
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.opRpm
      : (isHeadRole(role) ? null : opRpm);
  const chatOpLoad = mirrorReady
    ? displayOpLoad
    : (isHeadRole(role) && chatBayHasData)
      ? chatBaySnap.opLoad
      : (isHeadRole(role) ? null : opLoad);
  const chatDqpScore = chatPrediction?.Data_Quality?.score ?? 100;
  const chatActiveModelMetric = activeModelLabel(chatPrediction?.Model_Selection ?? modelSelection);

  const dqpScore = effectivePrediction?.Data_Quality?.score ?? 100;
  const systemState = effectivePrediction
    ? getSystemState(effectivePrediction, dqpScore, displayScenario)
    : null;

  const showBanner =
    !playbackActive &&
    effectivePrediction?.Leak_Present === 1 && !bannerDismissed;

  const activeStageId = effectivePrediction?.Suppressed
    ? "guard"
    : effectivePrediction
      ? "ui"
      : "sim";

  const hasLiveLeakFeed = observingHead ? mirrorActive : displayStreaming;
  const leakActive = hasLiveLeakFeed
    && effectivePrediction?.Leak_Present === 1
    && !effectivePrediction?.Suppressed;
  const sfiMeta = effectivePrediction?.Sensor_Fault_Isolation;
  const confidencePct = sfiMeta?.is_sensor_fault && sfiMeta?.fault_confidence != null
    ? (sfiMeta.fault_confidence * 100).toFixed(1)
    : effectivePrediction?.Confidence_Score != null
      ? (effectivePrediction.Confidence_Score * 100).toFixed(1)
      : "—";
  const displayBayId = observingHead && headViewingTester
    ? getTesterBayId(headViewingTester)
    : isTesterRole(role)
      ? getTesterBayId(role)
      : null;
  const displayCellLabel = getCellPillLabel({ role, viewingTester: headViewingTester });
  const displayPipelineStats = mirrorReady && remoteSnap?.pipelineStats
    ? remoteSnap.pipelineStats
    : (!observingHead ? pipelineStats : null);

  const flagRate = displayPipelineStats?.flag_rate_pct != null
    ? displayPipelineStats.flag_rate_pct.toFixed(1)
    : pipelineStats?.flag_rate_pct != null
      ? pipelineStats.flag_rate_pct.toFixed(1)
      : "—";
  const activeModelMetric = activeModelLabel(
    effectivePrediction?.Model_Selection ?? modelSelection
  );
  const effectiveModelSelection = effectivePrediction?.Model_Selection ?? modelSelection;
  const contentFill = activeTab === "digitaltwin" || activeTab === "chat" || activeTab === "federated";

  const sensorHealthEngineId = displayEngine || activeEngine || "CAT_C13";
  const { healthData: sensorHealthData, loading: sensorHealthLoading } = useSensorHealth(
    sensorHealthEngineId,
    activeTab === "dashboard" || activeTab === "sensorhealth"
  );

  const handleLogout = useCallback(async () => {
    const loggingOutRole = roleRef.current || role;
    loggingOutRef.current = true;
    isStreamingRef.current = false;

    if (isTesterRole(loggingOutRole)) {
      setIsStreaming(false);
      publishOfflineSnapshot(loggingOutRole);
      clearPresence(loggingOutRole);
      flushBayLiveStatePersist({
        role: loggingOutRole,
        displayName: getTesterDisplayName(loggingOutRole),
        offline: true,
        isStreaming: false,
        readingCount: 0,
        latestReading: null,
        latestPrediction: null,
        latestRca: null,
        leakActive: false,
        sensorFaultActive: false,
        sessionId: sessionLogRef.current?.sessionId ?? null,
        currentScenario: scenarioRef.current,
        activeEngine: activeEngineRef.current,
      });
      saveTesterSession(loggingOutRole, {
        ...(loadTesterSession(loggingOutRole) || {}),
        isStreaming: false,
        updatedAt: Date.now(),
      });
      logCellActivity({
        role: loggingOutRole,
        displayName: getTesterDisplayName(loggingOutRole),
        type: "LOGOUT",
        message: `${getTesterDisplayName(loggingOutRole)} left console`,
      });
    }

    roleRef.current = null;
    clearAuthSession();
    await signOut();
    setHeadViewingTester(null);
    setAriaFocusTester(null);
    setRole(null);
    navigate("/login");
  }, [role, navigate]);

  const [loginHandoff, setLoginHandoff] = useState(false);

  useEffect(() => {
    if (!loginHandoff) return undefined;
    const timer = window.setTimeout(() => setLoginHandoff(false), 750);
    return () => window.clearTimeout(timer);
  }, [loginHandoff]);

  useEffect(() => {
    if (role) setLoginHandoff(true);
  }, []);

  if (!role) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className={`app-shell ${leakActive ? "leak-active" : ""}`}>
      {loginHandoff && (
        <div
          className="app-handoff-curtain"
          aria-hidden
          onAnimationEnd={() => setLoginHandoff(false)}
        />
      )}
      {activeTab === "dashboard" && (
        <div className="dashboard-ambient-bg">
          <AmbientParticles count={14} maxOpacity={0.22} active />
        </div>
      )}

      <TopBar
        isStreaming={displayStreaming}
        readingCount={displayReadingCount}
        role={role}
        headViewingTester={headViewingTester}
        headViewingName={headViewingTester ? getTesterDisplayName(headViewingTester) : null}
        cellLabel={displayCellLabel}
        onLogout={handleLogout}
        onManageTesters={isHeadRole(role) ? openManageBays : undefined}
        onOpenAccount={isTesterRole(role) ? openTesterAccount : undefined}
        onOpenFlGlobe={openFlGlobe}
        flGlobeActive={activeTab === "federated" && flSubView === "globe"}
        accountActive={activeTab === "account"}
        activeEngine={displayEngine}
        onGenerateReport={handleGenerateReport}
        reportReady={
          !displayStreaming &&
          Boolean(sessionLog.endTime) &&
          (sessionLog.totalReadings > 0 || !displayApiOnline)
        }
        isRecording={displayStreaming}
        leakActive={leakActive}
        mirrorWaiting={observingHead ? mirrorWaiting : false}
        operatorView={operatorView}
        onOperatorViewChange={handleOperatorViewChange}
      />
      <MainNav
        activeTab={activeTab === "account" ? previousTab : activeTab}
        onTabChange={handleTabChange}
        unreadCommsCount={unreadMessageCount}
        opsTabBadgeCount={opsTabBadgeCount}
        operatorView={operatorView}
        onOperatorViewChange={handleOperatorViewChange}
      />

      <PipelineBreadcrumb activeStageId={activeStageId} isStreaming={displayStreaming} />

      {showCommsNotifyBar && (
        <CommsNotifyBar
          message={latestUnreadMessage}
          onOpen={() => {
            setCommsBannerDismissedId(latestUnreadMessage.id);
            navigateToComms();
          }}
          onDismiss={(id) => setCommsBannerDismissedId(id)}
        />
      )}

      {showHeadOpsNotifyBar && (
        <HeadOpsNotifyBar
          event={latestUnreadHeadOpsEvent}
          onOpen={() => {
            setHeadOpsBannerDismissedId(latestUnreadHeadOpsEvent.id);
            setActiveTab("operations");
            window.setTimeout(() => {
              const panel = document.getElementById("head-manual-disturbance-panel");
              const scrollRoot = document.querySelector(".operations-scroll") || document.getElementById("main-scroll");
              if (panel && scrollRoot) {
                const top = panel.getBoundingClientRect().top - scrollRoot.getBoundingClientRect().top + scrollRoot.scrollTop - 16;
                scrollRoot.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
              } else if (panel) {
                panel.scrollIntoView({ behavior: "smooth", block: "start" });
              }
            }, 150);
          }}
          onDismiss={(id) => setHeadOpsBannerDismissedId(id)}
        />
      )}

      {changeRequestAlerts.length > 0 && (
        <div className="cr-alert-stack" aria-live="polite">
          {changeRequestAlerts.slice(0, 3).map((alert, i) => (
            <ChangeRequestAlert
              key={alert.key}
              alertKey={alert.key}
              request={alert.request}
              variant={alert.variant}
              index={i}
              onNavigate={navigateToChangeRequests}
              onDismiss={dismissChangeRequestAlert}
            />
          ))}
        </div>
      )}

      <div className="app-body">
        {(isTesterRole(role) && (activeTab === "dashboard" || activeTab === "sensorhealth" || activeTab === "operations" || activeTab === "comms")) && (
        <LeftSidebar
          selectedEngine={displayEngine}
          setSelectedEngine={sidebarReadOnly ? () => {} : handleEngineSwitch}
          activeScenario={displayScenario}
          setActiveScenario={sidebarReadOnly ? () => {} : handleScenarioChange}
          isStreaming={displayStreaming}
          setIsStreaming={sidebarReadOnly ? () => {} : setIsStreaming}
          streamingSpeed={intervalMs}
          setStreamingSpeed={sidebarReadOnly ? () => {} : setIntervalMs}
          latestPrediction={displayPrediction}
          apiOnline={displayApiOnline}
          engineSwitching={engineSwitching}
          switchingLabel={switchingLabel}
          readOnly={sidebarReadOnly}
          sensorHealthScore={sensorHealthData?.health_score}
          sensorStatusCounts={sensorHealthData?.status_counts}
          faultInjectionActive={displayFaultInjectionActive}
          canFaultInject={canFaultInjectForScenario(displayScenario)}
          faultInjectionPreset={getFaultInjectionForScenario(displayScenario)}
          onToggleFaultInjection={
            sidebarReadOnly || !displayStreaming ? undefined : handleToggleFaultInjection
          }
        />
        )}

        <main className={`app-content ${contentFill ? "app-content-fill" : ""} ${activeTab === "dashboard" ? "app-content-dashboard" : ""} ${activeTab === "sensorhealth" ? "app-content-health" : ""} ${activeTab === "manualinput" ? "app-content-manualinput" : ""} ${activeTab === "validation" ? "app-content-validation" : ""} ${activeTab === "operations" || activeTab === "comms" ? "app-content-ops" : ""} ${activeTab === "cellboard" ? "app-content-cellboard" : ""} ${activeTab === "account" ? "app-content-account" : ""}`} id="main-scroll">
          {!displayApiOnline && activeTab === "dashboard" && (
            <div className="demo-banner">API offline — running in demo mode (mock predictions)</div>
          )}

          {activeTab === "dashboard" && (
            <AlertBanner
              visible={showBanner}
              prediction={displayPrediction}
              multiPattern={effectiveMultiPattern}
              activeScenario={displayScenario}
              onDismiss={() => setBannerDismissed(true)}
            />
          )}

          {activeTab === "dashboard" && (
            <div className="dashboard-page">
              <div className="dashboard-page-pinned">
                {isHeadRole(role) && (
                  <TesterViewSelector
                    liveTesters={boardTesters}
                    selectedId={headViewingTester}
                    compact
                    onSelect={(id) => {
                      handleBayFocusChange(id);
                      setActiveTab("dashboard");
                    }}
                  />
                )}
                {(mirrorStale || mirrorWaiting) && (
                  <div className="head-view-waiting">
                    {mirrorStale
                      ? `${getTesterDisplayName(headViewingTester)} feed stale — waiting for live ticks from tester tab`
                      : viewedBay?.online
                        ? `Syncing live feed from ${getTesterDisplayName(headViewingTester)}…`
                        : `${getTesterDisplayName(headViewingTester)} is offline — open their console tab and start streaming`}
                  </div>
                )}
                <div className="metric-strip">
                  <MetricCard
                    variant="confidence"
                    label="CONFIDENCE"
                    value={headOverviewMode
                      ? (headOverviewStats?.leakCount
                        ? `${headOverviewStats.leakBays[0]?.snap?.latestPrediction?.Confidence_Score != null
                          ? (headOverviewStats.leakBays[0].snap.latestPrediction.Confidence_Score * 100).toFixed(1)
                          : "—"}%`
                        : "—%")
                      : `${confidencePct}%`}
                    progress={headOverviewMode
                      ? (headOverviewStats?.leakBays[0]?.snap?.latestPrediction?.Confidence_Score ?? 0) * 100
                      : parseFloat(confidencePct) || 0}
                    colour={headOverviewMode
                      ? (headOverviewStats?.leakCount ? "leak" : "normal")
                      : (leakActive ? "leak" : "normal")}
                    animated={headOverviewMode ? headOverviewStats?.streaming > 0 : displayStreaming}
                    subLabel={headOverviewMode
                      ? (headOverviewStats?.leakCount ? "Peak leak confidence" : "No active leaks")
                      : (leakActive
                        ? "Leak signature match"
                        : sfiMeta?.is_sensor_fault
                          ? "SFI fault isolation"
                          : "No active leak")}
                  />
                  <MetricCard
                    variant="model"
                    label={headOverviewMode ? "CELL STATUS" : "ACTIVE MODEL"}
                    modelName={headOverviewMode
                      ? (headOverviewStats?.leakCount ? "LEAK ALERT" : "ALL CLEAR")
                      : displayModelName(
                          effectiveModelSelection?.active_model_id,
                          effectiveModelSelection?.active_model_name
                        )}
                    accuracy={headOverviewMode ? undefined : effectiveModelSelection?.active_leak_location_accuracy}
                    colour={headOverviewMode
                      ? (headOverviewStats?.leakCount ? "leak" : "normal")
                      : "info"}
                    animated={headOverviewMode ? headOverviewStats?.streaming > 0 : displayStreaming}
                  />
                  <MetricCard
                    label="DQ SCORE"
                    value={headOverviewMode ? `${headOverviewStats?.avgDq ?? 100}/100` : `${dqpScore}/100`}
                    colour="info"
                  />
                  <MetricCard
                    label={headOverviewMode ? "ONLINE" : "RPM"}
                    value={headOverviewMode
                      ? `${headOverviewStats?.online ?? 0}/${headOverviewStats?.total ?? 0}`
                      : (displayOpRpm?.toFixed(0) ?? "—")}
                    mono
                  />
                  <MetricCard
                    label={headOverviewMode ? "STREAMING" : "LOAD"}
                    value={headOverviewMode
                      ? String(headOverviewStats?.streaming ?? 0)
                      : `${displayOpLoad?.toFixed(0) ?? "—"}%`}
                    mono
                  />
                  <MetricCard
                    label={headOverviewMode ? "LEAKS" : "AMB kPa"}
                    value={headOverviewMode
                      ? String(headOverviewStats?.leakCount ?? 0)
                      : (displayOpAmbient?.toFixed(1) ?? "—")}
                    mono
                    colour={headOverviewMode && headOverviewStats?.leakCount ? "leak" : undefined}
                  />
                  <MetricCard
                    label="READINGS"
                    value={headOverviewMode ? headOverviewStats?.totalReadings ?? 0 : displayReadingCount}
                    mono
                  />
                  <MetricCard label="FLAG RATE" value={`${flagRate}%`} mono />
                </div>

                {!headOverviewMode && (
                <OperatingPointBar
                  isStreaming={displayStreaming}
                  opRpm={displayOpRpm}
                  opLoad={displayOpLoad}
                  opAmbientPressure={displayOpAmbient}
                  spRpm={displaySpRpm}
                  spLoad={displaySpLoad}
                  spAmbient={displaySpAmbient}
                />
                )}
              </div>

              <div className="dashboard-page-scroll">
              <div className="dashboard-rows stagger-in">
                {/* Row 1: Head overview OR single-bay leak + judge summary */}
                <div className={`dash-row ${headOverviewMode ? "dash-row-full" : "dash-row-2"}`}>
                  {headOverviewMode ? (
                    <div className="dash-cell">
                      <HeadCellOverview
                        boardTesters={boardTesters}
                        onMirrorTester={(id) => {
                          handleBayFocusChange(id);
                          setActiveTab("dashboard");
                        }}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="dash-cell">
                        <PredictionPanel
                          prediction={effectivePrediction}
                          systemState={systemState}
                          leakStartMs={displayLeakStartMs}
                          opRpm={effectiveOpRpm}
                          spRpm={displaySpRpm}
                          opLoad={effectiveOpLoad}
                          spLoad={displaySpLoad}
                          isStreaming={displayStreaming && !playbackActive}
                          multiPattern={effectiveMultiPattern}
                          activeScenario={displayScenario}
                        />
                      </div>
                      <div className="dash-cell">
                        <JudgeSummaryCard
                          prediction={effectivePrediction}
                          modelSelection={effectiveModelSelection}
                          apiOnline={displayApiOnline}
                          multiPattern={effectiveMultiPattern}
                          activeScenario={displayScenario}
                        />
                      </div>
                    </>
                  )}
                </div>

                {headOverviewMode && (
                  <div className="dash-row dash-row-2">
                    <div className="dash-cell">
                      <HeadCellAggregateSummary
                        boardTesters={boardTesters}
                        onMirrorTester={(id) => {
                          handleBayFocusChange(id);
                          setActiveTab("dashboard");
                        }}
                      />
                    </div>
                    <div className="dash-cell">
                      <CellActivityPanel role={role} />
                    </div>
                  </div>
                )}

                {headOverviewMode && (
                  <div className="dash-row dash-row-full">
                    <div className="dash-cell">
                      <AnomalyTimeline
                        embedded
                        role={role}
                        markers={timelineMarkers}
                        sessionStartMs={timelineStartMs}
                        selectedEventId={playbackEvent?.id ?? null}
                        playbackActive={playbackActive}
                        overviewMode
                        onSelectEvent={(event) => {
                          if (!event) {
                            setPlaybackEvent(null);
                            return;
                          }
                          setPlaybackEvent(event);
                          if (event.role) {
                            handleBayFocusChange(event.role, { keepPlayback: true });
                          }
                        }}
                        onReturnLive={() => setPlaybackEvent(null)}
                        onMirrorBay={(testerId) => {
                          handleBayFocusChange(testerId, { keepPlayback: true });
                          setActiveTab("dashboard");
                        }}
                      />
                    </div>
                  </div>
                )}

                {!headOverviewMode && (
                <div className={`dash-row ${isHeadRole(role) ? "dash-row-2" : "dash-row-full"}`}>
                  <div className="dash-cell">
                    <CellActivityPanel role={role} />
                  </div>
                  {isHeadRole(role) && (
                    <div className="dash-cell section-card compact tester-live-board-wrap">
                      <div className="section-card-header">
                        <span className="section-card-title">LIVE TESTER STATUS</span>
                      </div>
                      <div className="section-card-body flush">
                        <TesterLiveBoard
                          liveTesters={boardTesters}
                          selectedId={headViewingTester}
                          onSelect={(id) => {
                            handleBayFocusChange(id);
                            setActiveTab("dashboard");
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
                )}

                {!headOverviewMode && (
                <>
                {/* Row 3: Data quality + Steady state guard + SHAP — equal height, scrollable */}
                <div className="dash-row dash-row-3 dash-row-equal">
                  <div className="dash-cell section-card">
                    <div className="section-card-header">
                      <span className="section-card-title">DATA QUALITY STUDY</span>
                    </div>
                    <div className="section-card-body flush dash-panel-scroll">
                      <DataQualityPanel
                        dataQuality={effectivePrediction?.Data_Quality}
                        pipelineStats={displayPipelineStats ?? pipelineStats}
                        isStreaming={displayStreaming && !playbackActive}
                        compact
                        scrollable
                      />
                    </div>
                  </div>
                  <div className="dash-cell section-card">
                    <div className="section-card-header">
                      <span className="section-card-title">STEADY STATE GUARD</span>
                    </div>
                    <div className="section-card-body flush dash-panel-scroll">
                      <SteadyStatePanel
                        prediction={effectivePrediction}
                        isStreaming={displayStreaming && !playbackActive}
                      />
                    </div>
                  </div>
                  <div className="dash-cell section-card dash-cell-shap" style={{ position: "relative", overflow: "hidden" }}>
                    <div className="data-stream-section-bg">
                      <DataStreamBg density={0.2} active={activeTab === "dashboard"} />
                    </div>
                    <div className="section-card-header" style={{ position: "relative", zIndex: 1 }}>
                      <span className="section-card-title">SHAP EXPLAINABILITY</span>
                    </div>
                    <div className="section-card-body flush dash-panel-scroll" style={{ position: "relative", zIndex: 1 }}>
                      <ShapPanel
                        prediction={effectivePrediction}
                        multiPattern={effectiveMultiPattern}
                        activeScenario={displayScenario}
                        scrollable
                      />
                    </div>
                  </div>
                </div>

                {/* Row 4: Pressure monitoring — full width */}
                <div className="dash-row dash-row-full">
                  <div className="dash-cell">
                    <PressureChart data={displayChartBuffer} leakAtReadingNo={displayLeakAtReadingNo} isStreaming={displayStreaming} />
                  </div>
                </div>

                {/* Row 5: Root cause analysis — full width */}
                <div className="dash-row dash-row-full">
                  <div className="dash-cell section-card" style={{ position: "relative", overflow: "hidden" }}>
                    <div className="section-card-header" style={{ position: "relative", zIndex: 1 }}>
                      <span className="section-card-title">ROOT CAUSE ANALYSIS</span>
                    </div>
                    <div className="section-card-body" style={{ position: "relative", zIndex: 1 }}>
                      <RcaPanel
                        rcaResult={effectiveRca}
                        secondaryRcaResult={effectiveSecondaryRca}
                        multiRcaResults={effectiveMultiRca}
                        multiPattern={effectiveMultiPattern}
                        latestPrediction={effectivePrediction}
                      />
                    </div>
                  </div>
                </div>

                {/* Row 6: Baseline expected vs actual — full width */}
                <div className="dash-row dash-row-full">
                  <div className="dash-cell">
                    <BaselinePanel
                      reading={effectiveReading}
                      baseline={effectivePrediction?.Dynamic_Baseline || null}
                      open={baselineOpen}
                      onToggle={() => setBaselineOpen((v) => !v)}
                    />
                  </div>
                </div>

                {/* Row 6b: Anomaly timeline — scrollable, above live telemetry */}
                <div className="dash-row dash-row-full">
                  <div className="dash-cell">
                    <AnomalyTimeline
                      embedded
                      role={role}
                      markers={timelineMarkers}
                      sessionStartMs={timelineStartMs}
                      selectedEventId={playbackEvent?.id ?? null}
                      playbackActive={playbackActive}
                      overviewMode={false}
                      onSelectEvent={(event) => {
                        if (!event) {
                          setPlaybackEvent(null);
                          return;
                        }
                        setPlaybackEvent(event);
                        if (isHeadRole(role) && event.role) {
                          handleBayFocusChange(event.role, { keepPlayback: true });
                        }
                      }}
                      onReturnLive={() => setPlaybackEvent(null)}
                      onMirrorBay={(testerId) => {
                        handleBayFocusChange(testerId, { keepPlayback: true });
                        setActiveTab("dashboard");
                      }}
                    />
                  </div>
                </div>

                {/* Row 7: Live sensor telemetry — full width */}
                <div className="dash-row dash-row-full">
                  <div className="dash-cell">
                    <SensorGrid
                      latestReading={effectiveReading}
                      historyStack={displayRecentReadings}
                      dynamicBaseline={effectivePrediction?.Dynamic_Baseline || null}
                      dataQuality={effectivePrediction?.Data_Quality || null}
                      engineBaselines={displayEngineBaselines}
                      activeEngine={displayEngine}
                    />
                  </div>
                </div>

                </>
                )}
              </div>
              </div>
            </div>
          )}

          {activeTab === "sensorhealth" && (
            <div className="sensor-health-page">
              {isHeadRole(role) && (
                <TesterViewSelector
                  liveTesters={boardTesters}
                  selectedId={headViewingTester}
                  compact
                  onSelect={(id) => {
                    handleBayFocusChange(id);
                  }}
                />
              )}
              <div className="sensor-health-page__body section-card">
                <SensorHealthDashboard
                  engineId={sensorHealthEngineId}
                  isVisible
                  healthData={sensorHealthData}
                  loading={sensorHealthLoading}
                />
              </div>
            </div>
          )}

          {activeTab === "manualinput" && (
            <div className="manual-input-page-wrap">
              <ManualInputPanel
                defaultEngineId={displayEngine}
                apiOnline={displayApiOnline}
              />
            </div>
          )}

          {activeTab === "validation" && (
            <div className="validation-demo-page-wrap">
              <ValidationDemoPanel apiOnline={displayApiOnline} />
            </div>
          )}

          {activeTab === "cellboard" && (
            <CellCommunityDashboard
              role={role}
              boardTesters={boardTesters}
              onMirrorTester={(id) => {
                handleBayFocusChange(id);
                setActiveTab("dashboard");
              }}
            />
          )}

          {activeTab === "operations" && (
            <OperationsPanel
              role={role}
              liveTesters={boardTesters}
              headViewingTester={headViewingTester}
              onHeadViewTester={(id) => {
                handleBayFocusChange(id);
                setActiveTab("dashboard");
              }}
              targetRpm={targetRpm}
              targetLoad={targetLoad}
              targetAmbientPressure={targetAmbientPressure}
              disturbanceMode={disturbanceMode}
              rampSeconds={rampSeconds}
              changeReason={changeReason}
              onReasonChange={setChangeReason}
              onRpmChange={setTargetRpm}
              onLoadChange={setTargetLoad}
              onAmbientPressureChange={setTargetAmbientPressure}
              onModeChange={setDisturbanceMode}
              onRampSecondsChange={setRampSeconds}
              onReturnSteady={returnToSteady}
              onRequestChange={createRequest}
              onApplyChange={applyDisturbance}
              headApplyTargets={headApplyTargets}
              onHeadApplyTargetsChange={setHeadApplyTargets}
              boardTesters={boardTesters}
              requests={requests}
              auditEvents={auditEvents}
              notifications={notifications}
              onApprove={approveRequest}
              onReject={rejectRequest}
              highlightRequestId={highlightedRequestId}
              isStreaming={displayStreaming}
              opRpm={displayOpRpm}
              opLoad={displayOpLoad}
              opAmbientPressure={displayOpAmbient}
              spRpm={displaySpRpm}
              spLoad={displaySpLoad}
              spAmbient={displaySpAmbient}
            />
          )}

          {activeTab === "comms" && (
            <CellCommsPage
              role={role}
              testerRegistry={chatRegistry}
              messagesReadAt={messagesReadAt}
              onMarkThreadRead={markCommsThreadRead}
              onSend={sendCellMessage}
              unreadCount={unreadMessageCount}
              initialThreadId={commsInitialThreadId}
              onInitialThreadConsumed={() => setCommsInitialThreadId(null)}
              pendingReportShare={pendingReportShare}
              onPendingReportShared={() => {
                setPendingReportShare(null);
                setChatTick((n) => n + 1);
              }}
              onCancelPendingReportShare={() => setPendingReportShare(null)}
              onOpenSharedReport={handleOpenSharedReport}
            />
          )}

          {activeTab === "account" && isTesterRole(role) && (
            <TesterAccountDashboard
              role={role}
              onBack={closeTesterAccount}
              onRegistryChange={() => setRegistryTick((n) => n + 1)}
              activeEngine={displayEngine}
              activeScenario={displayScenario}
              isStreaming={displayStreaming}
              readingCount={displayReadingCount}
              apiOnline={displayApiOnline}
              returnTab={previousTab}
              sessionLog={sessionLog}
              opRpm={displayOpRpm}
              opLoad={displayOpLoad}
              opAmbientPressure={displayOpAmbient}
            />
          )}

          {activeTab === "digitaltwin" && (
            <div className="digital-twin-page">
              {isHeadRole(role) && (
                <TesterViewSelector
                  liveTesters={boardTesters}
                  selectedId={headViewingTester}
                  compact
                  onSelect={(id) => {
                    handleBayFocusChange(id);
                  }}
                />
              )}
              <DigitalTwinTopBar
                activeEngine={displayEngine}
                onEngineChange={twinHeadMonitor ? () => {} : handleEngineSwitch}
                activeScenario={displayScenario}
                onScenarioChange={twinHeadMonitor ? () => {} : handleScenarioChange}
                isStreaming={displayStreaming}
                onToggleStream={twinHeadMonitor ? () => {} : () => setIsStreaming((s) => !s)}
                intervalMs={intervalMs}
                onIntervalChange={twinHeadMonitor ? () => {} : setIntervalMs}
                latestPrediction={displayPrediction}
                apiOnline={displayApiOnline}
                engineSwitching={engineSwitching}
                switchingLabel={switchingLabel}
                readingCount={displayReadingCount}
                presentMode={twinPresentMode}
                onPresentModeChange={setTwinPresentMode}
                opRpm={displayOpRpm}
                opLoad={displayOpLoad}
                opAmbientPressure={displayOpAmbient}
                spRpm={displaySpRpm}
                spLoad={displaySpLoad}
                spAmbient={displaySpAmbient}
                readOnly={twinHeadMonitor}
                mirrorWaiting={twinMirrorWaiting}
                mirrorBayName={headViewingTester ? getTesterDisplayName(headViewingTester) : null}
                faultInjectionActive={displayFaultInjectionActive}
                faultInjectionPreset={getFaultInjectionForScenario(displayScenario)}
              />
              <div className="twin-canvas-area">
                {twinMirrorWaiting && (
                  <div className="twin-mirror-waiting" role="status">
                    <span className="twin-mirror-waiting__dot" aria-hidden />
                    <p className="twin-mirror-waiting__title">
                      {!headViewingTester
                        ? "Select a tester bay above"
                        : viewedBay?.online
                          ? "Connecting to bay feed…"
                          : `${getTesterDisplayName(headViewingTester)} offline`}
                    </p>
                    <p className="twin-mirror-waiting__hint">
                      {!headViewingTester
                        ? "Digital Twin mirrors the selected tester — engine and scenario are under tester control."
                        : viewedBay?.online
                          ? "Waiting for the next snapshot from this tester."
                          : "Open this tester in a separate browser tab and log in."}
                    </p>
                  </div>
                )}
                <Suspense fallback={<div className="twin-canvas-loading">Loading Digital Twin…</div>}>
                  <DigitalTwin
                    sensorData={displayReading}
                    prediction={displayPrediction}
                    multiPattern={effectiveMultiPattern}
                    activeScenario={displayScenario}
                    engineBaselines={displayEngineBaselines}
                    isStreaming={displayStreaming}
                    activeEngine={displayEngine || "CAT_C13"}
                    engineDisplayName={displayEngine ? (ENGINE_DISPLAY[displayEngine] || displayEngine) : "—"}
                    hasScr={displayEngine ? ENGINE_HAS_SCR[displayEngine] !== false : true}
                    operatingPoint={{ rpm: displayOpRpm ?? 0, load: displayOpLoad ?? 0, ambientPressure: displayOpAmbient ?? 0 }}
                    rcaResult={displayRca}
                    multiRcaResults={effectiveMultiRca}
                    presentationMode={twinPresentMode}
                    mirrorWaiting={twinMirrorWaiting}
                    faultInjectionActive={displayFaultInjectionActive}
                    faultInjectionPreset={getFaultInjectionForScenario(displayScenario)}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {activeTab === "federated" && (
            <div className="digital-twin-page fl-page-wrapper">
              <Suspense fallback={<div className="fl-page-loading">Loading Federated Learning…</div>}>
                <FederatedLearningPanel view={flSubView} onViewChange={setFlSubViewFromPanel} />
              </Suspense>
            </div>
          )}

          {activeTab === "chat" && (
            <div className="chat-panel-page">
              <ChatPanel
                onClose={closeChat}
                role={role}
                latestPrediction={mirrorReady ? displayPrediction : (isHeadRole(role) ? chatPrediction : latestPrediction)}
                liveReadings={mirrorReady ? displayReading : (isHeadRole(role) ? chatReading : latestReading)}
                rcaResult={mirrorReady ? displayRca : (isHeadRole(role) ? chatRca : latestRca)}
                multiRcaResults={mirrorReady ? effectiveMultiRca : (isHeadRole(role) ? chatMultiRca : latestMultiRca)}
                activeScenario={displayScenario}
                engineId={mirrorReady ? displayEngine : (isHeadRole(role) ? chatEngine : activeEngine)}
                sessionEvents={auditEvents.slice(0, 10).map((e) => `[${e.type}] ${e.message}`)}
                isStreaming={mirrorReady ? displayStreaming : (isHeadRole(role) ? chatStreaming : isStreaming)}
                dqpScore={mirrorReady ? dqpScore : chatDqpScore}
                activeModelMetric={mirrorReady ? activeModelMetric : chatActiveModelMetric}
                opRpm={mirrorReady ? displayOpRpm : chatOpRpm}
                opLoad={mirrorReady ? displayOpLoad : chatOpLoad}
                readingCount={mirrorReady ? displayReadingCount : chatReadingCount}
                boardTesters={boardTesters}
                ariaFocusTester={headBayFocus}
                onAriaFocusTesterChange={handleBayFocusChange}
                cellTesterSummaries={cellTesterSummaries}
              />
            </div>
          )}
        </main>
      </div>

      <StatusBar
        latestPrediction={effectivePrediction}
        opRpm={effectiveOpRpm ?? 0}
        opLoad={effectiveOpLoad ?? 0}
        opAmbientPressure={effectiveOpAmbient ?? 0}
        spRpm={displaySpRpm ?? 0}
        spLoad={displaySpLoad ?? 0}
        spAmbient={displaySpAmbient ?? 0}
        engineId={displayEngine}
        readingCount={displayReadingCount}
        isStreaming={displayStreaming}
        presentationMode={activeTab === "digitaltwin" && twinPresentMode}
        mirrorWaiting={observingHead ? mirrorWaiting : false}
        mirrorBayName={headViewingTester ? getTesterDisplayName(headViewingTester) : null}
        bayId={displayBayId}
        viewerName={observingHead && headViewingTester ? getTesterDisplayName(headViewingTester) : null}
        headOverviewMode={headOverviewMode}
        overviewStats={headOverviewStats}
        activeScenario={displayScenario}
        faultInjectionActive={displayFaultInjectionActive}
        faultInjectionPreset={getFaultInjectionForScenario(displayScenario)}
      />

      {showReport && reportSessionLog && (
        <ReportPreview
          sessionLog={reportSessionLog}
          role={role}
          onClose={() => setShowReport(false)}
          onDownload={async () => {
            generateSessionReport(reportSessionLog);
            try {
              await uploadSessionReport(reportSessionLog);
            } catch {
              // keep the local download even if the upload fails
            }
            setShowReport(false);
          }}
          onShareToComms={handleShareReportToComms}
        />
      )}

      <IntroTriggerBtn />
    </div>
  );
}
