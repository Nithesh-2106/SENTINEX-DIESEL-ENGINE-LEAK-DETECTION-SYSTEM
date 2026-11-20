import { useMemo } from "react";
import { getFlClientPins } from "../../data/indiaStates.js";
import { splitFacilityCatalog } from "../../utils/flGlobePinLayout.js";
import { samplePriorPct } from "../../utils/federatedWeights.js";
import FederatedGlobeErrorBoundary from "./FederatedGlobeErrorBoundary.jsx";
import FLPanelShell from "./FLPanelShell.jsx";
import FLTestCellCard from "./FLTestCellCard.jsx";
import FLGlobalSiteCard from "./FLGlobalSiteCard.jsx";
import GlobeToIndiaTransition from "./GlobeToIndiaTransition.jsx";

function IconGlobe() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.8 3.2 2.8 14.8 0 18M12 3c-2.8 3.2-2.8 14.8 0 18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function IconArchitecture() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="5" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="19" cy="7" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="5" cy="17" r="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="19" cy="17" r="2" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 8l3 3M17 8l-3 3M7 16l3-3M17 16l-3-3" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
    </svg>
  );
}

function mapFlPinToCell(pin, facility) {
  return {
    id: pin.id,
    name: pin.name,
    organisation: pin.organisation,
    city: pin.city,
    state: pin.state,
    lat: pin.lat,
    lng: pin.lng,
    colour: pin.colour,
    colourRGB: pin.colourRGB,
    description: pin.description,
    environment: pin.environment,
    altitude: pin.altitude,
    flRole: pin.flRole,
    trainRows: pin.trainRows ?? facility?.trainRows,
  };
}

export default function FLGlobeDashboard({
  onBackToArchitecture,
  geoView,
  onGeoViewChange,
  currentPhase,
  activeTransmissions,
  facilityStates,
  currentRound,
  isRunning,
}) {
  const flPins = getFlClientPins();
  const { federated, nonFederated } = useMemo(() => splitFacilityCatalog(), []);
  const weightPriors = useMemo(() => samplePriorPct(flPins), [flPins]);

  const resolveWeight = (cellId) => {
    const live = facilityStates[cellId]?.weightPct;
    if (live != null && live > 0) return live;
    return weightPriors[cellId];
  };

  const federatedCells = useMemo(
    () =>
      flPins.map((pin) => {
        const facility = federated.find((f) => f.id === pin.id);
        return mapFlPinToCell(pin, facility);
      }),
    [flPins, federated],
  );

  return (
    <div className="fl-globe-dashboard">
      <div className="fl-view-nav">
        <button type="button" className="fl-view-nav__btn" onClick={onBackToArchitecture}>
          <IconArchitecture />
          Federation Architecture
        </button>
        <span className="fl-view-nav__title">
          <IconGlobe />
          Global Facility Map
        </span>
        <span className={`fl-view-nav__status ${isRunning ? "live" : ""}`}>
          {isRunning ? "STREAMING" : "IDLE"}
        </span>
      </div>

      <div className="fl-globe-dashboard__body">
        <div className="fl-globe-dashboard__map">
          <FLPanelShell
            title="LIVE FACILITY MAP"
            subtitle={geoView === "india" ? "Caterpillar India — test cell locations" : "Caterpillar global facility network"}
          >
            <FederatedGlobeErrorBoundary>
              <GlobeToIndiaTransition
                currentPhase={currentPhase}
                activeTransmissions={activeTransmissions}
                facilityStates={facilityStates}
                currentRound={currentRound}
                onViewChange={onGeoViewChange}
                onFacilityClick={() => {}}
              />
            </FederatedGlobeErrorBoundary>
          </FLPanelShell>
        </div>

        <section className="fl-globe-dashboard__detail-strip liquid-glass-panel" aria-label="Facility catalog">
          <div className="fl-globe-dashboard__detail-head">
            <div>
              <h2 className="fl-globe-dashboard__detail-title">FACILITY INFORMATION</h2>
              <p className="fl-globe-dashboard__detail-sub">
                Federated India test cells and global CAT sites shown on the globe
              </p>
            </div>
            <span className={`fl-globe-dashboard__detail-phase${isRunning ? " live" : ""}`}>
              {isRunning ? `ROUND ${currentRound} · ${currentPhase.toUpperCase()}` : "AWAITING FEDERATION"}
            </span>
          </div>

          <div className="fl-globe-dashboard__category">
            <div className="fl-globe-dashboard__category-head">
              <span className="fl-globe-dashboard__category-badge fl-globe-dashboard__category-badge--fed">
                FEDERATED
              </span>
              <h3 className="fl-globe-dashboard__category-title">India FL Test Cells</h3>
              <span className="fl-globe-dashboard__category-count">{federatedCells.length} clients</span>
            </div>
            <div className="fl-globe-dashboard__detail-grid fl-globe-dashboard__detail-grid--fed">
              {federatedCells.map((cell) => (
                <FLTestCellCard
                  key={cell.id}
                  cell={cell}
                  facilityState={facilityStates[cell.id]}
                  weightPct={resolveWeight(cell.id)}
                />
              ))}
            </div>
          </div>

          <div className="fl-globe-dashboard__category">
            <div className="fl-globe-dashboard__category-head">
              <span className="fl-globe-dashboard__category-badge fl-globe-dashboard__category-badge--global">
                NOT FEDERATED
              </span>
              <h3 className="fl-globe-dashboard__category-title">Global CAT Network</h3>
              <span className="fl-globe-dashboard__category-count">{nonFederated.length} sites</span>
            </div>
            <div className="fl-globe-dashboard__detail-grid fl-globe-dashboard__detail-grid--global">
              {nonFederated.map((site) => (
                <FLGlobalSiteCard key={site.id} site={site} />
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
