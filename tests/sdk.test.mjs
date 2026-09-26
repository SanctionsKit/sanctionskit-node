import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { inspect } from 'node:util';
import test from 'node:test';
import SanctionsKit, { SanctionsKit as NamedSanctionsKit, SanctionsKitError } from '../dist/index.js';

const apiKey = 'sk_test_example_not_a_real_key';
const screening = {
  subject: { name: 'Example Trading', entityType: 'organization' },
  package: 'sandbox@1',
};

function mockClient(respond = () => Response.json({ data: [] }), options = {}) {
  const calls = [];
  const client = new SanctionsKit({
    apiKey,
    ...options,
    fetch: async (input, init) => {
      const request = new Request(input, init);
      calls.push(request);
      return respond(request);
    },
  });
  return { client, calls };
}

function waitForAbort(input, init) {
  const { signal } = new Request(input, init);
  return new Promise((resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  });
}

test('ES modules and CommonJS expose the client and error class', () => {
  assert.equal(SanctionsKit, NamedSanctionsKit);
  const require = createRequire(import.meta.url);
  const commonJS = require('../dist/cjs/index.js');
  assert.equal(typeof commonJS.SanctionsKit, 'function');
  assert.equal(commonJS.default, commonJS.SanctionsKit);
  assert.equal(typeof commonJS.SanctionsKitError, 'function');
});

test('uses the production API with bearer authentication and rejects redirects', async () => {
  const { client, calls } = mockClient();
  await client.sources.list();
  const request = calls[0];
  assert.equal(request.url, 'https://www.sanctionskit.com/api/v1/sources');
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.get('authorization'), `Bearer ${apiKey}`);
  assert.equal(request.headers.get('accept'), 'application/json');
  assert.equal(request.redirect, 'error');
  assert.equal(request.body, null);
});

test('encodes filters and preserves false, zero, and a base URL path', async () => {
  const { client, calls } = mockClient(undefined, { baseURL: 'http://localhost:3000/custom/v1/' });
  const filters = { limit: 0, summary: false, q: 'A & B/Example', cursor: undefined };
  await client.results.list(filters);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/custom/v1/results');
  assert.equal(url.searchParams.get('limit'), '0');
  assert.equal(url.searchParams.get('summary'), 'false');
  assert.equal(url.searchParams.get('q'), 'A & B/Example');
  assert.equal(url.searchParams.has('cursor'), false);
  assert.deepEqual(filters, { limit: 0, summary: false, q: 'A & B/Example', cursor: undefined });
});

test('sends the screening body and caller idempotency key unchanged', async () => {
  const response = { data: { id: 'screening-1', status: 'no_match' } };
  const { client, calls } = mockClient(() => Response.json(response));
  const actual = await client.screenings.create(screening, { idempotencyKey: 'screening-example-1' });
  assert.deepEqual(actual, response);
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.get('content-type'), 'application/json');
  assert.equal(calls[0].headers.get('idempotency-key'), 'screening-example-1');
  assert.deepEqual(await calls[0].json(), screening);
});

test('maps each resource method to its documented endpoint', async () => {
  const { client, calls } = mockClient();
  const methods = [
    [() => client.policies.list({ limit: 5, cursor: 'policy cursor' }), 'GET', '/policies?limit=5&cursor=policy+cursor'],
    [() => client.policies.retrieve('policy-1'), 'GET', '/policies/policy-1'],
    [() => client.results.list({ summary: true, status: 'no_match', review: 'unreviewed', origin: 'api' }), 'GET', '/results?summary=true&status=no_match&review=unreviewed&origin=api'],
    [() => client.results.retrieve('result-1'), 'GET', '/results/result-1'],
    [() => client.results.evidence('result-1'), 'GET', '/results/result-1/evidence'],
    [() => client.batches.create({ name: 'Example batch', subjects: [screening] }, { idempotencyKey: 'batch-example-1' }), 'POST', '/batches'],
    [() => client.batches.list({ limit: 10, cursor: 'batch-1' }), 'GET', '/batches?limit=10&cursor=batch-1'],
    [() => client.batches.retrieve('batch-1', { limit: 25, offset: 0 }), 'GET', '/batches/batch-1?limit=25&offset=0'],
    [() => client.batches.cancel('batch-1'), 'DELETE', '/batches/batch-1'],
    [() => client.usage.retrieve(), 'GET', '/usage'],
  ];
  for (const [invoke, method, path] of methods) {
    await invoke();
    const request = calls.at(-1);
    assert.equal(request.method, method);
    assert.equal(request.url, `https://www.sanctionskit.com/api/v1${path}`);
  }
  assert.equal(calls.length, methods.length);
});

test('returns the evidence object without changing its envelope', async () => {
  const evidence = { format: 'sanctionskit-evidence@1', result: { id: 'result-1' }, retainedInputs: false };
  const { client } = mockClient(() => Response.json(evidence));
  assert.deepEqual(await client.results.evidence('result-1'), evidence);
});

test('encodes resource IDs as a single path segment', async () => {
  const { client, calls } = mockClient();
  await client.results.retrieve('result/with ?#%');
  assert.equal(new URL(calls[0].url).pathname, '/api/v1/results/result%2Fwith%20%3F%23%25');
  assert.equal(new URL(calls[0].url).search, '');
});

test('rejects empty and dot-segment IDs before sending a request', async () => {
  const { client, calls } = mockClient();
  for (const id of ['', '.', '..']) {
    await assert.rejects(async () => client.results.retrieve(id), TypeError);
  }
  assert.equal(calls.length, 0);
});

test('requires a valid idempotency key for screening and batch creation', async () => {
  const { client, calls } = mockClient();
  for (const options of [undefined, {}, { idempotencyKey: '' }, { idempotencyKey: 'short' }, { idempotencyKey: 'invalid key' }, { idempotencyKey: 'bad\r\nheader' }]) {
    await assert.rejects(async () => client.screenings.create(screening, options), TypeError);
    await assert.rejects(async () => client.batches.create({ name: 'Example batch', subjects: [screening] }, options), TypeError);
  }
  assert.equal(calls.length, 0);
});

test('exposes API error metadata without retaining the request or key', async () => {
  const details = [{ path: 'subject.name', message: 'Name is required.' }];
  const { client, calls } = mockClient(() => Response.json({
    error: { code: 'validation_error', message: 'Check the submitted fields.', requestId: 'request-body-id', details },
  }, { status: 422, headers: { 'x-request-id': 'request-header-id', 'retry-after': '15' } }));
  await assert.rejects(client.screenings.create(screening, { idempotencyKey: 'screening-example-1' }), (error) => {
    assert.ok(error instanceof SanctionsKitError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'validation_error');
    assert.equal(error.message, 'Check the submitted fields.');
    assert.equal(error.requestId, 'request-body-id');
    assert.equal(error.retryAfter, '15');
    assert.deepEqual(error.details, details);
    assert.equal(inspect(error).includes(apiKey), false);
    assert.equal(JSON.stringify(error).includes(apiKey), false);
    assert.equal('request' in error, false);
    return true;
  });
  assert.equal(calls.length, 1);
});

test('does not retry rate limits or server failures', async () => {
  for (const status of [429, 503]) {
    const { client, calls } = mockClient(() => Response.json({
      error: { code: status === 429 ? 'rate_limited' : 'temporarily_unavailable', message: 'Try again later.' },
    }, { status, headers: { 'x-request-id': 'request-1', 'retry-after': '30' } }));
    await assert.rejects(client.usage.retrieve(), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.requestId, 'request-1');
      assert.equal(error.retryAfter, '30');
      return true;
    });
    assert.equal(calls.length, 1);
  }
});

test('reports non-JSON HTTP failures without including their body', async () => {
  const { client } = mockClient(() => new Response(`<html>${apiKey}</html>`, {
    status: 502,
    headers: { 'content-type': 'text/html', 'x-request-id': 'proxy-request-1' },
  }));
  await assert.rejects(client.sources.list(), (error) => {
    assert.ok(error instanceof SanctionsKitError);
    assert.equal(error.status, 502);
    assert.equal(error.code, 'http_error');
    assert.equal(error.requestId, 'proxy-request-1');
    assert.equal(inspect(error).includes(apiKey), false);
    assert.equal(error.message.includes('<html>'), false);
    return true;
  });
});

test('reports invalid JSON in a successful response', async () => {
  const { client } = mockClient(() => new Response('{', { status: 200 }));
  await assert.rejects(client.sources.list(), (error) => {
    assert.ok(error instanceof SanctionsKitError);
    assert.equal(error.status, 200);
    assert.equal(error.code, 'invalid_response');
    return true;
  });
});

test('preserves network errors and makes one attempt', async () => {
  const failure = new TypeError('Network unavailable');
  const { client, calls } = mockClient(() => { throw failure; });
  await assert.rejects(client.usage.retrieve(), (error) => error === failure);
  assert.equal(calls.length, 1);
});

test('aborts a request when its timeout expires', async () => {
  const client = new SanctionsKit({ apiKey, timeoutMs: 1000, fetch: waitForAbort });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(client.usage.retrieve({ timeoutMs: 5 }), (error) => error.name === 'TimeoutError');
  } finally {
    clearTimeout(keepAlive);
  }
});

test('preserves caller cancellation and an already aborted signal', async () => {
  const client = new SanctionsKit({ apiKey, fetch: waitForAbort });
  const controller = new AbortController();
  const reason = new Error('Cancelled by caller');
  const pending = client.usage.retrieve({ signal: controller.signal });
  controller.abort(reason);
  await assert.rejects(pending, (error) => error === reason);
  await assert.rejects(client.usage.retrieve({ signal: controller.signal }), (error) => error === reason);
});

test('rejects unsafe configuration before any network request', () => {
  for (const invalidKey of ['', '   ', 'key\r\nother-header: value']) {
    assert.throws(() => new SanctionsKit({ apiKey: invalidKey }), TypeError);
  }
  for (const baseURL of ['http://example.com/api/v1', 'https://user:password@example.com/api/v1', 'https://example.com/api/v1?token=value', 'https://example.com/api/v1#fragment', 'file:///tmp/api']) {
    assert.throws(() => new SanctionsKit({ apiKey, baseURL }), TypeError);
  }
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 2147483648]) {
    assert.throws(() => new SanctionsKit({ apiKey, timeoutMs }), TypeError);
  }
});
