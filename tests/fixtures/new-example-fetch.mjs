import assert from 'node:assert/strict';

const example = process.env.SANCTIONSKIT_EXAMPLE_CASE;
const sourceId = process.env.SOURCE_ID;
const sourceState = process.env.SOURCE_STATE;
const failed = process.env.BATCH_FAILED === 'true';
let calls = 0;

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  calls += 1;
  assert.equal(url.origin, 'https://www.sanctionskit.com');
  assert.equal(request.headers.get('authorization'), 'Bearer example-test-key');
  assert.equal(request.redirect, 'error');

  if (example === 'screen-list.mjs') {
    if (calls === 1) {
      assert.equal(url.pathname, '/api/v1/sources');
      assert.equal(request.method, 'GET');
      return Response.json({ data: sourceState === 'missing' ? [] : [{
        id: sourceId,
        availability: sourceState === 'disabled' ? 'disabled' : 'available',
        fresh: sourceState !== 'stale',
        capabilities: sourceState === 'unsupported' ? ['vessel'] : ['person', 'organization'],
      }] });
    }
    assert.equal(sourceState, undefined, 'Screening must not be submitted for unavailable coverage.');
    assert.equal(url.pathname, '/api/v1/screenings');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('idempotency-key'), 'example-request-1');
    const body = await request.json();
    assert.deepEqual(body.sources, [sourceId]);
    assert.equal(body.package, undefined);
    assert.equal(body.subject.entityType, 'person');
    return Response.json({ data: { id: 'screening-1', status: 'no_match', coverage: [{ sourceId }] } });
  }

  if (example === 'results.mjs') {
    assert.equal(url.pathname, '/api/v1/results');
    assert.equal(url.searchParams.get('summary'), 'true');
    assert.equal(url.searchParams.get('cursor'), calls === 1 ? null : 'next-page');
    assert.ok(calls <= 2);
    return Response.json({ data: {
      items: [{ id: `screening-${calls}`, status: calls === 1 ? 'no_match' : 'potential_match', subjectName: 'Never log this' }],
      nextCursor: calls === 1 ? 'next-page' : null,
    } });
  }

  if (example === 'wait-for-batch.mjs') {
    assert.equal(url.pathname, '/api/v1/batches/example-batch-1');
    assert.equal(request.method, 'GET');
    assert.ok(calls <= 3);
    if (calls > 1) {
      assert.equal(url.searchParams.get('limit'), '100');
      assert.equal(url.searchParams.get('offset'), calls === 2 ? '0' : '1');
    }
    const last = calls === 3;
    return Response.json({ data: {
      id: 'example-batch-1', status: 'completed', total: 2, completed: failed ? 1 : 2, failed: failed ? 1 : 0,
      rows: [{
        row_number: last ? 2 : 1,
        status: last && failed ? 'failed' : 'completed',
        screening_id: last && failed ? null : `screening-${last ? 2 : 1}`,
        error: last && failed ? { code: 'source_unavailable', message: 'Unavailable source.' } : null,
      }],
      nextOffset: last ? null : 1,
    } });
  }

  if (example === 'monitor.mjs') {
    assert.equal(url.pathname, '/api/v1/monitors');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('idempotency-key'), 'example-request-1');
    const body = await request.json();
    assert.equal(body.package, 'sandbox@1');
    assert.equal(body.sources, undefined);
    assert.equal(body.subject.name, 'Alex Morgan');
    assert.equal(body.name, 'Example customer monitoring');
    return Response.json({ data: { id: 'monitor-1', status: 'active' } }, { status: 201 });
  }
  throw new Error(`Unexpected example: ${example}`);
};

process.on('beforeExit', () => {
  const expected = example === 'monitor.mjs' ? 1 : example === 'wait-for-batch.mjs' ? 3 : 2;
  assert.equal(calls, expected);
});
