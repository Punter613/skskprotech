const TSB_SYMPTOM_PATTERNS = [
  {
    id: "engine_rattle_warm_idle",
    system: "engine",
    title: "Engine warm rattle / rough idle",
    symptoms: [
      "rattle",
      "warm engine rattle",
      "rough idle",
      "idle rattle",
      "ticking at idle",
      "engine knocking"
    ],
    dtcs: [],
    contexts: ["warm", "idle"],
    possibleIssues: [
      "timing_chain_wear",
      "lifter_noise",
      "idler_pulley",
      "fead_noise"
    ],
    baseWeight: 0.26
  },
  {
    id: "cold_start_hesitation_rough",
    system: "engine_controls",
    title: "Cold start hesitation / rough running",
    symptoms: [
      "hesitation on cold start",
      "runs rough on cold start",
      "rough on startup",
      "hard cold start",
      "poor acceleration"
    ],
    dtcs: [],
    contexts: ["cold start"],
    possibleIssues: [
      "vacuum_leak",
      "maf_issue",
      "fuel_trim_issue",
      "ignition_misfire"
    ],
    baseWeight: 0.24
  },
  {
    id: "misfire_steady_cruise",
    system: "ignition_fuel",
    title: "Misfire on steady cruise",
    symptoms: [
      "misfire",
      "misfire on cruise",
      "shudder at speed",
      "engine stumble"
    ],
    dtcs: ["P0300", "P0301", "P0302", "P0303", "P0304", "P0171"],
    contexts: ["steady cruise"],
    possibleIssues: [
      "spark_plugs",
      "coil_pack",
      "vacuum_leak",
      "fuel_delivery_issue"
    ],
    baseWeight: 0.28
  },
  {
    id: "fuel_gauge_erratic",
    system: "fuel_system",
    title: "Erratic fuel gauge / MIL on",
    symptoms: [
      "fuel gauge erratic",
      "wrong fuel reading",
      "fuel level wrong",
      "gas gauge jumps"
    ],
    dtcs: ["P0460", "P0463"],
    contexts: [],
    possibleIssues: [
      "fuel_level_sender",
      "sender_wiring",
      "cluster_input_fault"
    ],
    baseWeight: 0.34
  },
  {
    id: "evap_small_leak",
    system: "emissions",
    title: "MIL on / EVAP small leak",
    symptoms: [
      "check engine light",
      "mil on",
      "fuel smell",
      "evap leak"
    ],
    dtcs: ["P0456"],
    contexts: [],
    possibleIssues: [
      "gas_cap_seal",
      "evap_hose_leak",
      "purge_valve",
      "vent_valve"
    ],
    baseWeight: 0.32
  },
  {
    id: "brake_vibration_mid_speed",
    system: "brakes",
    title: "Brake vibration around 45 mph",
    symptoms: [
      "brake vibration",
      "vibration when braking",
      "steering shake when braking",
      "brake pulsation"
    ],
    dtcs: [],
    contexts: ["45 mph", "park brake partial release"],
    possibleIssues: [
      "rotor_variation",
      "caliper_drag",
      "parking_brake_drag"
    ],
    baseWeight: 0.29
  },
  {
    id: "steering_wheel_nibble_vibration",
    system: "wheels_tires",
    title: "Steering wheel nibble / vibration",
    symptoms: [
      "steering vibration",
      "wheel vibration",
      "nibble",
      "shimmy",
      "highway vibration"
    ],
    dtcs: [],
    contexts: ["highway speed", "50 mph"],
    possibleIssues: [
      "tire_balance",
      "road_force_issue",
      "bent_wheel",
      "front_end_play"
    ],
    baseWeight: 0.22
  },
  {
    id: "ac_compressor_cutoff_hot",
    system: "hvac",
    title: "A/C compressor shuts off in heat",
    symptoms: [
      "ac stops working",
      "ac shuts off",
      "no ac in heat",
      "warm air from vents"
    ],
    dtcs: [],
    contexts: ["high temperatures", "hot weather"],
    possibleIssues: [
      "compressor_overheat",
      "pressure_switch_fault",
      "cooling_fan_issue"
    ],
    baseWeight: 0.25
  },
  {
    id: "ac_mode_grinding_noise",
    system: "hvac",
    title: "A/C grinding noise when changing modes",
    symptoms: [
      "grinding noise changing modes",
      "clicking in dash",
      "hvac actuator noise",
      "ac mode noise"
    ],
    dtcs: [],
    contexts: ["changing modes"],
    possibleIssues: [
      "blend_door_actuator",
      "mode_door_actuator",
      "hvac_gear_damage"
    ],
    baseWeight: 0.31
  },
  {
    id: "trans_3_4_shift_flare",
    system: "transmission",
    title: "RPM flare on 3-4 upshift",
    symptoms: [
      "rpm flare",
      "shift flare",
      "slips on shift",
      "delayed upshift"
    ],
    dtcs: [],
    contexts: ["3-4 upshift", "light accel"],
    possibleIssues: [
      "valve_body_issue",
      "clutch_pack_wear",
      "solenoid_control",
      "fluid_pressure_loss"
    ],
    baseWeight: 0.36
  },
  {
    id: "trans_gear_slip_whine_grind",
    system: "transmission",
    title: "Grinding / whine / vibration / gear slippage",
    symptoms: [
      "transmission grinding",
      "transmission whine",
      "gear slippage",
      "vibration in gear",
      "loss of reverse"
    ],
    dtcs: [],
    contexts: [],
    possibleIssues: [
      "internal_transmission_failure",
      "pump_noise",
      "bearing_damage",
      "clutch_failure"
    ],
    baseWeight: 0.38
  },
  {
    id: "drivetrain_highway_vibration",
    system: "drivetrain",
    title: "Highway speed drivetrain vibration",
    symptoms: [
      "highway speed vibration",
      "driveline vibration",
      "shudder at speed",
      "truck vibrates on highway"
    ],
    dtcs: [],
    contexts: ["highway speed"],
    possibleIssues: [
      "driveshaft_balance",
      "u_joint_wear",
      "cv_axle_issue",
      "pinion_angle_issue"
    ],
    baseWeight: 0.27
  },
  {
    id: "sync_privacy_mode_default",
    system: "electrical_audio",
    title: "SYNC defaults to privacy mode",
    symptoms: [
      "sync privacy mode",
      "bluetooth privacy mode",
      "sync call issue"
    ],
    dtcs: [],
    contexts: [],
    possibleIssues: [
      "sync_software_issue",
      "module_configuration"
    ],
    baseWeight: 0.16
  }
];

module.exports = { TSB_SYMPTOM_PATTERNS };
