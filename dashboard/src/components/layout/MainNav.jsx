import React, { useMemo } from "react";
import AriaNavOrb from "../AriaNavOrb.jsx";
import { NAV_TAB_LOGOS } from "../NavTabLogos.jsx";
import { filterNavTabs } from "../../constants/dashboardViewMode.js";

const TABS = [
  { id: "dashboard", label: "DASHBOARD" },
  { id: "operations", label: "CELL OPS" },
  { id: "digitaltwin", label: "DIGITAL TWIN" },
  { id: "sensorhealth", label: "SENSOR HEALTH" },
  { id: "manualinput", label: "MANUAL SENSOR INPUT" },
  { id: "validation", label: "VALIDATION DEMO" },
  { id: "comms", label: "OPS CHAT" },
  { id: "cellboard", label: "CELL BOARD" },
  { id: "federated", label: "FEDERATED LEARNING" },
  { id: "chat", icon: "aria", label: "ARIA" },
];

export default function MainNav({
  activeTab,
  onTabChange,
  unreadCommsCount = 0,
  opsTabBadgeCount = 0,
  operatorView = false,
  onOperatorViewChange,
}) {
  const visibleTabs = useMemo(
    () => filterNavTabs(TABS, operatorView),
    [operatorView],
  );
  const presentMode = !operatorView;

  return (
    <nav className="main-nav">
      <div className="nav-tabs">
        {visibleTabs.map((tab) => {
          const active = activeTab === tab.id;
          const TabLogo = tab.icon !== "aria" ? NAV_TAB_LOGOS[tab.id] : null;
          const badge =
            tab.id === "comms" ? unreadCommsCount :
            tab.id === "operations" ? opsTabBadgeCount : 0;

          return (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab ${active ? "active" : ""} ${tab.id === "chat" ? "nav-tab--aria" : ""} ${tab.id === "comms" ? "nav-tab--comms" : ""}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.icon === "aria" ? (
                <AriaNavOrb active={active} />
              ) : TabLogo ? (
                <TabLogo active={active} />
              ) : null}
              <span className="nav-label">{tab.label}</span>
              {badge > 0 && (
                <span className={`nav-tab-badge ${tab.id === "operations" ? "nav-tab-badge--ops" : "nav-tab-badge--chat"}`}>
                  {badge}
                </span>
              )}
              {active && <span className="nav-indicator" />}
            </button>
          );
        })}
      </div>
      {onOperatorViewChange && (
        <div className="main-nav__view-mode">
          <button
            type="button"
            className={`nav-view-mode-btn ${presentMode ? "nav-view-mode-btn--present" : "nav-view-mode-btn--operator"}`}
            onClick={() => onOperatorViewChange(!operatorView)}
            title={
              presentMode
                ? "Show Manual Input and Validation Demo tabs (operator view)"
                : "Hide operator-only tabs for judge presentation"
            }
          >
            {presentMode ? "OPERATOR VIEW" : "PRESENT MODE"}
          </button>
        </div>
      )}
    </nav>
  );
}
