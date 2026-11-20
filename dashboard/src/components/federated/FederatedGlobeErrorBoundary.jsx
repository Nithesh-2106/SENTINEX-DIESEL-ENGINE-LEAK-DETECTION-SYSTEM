import { Component } from "react";

export default class FederatedGlobeErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || "Globe failed to load" };
  }

  componentDidCatch(error) {
    console.error("[FederatedGeoMap]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="fl-globe-fallback">
          <div className="fl-globe-fallback-title">3D Globe unavailable</div>
          <div className="fl-globe-fallback-body">
            {this.state.message}. Federation simulation continues — try refreshing this tab.
          </div>
          <button
            type="button"
            className="fl-globe-fallback-btn"
            onClick={() => this.setState({ hasError: false, message: "" })}
          >
            Retry globe
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
