import assert from 'node:assert/strict';

const scenario = process.env.SANCTIONSKIT_EXAMPLE_CASE;
const calls = [];
const result = {
  id: 'example-screening-1',
  environment: 'sandbox',
  status: 'no_match',
  createdAt: '2026-01-01T00:00:00.000Z',
  matches: [],
  coverage: [],
  versions: { dataset: 'sandbox@1', matchingEngine: 'example', policy: 'example' },
  disclaimer: 'Synthetic example.',
};

function checkScreening(body) {
  assert.equal(body.package, 'sandbox@1');
  assert.equal('sources' in body, false);
  assert.equal(typeof body.subject.name, 'string');
  assert.ok(['person', 'organization'].includes(body.subject.entityType));
}

globalThis.fetch = async (input, init) => {
  const request = new Request(input, init);
  const url = new URL(request.url);
  calls.push(request);
  assert.equal(url.origin, 'https://www.sanctionskit.com');
  assert.equal(request.headers.get('authorization'), 'Bearer example-test-key');
  assert.equal(request.redirect, 'error');

  if (scenario === 'screen.mjs' || scenario === 'screen.ts') {
    assert.equal(url.pathname, '/api/v1/screenings');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('idempotency-key'), 'example-request-1');
    const body = await request.json();
    checkScreening(body);
    assert.equal(body.subject.birthDate, '1984');
    assert.equal(body.reference, 'example-customer-001');
    return Response.json({ data: result });
  }

  if (scenario === 'sources.mjs') {
    assert.equal(url.pathname, '/api/v1/sources');
    assert.equal(request.method, 'GET');
    return Response.json({ data: [{ id: 'example-source', name: 'Example source', availability: 'available' }] });
  }

  if (scenario === 'batch.mjs') {
    assert.equal(url.pathname, '/api/v1/batches');
    assert.equal(request.method, 'POST');
    assert.equal(request.headers.get('idempotency-key'), 'example-request-1');
    const body = await request.json();
    assert.equal(typeof body.name, 'string');
    assert.equal(body.subjects.length, 2);
    body.subjects.forEach(checkScreening);
    return Response.json({ data: { id: 'example-batch-1', status: 'pending', total: 2 } }, { status: 202 });
  }

  if (scenario === 'batch-results.mjs') {
    assert.equal(url.pathname, '/api/v1/batches/example-batch-1');
    assert.equal(request.method, 'GET');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(url.searchParams.get('offset'), calls.length === 1 ? '0' : '2');
    assert.ok(calls.length <= 2);
    const data = {
      id: 'example-batch-1',
      status: 'processing',
      total: 3,
      completed: 0,
      failed: 1,
      rows: calls.length === 1 ? [] : [{
        row_number: 3,
        status: 'failed',
        screening_id: null,
        error: { code: 'source_unavailable', message: 'Selected source is unavailable.' },
      }],
      nextOffset: calls.length === 1 ? 2 : null,
    };
    return Response.json({ data });
  }

  throw new Error(`Unexpected example: ${scenario}`);
};

process.on('beforeExit', () => {
  assert.equal(calls.length, scenario === 'batch-results.mjs' ? 2 : 1);
});
