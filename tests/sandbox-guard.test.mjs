import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSandbox } from '../scripts/test-sandbox.mjs';
import { SanctionsKitError } from '../dist/index.js';

test('sandbox acceptance refuses production before any write', async () => {
  const client = { usage: { retrieve: async () => ({ data: { environment: 'production', remaining: 1000 } }) } };
  await assert.rejects(checkSandbox(client), /refuses a production key/);
});

test('sandbox acceptance refuses insufficient allowance before any write', async () => {
  const client = { usage: { retrieve: async () => ({ data: { environment: 'sandbox', remaining: 4 } }) } };
  await assert.rejects(checkSandbox(client), /five sandbox screening units/);
});

function failingWorkflow({ batchFailure, monitorFailure, cleanupFailure } = {}) {
  const calls = [];
  const matching = { version: 'example' };
  const result = { id: 'match', environment: 'sandbox', status: 'potential_match', matching, matches: [{ assessment: {} }], coverage: [{ sourceId: 'sandbox-synthetic' }] };
  const noMatch = { ...result, id: 'no-match', status: 'no_match', matches: [] };
  const client = {
    usage: { retrieve: async () => ({ data: { environment: 'sandbox', remaining: 5 } }) },
    policies: { list: async () => ({ data: { requirePolicy: false } }) },
    sources: { list: async () => ({ data: [] }) },
    screenings: {
      create: async (body, options) => {
        if (body.subject.entityType === 'organization' && options.idempotencyKey.endsWith(':match')) {
          throw new SanctionsKitError('Conflict', { status: 409, code: 'idempotency_conflict' });
        }
        return { data: body.subject.entityType === 'person' ? result : noMatch };
      },
    },
    results: {
      retrieve: async () => ({ data: { ...result, subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' } } }),
      evidence: async () => ({ format: 'sanctionskit-evidence@1', result, retainedInputs: true }),
      list: async () => ({ data: { items: [noMatch] } }),
      iterate: async function* (_params, options) {
        assert.ok(options.signal instanceof AbortSignal);
        yield result;
        yield noMatch;
      },
    },
    batches: {
      create: async () => ({ data: { id: 'batch-1' } }),
      waitForCompletion: async () => {
        if (batchFailure) throw batchFailure;
        return { data: { status: 'completed', completed: 2, failed: 0 } };
      },
      iterateRows: async function* (_id, _params, options) {
        assert.ok(options.signal instanceof AbortSignal);
        yield { row_number: 1, status: 'completed', screening_id: 'match' };
        yield { row_number: 2, status: 'completed', screening_id: 'no-match' };
      },
      cancel: async (id) => { calls.push(['cancel', id]); },
    },
    monitors: {
      create: async () => ({ data: { id: 'monitor-1' } }),
      delete: async (id) => {
        calls.push(['delete', id]);
        if (cleanupFailure) throw cleanupFailure;
        return { data: { status: 'deleted' } };
      },
    },
    monitoring: { list: async () => { throw monitorFailure; } },
  };
  return { client, calls };
}

test('sandbox acceptance cancels its batch if completion fails', async () => {
  const failure = new Error('Batch wait expired');
  const { client, calls } = failingWorkflow({ batchFailure: failure });
  await assert.rejects(checkSandbox(client), (error) => error === failure);
  assert.deepEqual(calls, [['cancel', 'batch-1']]);
});

test('sandbox acceptance removes its monitor after a later failure', async () => {
  const failure = new Error('Monitoring unavailable');
  const { client, calls } = failingWorkflow({ monitorFailure: failure });
  const resources = [];
  await assert.rejects(checkSandbox(client, { resource: (...entry) => resources.push(entry) }), (error) => error === failure);
  assert.deepEqual(calls, [['delete', 'monitor-1']]);
  assert.deepEqual(resources, [['batch', 'batch-1'], ['monitor', 'monitor-1']]);
});

test('sandbox cleanup preserves the original failure alongside cleanup errors', async () => {
  const failure = new Error('Monitoring unavailable');
  const cleanupFailure = new Error('Delete unavailable');
  const { client } = failingWorkflow({ monitorFailure: failure, cleanupFailure });
  await assert.rejects(checkSandbox(client), (error) => {
    assert.ok(error instanceof AggregateError);
    assert.deepEqual(error.errors, [failure, cleanupFailure]);
    return true;
  });
});
