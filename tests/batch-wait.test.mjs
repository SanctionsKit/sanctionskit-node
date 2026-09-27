import assert from 'node:assert/strict';
import test from 'node:test';
import { SanctionsKit, SanctionsKitError } from '../dist/index.js';

function clientWith(fetch, options = {}) {
  return new SanctionsKit({ apiKey: 'test-key', fetch, ...options });
}

function batchResponse(status) {
  return Response.json({ data: {
    id: 'batch-1', environment: 'sandbox', name: 'Example', status,
    total: 1, completed: status === 'completed' ? 1 : 0, failed: status === 'failed' ? 1 : 0,
    created_at: '2026-09-27T00:00:00.000Z', cancelled_at: null,
    rows: [{ row_number: 1, status: status === 'failed' ? 'failed' : 'pending', screening_id: null, error: null }],
    nextOffset: null,
  } });
}

function waitForAbort(_url, options) {
  return new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
}

test('waitForCompletion polls active states and returns the terminal response', async () => {
  const statuses = ['importing', 'pending', 'processing', 'completed'];
  const calls = [];
  const client = clientWith(async (url, options) => {
    calls.push({ url: new URL(url), options });
    return batchResponse(statuses.shift());
  });
  const response = await client.batches.waitForCompletion('batch-1', { pollIntervalMs: 1, timeoutMs: 1000 });
  assert.equal(response.data.status, 'completed');
  assert.equal(response.data.rows.length, 1);
  assert.equal(calls.length, 4);
  assert.ok(calls.every(({ url, options }) => url.pathname === '/api/v1/batches/batch-1' && options.method === 'GET' && options.body === undefined));
});

test('completed, failed, and cancelled batches return immediately', async () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    let calls = 0;
    const client = clientWith(async () => { calls++; return batchResponse(status); });
    const response = await client.batches.waitForCompletion('batch-1');
    assert.equal(response.data.status, status);
    assert.equal(calls, 1);
  }
});

test('waitForCompletion rejects an unknown status', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return batchResponse('unknown'); });
  await assert.rejects(client.batches.waitForCompletion('batch-1'), /unknown batch status/);
  assert.equal(calls, 1);
});

test('the total deadline aborts an in-flight batch request', async () => {
  let signal;
  const client = clientWith((url, options) => { signal = options.signal; return waitForAbort(url, options); });
  await assert.rejects(client.batches.waitForCompletion('batch-1', { timeoutMs: 20 }), { name: 'TimeoutError' });
  assert.equal(signal.aborted, true);
});

test('the total deadline aborts polling sleep without waiting for the interval', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return batchResponse('pending'); });
  await assert.rejects(client.batches.waitForCompletion('batch-1', { timeoutMs: 20, pollIntervalMs: 5000 }), { name: 'TimeoutError' });
  assert.equal(calls, 1);
});

test('the total deadline is not reset by another poll', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  let secondSignal;
  const client = clientWith(async (url, options) => {
    calls++;
    if (calls === 1) return batchResponse('pending');
    secondSignal = options.signal;
    return waitForAbort(url, options);
  });
  const result = client.batches.waitForCompletion('batch-1', { timeoutMs: 40, pollIntervalMs: 10 });
  const rejection = assert.rejects(result, { name: 'TimeoutError' });
  await new Promise(setImmediate);
  assert.equal(calls, 1);
  context.mock.timers.tick(10);
  await new Promise(setImmediate);
  assert.equal(calls, 2);
  context.mock.timers.tick(29);
  assert.equal(secondSignal.aborted, false);
  context.mock.timers.tick(1);
  assert.equal(secondSignal.aborted, true);
  await rejection;
});

test('the client request timeout still applies to each poll', async () => {
  const client = clientWith(waitForAbort, { timeoutMs: 10 });
  await assert.rejects(client.batches.waitForCompletion('batch-1', { timeoutMs: 1000 }), (error) => {
    assert.equal(error.name, 'TimeoutError');
    assert.equal(error.message, 'SanctionsKit request timed out.');
    return true;
  });
});

test('caller cancellation interrupts an in-flight request and preserves its reason', async () => {
  const controller = new AbortController();
  const reason = new Error('Stop waiting');
  const client = clientWith(waitForAbort);
  const result = client.batches.waitForCompletion('batch-1', { signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(result, (error) => error === reason);
});

test('caller cancellation interrupts a polling sleep', async () => {
  const controller = new AbortController();
  let calls = 0;
  const client = clientWith(async () => { calls++; return batchResponse('processing'); });
  const result = client.batches.waitForCompletion('batch-1', { signal: controller.signal, pollIntervalMs: 5000 });
  const timer = setTimeout(() => controller.abort(), 10);
  try {
    await assert.rejects(result, { name: 'AbortError' });
  } finally {
    clearTimeout(timer);
  }
  assert.equal(calls, 1);
});

test('an already cancelled wait makes no request', async () => {
  const controller = new AbortController();
  controller.abort();
  let calls = 0;
  const client = clientWith(async () => { calls++; return batchResponse('completed'); });
  await assert.rejects(client.batches.waitForCompletion('batch-1', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('HTTP and network failures are preserved without another poll or resubmission', async () => {
  const failure = new TypeError('Connection closed');
  for (const fetch of [
    async () => Response.json({ error: { code: 'rate_limited', message: 'Try later.', requestId: 'request-1' } }, { status: 429 }),
    async () => { throw failure; },
  ]) {
    let calls = 0;
    const client = clientWith((url, options) => { calls++; return fetch(url, options); });
    await assert.rejects(client.batches.waitForCompletion('batch-1'), (error) => error === failure || (error instanceof SanctionsKitError && error.code === 'rate_limited'));
    assert.equal(calls, 1);
  }
});

test('wait settings and the batch ID are validated before requesting', async () => {
  let calls = 0;
  const client = clientWith(async () => { calls++; return batchResponse('completed'); });
  for (const invalid of [0, -1, 0.5, Infinity, NaN, 2_147_483_648]) {
    await assert.rejects(client.batches.waitForCompletion('batch-1', { timeoutMs: invalid }), TypeError);
    await assert.rejects(client.batches.waitForCompletion('batch-1', { pollIntervalMs: invalid }), TypeError);
  }
  await assert.rejects(client.batches.waitForCompletion(''), TypeError);
  assert.equal(calls, 0);
});
