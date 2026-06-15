/**
 * SKSK ProTech - Core System Constants & Enums
 * Eliminates fragile magic strings across the entire pipeline.
 */

const ENGINE_TYPES = {
  FORD_3V_54: '5.4L 3V',
  GM_AFM_53: '5.3L AFM',
  FORD_ECOBOOST_35: '3.5L EcoBoost',
  GENERIC: 'GENERIC_ENGINE'
};

const FAILURE_KEYS = {
  TRITON_PLUG: 'spark_plug_separation',
  GM_LIFTER: 'afm_lifter_collapse',
  ECOBOOST_PHASER: 'vct_phaser_rattle',
  GENERIC: 'generic_inspection'
};

const PROTOCOL_KEYS = {
  TRITON_PLUG: 'FORD_54_TRITON_SPARK_PLUG',
  GM_LIFTER: 'GM_53_AFM_LIFTER_REPLACE',
  GENERIC: 'DEFAULT_GENERIC'
};

const SOURCE_TIERS = {
  OEM: 'OEM_VERIFIED',
  TECH_KB: 'TECHNICIAN_KB',
  HEURISTIC: 'HEURISTIC_COMMUNITY',
  LLM: 'LLM_INFERENCE'
};

module.exports = {
  ENGINE_TYPES,
  FAILURE_KEYS,
  PROTOCOL_KEYS,
  SOURCE_TIERS
};
