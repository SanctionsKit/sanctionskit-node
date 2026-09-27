import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import test from 'node:test';
import { verifyWebhook } from '../dist/index.js';
import { receiveWebhook } from '../examples/webhook-receiver.mjs';

const secret = 'c2FuY3Rpb25za2l0LWV4YW1wbGU=';
const now = 1700000000;
const rawBody = new TextEncoder().encode('{"id":"event-1","name":"Café 東京"}\n');
const headers = {
  'Webhook-Id': 'event-1',
  'Webhook-Timestamp': String(now),
  'Webhook-Signature': 'v1=10af95720760d7ebf5d7fbd6bac4b6a5ed3897a5a5da344af6e643e3e3ea243c',
};

function sign(body, { id = 'event-1', timestamp = now, signingSecret = secret } = {}) {
  return {
    'Webhook-Id': id,
    'Webhook-Timestamp': String(timestamp),
    'Webhook-Signature': `v1=${createHmac('sha256', signingSecret).update(`${id}.${timestamp}.`).update(body).digest('hex')}`,
  };
}

test('verifies a known signature using the literal secret and exact UTF-8 bytes', () => {
  assert.equal(verifyWebhook(secret, headers, rawBody, { now }), true);
  assert.equal(verifyWebhook(secret, new Headers(headers), Buffer.from(rawBody), { now }), true);
  assert.equal(verifyWebhook(Buffer.from(secret, 'base64').toString(), headers, rawBody, { now }), false);
  const commonJS = createRequire(import.meta.url)('../dist/cjs/index.js');
  assert.equal(commonJS.verifyWebhook(secret, headers, rawBody, { now }), true);
});

test('uses only the supplied byte view, without decoding its contents', () => {
  const backing = Uint8Array.of(1, 255, 0, 128, 2);
  const body = backing.subarray(1, 4);
  assert.equal(verifyWebhook(secret, sign(body), body, { now }), true);
  assert.equal(verifyWebhook(secret, sign(body), backing, { now }), false);
});

test('rejects altered whitespace, payload, event ID, timestamp, and secret', () => {
  const changedWhitespace = new TextEncoder().encode('{ "id":"event-1","name":"Café 東京"}\n');
  const changedPayload = new TextEncoder().encode('{"id":"event-1","name":"Café Paris"}\n');
  assert.equal(verifyWebhook(secret, headers, changedWhitespace, { now }), false);
  assert.equal(verifyWebhook(secret, headers, changedPayload, { now }), false);
  assert.equal(verifyWebhook(secret, { ...headers, 'Webhook-Id': 'event-2' }, rawBody, { now }), false);
  assert.equal(verifyWebhook(secret, { ...headers, 'Webhook-Timestamp': String(now + 1) }, rawBody, { now }), false);
  assert.equal(verifyWebhook('another-secret', headers, rawBody, { now }), false);
});

test('accepts case-insensitive header records and rejects duplicate header names', () => {
  const lower = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  assert.equal(verifyWebhook(secret, lower, rawBody, { now }), true);
  for (const name of Object.keys(headers)) {
    const duplicate = { ...headers, [name.toLowerCase()]: headers[name] };
    assert.equal(verifyWebhook(secret, duplicate, rawBody, { now }), false);
    const combined = new Headers(headers);
    combined.append(name, headers[name]);
    assert.equal(verifyWebhook(secret, combined, rawBody, { now }), false);
  }
});

test('rejects missing, malformed, or ambiguous request headers', () => {
  for (const name of Object.keys(headers)) {
    const missing = { ...headers };
    delete missing[name];
    assert.equal(verifyWebhook(secret, missing, rawBody, { now }), false);
    assert.equal(verifyWebhook(secret, { ...headers, [name]: '' }, rawBody, { now }), false);
  }
  for (const timestamp of ['-1', '+1700000000', '1700000000.0', '1.7e9', ' 1700000000', '1700000000 ', 'NaN', 'Infinity', '9007199254740992']) {
    assert.equal(verifyWebhook(secret, sign(rawBody, { timestamp }), rawBody, { now }), false);
  }
  for (const id of [' ', 'event-1,event-2', 'event-1\nevent-2', 'event-1\0', 'event-1 event-2']) {
    assert.equal(verifyWebhook(secret, sign(rawBody, { id }), rawBody, { now }), false);
  }
  for (const signature of ['v2=' + 'a'.repeat(64), 'v1=' + 'a'.repeat(63), 'v1=' + 'a'.repeat(65), 'v1=' + 'z'.repeat(64), headers['Webhook-Signature'].toUpperCase(), headers['Webhook-Signature'] + ', ' + headers['Webhook-Signature']]) {
    assert.equal(verifyWebhook(secret, { ...headers, 'Webhook-Signature': signature }, rawBody, { now }), false);
  }
  assert.equal(verifyWebhook(secret, null, rawBody, { now }), false);
  assert.equal(verifyWebhook(secret, { ...headers, 'Webhook-Timestamp': now }, rawBody, { now }), false);
});

test('enforces the timestamp window in both directions including exact boundaries', () => {
  for (const difference of [-301, -300, 0, 300, 301]) {
    const signed = sign(rawBody, { timestamp: now + difference });
    assert.equal(verifyWebhook(secret, signed, rawBody, { now }), Math.abs(difference) <= 300);
  }
  assert.equal(verifyWebhook(secret, headers, rawBody, { now, toleranceSeconds: 0 }), true);
  assert.equal(verifyWebhook(secret, headers, rawBody, { now: now + 1, toleranceSeconds: 0 }), false);
  assert.equal(verifyWebhook(secret, headers, rawBody, { now: now + 600, toleranceSeconds: 600 }), true);
});

test('uses the current clock by default', (t) => {
  t.mock.method(Date, 'now', () => now * 1000 + 999);
  assert.equal(verifyWebhook(secret, headers, rawBody), true);
});

test('rejects invalid configuration and bodies without exposing values', () => {
  for (const invalidSecret of ['', undefined, null, 42]) {
    assert.throws(() => verifyWebhook(invalidSecret, headers, rawBody, { now }), TypeError);
  }
  for (const body of ['already decoded', {}, rawBody.buffer, undefined]) {
    assert.throws(() => verifyWebhook(secret, headers, body, { now }), TypeError);
  }
  for (const value of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '300', null]) {
    assert.throws(() => verifyWebhook(secret, headers, rawBody, { now: value }), TypeError);
    assert.throws(() => verifyWebhook(secret, headers, rawBody, { now, toleranceSeconds: value }), TypeError);
  }
  assert.throws(() => verifyWebhook(secret, headers, rawBody, null), TypeError);
  assert.throws(() => verifyWebhook(secret, headers, rawBody, []), TypeError);
});

function eventBody(overrides = {}) {
  return new TextEncoder().encode(JSON.stringify({
    id: 'event-1',
    type: 'screening.completed',
    environment: 'sandbox',
    data: { screeningId: 'screening-1', status: 'no_match' },
    createdAt: '2023-11-14T22:13:20.000Z',
    ...overrides,
  }));
}

function request(body, headerOverrides = {}) {
  return new Request('https://example.com/webhooks/sanctionskit', {
    method: 'POST',
    headers: { ...sign(body, { timestamp: Math.floor(Date.now() / 1000) }), ...headerOverrides },
    body,
  });
}

test('receiver passes verified events to the persistence hook and accepts duplicates', async () => {
  const saved = [];
  const queued = [];
  let accepted = 0;
  const persistAndEnqueue = async (event) => {
    accepted += 1;
    if (saved.some((row) => row.id === event.id && row.environment === event.environment)) return;
    saved.push(event);
    queued.push(event.id);
  };
  const body = eventBody();
  assert.equal((await receiveWebhook(request(body), { secret, persistAndEnqueue })).status, 204);
  const laterDelivery = sign(body, { timestamp: Math.floor(Date.now() / 1000) + 1 });
  assert.equal((await receiveWebhook(request(body, laterDelivery), { secret, persistAndEnqueue })).status, 204);
  assert.equal(accepted, 2);
  assert.equal(saved.length, 1);
  assert.deepEqual(queued, ['event-1']);
});

test('receiver acknowledges only after the persistence hook completes', async () => {
  let release;
  const committed = new Promise((resolve) => { release = resolve; });
  let finished = false;
  const pending = receiveWebhook(request(eventBody()), {
    secret,
    persistAndEnqueue: () => committed,
  }).then((response) => { finished = true; return response; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(finished, false);
  release();
  assert.equal((await pending).status, 204);
});

test('receiver never persists unsigned, mismatched, or malformed events', async () => {
  let calls = 0;
  const options = { secret, persistAndEnqueue: async () => { calls += 1; } };
  const invalidSignature = await receiveWebhook(request(eventBody(), { 'Webhook-Signature': 'v1=' + '0'.repeat(64) }), options);
  assert.equal(invalidSignature.status, 400);
  for (const body of [
    eventBody({ id: 'another-event' }),
    eventBody({ environment: 'unknown' }),
    eventBody({ type: '' }),
    eventBody({ data: [] }),
    new TextEncoder().encode('{'),
    Uint8Array.of(255),
    new TextEncoder().encode('null'),
  ]) {
    const response = await receiveWebhook(request(body), options);
    assert.equal(response.status, 400);
  }
  assert.equal(calls, 0);
});

test('receiver returns 503 when durable acceptance fails without exposing details', async () => {
  const response = await receiveWebhook(request(eventBody()), {
    secret,
    persistAndEnqueue: async () => { throw new Error('Private database details'); },
  });
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'Storage unavailable');
});
