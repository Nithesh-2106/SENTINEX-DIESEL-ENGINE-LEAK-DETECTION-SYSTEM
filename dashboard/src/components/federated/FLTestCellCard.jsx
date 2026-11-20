/** Rich test-cell detail card — matches globe tooltip fields + live FL metrics. */

export default function FLTestCellCard({ cell, facilityState, weightPct, compact = false }) {
  const localF1 = facilityState?.localF1;
  const localLoss = facilityState?.localLoss;

  const metrics = [
    {
      k: "FL WEIGHT α",
      v: weightPct != null ? `${weightPct.toFixed(1)}%` : "—",
      accent: cell.colour,
    },
    {
      k: "LOCAL F1",
      v: localF1 != null ? `${(localF1 * 100).toFixed(1)}%` : "—",
      tone: "ok",
    },
    {
      k: "TRAIN ROWS",
      v: cell.trainRows?.toLocaleString() ?? "—",
    },
    {
      k: "VAL LOSS",
      v: localLoss != null ? localLoss.toFixed(4) : "—",
    },
  ];

  return (
    <article
      className={`fl-test-cell-card liquid-glass-card${compact ? " fl-test-cell-card--compact" : ""}`}
      style={{ "--cell-accent": cell.colour }}
    >
      <div className="fl-test-cell-card__accent" aria-hidden />

      <header className="fl-test-cell-card__head">
        <span className="fl-test-cell-card__dot" style={{ background: cell.colour }} />
        <div className="fl-test-cell-card__titles">
          <span className="fl-test-cell-card__eyebrow">
            {cell.flRole} · CATERPILLAR INDIA
          </span>
          <h3 className="fl-test-cell-card__name" style={{ color: cell.colour }}>
            {cell.name}
          </h3>
          <p className="fl-test-cell-card__loc">
            {cell.city}, {cell.state} · India
          </p>
        </div>
      </header>

      <p className="fl-test-cell-card__desc">{cell.description}</p>

      <dl className="fl-test-cell-card__facts">
        <div>
          <dt>Organisation</dt>
          <dd>{cell.organisation}</dd>
        </div>
        <div>
          <dt>Coordinates</dt>
          <dd className="mono">
            {cell.lat.toFixed(4)}°N · {cell.lng.toFixed(4)}°E
          </dd>
        </div>
        <div>
          <dt>Altitude</dt>
          <dd>{cell.altitude}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{cell.environment}</dd>
        </div>
      </dl>

      <div className="fl-test-cell-card__metrics">
        {metrics.map((m) => (
          <div key={m.k} className="fl-test-cell-card__metric">
            <span className="fl-test-cell-card__metric-k">{m.k}</span>
            <span
              className={`fl-test-cell-card__metric-v mono${m.tone === "ok" ? " fl-test-cell-card__metric-v--ok" : ""}`}
              style={m.accent ? { color: m.accent } : undefined}
            >
              {m.v}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}
