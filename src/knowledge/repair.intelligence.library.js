/**
 * SKSK ProTech - Master Repair Intelligence Protocol Library
 * Stores custom, trade-tested field repair procedures and workflow blueprints.
 */

const REPAIR_INTELLIGENCE_VAULT = {
  'FORD_54_TRITON_SPARK_PLUG': {
    patternId: 'FORD_54_TRITON_SPARK_PLUG',
    title: 'Ford 3V 5.4L Triton Spark Plug Field Extraction Protocol',
    estimatedTime: '2.5 - 5.0 Hours (Variable by breakage density)',
    requiredTools: [
      'Motorcraft Extension Plug sockets',
      'Long-reach extraction tap specialized kits',
      'High-grade carbon solvent or penetrating fluid assembly',
      'Custom fabricated all-thread alignment rigging'
    ],
    officialProcedure: 'Apply penetrating fluid to well banks, allow soak. Use factory spark plug removal extension sockets. Slowly extract tool payload at designated torque limit boundaries.',
    shopProcedure: 'Blow debris clean from bores. Apply localized impact vibrational cycles to break carbon bonds. Extract plug bodies. Use standard tool truck porcelain extraction kits if shroud separates.',
    fieldProcedure: 'Blow out wells. Soak bores with deep creep compound for 30 minutes. Cycle plugs back and forth using a hand ratchet. If shroud tears loose, move instantly to specialized thread tapping adapters.',
    lastResortProcedure: 'Execute Shaffer Method: Fracture porcelain shield halfway down the shroud cavity to clear throat lines. Tap directly into the fused sleeve shroud tip with a long tap. Insert custom all-thread locking rig with a top nut to secure the tap alignment and a middle center-nut configuration to pull the sleeve completely clear of the block deck.',
    commonMistakes: [
      'Using high-torque un-metered air impacts on cold cylinder heads, stripping the threads instantly.',
      'Allowing fractured porcelain crumbs to fall deep into the combustion dome chamber without clearing with suction lines.',
      'Forcing extraction tools out dry when threads begin galling.'
    ]
  },
  'GM_53_AFM_LIFTER_REPLACE': {
    patternId: 'GM_53_AFM_LIFTER_REPLACE',
    title: 'GM 5.3L AFM Seized/Collapsed Lifter Field Resolution Protocol',
    estimatedTime: '6.0 - 9.0 Hours',
    requiredTools: [
      'Cylinder head bolt installation kits',
      'Torque angle gauges',
      'VLOM (Valve Lifter Oil Manifold) test validation pressure rigs',
      'Heavy duty pushrod alignment checkers'
    ],
    officialProcedure: 'Remove intake manifold assembly and cylinder heads. Replace all lifter guides and lifter assemblies on affected banks. Discard old single-use head bolts.',
    shopProcedure: 'Pull heads, inspect cam lobes for deep tracking scores. Replace AFM lifters with updated factory items. Replace physical VLOM plate assembly to ensure proper oil solenoid modulation.',
    fieldProcedure: 'Verify dead cylinder path via cylinder balance mapping. Pull cylinder bank head. Inspect pushrod lines for bending parameters. Clean deck faces meticulously before dropping replacement lifter buckets down.',
    lastResortProcedure: 'If high mileage fleet vehicle parameters apply, execute full AFM mechanical delete protocol: Swap lifters for standard non-AFM rollers, plug block oil galleries securely, and flash the ECM module to completely disable software cylinder deactivation commands.',
    commonMistakes: [
      'Replacing collapsed lifters without changing out a contaminated or bleeding VLOM plate solenoid assembly.',
      'Reusing stretched factory cylinder head TTY bolts, causing head deck torque deflection and immediate gasket blowout.'
    ]
  }
};

/**
 * Snaps verified repair procedures straight out of the library core database
 * @param {string} patternId 
 * @returns {Object|null} Complete procedure cards
 */
function getRepairProtocol(patternId) {
  return REPAIR_INTELLIGENCE_VAULT[patternId] || null;
}

module.exports = { getRepairProtocol, REPAIR_INTELLIGENCE_VAULT };
