/** Compact liquid-glass card for non-federated global CAT sites. */

export default function FLGlobalSiteCard({ site }) {
  const coords = site.coordinates;

  return (
    <article
      className="fl-global-site-card liquid-glass-card"
      style={{ "--site-accent": site.colour || "#6B8CAE" }}
    >
      <div className="fl-global-site-card__accent" aria-hidden />
      <header className="fl-global-site-card__head">
        <span className="fl-global-site-card__dot" />
        <div>
          <span className="fl-global-site-card__country">{site.country}</span>
          <h4 className="fl-global-site-card__name">{site.name}</h4>
          <p className="fl-global-site-card__loc">
            {site.city}, {site.state}
          </p>
        </div>
      </header>
      <p className="fl-global-site-card__desc">{site.cellDescription || site.description}</p>
      <dl className="fl-global-site-card__meta">
        <div>
          <dt>Type</dt>
          <dd>{site.cellType || site.siteType || "Facility"}</dd>
        </div>
        <div>
          <dt>Environment</dt>
          <dd>{site.environment || "—"}</dd>
        </div>
        {coords && (
          <div className="fl-global-site-card__coords">
            <dt>Coordinates</dt>
            <dd className="mono">
              {coords.lat.toFixed(2)}° · {coords.lng.toFixed(2)}°
            </dd>
          </div>
        )}
      </dl>
      <span className="fl-global-site-card__badge">NOT IN FEDERATION</span>
    </article>
  );
}
