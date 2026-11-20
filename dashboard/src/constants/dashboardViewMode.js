import { getCachedPreference, saveUserPreferencesPatch, setCachedPreference } from "../lib/supabasePreferences.js";

/** Tabs visible only in operator view (hidden in present / judge mode). */
export const OPERATOR_ONLY_TAB_IDS = new Set(["manualinput", "validation"]);

export const OPERATOR_VIEW_STORAGE_KEY = "sentinex_operator_view";

export function isOperatorOnlyTab(tabId) {
  return OPERATOR_ONLY_TAB_IDS.has(tabId);
}

export function filterNavTabs(tabs, operatorView) {
  if (operatorView) return tabs;
  return tabs.filter((tab) => !OPERATOR_ONLY_TAB_IDS.has(tab.id));
}

export function readOperatorViewPreference() {
  try {
    const cached = getCachedPreference("operatorView", null);
    if (typeof cached === "boolean") return cached;
    return localStorage.getItem(OPERATOR_VIEW_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function writeOperatorViewPreference(operatorView) {
  try {
    localStorage.setItem(OPERATOR_VIEW_STORAGE_KEY, String(operatorView));
  } catch {
    /* ignore */
  }
  setCachedPreference("operatorView", Boolean(operatorView));
  void saveUserPreferencesPatch({ operatorView: Boolean(operatorView) });
}
