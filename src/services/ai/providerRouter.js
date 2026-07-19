const groq = require('./providers/groq');

const providers = {
  groq
};

let activeProvider = 'groq';

function getProvider() {
  const provider = providers[activeProvider];
  if (!provider) throw new Error("No active provider set: " + activeProvider);
  return provider;
}

function setProvider(name) {
  if (!providers[name]) throw new Error("Unknown provider: " + name);
  activeProvider = name;
}

async function routeProvider(payload) {
  return getProvider().chat(payload);
}

module.exports = {
  routeProvider,
  setProvider
};
