import { useEffect, useRef } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import { getTokens } from "../utils/themeTokens.js";

export function useThemeTokens() {
  const { theme, isDark, isLight } = useTheme();
  const tokensRef = useRef(getTokens(theme));

  useEffect(() => {
    tokensRef.current = getTokens(theme);
  }, [theme]);

  return { theme, isDark, isLight, tokensRef };
}

export default useThemeTokens;
