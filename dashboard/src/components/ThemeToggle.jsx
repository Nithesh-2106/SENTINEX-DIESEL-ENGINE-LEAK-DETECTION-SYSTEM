import { useTheme } from "../context/ThemeContext.jsx";

export default function ThemeToggle({ style = {}, className = "" }) {
  const { toggleTheme, isDark } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle-btn ${className}`.trim()}
      onClick={toggleTheme}
      style={{ position: "fixed", top: 16, right: 16, zIndex: 9999, ...style }}
      title={isDark ? "Light Mode" : "Dark Mode"}
      aria-label="Toggle theme"
    >
      <span className="theme-toggle-icon">{isDark ? "☀" : "◗"}</span>
    </button>
  );
}
