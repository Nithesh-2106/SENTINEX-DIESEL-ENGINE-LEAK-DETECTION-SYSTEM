import { createContext, useContext, useEffect, useState } from "react";
import { AUTH_SESSION_CHANGE_EVENT } from "../lib/authSession.js";
import { getCachedPreference, loadUserPreferences, saveUserPreferencesPatch, PREFS_CHANGED_EVENT } from "../lib/supabasePreferences.js";

const ThemeContext = createContext({
  theme: "dark",
  toggleTheme: () => {},
  isDark: true,
  isLight: false,
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return getCachedPreference("theme", localStorage.getItem("sentinex-theme") || "dark") || "dark";
    } catch {
      return "dark";
    }
  });

  useEffect(() => {
    let active = true;
    const syncTheme = async () => {
      const prefs = await loadUserPreferences();
      if (!active) return;
      if (prefs?.theme === "dark" || prefs?.theme === "light") {
        setTheme(prefs.theme);
      }
    };

    const onPrefsChanged = (event) => {
      const nextTheme = event?.detail?.prefs?.theme;
      if (nextTheme === "dark" || nextTheme === "light") {
        setTheme(nextTheme);
      }
    };

    syncTheme();
    window.addEventListener(PREFS_CHANGED_EVENT, onPrefsChanged);
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, syncTheme);
    return () => {
      active = false;
      window.removeEventListener(PREFS_CHANGED_EVENT, onPrefsChanged);
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, syncTheme);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("sentinex-theme", theme);
    } catch {
      // ignore
    }
    document.body.style.background = "var(--void)";
    document.documentElement.classList.add("theme-transitioning");
    const timer = window.setTimeout(() => {
      document.documentElement.classList.remove("theme-transitioning");
    }, 280);
    void saveUserPreferencesPatch({ theme });
    return () => window.clearTimeout(timer);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        isDark: theme === "dark",
        isLight: theme === "light",
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
export default ThemeContext;
