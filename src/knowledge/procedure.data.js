/**
 * SKSK ProTech - Localized Technical Extraction Registry
 * Hardened mechanical procedure blocks mapped straight to link protocols.
 */

const PROCEDURE_DB = {
  'FORD_54_TRITON_SPARK_PLUG': {
    protocolId: 'FORD_54_TRITON_SPARK_PLUG',
    requiredTools: [
      '9/16" specialized extension spark plug socket',
      'Lisle 65600 Broken Spark Plug Remover Kit',
      'Carburetor cleaner / penetrating solvent',
      'In-lb and ft-lb torque wrenches'
    ],
    clearanceSteps: [
      'Blow out all debris from spark plug wells before loosening component bodies.',
      'Back off each spark plug approximately 1/8 to 1/4 turn only while engine is lukewarm.',
      'Fill spark plug cavity with penetrating solvent or carburetor cleaner to dissolve carbon bonds around the lower shroud; let sit for minimum 30-45 minutes.',
      'Slowly work plug out using back-and-forth counter movements. If separation occurs, deploy the Lisle tool assembly to draw out the isolated ground shield sleeves.'
    ],
    criticalSpecs: {
      torqueSequence: '25 ft-lbs (34 Nm) clean and completely dry thread specification.',
      antiseizeNote: 'Apply nickel anti-seize strictly to the smooth ground shield barrel only; do NOT contaminate plug threads or electrode surfaces.'
    }
  },
  'RAM_57_HEMI_CAM_LIFTER': {
    protocolId: 'RAM_57_HEMI_CAM_LIFTER',
    requiredTools: [
      'Pushrod organization tray',
      'Valve spring compressor utility tool',
      'Magnetic lifter extraction wand tool',
      'New head gasket and cylinder head bolt tracking sets'
    ],
    clearanceSteps: [
      'Isolate and disconnect vehicle power system before stripping top engine covers.',
      'Remove intake manifold, valve covers, rocker arm shaft assemblies, and pushrods (keep pushrods strictly matched to original operational layout locations).',
      'Extract cylinder head assemblies to gain physical path clearance to the internal lifter plastic guide yokes.',
      'Inspect the specific target cylinder lifter roller wheel for flat spots or needle bearing destruction. Examine camshaft lobes for localized scarring or metal degradation.'
    ],
    criticalSpecs: {
      headBoltTorque: '70 ft-lbs final pass sequence combined with specific angle turn procedures.',
      lubricationRule: 'Soak all replacement lifter assemblies in clean engine oil for minimum 2 hours prior to block insertion.'
    }
  }
};

function getLocalProcedure(protocolId) {
  return PROCEDURE_DB[protocolId] || null;
}

module.exports = { getLocalProcedure, PROCEDURE_DB };
