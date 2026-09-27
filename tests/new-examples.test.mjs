import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/new-example-fetch.mjs', import.meta.url));

function run(example, extra = {}) {
  const child = spawnSync(process.execPath, ['--import', preload, `examples/${example}`], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    env: {
      SANCTIONSKIT_API_KEY: 'example-test-key',
      REQUEST_KEY: 'example-request-1',
      BATCH_ID: 'example-batch-1',
      SOURCE_ID: 'ofac-sdn',
      SANCTIONSKIT_EXAMPLE_CASE: example,
      ...extra,
    },
  });
  assert.equal(child.error, undefined);
  assert.equal(child.stdout.includes('example-test-key'), false);
  return child;
}

test('named-list recipes discover and submit only the requested coverage', () => {
  for (const source of ['ofac-sdn', 'uk-sanctions', 'us-csl', 'us-bis-denied']) {
    const child = run('screen-list.mjs', { SOURCE_ID: source });
    assert.equal(child.status, 0, child.stderr);
    const result = JSON.parse(child.stdout);
    assert.equal(result.id, 'screening-1');
    assert.equal(result.coverage[0].sourceId, source);
  }
});

test('list example refuses unavailable, stale, and unsupported sources', () => {
  for (const state of ['missing', 'disabled', 'stale', 'unsupported']) {
    const child = run('screen-list.mjs', { SOURCE_STATE: state });
    assert.equal(child.status, 1);
    assert.match(child.stderr, /unavailable|does not support person screening/);
    assert.equal(child.stderr.includes('Screening must not be submitted'), false);
  }
});

test('results example consumes all pages and logs only result identifiers and statuses', () => {
  const child = run('results.mjs');
  assert.equal(child.status, 0, child.stderr);
  const results = child.stdout.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(results, [
    { id: 'screening-1', status: 'no_match' },
    { id: 'screening-2', status: 'potential_match' },
  ]);
});

test('batch wait example inspects all terminal rows and fails on row errors', () => {
  for (const failed of [false, true]) {
    const child = run('wait-for-batch.mjs', { BATCH_FAILED: String(failed) });
    assert.equal(child.status, failed ? 1 : 0, child.stderr);
    const output = child.stdout.trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(output.length, 3);
    assert.equal(output[0].status, 'completed');
    assert.equal(output[1].row, 1);
    assert.equal(output[2].row, 2);
    assert.equal(output[2].status, failed ? 'failed' : 'completed');
    if (failed) assert.equal(output[2].errorCode, 'source_unavailable');
  }
});

test('monitoring example creates one synthetic monitor with a stable request key', () => {
  const child = run('monitor.mjs');
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout.split('\n')[0]), { id: 'monitor-1', status: 'active' });
  assert.match(child.stdout, /first screening is queued/);
});
