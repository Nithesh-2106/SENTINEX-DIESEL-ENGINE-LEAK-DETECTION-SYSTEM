export const DEMO_MODEL_SELECTION = {
  selection_criterion: "Leak_Location_accuracy",
  active_model_id: "xgboost",
  active_model_name: "XGBoost",
  active_leak_location_accuracy: 1.0,
  models: [
    {
      id: "xgboost",
      name: "XGBoost",
      leak_location_accuracy: 1.0,
      leak_present_accuracy: 0.9995,
      is_active: true,
    },
    {
      id: "random_forest",
      name: "Random Forest",
      leak_location_accuracy: 1.0,
      leak_present_accuracy: 1.0,
      is_active: false,
    },
    {
      id: "neural_network",
      name: "Neural Network",
      leak_location_accuracy: 0.9958,
      leak_present_accuracy: 0.9991,
      is_active: false,
    },
  ],
};

export function formatModelAccuracy(acc) {
  if (acc == null || Number.isNaN(acc)) return "—";
  return `${(acc * 100).toFixed(1)}%`;
}

const MODEL_ID_LABELS = {
  random_forest: "Random Forest",
  rf: "Random Forest",
  rf_multilabel: "Random Forest",
  xgboost: "XGBoost",
  xgb: "XGBoost",
  xgb_multilabel: "XGBoost",
  neural_network: "Neural Network",
  nn: "Neural Network",
  nn_multilabel: "Neural Network",
};

/** Human-readable model name — never show raw multilabel ids in UI. */
export function displayModelName(modelOrId, fallbackName) {
  if (modelOrId && typeof modelOrId === "object") {
    const m = modelOrId;
    const fromId = MODEL_ID_LABELS[m.id];
    if (fromId) return fromId;
    const name = m.name || "";
    if (name && !/multi[- ]?label|_multilabel/i.test(name)) return name;
    return MODEL_ID_LABELS[m.id] || name.replace(/\s*\(multi[- ]?label\)/gi, "").trim() || "—";
  }
  const id = String(modelOrId || "").toLowerCase();
  return MODEL_ID_LABELS[id] || fallbackName || modelOrId || "—";
}

export function shortModelName(id) {
  return displayModelName(id);
}

export function activeModelLabel(selection) {
  if (!selection) return "—";
  const name = displayModelName(selection.active_model_id, selection.active_model_name);
  const acc = selection.active_leak_location_accuracy;
  if (acc == null) return name;
  return `${name} (${formatModelAccuracy(acc)})`;
}
