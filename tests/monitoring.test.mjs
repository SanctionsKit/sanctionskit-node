import assert from 'node:assert/strict';
import test from 'node:test';
import SanctionsKit, { SanctionsKitError } from '../dist/index.js';

const monitorId = '00000000-0000-4000-8000-000000000001';
const eventId = '00000000-0000-4000-8000-000000000002';
const timestamp = '2026-09-27T12:00:00.000Z';
const input = {
  name: 'Example customer',
  subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' },
  package: 'sandbox@1',
};
const writeOptions = { idempotencyKey: 'monitor-example-001' };

function mockClient(body, status = 200) {
  const calls = [];
  const client = new SanctionsKit({
    apiKey: 'sk_test_example_not_a_real_key',
    fetch: async (url, init) => {
      calls.push(new Request(url, init));
      return Response.json(body, { status });
    },
  });
  return { client, calls };
}

const monitor = {
  id: monitorId,
  name: input.name,
  status: 'active',
  last_screening_id: null,
  next_run_at: timestamp,
  created_at: timestamp,
  revision: 1,
  counterparty_id: null,
};

test('creates a monitor with the caller payload and idempotency key', async () => {
  const response = { data: { id: monitorId, name: input.name, status: 'active' } };
  const { client, calls } = mockClient(response, 201);
  assert.deepEqual(await client.monitors.create(input, writeOptions), response);
  const request = calls[0];
  assert.equal(request.method, 'POST');
  assert.equal(request.url, 'https://www.sanctionskit.com/api/v1/monitors');
  assert.equal(request.headers.get('idempotency-key'), writeOptions.idempotencyKey);
  assert.deepEqual(await request.json(), input);
  assert.equal(calls.length, 1);
});

test('lists, retrieves and deletes monitors without changing raw response fields', async () => {
  const cases = [
    {
      invoke: (client) => client.monitors.list({ limit: 10, cursor: monitorId }),
      method: 'GET',
      path: `/monitors?limit=10&cursor=${monitorId}`,
      body: { data: { items: [monitor], nextCursor: null } },
    },
    {
      invoke: (client) => client.monitors.retrieve(monitorId),
      method: 'GET',
      path: `/monitors/${monitorId}`,
      body: { data: monitor },
    },
    {
      invoke: (client) => client.monitors.delete(monitorId),
      method: 'DELETE',
      path: `/monitors/${monitorId}`,
      body: { data: { id: monitorId, status: 'deleted' } },
    },
  ];
  for (const { invoke, method, path, body } of cases) {
    const { client, calls } = mockClient(body);
    assert.deepEqual(await invoke(client), body);
    assert.equal(calls[0].method, method);
    assert.equal(calls[0].url, `https://www.sanctionskit.com/api/v1${path}`);
    assert.equal(calls[0].headers.has('idempotency-key'), false);
    assert.equal(calls[0].body, null);
  }
});

test('updates the complete monitored identity with its expected revision', async () => {
  const body = { ...input, name: 'Updated customer', expectedRevision: 7 };
  const response = { data: { id: monitorId, name: body.name, status: 'paused', revision: 8 } };
  const { client, calls } = mockClient(response);
  assert.deepEqual(await client.monitors.update(monitorId, body, writeOptions), response);
  assert.equal(calls[0].method, 'PATCH');
  assert.equal(calls[0].url, `https://www.sanctionskit.com/api/v1/monitors/${monitorId}`);
  assert.equal(calls[0].headers.get('idempotency-key'), writeOptions.idempotencyKey);
  assert.deepEqual(await calls[0].json(), body);
});

test('preserves monitoring health, retained input, and unavailable forecast fields', async () => {
  const response = {
    data: {
      items: [{
        id: monitorId,
        name: input.name,
        status: 'active',
        request: { subject: input.subject, package: input.package, retention: 'standard' },
        counterpartyId: null,
        lastScreeningId: null,
        nextRunAt: timestamp,
        updatedAt: timestamp,
        intervalHours: 24,
        revision: 1,
        lastErrorCode: null,
        lastAttemptAt: null,
        lastSuccessfulAt: null,
        health: 'pending',
      }],
      nextCursor: null,
      forecast: null,
      forecastUnavailable: 'temporarily_unavailable',
    },
  };
  const { client, calls } = mockClient(response);
  assert.deepEqual(await client.monitoring.list({ limit: 20, monitorId, q: 'A & B' }), response);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/monitoring');
  assert.equal(url.searchParams.get('limit'), '20');
  assert.equal(url.searchParams.get('monitorId'), monitorId);
  assert.equal(url.searchParams.get('q'), 'A & B');
  assert.equal(calls[0].method, 'GET');
});

test('sends revision-guarded monitoring controls without adding other actions', async () => {
  for (const action of [{ status: 'paused' }, { intervalHours: 168 }, { runNow: true }]) {
    const body = { expectedRevision: 4, ...action };
    const response = { data: { id: monitorId, updated: true } };
    const { client, calls } = mockClient(response);
    assert.deepEqual(await client.monitoring.update(monitorId, body, writeOptions), response);
    assert.equal(calls[0].method, 'PATCH');
    assert.equal(calls[0].url, `https://www.sanctionskit.com/api/v1/monitoring/${monitorId}`);
    assert.equal(calls[0].headers.get('idempotency-key'), writeOptions.idempotencyKey);
    assert.deepEqual(await calls[0].json(), body);
  }
});

test('reads inbox filters and preserves incomplete evidence on events', async () => {
  const event = {
    id: eventId,
    monitorId,
    monitorName: input.name,
    caseId: null,
    screeningId: null,
    previousScreeningId: null,
    kind: 'baseline_unavailable',
    status: 'unread',
    createdAt: timestamp,
    acknowledgedAt: null,
    errorCode: null,
    totalChanges: 1,
    evidenceExpired: true,
    currentEvidenceAvailable: true,
    previousEvidenceAvailable: false,
    changes: [{ sourceId: 'sandbox-synthetic', recordId: 'sandbox:person-001', kind: 'changed', fields: ['names'] }],
  };
  const page = { data: { items: [event], nextCursor: eventId, unreadCount: 2 } };
  const { client, calls } = mockClient(page);
  assert.deepEqual(await client.monitoring.inbox.list({
    limit: 25,
    cursor: eventId,
    status: 'unread',
    kind: 'baseline_unavailable',
    monitorId,
  }), page);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, '/api/v1/monitoring/inbox');
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    limit: '25', cursor: eventId, status: 'unread', kind: 'baseline_unavailable', monitorId,
  });
  const detail = mockClient({ data: event });
  assert.deepEqual(await detail.client.monitoring.inbox.retrieve(eventId), { data: event });
  assert.equal(detail.calls[0].url, `https://www.sanctionskit.com/api/v1/monitoring/inbox/${eventId}`);
  assert.equal(detail.calls[0].method, 'GET');
});

test('requires idempotency keys for monitor creation and both update endpoints', async () => {
  const { client, calls } = mockClient({ data: {} });
  for (const options of [undefined, {}, { idempotencyKey: 'short' }]) {
    await assert.rejects(async () => client.monitors.create(input, options), TypeError);
    await assert.rejects(async () => client.monitors.update(monitorId, { ...input, expectedRevision: 1 }, options), TypeError);
    await assert.rejects(async () => client.monitoring.update(monitorId, { expectedRevision: 1, runNow: true }, options), TypeError);
  }
  assert.equal(calls.length, 0);
});

test('returns revision conflicts without retrying or replacing the caller revision', async () => {
  for (const code of ['monitor_changed', 'stale_revision']) {
    const response = { error: { code, message: 'The monitor changed.', requestId: eventId } };
    const { client, calls } = mockClient(response, 409);
    const body = code === 'monitor_changed'
      ? { ...input, expectedRevision: 3 }
      : { expectedRevision: 3, runNow: true };
    const invoke = () => code === 'monitor_changed'
      ? client.monitors.update(monitorId, body, writeOptions)
      : client.monitoring.update(monitorId, body, writeOptions);
    await assert.rejects(invoke, (error) => {
      assert.ok(error instanceof SanctionsKitError);
      assert.equal(error.status, 409);
      assert.equal(error.code, code);
      assert.equal(error.requestId, eventId);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(await calls[0].json(), body);
  }
});
