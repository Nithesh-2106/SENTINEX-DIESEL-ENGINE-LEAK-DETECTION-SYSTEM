"""
src/federated/facility_config.py — Federated Learning Facility Configuration
=============================================================================
Defines the three simulated C13 test facilities and their real-world
environmental and operational characteristics.

ALL THREE FACILITIES RUN CAT C13 ENGINES.
They differ in environmental conditions, operational history, and sensor
characteristics — not in engine type. This mirrors real-world federated
learning where multiple facilities cannot share raw sensor data.
"""

# ---------------------------------------------------------------------------
# Facility configurations — one entry per simulated test cell
# ---------------------------------------------------------------------------
FACILITY_CONFIGS = {

    "hosur_cell_1": {
        "client_id": "client_a",
        "facility_name": "Hosur Test Cell 1",
        "city": "Hosur",
        "state": "Tamil Nadu",
        "elevation_m": 350,
        "description": "High humidity facility — monsoon season effects",
        "engine_family": "CAT_C13",
        "years_operational": 3,
        "num_rows": 14400,

        # Physical justification:
        # Hosur sits at 350m, slightly above sea level.
        # Ambient pressure is marginally above ISA due to
        # dense monsoon air mass during June-September.
        "ambient_pressure_kpa": 99.8,
        "ambient_temp_c": 38.0,

        # Humidity factor: During monsoon, intake air has higher
        # moisture content. Denser humid air increases mass flow
        # slightly — humidity_factor applied to MAF and EGR readings.
        "humidity_factor": 1.04,

        # Noise profile: Monsoon humidity causes condensation
        # micro-droplets in pressure lines, creating oscillations.
        # This facility has higher pressure sensor noise than standard.
        "noise_profile": {
            "pressure_noise_pct": 0.8,
            "temp_noise_pct": 0.4,
            "flow_noise_pct": 0.6,
            "spike_injection_rate": 0.006,
            "drift_injection_rate": 0.012,
            "missing_rate": 0.003,
        },

        # This cell has historically seen more CAC Direct Leaks
        # because humidity-induced thermal cycling stresses CAC welds.
        "overrepresented_scenario": "CAC_Direct_Leak",
        "overrepresentation_factor": 1.4,

        # Pre_Compressor_Pressure sensor at this facility develops
        # a systematic +1.5% positive bias over time because
        # humidity affects the capacitive pressure transducer membrane.
        "characteristic_drift_sensor": "Pre_Compressor_Pressure_kPa",
        "characteristic_drift_magnitude": 0.015,
    },

    "hosur_cell_2": {
        "client_id": "client_b",
        "facility_name": "Hosur Test Cell 2",
        "city": "Hosur",
        "state": "Tamil Nadu",
        "elevation_m": 350,
        "description": "Standard reference facility — largest dataset",
        "engine_family": "CAT_C13",
        "years_operational": 5,
        "num_rows": 18000,

        # Standard ISA conditions — this is the reference facility.
        # Its data is closest to the baseline C13 dataset already
        # generated. Use existing dataset with minimal modification.
        "ambient_pressure_kpa": 101.3,
        "ambient_temp_c": 32.0,
        "humidity_factor": 1.00,

        "noise_profile": {
            "pressure_noise_pct": 0.5,
            "temp_noise_pct": 0.3,
            "flow_noise_pct": 0.4,
            "spike_injection_rate": 0.005,
            "drift_injection_rate": 0.010,
            "missing_rate": 0.003,
        },

        # This cell runs the most EGR-intensive test protocols.
        # High-EGR duty cycles stress EGR circuit more frequently.
        "overrepresented_scenario": "EGR_Leak",
        "overrepresentation_factor": 1.3,

        # No systematic sensor drift — sensors are well maintained
        # and calibrated quarterly.
        "characteristic_drift_sensor": None,
        "characteristic_drift_magnitude": 0.0,
    },

    "pune_cell": {
        "client_id": "client_c",
        "facility_name": "Pune Test Cell",
        "city": "Pune",
        "state": "Maharashtra",
        "elevation_m": 560,
        "description": "High altitude facility — reduced ambient pressure",
        "engine_family": "CAT_C13",
        "years_operational": 1.5,
        "num_rows": 10800,

        # Physical justification:
        # Pune is at ~560m above sea level.
        # Standard atmosphere at 560m: ~94.5 kPa (vs 101.3 kPa at sea level).
        # This is NOT a fault — it is the real ambient condition.
        # ALL absolute pressure sensors read proportionally lower.
        "ambient_pressure_kpa": 94.5,
        "ambient_temp_c": 28.0,

        # Drier air at altitude — slightly lower mass flow.
        "humidity_factor": 0.97,

        "noise_profile": {
            "pressure_noise_pct": 0.5,
            "temp_noise_pct": 0.3,
            "flow_noise_pct": 0.4,
            "spike_injection_rate": 0.005,
            "drift_injection_rate": 0.008,
            "missing_rate": 0.002,
        },

        # Cooler ambient at altitude causes more aggressive thermal
        # cycling on exhaust manifold — more Exhaust_PreTurbine failures.
        "overrepresented_scenario": "Exhaust_PreTurbine",
        "overrepresentation_factor": 1.5,

        # Post_Compressor_Pressure reads systematically -2% at this
        # facility because the altitude-adjusted compressor output
        # baseline was not recalibrated when the cell was commissioned.
        "characteristic_drift_sensor": "Post_Compressor_Pressure_kPa",
        "characteristic_drift_magnitude": -0.020,
    },
}

# ---------------------------------------------------------------------------
# Sensor group lists — used by data_generator.py
# ---------------------------------------------------------------------------

# Absolute pressure sensors — scaled by ambient pressure ratio
ABSOLUTE_PRESSURE_SENSORS = [
    "Pre_Compressor_Pressure_kPa",
    "Post_Compressor_Pressure_kPa",
    "Post_CAC_Pressure_kPa",
    "Boost_Pressure_kPa",
    "Exhaust_Manifold_Pressure_kPa",
    "Pre_Turbine_Pressure_kPa",
    "Post_Turbine_Pressure_kPa",
    "Intake_Manifold_Pressure_kPa",
]

# Differential measurements or ratios — NOT scaled by ambient pressure
DIFFERENTIAL_SENSORS = [
    "CAC_Pressure_Drop_kPa",
    "Turbine_Expansion_Ratio",
]

# Mass flow sensors — scaled by humidity factor
MASS_FLOW_SENSORS = [
    "MAF_Sensor_Reading_kgph",
    "EGR_Flow_Rate_kgph",
]

# Target label columns (must match dataset column names exactly)
LABEL_COLUMNS = [
    "Leak_Present",
    "Leak_Location",
    "Leak_Severity",
    "Recommended_Action",
]

# Metadata columns to drop before ML training
# These match the actual CSV headers in the dataset
METADATA_COLUMNS = [
    "Test_ID",
    "Timestamp",
    "Engine_Serial_No",
    "Test_Cell_ID",
    "Test_Mode",
    "Confidence_Score",
    "Ambient_Pressure_kPa",
    "Ambient_Temp_C",
    "Engine_Speed_Setpoint_RPM",
    "Engine_Load_Pct",
]

# All valid leak location labels used for per-scenario F1 evaluation
LEAK_SCENARIOS = [
    "Normal",
    "Intake_PreTurbo",
    "Intake_PostTurbo_CAC",
    "Exhaust_PreTurbine",
    "Exhaust_PostTurbine",
    "EGR_Leak",
    "CAC_Direct_Leak",
    "Minor_Intake_Leak",
]

# ---------------------------------------------------------------------------
# File paths
# ---------------------------------------------------------------------------
DATASET_PATHS = {
    "hosur_cell_1": {
        "noisy": "data/federated/hosur_cell_1_dataset.csv",
        "clean": "data/federated/hosur_cell_1_dataset_clean.csv",
    },
    "hosur_cell_2": {
        "noisy": "data/federated/hosur_cell_2_dataset.csv",
        "clean": "data/federated/hosur_cell_2_dataset_clean.csv",
    },
    "pune_cell": {
        "noisy": "data/federated/pune_cell_dataset.csv",
        "clean": "data/federated/pune_cell_dataset_clean.csv",
    },
}

FL_RESULTS_PATH = "models/federated/fl_results.json"
BASE_C13_CLEAN_PATH = "data/caterpillar_testcell_leak_dataset_clean.csv"
