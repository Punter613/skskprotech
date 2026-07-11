const { groqChat } = require('../../groq');

async function chat(messages, options = {}) {
  return groqChat(messages, options);
}

module.exports = { chat };
