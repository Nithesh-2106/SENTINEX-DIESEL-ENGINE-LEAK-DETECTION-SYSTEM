import React, { useState, useCallback, useRef, useLayoutEffect } from "react";
import ProductBrandLockup from "./ProductBrandLockup.jsx";
import LoginLiquidCrystal from "./spline/LoginLiquidCrystal.jsx";
import LoginWelcomeTransition from "./LoginWelcomeTransition.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import {
  DEFAULT_HEAD_PASSWORD,
  DEFAULT_HEAD_USERNAME,
} from "../lib/authEmail.js";
import { signInWithUsername } from "../lib/supabaseAuth.js";

const ML_CHIPS = [
  { id: "shap", label: "SHAP", desc: "WHICH SENSORS DRIVE EACH LEAK VERDICT" },
  { id: "aria", label: "ARIA", desc: "AI EXPLAINS WHAT SENTINEX DETECTS" },
  { id: "rca", label: "RCA", desc: "RANKED ROOT-CAUSE HYPOTHESES" },
  { id: "twin", label: "DIGITAL TWIN", desc: "3D ENGINE VIEW WITH LIVE SHAP" },
  { id: "guard", label: "STEADY GUARD", desc: "FILTERS TRANSIENT FALSE ALARMS" },
];

const PRODUCT_TAGLINE_LEAD = "Diesel Leak Intelligence";
const PRODUCT_AI_STACK = "SHAP · ARIA · RCA · DIGITAL TWIN · STEADY GUARD";

const PRODUCT_QUOTE = "BUILT FOR CATERPILLAR TEST CELLS";

export default function LoginScreen({ onLogin }) {
  const [loginStep, setLoginStep] = useState("pick");
  const [consoleType, setConsoleType] = useState(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [pendingRole, setPendingRole] = useState(null);
  const [activeChip, setActiveChip] = useState(null);
  const quoteMeasureRef = useRef(null);
  const quoteShellRef = useRef(null);

  const quoteText = activeChip
    ? ML_CHIPS.find((c) => c.id === activeChip)?.desc
    : PRODUCT_QUOTE;

  useLayoutEffect(() => {
    const measure = quoteMeasureRef.current;
    const shell = quoteShellRef.current;
    if (!measure || !shell) return;
    shell.style.width = `${Math.ceil(measure.getBoundingClientRect().width)}px`;
  }, [quoteText]);

  const openTesterLogin = () => {
    setConsoleType("tester");
    setLoginStep("credentials");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError("");
  };

  const openHeadLogin = () => {
    setConsoleType("head");
    setLoginStep("credentials");
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError("");
  };

  const backToPick = () => {
    setLoginStep("pick");
    setConsoleType(null);
    setUsername("");
    setPassword("");
    setShowPassword(false);
    setError("");
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signInWithUsername(username.trim(), password);
    setLoading(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    const session = res.session;
    if (consoleType === "head" && session.role !== "head") {
      setError("Head console requires test head credentials.");
      return;
    }
    if (consoleType === "tester" && session.role === "head") {
      setError("Use the Head console to sign in as test head.");
      return;
    }
    if (consoleType === "tester" && session.role !== "tester") {
      setError("Invalid credentials for selected console.");
      return;
    }
    setPendingRole(session.sessionKey);
    setTransitioning(true);
  };

  const handleTransitionComplete = useCallback(() => {
    if (pendingRole) onLogin(pendingRole);
  }, [pendingRole, onLogin]);

  return (
    <div className={`login-page login-page--sentinex ${transitioning ? "login-page--portal-active" : ""}`}>
      <ThemeToggle />
      <LoginLiquidCrystal />

      <div className="login-bg">
        <div className="login-bg-gradient login-bg-gradient--water" />
      </div>

      <div className="login-content login-content--glass">
        <div className="login-logo">
          <div className="login-brand-lockup login-brand-liquid-box">
            <ProductBrandLockup variant="login" />
          </div>
          <p className="login-tagline">
            <span className="login-tagline__lead">{PRODUCT_TAGLINE_LEAD}</span>
            <span className="login-tagline__ai">{PRODUCT_AI_STACK}</span>
          </p>
        </div>

        <div
          className="login-ml-chips"
          aria-label="AI and ML capabilities"
          onMouseLeave={() => setActiveChip(null)}
        >
          {ML_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`login-ml-chip login-ml-chip--${chip.id} login-glass login-glass--chip ${activeChip === chip.id ? "active" : ""}`}
              onMouseEnter={() => setActiveChip(chip.id)}
              onFocus={() => setActiveChip(chip.id)}
              onBlur={(e) => {
                if (!e.currentTarget.parentElement?.contains(e.relatedTarget)) {
                  setActiveChip(null);
                }
              }}
            >
              <span className="login-ml-chip-label">{chip.label}</span>
            </button>
          ))}
        </div>

        <div className="login-ai-quote-wrap">
          <div ref={quoteShellRef} className="login-ai-quote-shell">
            <div
              ref={quoteMeasureRef}
              className="login-ai-quote login-ai-quote--measure"
              aria-hidden="true"
            >
              <span className="login-ai-quote__text">{quoteText}</span>
            </div>
            <div
              className={`login-ai-quote login-glass login-glass--pill ${activeChip ? "active" : ""}`}
            >
              <span className="login-ai-quote__text">{quoteText}</span>
            </div>
          </div>
        </div>

        {loginStep === "pick" ? (
          <div
            className={`login-console-pick login-glass login-glass--card ${transitioning ? "login-card--exit" : ""}`}
          >
            <div className="login-col-label login-console-pick__label">SELECT CONSOLE</div>
            <div className="login-console-pick__grid">
              <button
                type="button"
                className="login-console-panel login-console-panel--tester login-glass login-glass--btn"
                onClick={openTesterLogin}
                disabled={transitioning || loading}
              >
                <div className="login-console-panel__icon">◎</div>
                <div className="login-console-panel__title">Tester Console</div>
                <div className="login-console-panel__desc login-console-panel__desc--caps">
                  SENSORS · LEAK DETECTION · ARIA
                </div>
              </button>
              <button
                type="button"
                className="login-console-panel login-console-panel--head login-glass login-glass--btn"
                onClick={openHeadLogin}
                disabled={transitioning || loading}
              >
                <div className="login-console-panel__icon">◈</div>
                <div className="login-console-panel__title">Test Head Console</div>
                <div className="login-console-panel__desc login-console-panel__desc--caps">
                  SUPERVISION · APPROVALS · LIVE BAY VISIBILITY
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`login-card login-card--water login-card--credentials login-glass login-glass--card ${transitioning ? "login-card--exit" : ""}`}
          >
            <button
              type="button"
              className="login-credentials-back"
              onClick={backToPick}
              disabled={transitioning || loading}
            >
              ← BACK
            </button>

            <div className="login-credentials-header">
              <div className="login-col-label">
                {consoleType === "head" ? "HEAD CONSOLE" : "TESTER CONSOLE"}
              </div>
              <div className="login-credentials-sub">
                {consoleType === "head"
                  ? "Enter test head credentials"
                  : "Enter your tester credentials — username maps to your bay"}
              </div>
            </div>

            <form className="login-credentials-form" onSubmit={submit} autoComplete="off">
              <div className="login-field">
                <label className="login-field-label" htmlFor="sentinex_username">
                  USERNAME
                </label>
                <input
                  id="sentinex_username"
                  className="login-input login-input--water login-glass login-glass--input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="off"
                  name="sentinex_username"
                  data-1p-ignore
                  data-lpignore="true"
                  disabled={transitioning || loading}
                  placeholder={consoleType === "head" ? DEFAULT_HEAD_USERNAME : "your username"}
                />
              </div>
              <div className="login-field">
                <label className="login-field-label" htmlFor="sentinex_password">
                  PASSWORD
                </label>
                <div className="login-password-wrap">
                  <input
                    id="sentinex_password"
                    className="login-input login-input--water login-glass login-glass--input login-input--password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    name="sentinex_password"
                    data-1p-ignore
                    data-lpignore="true"
                    disabled={transitioning || loading}
                  />
                  <button
                    type="button"
                    className="login-password-toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    disabled={transitioning || loading}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M3 3l18 18M10.58 10.58A2 2 0 0012 15a2 2 0 001.42-.58M9.88 5.09A10.94 10.94 0 0112 5c5.52 0 10 4.48 10 8a10.9 10.9 0 01-4.12 4.88M6.61 6.61A10.94 10.94 0 002 13c0 3.52 2.24 6.52 5.36 7.64"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path
                          d="M2 13c0 0 3.5-8 10-8s10 8 10 8-3.5 8-10 8-10-8-10-8z"
                          stroke="currentColor"
                          strokeWidth="1.75"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <circle cx="12" cy="13" r="3" stroke="currentColor" strokeWidth="1.75" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
              {error && <div className="login-error">{error}</div>}
              <button
                type="submit"
                className="login-submit-btn login-submit-btn--sentinex"
                disabled={transitioning || loading}
              >
                {transitioning || loading ? "AUTHENTICATING…" : "ENTER CONSOLE"}
              </button>
            </form>

            <div className="demo-creds login-glass login-glass--btn">
              <div className="demo-creds-label">DEFAULT HEAD</div>
              {consoleType === "head" ? (
                <div className="demo-cred-row">
                  <span>username</span>
                  <code>{DEFAULT_HEAD_USERNAME}</code>
                </div>
              ) : (
                <div className="demo-cred-row demo-cred-row--hint">
                  <span>testers</span>
                  <code>created by head in Cell Ops</code>
                </div>
              )}
              {consoleType === "head" && (
                <div className="demo-cred-row">
                  <span>password</span>
                  <code>{DEFAULT_HEAD_PASSWORD}</code>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {transitioning && pendingRole && (
        <LoginWelcomeTransition key={pendingRole} role={pendingRole} onComplete={handleTransitionComplete} />
      )}
    </div>
  );
}
