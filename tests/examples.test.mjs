import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const preload = fileURLToPath(new URL('./fixtures/example-fetch.mjs', import.meta.url));
const [major, minor] = process.versions.node.split('.').map(Number);
const canRunTypeScript = major > 22 || (major === 22 && minor >= 6);

for (const example of ['screen.mjs', 'screen.ts', 'sources.mjs', 'batch.mjs', 'batch-results.mjs']) {
  test(`${example} works with mocked API responses`, {
    skip: example.endsWith('.ts') && !canRunTypeScript,
  }, () => {
    const flags = example.endsWith('.ts') ? ['--experimental-strip-types'] : [];
    const child = spawnSync(process.execPath, [...flags, '--import', preload, `examples/${example}`], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: {
        SANCTIONSKIT_API_KEY: 'example-test-key',
        REQUEST_KEY: 'example-request-1',
        BATCH_ID: 'example-batch-1',
        SANCTIONSKIT_EXAMPLE_CASE: example,
      },
    });
    assert.equal(child.error, undefined);
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.includes('example-test-key'), false);
    if (example.startsWith('screen.')) {
      const result = JSON.parse(child.stdout);
      assert.equal(result.id, 'example-screening-1');
      assert.equal(result.status, 'no_match');
      assert.deepEqual(result.matches, []);
      assert.equal(result.disclaimer, 'Synthetic example.');
    } else if (example === 'sources.mjs') {
      assert.equal(JSON.parse(child.stdout)[0].id, 'example-source');
    } else if (example === 'batch.mjs') {
      assert.match(child.stdout, /Batch accepted: example-batch-1 pending/);
      assert.match(child.stdout, /BATCH_ID=example-batch-1 node examples\/batch-results\.mjs/);
    } else {
      assert.equal(child.stdout.match(/"id": "example-batch-1"/g).length, 2);
      assert.match(child.stdout, /"nextOffset": 2/);
      assert.match(child.stdout, /"nextOffset": null/);
      assert.match(child.stdout, /"status": "failed"/);
      assert.match(child.stdout, /source_unavailable/);
    }
  });
}
