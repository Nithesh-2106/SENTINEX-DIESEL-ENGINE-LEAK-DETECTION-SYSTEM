import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[SENTINEX] UI render error:", error, info);
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 32,
            background: "#020408",
            color: "#f8fafc",
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          <div style={{ maxWidth: 520, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, marginBottom: 12, color: "#F0A500" }}>SENTINEX UI Error</h1>
            <p style={{ opacity: 0.8, marginBottom: 20, lineHeight: 1.5 }}>
              The dashboard hit a render error. Hard-refresh the page. If it persists, clear site data for localhost.
            </p>
            <pre
              style={{
                textAlign: "left",
                fontSize: 12,
                padding: 16,
                borderRadius: 8,
                background: "rgba(255,255,255,0.06)",
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {error.message}
            </pre>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                marginTop: 20,
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid rgba(240,165,0,0.4)",
                background: "rgba(240,165,0,0.12)",
                color: "#F0A500",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
