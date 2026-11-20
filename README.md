# SENTINEX — Caterpillar Diesel Engine Leak Detection

**Caterpillar Tech Challenge 2026 — Problem Statement 3**

> **SENTINEX detects. ARIA explains.**

End-to-end **diesel engine leak detection, sensor fault isolation, physics-based severity scoring, and federated learning** for Caterpillar test cells — pure software on existing sensor channels, zero new hardware.

| | |
|---|---|
| **Sensors** | 42 live channels (intake, exhaust, aftertreatment) |
| **Response** | Sub-1-second automated inference per tick |
| **Engines** | CAT C7, C13, C15 |
| **Deployment** | Docker locally · AWS EC2 + ECR production |
| **Stack** | FastAPI + PyTorch/XGBoost · React/Vite · Supabase |

---

## Table of Contents

- [What This Project Is](#what-this-project-is)
- [Key Features](#key-features)
- [Six Capabilities](#six-capabilities)
- [Prediction Pipeline](#prediction-pipeline)
- [Quick Start](#quick-start)
- [Authentication & Roles](#authentication--roles)
- [Dashboard](#dashboard)
- [Digital Twin](#digital-twin)
- [Dynamic Baseline & Physics Engine](#dynamic-baseline--physics-engine)
- [RCA & ARIA Copilot](#rca--aria-copilot)
- [Sensor Fault Isolation (SFI)](#sensor-fault-isolation-sfi)
- [Federated Learning](#federated-learning)
- [Cell Operations](#cell-operations)
- [Simulator Scenarios](#simulator-scenarios)
- [Multi-Engine Support](#multi-engine-support)
- [API Endpoints](#api-endpoints)
- [Supabase Setup](#supabase-setup)
- [Docker Architecture](#docker-architecture)
- [Training & Evaluation](#training--evaluation)
- [Environment Variables](#environment-variables)
- [Knowledge Transfer Docs](#knowledge-transfer-docs)
- [Folder Structure](#folder-structure)

---

## What This Project Is

SENTINEX turns a Caterpillar test cell's **existing 42-sensor stream** into an automated leak intelligence platform:

- **Backend ML pipeline (Python + FastAPI)** — 7-stage inference stack (DQP → SSG → ML → SHAP → SFI → severity → API), multi-label leak classifiers, ARIA chat, federated learning simulator.
- **Real-time React dashboard (Vite)** — 1 Hz sensor streaming, SHAP panels, RCA, 3D digital twin with hologram mode, sensor health, cell ops, session reports, FedAvg globe.
- **Supabase backend** — auth, Postgres, Storage for multi-tester workflows (change requests, live bay mirror, head ops, audit trail, Ops Chat).
- **RCA + ARIA** — deterministic physics-based root-cause ranking in the browser, plus an LLM copilot with optional voice I/O.

Every streaming tick:

1. Simulator (or real feed) sends 42 sensor readings.
2. **Data Quality Pipeline** cleans spikes, drift, and missing values (with cascade protection).
3. **Steady State Guard** suppresses predictions during RPM/load transients.
4. **Dynamic baseline** computes expected values at the current operating point.
5. **Multi-label ML** predicts up to **7 simultaneous leak locations**, severity, and action.
6. **SHAP** explains which sensors drove each active location.
7. **Sensor Fault Isolation** distinguishes real leaks from broken sensors.
8. **Physics severity engine** quantifies impact % and tier (Minor → Critical).
9. Dashboard, Digital Twin, RCA, and ARIA render the unified result.

---

## Key Features

### Detection & ML

| Feature | Description |
|---------|-------------|
| **Multi-label leak detection** | 7 independent sigmoid heads; prob ≥ 0.50 = active; supports **simultaneous multi-leak** (7 dataset combos) |
| **Three model families** | Random Forest, XGBoost, Neural Network — best selected by multi-leak F1 |
| **Unified `/predict`** | Leak + SHAP + DQP + SSG + SFI + severity in one JSON response |
| **Steady State Guard** | RPM/Load CV &lt; 2%; suppresses false alarms during transients |
| **Data Quality Pipeline** | 5-stage cleaning: bounds, null impute, spike (Z&gt;4σ), EMA smooth, drift flag |
| **Cascade protection** | Multi-sensor leak signatures are never cleaned away as noise |
| **Validation Demo** | 15-scenario live smoke test (8 single + 7 multi) against clean dataset rows |
| **Manual Sensor Input** | One-shot jury walkthrough — raw readings through full pipeline |
| **Threshold analysis** | `src/threshold_analysis.py` — Safety vs Efficiency leak-present trade-offs |

### Explainability & Intelligence

| Feature | Description |
|---------|-------------|
| **SHAP (TreeExplainer)** | Top-5 sensors per active leak with deviation % and interpretation |
| **RCA engine** | Ranked physical root causes (clamp, gasket, crack…) with inspect steps and tools |
| **ARIA copilot** | LLM chat (Gemini / Groq / Claude) with full live-state context injection |
| **ARIA voice** | Optional Web Speech API — speech-to-text input and text-to-speech output |
| **Multi-leak RCA** | Separate ranked causes for primary and secondary leaks |
| **Novel anomaly mode** | RCA flags low-confidence patterns and asks ARIA to reason dynamically |

### Physics & Baselines

| Feature | Description |
|---------|-------------|
| **Dynamic Baseline Engine** | Computes expected values for all 42 sensors from RPM, load, ambient P/T |
| **Physics severity** | Blend score from primary-sensor deviation → Minor / Moderate / Severe + impact % |
| **Per-engine constants** | C7, C13, C15 each have calibrated K1, CPR, MAF, exhaust temp references |
| **Engine frame translation** | C7/C15 readings mapped to C13 frame before ML inference |
| **SFI physics cascade** | Correlated sensors must deviate together to confirm a genuine leak |

### Digital Twin & Visualization

| Feature | Description |
|---------|-------------|
| **Procedural 3D engine** | Three.js — no external model files; C7/C13/C15 layouts built in code |
| **Leak physics particles** | Per-scenario escape behaviour (burst, hot gas rise, pressurised burst) |
| **SHAP component coloring** | Components glow cyan → amber → red by SHAP importance |
| **Hologram mode** | Cinematic part extraction, drag inspection, multi-leak + SFI fault overlays |
| **Sensor dot mode** | All 42 sensors as 3D dots with live values and deviation colors |
| **GNN edge overlay** | Correlated sensor graph edges on the engine |
| **Live pressure charts** | Recharts time-series for key air-path sensors |
| **Pipeline breadcrumb** | Animated stage indicator during streaming |

### Operations & Collaboration

| Feature | Description |
|---------|-------------|
| **Head + Tester roles** | Parallel browser windows via `sessionStorage` auth (no JWT clash) |
| **Change request workflow** | Tester requests RPM/Load/Ambient setpoints → Head approves/rejects |
| **Head manual apply** | Supervisor can force setpoints; events sync via Supabase |
| **Cell Board** | Multi-bay overview — leak / sensor-fault / streaming status per tester |
| **Bay live state mirror** | Realtime Supabase sync of tester dashboard snapshots |
| **Ops Chat** | DM + cell group messaging (Supabase-backed) |
| **Audit trail** | Cross-console activity log for head and testers |
| **Session reports** | PDF generation + Supabase Storage + optional SMTP email |
| **Present / Operator mode** | Hide engineering tabs for judge-facing demos |
| **Dark / light theme** | Theme toggle with persisted user preferences |

### Federated Learning

| Feature | Description |
|---------|-------------|
| **3 simulated facilities** | Hosur Cell 1, Hosur Cell 2, Pune — physics-justified environmental differences |
| **FedAvg aggregation** | XGB/RF probability averaging + NN weight averaging (McMahan 2017) |
| **Cross-facility metrics** | Shared validation set measures true generalization benefit |
| **Privacy stats** | Quantifies weights transmitted vs raw data never shared |
| **India globe dashboard** | Live round history, facility pins, attention weights, architecture diagram |
| **Detached subprocess** | Simulation survives uvicorn `--reload` restarts |

---

## Six Capabilities

SENTINEX delivers six capabilities from existing sensors — no new hardware:

| # | Capability | Question answered | Implementation |
|---|------------|-------------------|----------------|
| 1 | **DATA CLEAN** | Is the sensor data trustworthy? | `src/data_quality_pipeline.py` — 5-stage cleaning + cascade protection |
| 2 | **DETECT** | Is there a leak? | Multi-label ML + Steady State Guard; answer in &lt; 1 s |
| 3 | **LOCATE** | Which of 7 air-path locations? | 7 sigmoid heads — intake, exhaust, EGR, CAC paths; multi-leak supported |
| 4 | **QUANTIFY** | How severe? | `src/severity_engine.py` — physics blend score + performance impact % |
| 5 | **EXPLAIN** | Why did the model decide this? | SHAP + RCA + ARIA — four layers of explainability |
| 6 | **PROTECT** | Real leak or broken sensor? | `src/sensor_fault_isolator.py` — 3-mechanism physics cascade check |

---

## Prediction Pipeline

Every `POST /predict` call runs:

```
Raw 42-sensor reading
  → Data Quality Pipeline (clean spikes / drift / missing; protect cascades)
  → SFI health update (correlation tracking on raw values)
  → Steady State Guard (suppress during RPM/load transients)
  → Dynamic baseline (operating-point-aware expected values)
  → Multi-label ML inference (RF / XGB / NN — best by multi_leak F1)
  → Per-location SHAP (top 5 sensors per active leak)
  → Physics severity engine (blend score + impact %)
  → Sensor Fault Isolation (cascade consistency check)
  → Unified JSON response
```

### Core API outputs

| Field | Description |
|-------|-------------|
| `Leak_Present` | Binary — any active leak above threshold |
| `Leak_Location` | Primary location (highest probability) or `None` |
| `Secondary_Leak` | Second active location in multi-leak mode |
| `Active_Labels` | All locations with probability ≥ 0.50 |
| `Is_Multi_Leak` | True when two or more labels are active |
| `Active_Leak_Details` | Per-location severity, SHAP, physics severity, action |
| `Label_Probabilities` | All 7 location probabilities |
| `Confidence_Score` | Model confidence |
| `top_5_sensors_driving_prediction` | SHAP for primary location |
| `Sensor_Fault_Isolation` | SFI result — faulty sensor, reason, correlated count |
| `Data_Quality` | DQP score, flags, cleaned events |
| `Physics_Severity` | Tier + performance impact % |
| `Dynamic_Baseline` | Operating-point expected values |
| `Suppressed` | True when steady-state guard blocked inference |

### Seven leak labels

| Label | Air-path region |
|-------|-----------------|
| `Intake_PreTurbo` | Upstream of turbo compressor |
| `Intake_PostTurbo_CAC` | Post-turbo / CAC path |
| `Exhaust_PreTurbine` | Exhaust manifold / pre-turbine |
| `Exhaust_PostTurbine` | Post-turbine / aftertreatment |
| `EGR_Leak` | EGR circuit |
| `CAC_Direct_Leak` | Charge air cooler body |
| `Minor_Intake_Leak` | Early-stage small intake leak |

Multi-leak: 7 supported two-leak combinations (7 dataset combos, stabilized primary/secondary in demo mode).

---

## Quick Start

### Docker (recommended)

For **AWS EC2 + ECR production**, configure `AWS_REGION`, `ECR_REGISTRY`, and `IMAGE_TAG` in `.env` (see `.env.example`).

```bash
# From repo root
cp .env.example .env          # Supabase + optional LLM/SMTP keys
docker compose up --build -d  # first build ~10–20 min (PyTorch)
```

| Service | URL |
|---------|-----|
| **Dashboard** | http://localhost:8080 |
| API docs (Swagger) | http://localhost:8000/docs |
| Health check | http://localhost:8000/health |

```bash
docker compose logs -f
docker compose down
docker compose up --build -d   # after code changes
```

**Default head login:** `CAT_test_head` / `head1234`

### Local development

```bash
pip install -r requirements.txt
cp .env.example .env

# Terminal 1 — API
python -m uvicorn api.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Dashboard
cd dashboard
cp .env.example .env    # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
npm install && npm run dev
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:5173 |
| API | http://localhost:8000/docs |

Vite proxies `/api/*` → `localhost:8000` (same as nginx in Docker).

### Retrain models (optional)

Pre-trained artefacts ship in `models/`:

```bash
PYTHONPATH=src python src/run_training.py
```

---

## Authentication & Roles

- **Username/password** via Supabase Auth (`{username}@sentinex.auth` — users type username only).
- **Roles:** `head` (Test Head) and `tester` (bay operators).
- Tokens in **`sessionStorage`** so head + tester run in **parallel browser windows** without JWT clashes.
- Head manages testers via `GET/POST/DELETE /admin/testers`.

| Role | Capabilities |
|------|----------------|
| **Head** | Cell Board, approve/reject change requests, manual setpoint apply, return-to-steady, tester CRUD, audit view, multi-bay ARIA context |
| **Tester** | Stream sensors, scenario selection, change requests, Ops Chat, session reports, manual input |

---

## Dashboard

### Navigation tabs

| Tab | Purpose |
|-----|---------|
| **Dashboard** | Live leak HUD, SHAP, RCA, pressure charts, steady-state panel, disturbance controls, ARIA sidebar |
| **Cell Ops** | Setpoint sliders, change request queue, tester presence, approval workflow |
| **Digital Twin** | 3D procedural engine — leak zones, hologram, SHAP coloring, sensor dots, SFI overlays |
| **Sensor Health** | DQP stats, SFI divergence, per-sensor drift vs baseline, fault persistence |
| **Manual Sensor Input** | One-shot raw readings through full pipeline *(operator only)* |
| **Validation Demo** | 15-scenario smoke test *(operator only)* |
| **Ops Chat** | Human DMs + cell group thread (Supabase) |
| **Cell Board** | Multi-tester bay overview — leak / sensor-fault / streaming status |
| **Federated Learning** | FedAvg simulator, India globe, round F1 charts, privacy stats |
| **ARIA** | Full-screen LLM copilot with live prediction context |

### Present Mode vs Operator View

Toggle in the nav bar:

- **Present Mode** (default) — hides Manual Sensor Input and Validation Demo for judge demos.
- **Operator View** — reveals engineering walkthrough tabs.

Preference persists in Supabase Storage (local fallback).

### Intro splash

First visit shows an animated **Intro Page** (`/intro`) with Three.js visuals and feature highlights before the login screen.

---

## Digital Twin

**Files:** `dashboard/src/components/DigitalTwin.jsx`, `dashboard/src/digitalTwin/`

A **props-driven** Three.js visualization — no internal API polling; stays perfectly synced with `App.jsx` streaming and ML predictions.

| Mode | What it shows |
|------|----------------|
| **Leak propagation** | Pulsing leak sphere + rings at the predicted zone |
| **Leak physics** | Per-scenario escape particles (burst outward, hot gas rise, pressurised burst), flow reduction, heat glow, gap indicators |
| **SHAP overlay** | Component meshes colored cyan → amber → red by SHAP importance |
| **Sensor dots** | 42 sensors as 3D points with live values, deviation colors, hover tooltips |
| **GNN mode** | Correlated-sensor edges across the air path |
| **Hologram mode** | Cinematic part extraction, drag-to-inspect, multi-leak dual highlights, SFI amber fault overlay |
| **Multi-leak** | Primary (red) + secondary leak markers; stabilized order for demo scenarios |
| **SFI fault** | Amber highlight on faulty sensor component — not a fake leak visualization |

### Engine geometry

- **Procedurally built** from `buildEngine.js` — tubes, solids, wireframes per component group.
- **Per-engine layouts:** `layouts/c7Layout.js`, `c13Layout.js`, `c15Layout.js`.
- C7 hides SCR mesh (no SCR in physics config).
- Component ↔ sensor mapping via `componentSensorMap.js` (single source of truth).

---

## Dynamic Baseline & Physics Engine

**Files:** `src/baseline_engine.py`, `src/engine_config.py`, `src/severity_engine.py`

### Dynamic baseline

Computes **expected values for all 42 sensors** at the current operating point (RPM, load, ambient pressure, ambient temperature) — not a fixed lookup table.

Key formulas (C13 reference):

```
CPR          = 1 + K1 · (rpm/RPM_ref)² · (load/100)
Pre_Compressor  = Ambient × 0.982
Post_Compressor = Pre_Compressor × CPR
Post_CAC        = Post_Compressor × 0.977
MAF             = MAF_ref · (rpm/RPM_ref) · (load/load_ref) · (P_amb/P_ref)
Exhaust_T       = T_base_exhaust · (load/100) · (rpm/RPM_ref)^0.15
Turbo_RPM       = RPM_ref_turbo · (rpm/RPM_ref) · √(CPR/CPR_ref)
EGR             = MAF × EGR_fraction
deviation_%     = ((actual − baseline) / |baseline|) × 100
```

Calibrated at C13 reference (1800 RPM, 75% load): Post-Compressor ≈ 218 kPa, Exhaust ≈ 680°C, MAF ≈ 720 kg/h.

Used for: SHAP deviation context, sensor health dashboard, severity scoring, API `GET /baseline` and `GET /engine-baseline`.

### Physics severity

`severity_engine.py` blends primary-sensor deviations per leak location into a score mapped to **Minor / Moderate / Severe** with **performance impact %**.

---

## RCA & ARIA Copilot

### RCA (`dashboard/src/utils/rootCauseEngine.js`)

Deterministic physics-based root-cause analysis in the browser:

- Knowledge base per leak location (loose clamp, blown gasket, cracked pipe…)
- Ranked causes with probability %, physical reasoning, inspect action, tool, visual sign
- Disambiguation rules (e.g. EGR drop during intake leak = cascade consequence, not co-failure)
- Temperature-pattern rules for scenario identification
- Novel anomaly flag when historical match confidence is too low

### ARIA (`POST /chat`)

- **Tagline:** SENTINEX detects. ARIA explains.
- Injects full live state: prediction, SHAP, RCA, DQP, SSG, SFI, multi-leak details, cell board summary
- Providers: **Gemini 2.5 Flash**, **Groq Llama 3.1**, **Claude Sonnet 4.5** (SSE streaming)
- Structured response template: Verdict → Key Points → Recommended Action
- Optional **voice I/O** via Web Speech API (`useAriaVoice.js`)

RCA knowledge base covers all 7 leak locations with ranked causes, disambiguation rules, and EGR cascade logic.

---

## Sensor Fault Isolation (SFI)

**File:** `src/sensor_fault_isolator.py`

Three mechanisms:

1. **Health divergence tracking** — session baseline locked at start; per-sensor drift over time
2. **DQP flag integration** — repeated flags on one channel suggest hardware fault
3. **Physics cascade check** — real leaks move correlated sensors together; isolated deviation = sensor fault

When SFI fires: overrides leak to 0, action = `Inspect_Sensor_Hardware`. Digital Twin shows amber SFI overlay instead of red leak visualization.

### SFI demo scenarios (simulator)

| Scenario ID | Injected fault |
|-------------|----------------|
| `sensor_fault_demo` | Pre-Compressor pressure |
| `sensor_fault_exhaust` | Exhaust manifold |
| `sensor_fault_egr` | EGR flow |
| `sensor_fault_cac` | CAC ΔP |

SFI demo scenarios inject isolated sensor faults that mimic leak signatures — the twin shows amber fault overlays, not red leak zones.

---

## Federated Learning

**Files:** `src/federated/` — simulation, client, aggregator, data generator

Simulates three CAT C13 test facilities that **cannot share raw data**:

| Facility | Difference |
|----------|------------|
| Hosur Cell 1 | High humidity, monsoon noise, CAC leak overrepresented |
| Hosur Cell 2 | ISA reference, largest dataset, EGR-heavy protocols |
| Pune Cell | 560 m altitude, reduced ambient pressure, exhaust leak overrepresented |

**Aggregation:**
- XGBoost / RF: weighted prediction-probability averaging (FedAvg for trees)
- Neural Network: classical FedAvg weight averaging (McMahan et al. 2017)
- 3 rounds default; progressive data fractions [10%, 40%, 100%]
- Cross-facility shared validation set — primary metric for FL benefit
- Raw data **never** leaves the facility

**API:** `POST /federated/run`, `GET /federated/status`, `/results`, `/log`

**Dashboard:** India globe, facility pins, round F1 chart, attention weights, privacy compression stats.

---

## Cell Operations

Multi-tester test cell workflow backed by Supabase:

```
TESTER                          HEAD (Supervisor)
  ├─ Stream sensors               ├─ Cell Board (all bays live)
  ├─ Select scenario / engine     ├─ Approve / reject change_requests
  ├─ Request setpoint changes     ├─ Manual setpoint apply (head_ops_events)
  ├─ Ops Chat (DM + group)        ├─ Return-to-steady command
  └─ Generate session report PDF  └─ ARIA with multi-bay cell context
         │                                   │
         └──────── Supabase realtime ────────┘
              change_requests · bay_live_state
              head_ops_events · audit_events · chat_messages
```

- **Disturbance controls:** RPM, Load, Ambient Pressure sliders; step vs ramp mode.
- **Session timeline:** Events logged for report generation.
- **Notifications:** In-app toasts for change request approvals and chat messages.

---

## Simulator Scenarios

**File:** `dashboard/src/simulator.js` — 1 Hz synthetic stream with engine-aware baselines and noise.

### Single-leak (8)

| ID | Label |
|----|-------|
| `normal` | Normal Operation |
| `intake_preturbo` | Intake Leak — Pre Turbo |
| `intake_cac` | Intake Leak — Post Turbo / CAC |
| `exhaust_preturbine` | Exhaust Leak — Pre Turbine |
| `exhaust_postturbine` | Exhaust Leak — Post Turbine |
| `egr_leak` | EGR System Leak |
| `cac_direct_leak` | CAC Direct Leak |
| `minor_intake_leak` | Minor Intake Leak (Early) |

### SFI fault injection (4)

| ID | Label |
|----|-------|
| `sensor_fault_demo` | SFI — Pre-Compressor Fault |
| `sensor_fault_exhaust` | SFI — Exhaust Manifold Fault |
| `sensor_fault_egr` | SFI — EGR Flow Fault |
| `sensor_fault_cac` | SFI — CAC ΔP Fault |

### Multi-leak (7)

| ID | Combo |
|----|-------|
| `intake_preturbo_egr` | Intake Pre-Turbo + EGR |
| `intake_postturbo_egr` | Intake Post-Turbo/CAC + EGR |
| `cac_egr_combined` | CAC Direct + EGR |
| `exhaust_post_egr` | Exhaust Post-Turbine + EGR |
| `exhaust_post_intake_pre` | Exhaust Post + Intake Pre |
| `exhaust_post_cac` | Exhaust Post + CAC Direct |
| `minor_intake_egr` | Minor Intake + EGR |

---

## Multi-Engine Support

**File:** `src/engine_config.py`

| Engine | Displacement | MAF ref | SCR | Notes |
|--------|-------------|---------|-----|-------|
| **CAT_C7** | 7.2 L | 520 kg/h | No | 2000 RPM ref |
| **CAT_C13** | 12.5 L | 720 kg/h | Yes | Default; ML trained on C13 frame |
| **CAT_C15** | 15.2 L | 865 kg/h | Yes | Highest power class |

- `POST /engine/switch` resets DQP, SSG, SFI, and baseline engine state.
- Non-C13 engines: `translate_reading_to_c13_frame()` before ML inference.
- Digital Twin swaps procedural layout per engine.

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Service status + active model |
| `POST` | `/predict` | Full 7-stage pipeline on 42 sensor values |
| `GET` | `/model-selection` | Active model + accuracy comparison |
| `POST` | `/validation-demo/run` | 15-scenario validation smoke test |
| `GET` | `/scenarios` | Leak scenario reference data |
| `GET` | `/steady-state` | Steady-state guard metrics |
| `GET` | `/data-quality` | DQP statistics |
| `POST` | `/data-quality/reset` | Reset DQP + SSG history |
| `GET` | `/sensor-health` | SFI health report |
| `GET` | `/sensor-health/{engine_id}` | Per-engine sensor health summary |
| `POST` | `/sensor-health/reset/{engine_id}` | Reset health tracker |
| `GET` | `/sensor-fault-map` | SFI dependency map |
| `GET` | `/engines` | Supported engine list |
| `GET` | `/engine-baseline` | Physics baselines for engine |
| `POST` | `/engine/switch` | Switch active engine context |
| `GET` | `/baseline` | Dynamic baseline at RPM/load/ambient |
| `POST` | `/chat` | ARIA LLM copilot (SSE) |
| `GET` | `/report/email-config` | SMTP configured? |
| `POST` | `/report/send-email` | Email session report PDF |
| `GET/POST/DELETE` | `/admin/testers` | Head-only tester management |
| `GET` | `/chat/peers` | Active testers for Ops Chat |
| `GET` | `/federated/status` | FL simulation state + metrics |
| `GET` | `/federated/results` | Full `fl_results.json` |
| `GET` | `/federated/log` | Simulation log (last 100 lines) |
| `POST` | `/federated/run` | Launch FL simulation subprocess |

Interactive docs: http://localhost:8000/docs

Dashboard uses `/api` prefix (Vite dev proxy or nginx in Docker).

---

## Supabase Setup

Run migrations in the **Supabase SQL Editor** in order:

| Step | File | Purpose |
|------|------|---------|
| 1 | `01_extensions_and_helpers.sql` | Extensions + helpers |
| 2 | `02_bays.sql` | Dynamic bay registry |
| 3 | `03_profiles.sql` | User profiles |
| 4 | Auth user + `04_seed_head.sql` | Create head, then seed |
| 5 | `05_test_sessions.sql` | Test session records |
| 6 | `06_session_records.sql` | Timeline / ML / report pointers |
| 7 | `07_change_requests.sql` | Setpoint approval queue |
| 8 | `08_bay_live_state.sql` | Head mirror of live state |
| 9 | `09_storage_bucket.sql` | `sentinex-files` bucket |
| 10 | `11_head_ops_events.sql` | Head manual apply |
| 11 | `12_audit_events.sql` | Audit trail |
| 12 | `13_chat_messages.sql` | Ops Chat |
| ✓ | `10_verify.sql` | Verify — 9 tables + bucket |

**Create Auth user:** `CAT_test_head@sentinex.auth` / `head1234` → run `04_seed_head.sql` → disable public sign-up.

Disable public sign-up after creating the head user.

---

## Docker Architecture

```
Browser → http://localhost:8080
              │
              ▼
    ┌─────────────────────┐
    │  sentinex-frontend  │  nginx (port 80 → host 8080)
    │  static Vite build  │
    │  /api/* → proxy     │
    └──────────┬──────────┘
               │
               ▼
    ┌─────────────────────┐
    │  sentinex-backend   │  uvicorn :8000
    │  FastAPI + ML       │
    └──────────┬──────────┘
               │
               ▼
         Supabase (cloud)
```

Docker frontend reads Supabase keys from root `.env` at **build time**.

---

## Training & Evaluation

```bash
PYTHONPATH=src python src/run_training.py    # full retrain
cd src && python evaluate.py                 # legacy evaluate chain
cd src && python explain.py                  # SHAP plots
cd src && python threshold_analysis.py       # threshold sweep
PYTHONPATH=src python src/merge_datasets.py  # regenerate combined CSV
PYTHONPATH=src python src/validate_scenarios.py  # CLI validation demo
```

### Datasets

| File | Rows | Contents |
|------|------|----------|
| `caterpillar_testcell_leak_dataset_clean.csv` | 14,400 | 8 single-leak scenarios |
| `caterpillar_multileak_dataset.csv` | 17,500 | 7 multi-leak combos |
| `caterpillar_combined_dataset_clean.csv` | 31,900 | Merged training corpus |

**Features:** 42 numeric sensors. **Models:** RF, XGBoost, NN with 7 sigmoid heads. **Selection:** best by `multi_leak_f1` → `models/model_selection.json`.

Load CSVs with `keep_default_na=False` — `"None"` labels must not become NaN.

### Saved artefacts (`models/`)

| File | Purpose |
|------|---------|
| `scaler.pkl` | StandardScaler |
| `rf_multilabel.pkl` / `xgb_multilabel.pkl` / `nn_multilabel.pt` | Trained models |
| `model_selection.json` | Best model + metrics |
| `federated/fl_results.json` | FL simulation output |

---

## Environment Variables

Copy `.env.example` → `.env` at repo root. For Vite dev, also set in `dashboard/.env`:

```env
VITE_SUPABASE_URL=<same as SUPABASE_URL>
VITE_SUPABASE_ANON_KEY=<same as SUPABASE_ANON_KEY>
```

| Variable | Required | Purpose |
|----------|----------|---------|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role (backend admin only) |
| `GEMINI_API_KEY` | No | ARIA — Gemini provider |
| `GROQ_API_KEY` | No | ARIA — Groq provider |
| `ANTHROPIC_API_KEY` | No | ARIA — Claude provider |
| `SMTP_*` | No | Session report email with PDF |
| `AWS_REGION` / `ECR_REGISTRY` / `IMAGE_TAG` | No | EC2 + ECR deploy |

---

---

## Folder Structure

```
.
├── api/                         # FastAPI — predict, chat, FL, admin, reports
│   ├── main.py
│   ├── user_admin.py
│   ├── schemas.py
│   └── report_email.py
├── dashboard/                   # React/Vite frontend
│   └── src/
│       ├── App.jsx              # Main shell, streaming, tab routing
│       ├── simulator.js         # 19 scenarios, engine baselines
│       ├── components/          # Panels, DigitalTwin, CellComms, ARIA, FL
│       ├── digitalTwin/         # 3D engine, leak physics, hologram, SHAP
│       ├── lib/                 # Supabase clients + persistence
│       ├── hooks/               # Streaming, FL, presence, ARIA voice
│       ├── utils/               # RCA, session reports, multi-leak
│       └── pages/               # IntroPage, LoginPage
├── docker/                      # Backend + frontend Dockerfiles, nginx
├── supabase/migrations/         # SQL 01–13 + verify
├── data/                        # Training CSVs + federated facility data
├── docs/                        # Knowledge transfer guides
├── models/                      # scaler, RF/XGB/NN, model_selection.json
├── src/                         # ML pipeline, training, federated sim
│   ├── predict.py               # Unified inference entry point
│   ├── baseline_engine.py       # Dynamic physics baselines
│   ├── severity_engine.py       # Physics severity scoring
│   ├── data_quality_pipeline.py
│   ├── steady_state_guard.py
│   ├── sensor_fault_isolator.py
│   └── federated/               # FL client, aggregator, simulation
├── scripts/run_fl_simulation.py
├── docker-compose.yml
├── requirements.txt
├── requirements.prod.txt
└── .env.example
```

---

## Key Design Decisions

- **Multi-label over single-class** — seven sigmoid heads detect simultaneous leaks.
- **Unified predict + explain** — every `/predict` includes SHAP, DQP, SSG, SFI, severity in one call.
- **Physics before ML trust** — SFI overrides isolated sensor faults; dynamic baseline replaces static tables.
- **Cascade protection in DQP** — real multi-sensor leak signatures are never erased as noise.
- **Steady State Guard** — no false alarms during RPM/load ramps; bypassed for SFI demos and manual input.
- **Combined training corpus** — 14.4k single + 17.5k multi-leak rows.
- **Engine frame translation** — C7/C15 mapped to C13 before ML; physics baselines stay engine-specific.
- **Props-driven Digital Twin** — zero API polling; same prediction object as HUD.
- **Supabase cell ops** — head/tester parallel windows via sessionStorage auth.
- **Present Mode** — engineering tabs hidden for judge demos without backend changes.
- **Federated privacy** — only model weights transmitted; raw facility data never shared.
- **Two-container Docker** — nginx SPA + API proxy; Supabase external cloud.

---

## Sample Multi-Leak Response

```json
{
  "Leak_Present": 1,
  "Leak_Location": "Intake_PreTurbo",
  "Secondary_Leak": "EGR_Leak",
  "Is_Multi_Leak": true,
  "Active_Labels": ["Intake_PreTurbo", "EGR_Leak"],
  "Label_Probabilities": {
    "Intake_PreTurbo": 0.97,
    "EGR_Leak": 0.94
  },
  "Active_Leak_Details": [
    {
      "location": "Intake_PreTurbo",
      "severity": "Moderate",
      "physics_severity": { "performance_impact_pct": 12.4 },
      "top_5_sensors_driving_prediction": ["..."]
    },
    {
      "location": "EGR_Leak",
      "severity": "Moderate",
      "top_5_sensors_driving_prediction": ["..."]
    }
  ],
  "Confidence_Score": 0.98,
  "Sensor_Fault_Isolation": { "is_sensor_fault": false },
  "Physics_Severity": { "tier": "Moderate", "performance_impact_pct": 12.4 },
  "display_mode": "MULTI_LEAK"
}
```

---

**Caterpillar Tech Challenge 2026 · Problem Statement 3 · Team DECODERZZ**
