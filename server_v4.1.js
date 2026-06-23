require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const { z } = require('zod');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  credentials: false
}));
app.options('*', cors());
app.use(express.json());

// ========================================
// ENV
// ========================================
const PORT                  = process.env.PORT || 4000;
const GROQ_API_KEY          = process.env.GROQ_API_KEY;
const SUPABASE_URL          = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DEFAULT_LABOR_RATE    = Number(process.env.DEFAULT_LABOR_RATE || 65);
const STRIPE_SECRET_KEY     = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const FRONTEND_URL          = process.env.FRONTEND_URL || 'https://sksk-protech.netlify.app';

if (!GROQ_API_KEY)                              throw new Error('GROQ_API_KEY missing');
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE creds missing');

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let stripe = null;
if (STRIPE_SECRET_KEY) {
  stripe = require('stripe')(STRIPE_SECRET_KEY);
  console.log('💳 Stripe initialized');
}

// ========================================
// FLAT RATES
// ========================================
const FLAT_RATES = {
  'oil change': 0.5, 'oil change basic': 0.5, 'oil change synthetic': 0.5,
  'oil and filter': 0.5, 'oil change + rotation': 1.0, 'oil change and tire rotation': 1.0,
  'tire rotation': 0.5, 'rotate tires': 0.5,
  'battery replacement': 0.3, 'battery install': 0.3, 'replace battery': 0.3,
  'wiper blades': 0.2, 'windshield wipers': 0.2,
  'air filter': 0.3, 'engine air filter': 0.3,
  'cabin filter': 0.4, 'cabin air filter': 0.4,
  'brake fluid flush': 0.75, 'brake fluid change': 0.75,
  'coolant flush': 1.0, 'radiator flush': 1.0, 'coolant change': 1.0,
  'transmission fluid': 1.0, 'transmission fluid change': 1.0, 'trans fluid': 1.0,
  'power steering flush': 0.5, 'power steering fluid': 0.5,
  'differential fluid': 0.75, 'diff fluid': 0.75,
  'thermostat': 1.0, 'thermostat replacement': 1.0,
  'water pump': 2.5, 'water pump replacement': 2.5, 'coolant pump': 2.5,
  'radiator': { min: 2.0, max: 3.5 }, 'radiator replacement': { min: 2.0, max: 3.5 },
  'radiator hose': 0.5, 'coolant hose': 0.5,
  'brake pads front': { min: 1.5, max: 2.0 }, 'front brake pads': { min: 1.5, max: 2.0 },
  'brake pads rear':  { min: 1.5, max: 2.0 }, 'rear brake pads':  { min: 1.5, max: 2.0 },
  'brake pads and rotors front': { min: 2.0, max: 2.5 },
  'brake pads and rotors rear':  { min: 2.0, max: 2.5 },
  'brake caliper': { min: 1.0, max: 1.5 },
  'alternator': { min: 1.5, max: 3.5 }, 'alternator replacement': { min: 1.5, max: 3.5 },
  'starter': { min: 1.5, max: 3.5 }, 'starter motor': { min: 1.5, max: 3.5 },
  'spark plugs': { min: 0.75, max: 2.0 }, 'spark plug replacement': { min: 0.75, max: 2.0 },
  'ignition coil': { min: 0.5, max: 1.0 },
  'serpentine belt': { min: 0.5, max: 1.0 }, 'drive belt': { min: 0.5, max: 1.0 },
  'timing belt': { min: 4.0, max: 8.0 },
  'belt tensioner': 0.75,
  'tie rod': { min: 1.0, max: 1.5 }, 'inner tie rod': { min: 1.0, max: 1.5 },
  'outer tie rod': { min: 0.75, max: 1.0 }, 'tie rod end': { min: 0.75, max: 1.0 },
  'ball joint': { min: 1.5, max: 2.5 },
  'control arm': { min: 1.5, max: 2.5 },
  'sway bar link': 0.75, 'stabilizer link': 0.75,
  'shock absorber': { min: 1.0, max: 1.5 },
  'strut': { min: 1.5, max: 2.5 }, 'strut assembly': { min: 1.5, max: 2.5 },
  'fuel pump': { min: 2.0, max: 3.5 },
  'fuel filter': 0.5,
  'fuel injector': { min: 1.0, max: 2.0 },
  'muffler': { min: 1.0, max: 1.5 },
  'catalytic converter': { min: 1.5, max: 2.5 },
  'oxygen sensor': 0.5, 'o2 sensor': 0.5,
  'headlight bulb': 0.3,
  'window regulator': { min: 1.5, max: 2.5 },
  'wheel bearing': { min: 1.5, max: 2.5 }
};

function getFlatRate(description) {
  const desc = (description || '').toLowerCase().trim();
  if (!desc) return null;
  for (const [job, hours] of Object.entries(FLAT_RATES)) {
    if (desc.includes(job)) return { job, hours };
  }
  return null;
}

// ========================================
// EXCLUSION CATALOG — maps UI values to searchable terms
// Used by both Foreman (prompt injection) and Auditor (post-validation)
// ========================================
const EXCLUSION_CATALOG = {
  // Braking
  'brake_pads':       ['brake pad', 'brake pads', 'pads'],
  'rotors':           ['rotor', 'rotors', 'disc', 'brake disc'],
  'calipers':         ['caliper', 'calipers', 'brake caliper'],
  'brake_lines':      ['brake line', 'brake hose', 'brake fluid line'],
  'master_cylinder':  ['master cylinder', 'brake master'],
  // Suspension
  'upper_control_arms': ['upper control arm', 'control arm upper'],
  'ball_joints':      ['ball joint', 'balljoint'],
  'tie_rod_ends':     ['tie rod', 'tierod', 'tie rod end'],
  'wheel_bearings':   ['wheel bearing', 'hub bearing', 'hub assembly'],
  'shocks_struts':    ['shock', 'strut', 'shock absorber', 'strut assembly'],
  'sway_bar_links':   ['sway bar link', 'stabilizer link', 'end link', 'sway link'],
  'cv_axles':         ['cv axle', 'axle shaft', 'cv joint', 'axle'],
  // Engine
  'spark_plugs':      ['spark plug', 'sparkplug'],
  'ignition_coils':   ['ignition coil', 'coil pack', 'coil'],
  'serpentine_belt':  ['serpentine belt', 'drive belt', 'accessory belt'],
  'timing_belt':      ['timing belt', 'timing chain'],
  'water_pump':       ['water pump', 'coolant pump'],
  'thermostat':       ['thermostat'],
  'fuel_pump':        ['fuel pump', 'fuel sender'],
  'fuel_injectors':   ['fuel injector', 'injector'],
  'alternator':       ['alternator', 'alternator replacement'],
  'starter':          ['starter', 'starter motor'],
  // Exhaust
  'oxygen_sensor':    ['oxygen sensor', 'o2 sensor', 'o2s'],
  'catalytic_converter': ['catalytic converter', 'cat converter', 'cat'],
  'muffler':          ['muffler', 'exhaust muffler'],
  // Other
  'headlight_bulb':   ['headlight bulb', 'headlamp bulb', 'headlight'],
  'window_regulator': ['window regulator', 'regulator'],
  'valve_cover_gasket': ['valve cover gasket', 'valve cover seal'],
  'head_gasket':      ['head gasket', 'cylinder head gasket']
};

// Normalize exclusion terms for fuzzy matching
function normalizeExclusion(term) {
  return term.toLowerCase().replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Check if a part recommendation matches any excluded component
function isExcluded(partName, exclusions) {
  const normalizedPart = normalizeExclusion(partName);

  for (const ex of exclusions) {
    const normalizedEx = normalizeExclusion(ex);

    // Direct match
    if (normalizedPart === normalizedEx) return { excluded: true, matched: ex, reason: 'Exact match' };
    if (normalizedPart.includes(normalizedEx)) return { excluded: true, matched: ex, reason: 'Part contains excluded term' };
    if (normalizedEx.includes(normalizedPart)) return { excluded: true, matched: ex, reason: 'Excluded term contains part' };

    // Catalog lookup — expand UI codes to searchable terms
    for (const [catalogKey, aliases] of Object.entries(EXCLUSION_CATALOG)) {
      if (normalizeExclusion(catalogKey) === normalizedEx || aliases.some(a => normalizeExclusion(a) === normalizedEx)) {
        // This exclusion maps to a catalog entry — check if part matches any alias
        if (aliases.some(alias => normalizedPart.includes(normalizeExclusion(alias)))) {
          return { excluded: true, matched: catalogKey, reason: `Catalog match: ${catalogKey}` };
        }
      }
    }
  }

  return { excluded: false };
}

// ========================================
// REPAIR SIGNAL LIBRARY
// Multi-repair detection — scans ALL 3 layers, collects ALL hits
// Priority: mechanic findings > OBD codes > customer states
// ========================================
const REPAIR_SIGNALS = [
  // ── CV / AXLE ────────────────────────────────────────────────────────
  {
    id: 'cv_axle',
    keywords: ['torn cv boot', 'cv boot torn', 'ripped cv boot', 'axle boot torn',
               'axle clicking', 'cv axle', 'clicking on turns', 'clicking when turning'],
    symptomKeywords: ['clicking turn', 'clicking when turn', 'clicking on turn', 'clunk turn'],
    layer: 'mechanic_or_obd',
    repair: 'CV Axle Shaft Replacement',
    hours: 1.5,
    minSteps: 6,
    parts: [
      { name: 'CV axle shaft assembly (OEM quality)', cost: 125 }
    ],
    workSteps: [
      'Safely lift vehicle and support on jack stands — confirm stability before crawling under',
      'Remove wheel/tire assembly to expose hub and axle nut',
      'Break loose axle nut (usually 32mm or 36mm) — apply penetrating oil if corroded',
      'Disconnect lower ball joint or control arm to swing knuckle outboard for clearance',
      'Slide CV axle out of transaxle — have drain pan ready, fluid will drip from diff bore',
      'Install new CV axle shaft — seat inner joint into diff with a firm pop (confirm seated)',
      'Reassemble knuckle, torque ball joint nut and axle nut to spec',
      'Test drive: verify no clicking on full-lock turns left and right'
    ],
    warnings: [
      'SEIZED AXLE NUT (common): Impact gun may not break it loose — breaker bar + pipe extension',
      'DIFF SEAL LEAK: Inspect inner diff seal while axle is out — $15 seal while you\'re already there',
      'WRONG SIDE: Double-check you\'re replacing the clicking side — test drive before teardown confirms which side'
    ]
  },

  // ── TIE ROD ──────────────────────────────────────────────────────────
  {
    id: 'tie_rod',
    keywords: ['tie rod boot missing', 'tie rod boot torn', 'tie rod worn', 'tie rod loose',
               'inner tie rod', 'outer tie rod', 'tie rod end', 'tie rod play'],
    symptomKeywords: ['wanders', 'pulls left', 'pulls right', 'steering loose', 'play in steering',
                      'loose steering', 'shimmy'],
    layer: 'mechanic',
    repair: 'Tie Rod End Replacement + Alignment',
    hours: 1.5,
    minSteps: 6,
    parts: [
      { name: 'Outer tie rod end (driver side)', cost: 35 },
      { name: 'Outer tie rod end (passenger side)', cost: 35 },
      { name: 'Alignment (shop visit or portable tools)', cost: 95 }
    ],
    notes: 'Missing boot = unprotected joint exposed to road debris — replacement is not optional once boot is gone, just a matter of when it fails. Get alignment after ANY tie rod work.',
    workSteps: [
      'Lift vehicle, remove wheel for access — inspect both inner and outer tie rod ends for play',
      'Mark tie rod thread count (measure or count turns) before loosening — preserves rough alignment',
      'Loosen jam nut on outer tie rod end with wrench; thread off old tie rod end',
      'Thread new tie rod end to same count/measurement, hand tighten then snug jam nut',
      'Separate old end from steering knuckle with tie rod puller — do NOT hammer directly on threads',
      'Install new end into knuckle, torque to spec, install cotter pin',
      'Reinstall wheel, lower vehicle — drive slowly to alignment shop or use alignment tool'
    ],
    warnings: [
      'ALWAYS ALIGN AFTER TIE ROD WORK — skipping alignment causes uneven tire wear starting immediately',
      'CHECK INNER TIE ROD TOO — outer boot gone usually means inner was getting hammered as well',
      'CORRODED KNUCKLE TAPER — tie rod puller required; hammer method damages threads and knuckle bore'
    ]
  },

  // ── SWAY BAR LINKS ───────────────────────────────────────────────────
  {
    id: 'sway_bar_links',
    keywords: ['sway bar link broken', 'sway bar link loose', 'stabilizer link', 'end link broken',
               'end link loose', 'sway bar end link', 'clunk suspension'],
    symptomKeywords: ['clunk over bumps', 'clunk hitting bump', 'clunk on bumps', 'knock bumps',
                      'knocking bumps', 'knocking over bumps', 'rattle over bumps', 'bang bumps',
                      'knock when hit bump', 'clunk when hit bump'],
    layer: 'either',
    repair: 'Sway Bar End Link Replacement',
    hours: 0.75,
    minSteps: 5,
    parts: [
      { name: 'Sway bar end links (pair)', cost: 45 }
    ],
    workSteps: [
      'Lift vehicle — visually inspect both end links for broken boots, excessive play, or detachment',
      'Confirm noise side by hand-shaking each link — loose = clunk confirmed',
      'Remove upper and lower end link nuts (usually 14-17mm) — hold stud with hex key if it spins',
      'Install new end links — torque to spec with suspension at ride height (not hanging)',
      'Test drive over speed bumps or rough road to confirm clunk eliminated'
    ],
    warnings: [
      'ROUNDED STUD: Torx or hex key in center prevents spinning — without it you can\'t get the nut off',
      'CHECK SWAY BAR BUSHINGS: If links are good and clunk remains, bushings are next',
      'TORQUE AT RIDE HEIGHT: Torquing with suspension hanging preloads the bushing wrong — always torque with wheels on ground'
    ]
  },

  // ── BALL JOINT ───────────────────────────────────────────────────────
  {
    id: 'ball_joint',
    keywords: ['ball joint worn', 'ball joint loose', 'ball joint play', 'torn ball joint boot',
               'ball joint boot torn', 'ball joint bad'],
    symptomKeywords: ['clunk front', 'clunk turning', 'clunk over bump', 'wandering', 'uneven tire wear'],
    layer: 'mechanic',
    repair: 'Ball Joint Replacement',
    hours: 2.5,
    minSteps: 7,
    parts: [
      { name: 'Ball joint (press-in or bolt-in)', cost: 65 },
      { name: 'Ball joint boot kit (if separate)', cost: 15 }
    ],
    workSteps: [
      'Lift vehicle, support on stands, remove wheel for access',
      'Load-test ball joint with pry bar under tire — measure play with dial indicator if available',
      'Inspect boot for tears — torn boot = contaminated joint, replacement required regardless of play',
      'Disconnect tie rod end first for clearance, then separate ball joint from knuckle',
      'Press out old ball joint (press or pickle fork + hammer — pickle fork destroys boot)',
      'Press in new ball joint to proper seating depth — do not overdrive',
      'Reassemble and torque all fasteners to spec; install cotter pin; verify boot not twisted',
      'Perform alignment check — ball joint replacement changes caster/camber geometry'
    ],
    warnings: [
      'FAILURE MODE: Ball joint failure can cause wheel to fold under vehicle at speed — do not delay',
      'INTEGRATED CONTROL ARM: Some vehicles (e.g., FWD Kia/Hyundai) require full control arm replacement — ball joint not sold separately',
      'PRESS REQUIRED: Many ball joints are pressed in — need ball joint press or shop press, not just standard tools'
    ]
  },

  // ── STRUT / SHOCK ────────────────────────────────────────────────────
  {
    id: 'strut',
    keywords: ['strut leaking', 'strut bad', 'shock leaking', 'shock worn', 'bounce test fail',
               'strut worn', 'shock absorber worn'],
    symptomKeywords: ['bouncy ride', 'car bounces', 'nose dives', 'sways', 'floaty', 'bottoms out'],
    layer: 'mechanic',
    repair: 'Strut/Shock Absorber Replacement',
    hours: 2.5,
    minSteps: 7,
    parts: [
      { name: 'Strut assembly (each — recommend pairs)', cost: 110 },
      { name: 'Strut mount/bearing plate', cost: 40 },
      { name: 'Alignment', cost: 95 }
    ],
    workSteps: [
      'Bounce test each corner — more than 1-2 rebounds = failed strut',
      'Lift vehicle and remove wheel; support lower control arm with jack',
      'Compress spring with spring compressor (REQUIRED — do not skip; spring energy is lethal)',
      'Disconnect strut top mount from tower; disconnect lower strut-to-knuckle bolts',
      'Remove strut assembly; transfer spring to new strut',
      'Torque all fasteners to spec; top mount nut with spring still compressed',
      'Release spring compressor carefully; reinstall wheel',
      'Alignment required after strut replacement'
    ],
    warnings: [
      'SPRING COMPRESSOR IS MANDATORY — an uncontrolled spring release is a lethal projectile',
      'REPLACE IN PAIRS — replacing one strut causes vehicle to lean and handle unpredictably',
      'BEARING PLATE: Inspect strut mount bearing while apart — $40 now vs. $150 labor later'
    ]
  },

  // ── WHEEL BEARING ────────────────────────────────────────────────────
  {
    id: 'wheel_bearing',
    keywords: ['wheel bearing noise', 'bearing worn', 'bearing play', 'hub bearing',
               'grinding wheel', 'growling wheel'],
    symptomKeywords: ['grinding', 'growling', 'hum speed', 'roar highway', 'noise changes lane'],
    layer: 'either',
    repair: 'Wheel Bearing/Hub Assembly Replacement',
    hours: 1.5,
    minSteps: 6,
    parts: [
      { name: 'Wheel bearing hub assembly', cost: 85 }
    ],
    workSteps: [
      'Jack up vehicle, grab tire at 9 and 3 o\'clock — check for lateral play (bearing)',
      'Grab at 12 and 6 — check for vertical play (ball joint); different diagnosis',
      'Spin wheel by hand — rough, grinding, or groan = bad bearing confirmed',
      'Remove wheel, brake caliper (hang — don\'t let it dangle by hose), and rotor',
      'Remove hub assembly bolts (usually 3-4 bolts from behind knuckle)',
      'Press or unbolt hub out — install new hub, torque to spec',
      'Reassemble brakes, wheel — road test and verify noise eliminated'
    ],
    warnings: [
      'CONFIRM WHICH SIDE: Bearing noise often sounds like it\'s opposite of bad side — swap weight in corners to isolate',
      'ABS RING: Integrated ABS tone ring on hub — verify new hub matches (sensor style, tooth count)',
      'AXLE NUT TORQUE: Must be torqued to spec (often 150-200 ft-lbs) — improper torque destroys new bearing fast'
    ]
  },

  // ── VALVE COVER GASKET ───────────────────────────────────────────────
  {
    id: 'valve_cover_gasket',
    keywords: ['valve cover leaking', 'oil on valve cover', 'valve cover gasket', 'oil on exhaust',
               'burning oil smell', 'oil leak top engine', 'oil around valve cover'],
    symptomKeywords: ['burning oil smell', 'smoke under hood', 'oil smell running'],
    layer: 'either',
    repair: 'Valve Cover Gasket Replacement',
    hours: 2.0,
    minSteps: 6,
    parts: [
      { name: 'Valve cover gasket set', cost: 35 },
      { name: 'Spark plug tube seals (if applicable)', cost: 15 }
    ],
    workSteps: [
      'Let engine cool fully — hot oil burns and components are easier to handle cool',
      'Remove any covers, air intake, or hoses blocking valve cover access',
      'Disconnect ignition coils/plug wires and any sensors attached to cover',
      'Remove valve cover bolts in reverse order of tightening pattern — pry gently to break seal',
      'Clean gasket mating surfaces thoroughly — old gasket material causes new leaks',
      'Install new gasket and grommets; torque bolts in sequence to spec (usually 7-10 ft-lbs — don\'t overtighten)',
      'Reinstall all components; run engine and inspect for leaks before returning vehicle'
    ],
    warnings: [
      'OVERTIGHTENING KILLS NEW GASKET: Valve cover bolts are low-torque — use a torque wrench',
      'SPARK PLUG TUBE SEALS: If oil is in plug wells, tube seals are also needed — inspect while apart',
      'MULTIPLE LAYERS: Some engines (e.g., V6/V8) have upper and lower intake manifolds in the way — add 1-2hrs'
    ]
  },

  // ── BRAKE PADS ─────────────────────────────────────────────────────
  {
    id: 'brakes',
    keywords: ['grinding brakes', 'squealing brakes', 'brake pads worn', 'metal on metal brakes',
               'brake wear indicator', 'worn brake pads'],
    symptomKeywords: ['squealing stop', 'grinding stop', 'squealing when brake', 'grinding when brake',
                      'brake noise', 'takes longer to stop', 'soft pedal'],
    layer: 'either',
    repair: 'Brake Pad Replacement (and Rotor Inspection)',
    hours: 2.0,
    minSteps: 6,
    parts: [
      { name: 'Brake pads (front axle set)', cost: 45 },
      { name: 'Brake rotors if worn past spec (each)', cost: 35 }
    ],
    workSteps: [
      'Lift vehicle; remove wheels to access calipers',
      'Measure rotor thickness with micrometer — compare to minimum spec on rotor hat',
      'Inspect caliper slides — if caliper is seized, replace or rebuild before new pads',
      'Remove caliper, compress piston fully (use piston tool — not pliers)',
      'Install new pads; apply brake grease to caliper slide pins and backing plate contact points',
      'Reinstall caliper, wheel; pump brake pedal to seat pads before moving vehicle',
      'Bed-in brakes: 5 moderate stops from 30mph with cool-down between'
    ],
    warnings: [
      'ROTOR MIN THICKNESS: If rotors are at or below minimum, pads-only is throwing money away',
      'SEIZED CALIPER PISTON: Grinding brakes often means seized caliper — replace caliper, not just pads',
      'BRAKE FLUID: Check fluid level while caliper is compressed — dark/contaminated fluid = flush needed'
    ]
  },

  // ── HEAD GASKET TELLS ─────────────────────────────────────────────────
  {
    id: 'head_gasket_suspect',
    keywords: ['white smoke exhaust', 'milky oil', 'coolant in oil', 'oil in coolant',
               'overheating', 'sweet smell exhaust', 'bubbles in coolant reservoir'],
    symptomKeywords: ['overheating', 'white smoke', 'losing coolant no leak', 'milky dipstick'],
    layer: 'either',
    repair: 'Head Gasket Diagnostic (Suspected Failure)',
    jobType: 'Diagnosis',
    hours: 1.5,
    minSteps: 6,
    parts: [],
    workSteps: [
      'Check oil dipstick for milky/frothy contamination — coolant in oil is definitive',
      'Check coolant reservoir for oily film or brown sludge',
      'Perform block test / combustion leak test (chemical test strip turns from blue to yellow in presence of combustion gases)',
      'Pressure test cooling system — external pressure loss with no visible external leak = internal breach',
      'Check for white steam/sweet smell from exhaust (coolant burning)',
      'If head gasket confirmed: provide separate repair estimate — this is a significant job'
    ],
    warnings: [
      'DO NOT DRIVE OVERHEATING: Each overheat event warps the head further — diagnosis first, drive second',
      'BLOWN HEAD GASKET REPAIR COST: Typically $1,200-$2,500 depending on vehicle — customer needs to know before committing',
      'CONFIRM WITH BLOCK TEST BEFORE QUOTING REPAIR: Symptoms alone are not enough — get chemical confirmation'
    ]
  }
];

// ========================================
// SYMPTOM → REPAIR ROUTING
// ========================================
const SYMPTOM_ROUTES = [
  { patterns: ['click', 'clicking', 'pop on turn', 'snap turn'],
    when: ['turn', 'turning', 'full lock', 'steering wheel'],
    likelyCause: 'CV axle shaft (inner or outer joint)', confidence: 70 },

  { patterns: ['clunk', 'knock', 'bang', 'thud'],
    when: ['bump', 'pothole', 'rough road', 'hit bump', 'over bump', 'speed bump'],
    likelyCause: 'Sway bar end links (most common), ball joint, or strut mount', confidence: 65 },

  { patterns: ['grind', 'grinding', 'growl', 'growling', 'hum', 'roar'],
    when: ['speed', 'highway', 'lane change', 'turning slowly', 'wheel'],
    likelyCause: 'Wheel bearing failure', confidence: 70 },

  { patterns: ['squeal', 'squeak', 'grind'],
    when: ['brake', 'stop', 'stopping', 'slow down'],
    likelyCause: 'Worn brake pads or seized caliper', confidence: 80 },

  { patterns: ['pull', 'pulls', 'drift', 'wander'],
    when: ['left', 'right', 'highway', 'hands off wheel', 'steering'],
    likelyCause: 'Alignment, tie rod, or brake caliper drag', confidence: 60 },

  { patterns: ['bounce', 'float', 'sway', 'dive', 'bottoms'],
    when: ['bump', 'speed bump', 'corner', 'braking', 'turning'],
    likelyCause: 'Worn struts or shock absorbers', confidence: 65 },

  { patterns: ['white smoke', 'steam', 'overheat', 'losing coolant', 'milky'],
    when: ['exhaust', 'running', 'driving', 'dipstick', 'reservoir'],
    likelyCause: 'Head gasket failure or coolant system breach', confidence: 75 }
];

// ========================================
// MULTI-REPAIR EVIDENCE ANALYZER
// ========================================
function analyzeEvidence({ obdCodes = [], customerStates = [], mechanicNotices = [] }) {
  const codesText    = (Array.isArray(obdCodes)        ? obdCodes        : []).join(' ').toLowerCase();
  const statesText   = (Array.isArray(customerStates)  ? customerStates  : []).join(' ').toLowerCase();
  const noticesText  = (Array.isArray(mechanicNotices) ? mechanicNotices : []).join(' ').toLowerCase();

  const allText = `${codesText} ${statesText} ${noticesText}`;

  const detectedRepairs = [];
  const seenIds = new Set();

  for (const signal of REPAIR_SIGNALS) {
    if (seenIds.has(signal.id)) continue;

    let confidence = 0;
    let triggeredBy = [];

    for (const kw of signal.keywords) {
      if (noticesText.includes(kw)) {
        confidence += 70;
        triggeredBy.push(`mechanic: "${kw}"`);
        break;
      }
    }

    for (const kw of signal.keywords) {
      if (codesText.includes(kw)) {
        confidence += 50;
        triggeredBy.push(`OBD: "${kw}"`);
        break;
      }
    }

    const symptomKws = signal.symptomKeywords || [];
    for (const kw of symptomKws) {
      if (statesText.includes(kw)) {
        confidence = Math.max(confidence, 40);
        triggeredBy.push(`customer: "${kw}"`);
        break;
      }
    }
    for (const kw of signal.keywords) {
      if (statesText.includes(kw) && !triggeredBy.some(t => t.includes(kw))) {
        confidence = Math.max(confidence, 45);
        triggeredBy.push(`customer mention: "${kw}"`);
        break;
      }
    }

    if (confidence >= 40) {
      seenIds.add(signal.id);
      detectedRepairs.push({
        ...signal,
        confidence,
        triggeredBy,
        jobType: signal.jobType || (confidence >= 60 ? 'Repair' : 'Diagnosis')
      });
    }
  }

  const symptomInsights = [];
  for (const route of SYMPTOM_ROUTES) {
    const patternMatch = route.patterns.some(p => statesText.includes(p) || noticesText.includes(p));
    const whenMatch    = route.when.some(w    => statesText.includes(w) || noticesText.includes(w));
    if (patternMatch && whenMatch) {
      symptomInsights.push({
        likelyCause: route.likelyCause,
        confidence: route.confidence
      });
    }
  }

  const hasConfirmed  = detectedRepairs.some(r => r.confidence >= 60);
  const hasSuspected  = detectedRepairs.some(r => r.confidence >= 40 && r.confidence < 60);
  const overallType   = hasConfirmed ? 'Repair' : hasSuspected ? 'Diagnosis' : 'Diagnosis';
  const totalConfidence = detectedRepairs.length > 0
    ? Math.round(detectedRepairs.reduce((s, r) => s + r.confidence, 0) / detectedRepairs.length)
    : 0;

  return {
    overallJobType: overallType,
    totalConfidence,
    detectedRepairs,
    symptomInsights,
    hasMultipleRepairs: detectedRepairs.filter(r => r.confidence >= 60).length > 1
  };
}

// ========================================
// FOREMAN AGENT — Diagnostic AI
// Builds the prompt, calls Groq, returns raw recommendations
// ========================================
function buildForemanPrompt({ customer, vehicle, description, obdCodes, customerStates, mechanicNotices, laborRate, exclusions }) {
  const effectiveRate = laborRate || DEFAULT_LABOR_RATE;
  const evidence = analyzeEvidence({ obdCodes, customerStates, mechanicNotices });

  const codesStr   = Array.isArray(obdCodes)        && obdCodes.length        ? obdCodes.join(', ')        : 'None';
  const statesStr  = Array.isArray(customerStates)  && customerStates.length  ? customerStates.join('; ')  : 'None';
  const noticesStr = Array.isArray(mechanicNotices) && mechanicNotices.length ? mechanicNotices.join('; ') : 'None';

  // Build detected repairs context
  let repairsContext = '';
  if (evidence.detectedRepairs.length > 0) {
    repairsContext = evidence.detectedRepairs.map((r, i) => {
      const partsStr = r.parts && r.parts.length
        ? r.parts.map(p => `${p.name} (~$${p.cost})`).join(', ')
        : 'AI to determine';
      return `
DETECTED REPAIR ${i + 1}: "${r.repair}"
  - Confidence: ${r.confidence}% (${r.jobType})
  - Triggered by: ${r.triggeredBy.join(', ')}
  - Suggested hours: ${typeof r.hours === 'number' ? r.hours : `${r.hours.min}-${r.hours.max}`}
  - Known parts needed: ${partsStr}
  - Notes: ${r.notes || 'None'}`;
    }).join('\n');
  } else {
    repairsContext = 'No specific repair patterns detected — generate diagnostic estimate based on symptoms.';
  }

  const insightsStr = evidence.symptomInsights.length > 0
    ? evidence.symptomInsights.map(s => `• ${s.likelyCause} (${s.confidence}% probability)`).join('\n')
    : 'No additional symptom patterns detected.';

  const isMultiRepair = evidence.hasMultipleRepairs;
  const multiNote = isMultiRepair
    ? `\n🚨 MULTI-REPAIR JOB DETECTED: Include ALL detected repairs as separate line items. Sum labor hours appropriately. Do NOT collapse into a single vague repair.`
    : '';

  // ── EXCLUSIONS BLOCK — Injected into prompt to prevent AI from recommending done work ──
  let exclusionsBlock = '';
  if (exclusions && exclusions.length > 0) {
    const exclusionList = exclusions.map(e => {
      // Expand catalog codes to human-readable names
      const catalogEntry = EXCLUSION_CATALOG[e];
      const display = catalogEntry ? catalogEntry[0] : e.replace(/_/g, ' ');
      return `- ${display}`;
    }).join('\n');

    exclusionsBlock = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚫 PREVIOUSLY COMPLETED WORK — DO NOT RECOMMEND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
The following work has ALREADY BEEN COMPLETED on this vehicle. 
You MUST NOT recommend these parts or services again.
Any recommendation matching these exclusions is a CRITICAL ERROR.

${exclusionList}

EXCLUSION RULES:
- If a detected repair conflicts with an exclusion, SKIP that repair entirely
- Do NOT suggest "inspecting" or "checking" excluded items as a workaround
- Do NOT recommend related parts that are functionally the same (e.g., if "brake_pads" excluded, do not suggest "brake pad set" or "front pads")
- Focus recommendations ONLY on parts NOT in the exclusion list
- If ALL detected repairs are excluded, return jobType "Diagnosis" with parts[] empty`;
  }

  return `You are an expert mobile mechanic and automotive diagnostic specialist with 25+ years of field experience.

🔒 MANDATORY LABOR RATE: $${effectiveRate}/hour — NEVER change this value.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3-LAYER DIAGNOSTIC SYSTEM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Layer 1 — 📟 OBD-II CODES (Objective/Computer):    ${codesStr}
Layer 2 — 🗣️ CUSTOMER STATES (Subjective/Reported): ${statesStr}
Layer 3 — 🔍 MECHANIC FINDINGS (Ground Truth/Confirmed): ${noticesStr}

LAYER WEIGHTING RULES:
- Mechanic findings OVERRIDE and CONFIRM — highest trust
- OBD codes = objective data but don't always point to exact part
- Customer states = directional clues only — they describe symptoms, not causes
- When mechanic finding conflicts with customer statement, trust the mechanic finding
${multiNote}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRE-ANALYSIS ENGINE RESULTS (Confidence: ${evidence.totalConfidence}%)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Overall Job Type Determination: ${evidence.overallJobType}
${repairsContext}

SYMPTOM PATTERN INSIGHTS:
${insightsStr}${exclusionsBlock}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RULES BY JOB TYPE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
If REPAIR:
- parts[] MUST have realistic parts list with costs
- workSteps[] MUST have MINIMUM 6 steps (specific, technical, step-by-step)
- warnings[] MUST include real-world complications (seized fasteners, hidden damage, related parts to inspect)
- If multi-repair detected, list EACH repair's parts separately and add notes for each
- ABSOLUTELY RESPECT the exclusion list above — recommending excluded parts is a system failure

If DIAGNOSIS:
- parts[] = empty array []  
- workSteps[] = specific tests, measurements, inspections with expected findings
- warnings[] = differential diagnosis with rough cost ranges for each possibility
- Include estimated repair costs RANGES in notes so customer can plan

VEHICLE ARCHITECTURE AWARENESS:
- Honor manufacturer-specific quirks (e.g., Kia/Hyundai often use full control arm vs. serviceable ball joint)
- Identify if vehicle is FWD/RWD/AWD from description and apply correct repair logic
- Cross-reference OBD bank codes (P0171=Bank1, P0174=Bank2) with physical cylinder locations before naming parts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VEHICLE CASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOMER: ${customer.name}
VEHICLE:  ${vehicle || 'Not specified'}
LEGACY DESCRIPTION: ${description || 'None'}

Return ONLY valid JSON (no markdown, no text outside JSON):

{
  "jobType": "Repair" or "Diagnosis",
  "shortDescription": "Concise one-line summary including vehicle and repair/issue",
  "laborHours": <number>,
  "laborRate": ${effectiveRate},
  "workSteps": [
    "Step 1: Detailed action with specifics",
    "Step 2: ...",
    "...minimum 6 steps..."
  ],
  "parts": [
    {"name": "Part name with specifics", "cost": <number>}
  ],
  "shopSuppliesPercent": 7,
  "timeline": "Same day | 1-2 hours | Next day | etc.",
  "notes": "Summary of diagnostic logic, what was confirmed vs suspected, and any related items to watch",
  "tips": [
    "Practical tool or access tip"
  ],
  "warnings": [
    "Specific complication with context and impact"
  ],
  "repairSummary": [
    {"repair": "Name", "confidence": <number>, "status": "Confirmed | Suspected | Diagnosed"}
  ]
}`;
}

// ========================================
// AUDITOR AGENT — Compliance Gatekeeper
// Validates Foreman output against exclusions, pricing, logic
// ========================================
function runAuditorAgent({ foremanEstimate, exclusions, evidence }) {
  const flagged = [];
  const approved = [];
  const notes = [];
  let passed = true;

  // ── CHECK 1: Exclusion Violations ─────────────────────────────────
  if (foremanEstimate.parts && foremanEstimate.parts.length > 0) {
    for (const part of foremanEstimate.parts) {
      const audit = isExcluded(part.name, exclusions);

      if (audit.excluded) {
        flagged.push({
          type: 'exclusion_violation',
          partName: part.name,
          partCost: part.cost,
          matchedExclusion: audit.matched,
          reason: audit.reason,
          severity: 'critical'
        });
        notes.push(`❌ EXCLUSION VIOLATION: "${part.name}" matches excluded item "${audit.matched}" (${audit.reason})`);
        passed = false;
      } else {
        approved.push({
          partName: part.name,
          partCost: part.cost,
          status: 'approved'
        });
        notes.push(`✅ APPROVED: "${part.name}" — no exclusion conflict`);
      }
    }
  }

  // ── CHECK 2: Confidence Threshold ───────────────────────────────────
  if (foremanEstimate.repairSummary) {
    for (const rec of foremanEstimate.repairSummary) {
      if (rec.confidence < 60 && rec.status === 'Confirmed') {
        flagged.push({
          type: 'confidence_mismatch',
          repair: rec.repair,
          confidence: rec.confidence,
          reason: 'Marked Confirmed but confidence below 60%',
          severity: 'medium'
        });
        notes.push(`⚠️ CONFIDENCE MISMATCH: "${rec.repair}" marked Confirmed at ${rec.confidence}%`);
        passed = false;
      }
    }
  }

  // ── CHECK 3: Labor Hours Sanity Check ──────────────────────────────
  if (foremanEstimate.laborHours > 8) {
    flagged.push({
      type: 'high_labor',
      hours: foremanEstimate.laborHours,
      reason: 'Labor hours exceed 8 — verify with mechanic',
      severity: 'medium'
    });
    notes.push(`⚠️ HIGH LABOR: ${foremanEstimate.laborHours}hrs — manual verification recommended`);
  }

  // ── CHECK 4: Empty Parts on Repair Job ─────────────────────────────
  if (foremanEstimate.jobType === 'Repair' && (!foremanEstimate.parts || foremanEstimate.parts.length === 0)) {
    flagged.push({
      type: 'missing_parts',
      reason: 'Repair job has no parts listed',
      severity: 'medium'
    });
    notes.push(`⚠️ MISSING PARTS: Repair job has empty parts[] — using detected repair fallback`);
  }

  // ── CHECK 5: All Repairs Excluded? ─────────────────────────────────
  const allRepairsExcluded = evidence.detectedRepairs.length > 0 && 
    evidence.detectedRepairs.every(r => {
      return exclusions.some(ex => {
        const audit = isExcluded(r.repair, [ex]);
        return audit.excluded;
      });
    });

  if (allRepairsExcluded) {
    flagged.push({
      type: 'all_excluded',
      reason: 'All detected repairs match exclusion list — job should be Diagnosis',
      severity: 'medium'
    });
    notes.push(`ℹ️ ALL EXCLUDED: Detected repairs all match exclusion list — switching to Diagnosis`);
    foremanEstimate.jobType = 'Diagnosis';
    foremanEstimate.parts = [];
  }

  return {
    passed,
    approved,
    flagged,
    notes,
    auditTimestamp: new Date().toISOString()
  };
}

// ========================================
// VALIDATION SCHEMA (v4.1 — includes exclusions)
// ========================================
const GenerateSchema = z.object({
  customer: z.object({
    name: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional()
  }),
  vehicle: z.string().optional(),
  description: z.string().optional().default(''),
  obdCodes:        z.array(z.string()).optional().default([]),
  customerStates:  z.array(z.string()).optional().default([]),
  mechanicNotices: z.array(z.string()).optional().default([]),
  exclusions:      z.array(z.string()).optional().default([]),      // ← NEW: previously completed work
  otherExclusions: z.string().optional().default(''),              // ← NEW: freeform text
  jobType: z.string().optional(),
  laborRate: z.number().optional()
});

// ========================================
// HEALTH CHECK
// ========================================
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'SKSK ProTech Backend',
    version: '4.1.0',
    features: [
      'Multi-repair detection engine',
      'Layer-weighted 3-input diagnosis',
      'Symptom routing (turns/bumps/grinding)',
      'Flat rate enforcement',
      'Tax tracking',
      'Invoice system',
      'VIN lookup',
      'Stripe payments',
      '🔒 Exclusion-aware AI prompting',
      '🔍 Dual-agent Foreman/Auditor pipeline'
    ]
  });
});

// ========================================
// ESTIMATE GENERATION — Dual-Agent Pipeline
// ========================================
app.post('/api/generate-estimate', async (req, res) => {
  try {
    const parsed = GenerateSchema.parse(req.body);
    const { customer, vehicle, description, obdCodes, customerStates, mechanicNotices } = parsed;
    const laborRate = parsed.laborRate || DEFAULT_LABOR_RATE;

    // ── Normalize exclusions ──────────────────────────────────────────
    const otherExclusions = parsed.otherExclusions
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const exclusions = [...parsed.exclusions, ...otherExclusions];

    console.log(`[ESTIMATE v4.1] ${customer.name} | ${vehicle || 'N/A'} | Exclusions: ${exclusions.length}`);
    console.log(`[EXCLUSIONS] ${exclusions.join(', ') || 'None'}`);

    // Run pre-analysis
    const evidence = analyzeEvidence({ obdCodes, customerStates, mechanicNotices });
    console.log(`[ENGINE] JobType:${evidence.overallJobType} | Confidence:${evidence.totalConfidence}% | Repairs: ${evidence.detectedRepairs.length}`);
    evidence.detectedRepairs.forEach(r => {
      console.log(`  → ${r.repair} (${r.confidence}%) via: ${r.triggeredBy.join(', ')}`);
    });

    // ── AGENT 1: FOREMAN ──────────────────────────────────────────────
    console.log('[AGENT] 🤖 Foreman dispatching...');
    const foremanPrompt = buildForemanPrompt({
      customer, vehicle, description, obdCodes, customerStates, mechanicNotices, laborRate, exclusions
    });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'You are an expert automotive estimator and mobile mechanic. Return ONLY valid JSON. No markdown. No extra text.' },
          { role: 'user', content: foremanPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.1
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Groq API ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error('No AI response from Groq');

    let cleanText = text.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
    const jsonText  = jsonMatch ? jsonMatch[0] : cleanText;

    let estimate;
    try {
      estimate = JSON.parse(jsonText);
    } catch (err) {
      console.error('[JSON PARSE ERROR]', text.substring(0, 300));
      return res.status(500).json({ error: 'AI returned invalid JSON', raw: text.substring(0, 500) });
    }

    console.log(`[FOREMAN] JobType: ${estimate.jobType} | Parts: ${estimate.parts?.length || 0} | Hours: ${estimate.laborHours}`);

    // ── AGENT 2: AUDITOR ──────────────────────────────────────────────
    console.log('[AGENT] 🔍 Auditor reviewing...');
    const auditorResult = runAuditorAgent({ foremanEstimate: estimate, exclusions, evidence });

    auditorResult.notes.forEach(note => console.log(`[AUDITOR] ${note}`));
    console.log(`[AUDITOR] Status: ${auditorResult.passed ? 'PASS' : 'FLAGGED'} | Flagged: ${auditorResult.flagged.length}`);

    // ── Post-process ──────────────────────────────────────────────────
    estimate.laborRate = laborRate;

    // Flat-rate override
    if (description) {
      const flatMatch = getFlatRate(description);
      if (flatMatch && typeof flatMatch.hours === 'number') {
        estimate.laborHours = flatMatch.hours;
        console.log(`[FLAT RATE OVERRIDE] ${flatMatch.hours}hrs for "${flatMatch.job}"`);
      }
    }

    // Enforce minimum work steps
    const MIN_STEPS = 5;
    if (!Array.isArray(estimate.workSteps) || estimate.workSteps.length < MIN_STEPS) {
      const detectedWithSteps = evidence.detectedRepairs.find(r => r.workSteps && r.workSteps.length >= MIN_STEPS);
      if (detectedWithSteps) {
        estimate.workSteps = detectedWithSteps.workSteps;
      }
    }

    // Enforce detected parts if AI returned empty on Repair
    if (estimate.jobType === 'Repair' && (!estimate.parts || estimate.parts.length === 0)) {
      const allDetectedParts = evidence.detectedRepairs.flatMap(r => r.parts || []);
      if (allDetectedParts.length > 0) {
        estimate.parts = allDetectedParts;
        console.log('[PARTS FALLBACK] Inserted detected parts — AI returned empty array on Repair job');
      }
    }

    // Enforce minimum warnings
    if (!Array.isArray(estimate.warnings) || estimate.warnings.length === 0) {
      const allWarnings = evidence.detectedRepairs.flatMap(r => r.warnings || []);
      if (allWarnings.length > 0) estimate.warnings = allWarnings.slice(0, 5);
    }

    estimate.shopSuppliesPercent = estimate.shopSuppliesPercent ?? 7;
    estimate.laborHours  = parseFloat(estimate.laborHours || 0);
    estimate.parts       = (estimate.parts || []).map(p => ({ name: p.name || 'Part', cost: Math.round(Number(p.cost || 0)) }));
    estimate.tips        = estimate.tips || [];
    estimate.warnings    = estimate.warnings || [];
    estimate.workSteps   = estimate.workSteps || [];
    estimate.repairSummary = estimate.repairSummary || evidence.detectedRepairs.map(r => ({
      repair: r.repair,
      confidence: r.confidence,
      status: r.confidence >= 60 ? 'Confirmed' : 'Suspected'
    }));

    // ── Build final estimate with exclusion flags ─────────────────────
    const finalItems = estimate.parts.map(part => {
      const audit = isExcluded(part.name, exclusions);
      return {
        name: part.name,
        cost: part.cost,
        excluded: audit.excluded,
        exclusionReason: audit.excluded ? audit.reason : null,
        exclusionMatch: audit.excluded ? audit.matched : null
      };
    });

    const activeParts = finalItems.filter(i => !i.excluded);
    const excludedParts = finalItems.filter(i => i.excluded);

    // ── Totals ──────────────────────────────────────────────────────────
    const laborCost             = Number((estimate.laborHours * estimate.laborRate).toFixed(2));
    const partsCost             = activeParts.reduce((s, p) => s + Number(p.cost || 0), 0);
    const shopSupplies          = Number((partsCost * (estimate.shopSuppliesPercent / 100)).toFixed(2));
    const subtotal              = Number((laborCost + partsCost + shopSupplies).toFixed(2));
    const taxRate               = 28;
    const recommendedTaxSetaside = Number((subtotal * 0.28).toFixed(2));
    const netAfterTax           = Number((subtotal - recommendedTaxSetaside).toFixed(2));

    // ── Customer upsert ──────────────────────────────────────────────────
    let customerRecord = null;
    if (customer.email) {
      const { data: d } = await supabase.from('customers').select('*').eq('email', customer.email).limit(1);
      if (d && d.length) customerRecord = d[0];
    }
    if (!customerRecord && customer.phone) {
      const { data: d } = await supabase.from('customers').select('*').eq('phone', customer.phone).limit(1);
      if (d && d.length) customerRecord = d[0];
    }
    if (!customerRecord) {
      const { data: d, error: e } = await supabase.from('customers')
        .insert({ name: customer.name, phone: customer.phone || null, email: customer.email || null })
        .select().single();
      if (e) throw e;
      customerRecord = d;
    }

    // ── Save job ─────────────────────────────────────────────────────────
    const { data: savedJob, error: jobErr } = await supabase.from('jobs').insert({
      customer_id:                    customerRecord.id,
      status:                         'estimate',
      description:                    estimate.shortDescription || description || 'Diagnostic Estimate',
      raw_description:                description || 'Multi-input system generated',
      job_type:                       estimate.jobType || 'Auto Repair',
      vehicle:                        vehicle || null,
      estimated_labor_hours:          estimate.laborHours,
      estimated_labor_rate:           estimate.laborRate,
      estimated_labor_cost:           laborCost,
      estimated_parts:                activeParts,
      estimated_parts_cost:           partsCost,
      estimated_shop_supplies_percent: estimate.shopSuppliesPercent,
      estimated_shop_supplies_cost:   shopSupplies,
      estimated_subtotal:             subtotal,
      estimated_tax_setaside:         recommendedTaxSetaside,
      tax_year:                       new Date().getFullYear(),
      tax_rate:                       taxRate,
      timeline:                       estimate.timeline || 'TBD',
      work_steps:                     estimate.workSteps,
      notes:                          estimate.notes || '',
      exclusions:                     exclusions,
      auditor_status:                 auditorResult.passed ? 'PASS' : 'FLAGGED',
      auditor_notes:                  auditorResult.notes
    }).select().single();

    if (jobErr) throw jobErr;

    console.log(`[SAVED] Job ${savedJob.id} | $${subtotal} | ${estimate.jobType} | Auditor: ${auditorResult.passed ? 'PASS' : 'FLAGGED'}`);

    res.json({
      ok: true,
      foreman: {
        jobType: estimate.jobType,
        laborHours: estimate.laborHours,
        laborRate: estimate.laborRate,
        partsCount: estimate.parts.length,
        confidence: evidence.totalConfidence,
        reasoning: estimate.notes || 'No reasoning provided'
      },
      auditor: {
        status: auditorResult.passed ? 'PASS' : 'FLAGGED',
        flagged: auditorResult.flagged,
        approved: auditorResult.approved,
        notes: auditorResult.notes
      },
      estimate: {
        ...estimate,
        parts: finalItems,
        activeParts,
        excludedParts,
        laborCost,
        partsCost,
        shopSupplies,
        subtotal,
        taxRate,
        recommendedTaxSetaside,
        netAfterTax
      },
      engineAnalysis: {
        overallJobType:   evidence.overallJobType,
        totalConfidence:  evidence.totalConfidence,
        detectedRepairs:  evidence.detectedRepairs.map(r => ({ repair: r.repair, confidence: r.confidence, triggeredBy: r.triggeredBy })),
        symptomInsights:  evidence.symptomInsights,
        multiRepair:      evidence.hasMultipleRepairs
      },
      savedJob,
      customer: customerRecord
    });

  } catch (err) {
    console.error('[ESTIMATE ERROR]', err);
    res.status(500).json({ 
      ok: false,
      error: process.env.NODE_ENV === 'production' 
        ? 'Estimate generation failed' 
        : err.message 
    });
  }
});

// ========================================
// CUSTOMERS
// ========================================
app.get('/api/customers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('customers').select('*').order('name', { ascending: true });
    if (error) throw error;
    res.json({ ok: true, customers: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================================
// ACCESS CODE VALIDATION
// ========================================
app.post('/api/validate-access', async (req, res) => {
  try {
    const { accessCode } = req.body;
    if (!accessCode?.trim()) return res.json({ valid: false, error: 'Access code required' });
    const code = accessCode.trim().toUpperCase();
    const { data, error } = await supabase.from('access_codes').select('*').eq('code', code).eq('is_active', true).single();
    if (error || !data) return res.json({ valid: false, error: 'Invalid or expired code' });
    if (data.expires_at && new Date(data.expires_at) < new Date()) return res.json({ valid: false, error: 'Code expired' });
    if (data.max_uses && data.current_uses >= data.max_uses) return res.json({ valid: false, error: 'Max uses reached' });
    await supabase.from('access_codes').update({ current_uses: (data.current_uses || 0) + 1, last_used_at: new Date().toISOString() }).eq('id', data.id);
    res.json({ valid: true, tier: data.tier || 'pro', customer: data.customer_name || 'Pro User', expires: data.expires_at, message: `Welcome to SKSK ProTech ${data.tier === 'pro_plus' ? 'Pro Plus' : 'Pro'}!` });
  } catch (err) {
    res.status(500).json({ valid: false, error: 'Server error' });
  }
});

// ========================================
// VIN LOOKUP
// ========================================
app.get('/api/vin-lookup/:vin', async (req, res) => {
  try {
    const vin = req.params.vin.trim().toUpperCase();
    if (vin.length !== 17) return res.status(400).json({ ok: false, error: 'VIN must be 17 characters' });
    const nhtsaUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVin/${vin}?format=json`;
    const response = await fetch(nhtsaUrl);
    if (!response.ok) throw new Error('NHTSA API failed');
    const data = await response.json();
    if (!data.Results?.length) return res.json({ ok: false, error: 'VIN not found' });
    const getField = (id) => data.Results.find(r => r.VariableId === id)?.Value || null;
    const year = getField(29) || getField(26);
    const make = getField(26);
    const model = getField(28);
    const trim = getField(109);
    const displacement = getField(11);
    const cylinders = getField(9);
    const driveType = getField(15);
    let displayString = [year, make, model, trim, (displacement && cylinders) ? `${displacement}L V${cylinders}` : null].filter(Boolean).join(' ');
    res.json({ ok: true, vin, year, make, model, trim, displacement, cylinders, driveType, displayString: displayString.trim() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ========================================
// JOBS
// ========================================
app.get('/api/jobs', async (req, res) => {
  const { data, error } = await supabase.from('jobs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

// ========================================
// STRIPE
// ========================================
const PRICING = {
  pro_monthly: { price: 2900, interval: 'month', name: 'SKSK ProTech Pro - Monthly' },
  pro_yearly:  { price: 29000, interval: 'year',  name: 'SKSK ProTech Pro - Yearly' }
};

function generateAccessCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

app.post('/api/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });
  try {
    const { plan, customerEmail, customerName } = req.body;
    if (!plan || !PRICING[plan]) return res.status(400).json({ error: 'Invalid plan' });
    const pricing = PRICING[plan];
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: customerEmail || undefined,
      client_reference_id: customerName || undefined,
      line_items: [{ price_data: { currency: 'usd', product_data: { name: pricing.name, description: 'Unlimited estimates, customer DB, VIN lookup, invoices, tax reports' }, unit_amount: pricing.price, recurring: { interval: pricing.interval } }, quantity: 1 }],
      success_url: `${FRONTEND_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}?canceled=true`,
      metadata: { plan, tier: 'pro' }
    });
    res.json({ ok: true, sessionId: session.id, url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe) return res.status(500).send('Stripe not configured');
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const code = generateAccessCode();
      await supabase.from('access_codes').insert({ code, tier: 'pro', customer_name: session.client_reference_id || session.customer_email, email: session.customer_email, is_active: true, max_uses: 999, stripe_customer_id: session.customer, stripe_subscription_id: session.subscription, stripe_subscription_status: 'active' });
      console.log(`[ACCESS CODE] ${code} for ${session.customer_email}`);
    } else if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      await supabase.from('access_codes').update({ is_active: ['active','trialing'].includes(sub.status), stripe_subscription_status: sub.status }).eq('stripe_subscription_id', sub.id);
    } else if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await supabase.from('access_codes').update({ is_active: false, stripe_subscription_status: 'canceled' }).eq('stripe_subscription_id', sub.id);
    }
  } catch (err) {
    console.error('[WEBHOOK HANDLER ERROR]', err);
  }
  res.json({ received: true });
});

// ========================================
// START
// ========================================
app.listen(PORT, () => {
  console.log(`🔥 SKSK ProTech Backend v4.1 on port ${PORT}`);
  console.log(`🔬 Multi-repair detection engine active`);
  console.log(`🎯 Layer-weighted diagnosis (mechanic > OBD > customer)`);
  console.log(`🚫 Exclusion-aware AI prompting enabled`);
  console.log(`🤖 Foreman + 🔍 Auditor dual-agent pipeline active`);
  if (stripe) console.log(`💳 Stripe payments enabled`);
});
