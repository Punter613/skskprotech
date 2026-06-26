const { REPAIR_INTELLIGENCE_VAULT } = require('../../knowledge/repair.intelligence.library');

function assembleProtocolAssets(matchedPatterns, trace) {
  trace.log('ASSEMBLER_PROTOCOL', 'Mapping custom shop strategy protocol guides.');
  const protocols = [];
  for (const pattern of matchedPatterns) {
    if (REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]) {
      protocols.push(REPAIR_INTELLIGENCE_VAULT[pattern.linkProtocol]);
    }
  }
  return protocols;
}

module.exports = { assembleProtocolAssets };
