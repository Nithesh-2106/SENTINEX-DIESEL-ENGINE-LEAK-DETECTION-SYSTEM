export function IconGlobeNav() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18M12 3c2.8 3.2 2.8 14.8 0 18M12 3c-2.8 3.2-2.8 14.8 0 18" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

export default function FLViewNavButton({ onClick, label = "Global Facility Map" }) {
  return (
    <button type="button" className="fl-view-nav__btn fl-view-nav__btn--globe" onClick={onClick}>
      <IconGlobeNav />
      {label}
    </button>
  );
}
