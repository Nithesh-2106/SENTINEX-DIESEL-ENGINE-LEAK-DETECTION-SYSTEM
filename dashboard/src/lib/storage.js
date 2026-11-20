export function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Append to a JSON array in localStorage and return the new array. */
export function appendJsonArray(key, item, max = 200) {
  const prev = loadJson(key, []);
  const arr = Array.isArray(prev) ? prev : [];
  const next = [...arr, item].slice(-max);
  saveJson(key, next);
  return next;
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

