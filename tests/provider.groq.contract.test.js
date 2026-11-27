'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const groqClient = require('../src/services/groq');
const groqProvider = require('../src/services/ai/providers/groq');

test('Groq provider adapter delegates fallback ownership to providerRouter', async () => {
  const originalGroqChat = groqClient.groqChat;
  let capturedMessages;
  let capturedOptions;

  groqClient.groqChat = async (messages, options) => {
    capturedMessages = messages;
    capturedOptions = options;
    return {
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { total_tokens: 1 },
      _provider: 'groq'
    };
  };

  try {
    const messages = [{ role: 'user', content: 'diagnose this' }];
    const result = await groqProvider.chat({
      messages,
      model: 'openai/gpt-oss-120b',
      temperature: 0.15,
      max_tokens: 800,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' }
    });

    assert.equal(result._provider, 'groq');
    assert.deepEqual(capturedMessages, messages);
    assert.equal(capturedOptions.model, 'openai/gpt-oss-120b');
    assert.equal(capturedOptions.temperature, 0.15);
    assert.equal(capturedOptions.max_tokens, 800);
    assert.equal(capturedOptions.reasoning_effort, 'low');
    assert.deepEqual(capturedOptions.response_format, { type: 'json_object' });
    assert.equal(
      capturedOptions.disable_fallback,
      true,
      'providerRouter must own Groq→Gemini fallback for aiClient calls'
    );
  } finally {
    groqClient.groqChat = originalGroqChat;
  }
});


const { requestGroqCompletion, sanitizeGroqError } = groqClient;
const jsonBody = Object.freeze({
  messages: Object.freeze([{ role: 'user', content: 'synthetic test' }]),
  response_format: Object.freeze({ type: 'json_object' })
});
const validationError = () => Object.assign(new Error('private failed generation'), {
  status: 400, error: { error: { code: 'json_validate_failed', failed_generation: 'private payload' } }
});

test('Groq JSON retry preserves exact body and remaining timeout', async () => {
  const calls = [];
  const result = { choices: [{ message: { content: '{"ok":true}' } }] };
  const times = [1000, 5000];
  assert.equal(await requestGroqCompletion(async (body, config) => {
    calls.push({ body, config });
    if (calls.length === 1) throw validationError();
    return result;
  }, jsonBody, () => times.shift()), result);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, jsonBody);
  assert.equal(calls[1].body, jsonBody);
  assert.deepEqual(calls[1].config, { timeout: 11000, maxRetries: 0 });
});

test('Groq first success never retries', async () => {
  let calls = 0;
  assert.equal(await requestGroqCompletion(async () => ++calls, jsonBody), 1);
  assert.equal(calls, 1);
});

test('Groq second validation failure propagates without third attempt', async () => {
  let calls = 0;
  const second = validationError();
  await assert.rejects(requestGroqCompletion(async () => {
    throw ++calls === 1 ? validationError() : second;
  }, jsonBody, () => 0), error => error === second);
  assert.equal(calls, 2);
});

for (const [name, body, error, elapsed] of [
  ['auth', jsonBody, Object.assign(validationError(), { status: 401 }), 1],
  ['unrelated 400', jsonBody, Object.assign(new Error('json_validate_failed'), { status: 400 }), 1],
  ['non JSON', { messages: jsonBody.messages }, validationError(), 1],
  ['exact cutoff', jsonBody, validationError(), 10000],
  ['slow failure', jsonBody, validationError(), 11000],
  ['clock reversal', jsonBody, validationError(), -1]
]) {
  test('Groq does not retry ' + name, async () => {
    let calls = 0;
    const times = [0, elapsed];
    await assert.rejects(requestGroqCompletion(async () => {
      calls++;
      throw error;
    }, body, () => times.shift()), caught => caught === error);
    assert.equal(calls, 1);
  });
}

test('Groq validation error redaction removes raw payload and preserves classification', () => {
  const safe = sanitizeGroqError(validationError());
  assert.equal(safe.status, 400);
  assert.equal(safe.code, 'json_validate_failed');
  assert.equal(safe.error, undefined);
  assert.equal(safe.cause, undefined);
  assert.doesNotMatch(String(safe.stack) + JSON.stringify(safe), /private|failed_generation/);
});
