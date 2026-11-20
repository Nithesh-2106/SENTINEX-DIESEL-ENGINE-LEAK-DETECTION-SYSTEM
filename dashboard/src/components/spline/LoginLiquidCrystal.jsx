/**
 * Static liquid-crystal backdrop for the login page — CSS only, no canvas.
 */
export default function LoginLiquidCrystal() {
  return (
    <div className="login-lc-bg" aria-hidden>
      <div className="login-lc-slab login-lc-slab--a" />
      <div className="login-lc-slab login-lc-slab--b" />
      <div className="login-lc-slab login-lc-slab--c" />
      <div className="login-lc-grid" />
      <div className="login-lc-facet" />
    </div>
  );
}
