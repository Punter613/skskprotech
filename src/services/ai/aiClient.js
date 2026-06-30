const { routeProvider, setProvider } = require('./providerRouter');

async function aiChat(payload) {
  return routeProvider(payload);
}

module.exports = {
  aiChat,
  setProvider
};
