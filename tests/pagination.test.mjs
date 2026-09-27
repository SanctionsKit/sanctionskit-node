import assert from 'node:assert/strict';
import test from 'node:test';
import { SanctionsKit, SanctionsKitError } from '../dist/index.js';

function mockClient(pages) {
  const calls = [];
  const client = new SanctionsKit({
    apiKey: 'test-key',
    fetch: async (url, options) => {
      calls.push({ url: new URL(url), options });
      const page = pages[calls.length - 1];
      assert.ok(page, 'Unexpected page request');
      return page instanceof Response ? page : Response.json({ data: page });
    },
  });
  return { client, calls };
}

async function collect(iterator) {
  const items = [];
  for await (const item of iterator) items.push(item);
  return items;
}

test('cursor iterators are lazy and follow short and empty pages until null', async () => {
  for (const resource of ['results', 'policies', 'batches']) {
    const first = { id: 'first' };
    const last = { id: 'last' };
    const { client, calls } = mockClient([
      { items: [first], nextCursor: 'page-2' },
      { items: [], nextCursor: 'page-3' },
      { items: [last], nextCursor: null },
    ]);
    const iterator = client[resource].iterate({ limit: 100 });
    assert.equal(calls.length, 0);
    assert.deepEqual(await iterator.next(), { value: first, done: false });
    assert.equal(calls.length, 1);
    assert.deepEqual(await iterator.next(), { value: last, done: false });
    assert.equal(calls.length, 3);
    assert.deepEqual(await iterator.next(), { value: undefined, done: true });
    assert.deepEqual(calls.map(({ url }) => url.searchParams.get('cursor')), [null, 'page-2', 'page-3']);
    assert.ok(calls.every(({ url }) => url.pathname === `/api/v1/${resource}`));
  }
});

test('results iterator preserves summary filters and the caller parameters', async () => {
  const { client, calls } = mockClient([
    { items: [{ id: 'one', subjectName: 'Example' }], nextCursor: 'second' },
    { items: [{ id: 'two', subjectName: null }], nextCursor: null },
  ]);
  const params = { cursor: 'first', summary: true, status: 'no_match', q: 'Example name', limit: 2 };
  const iterator = client.results.iterate(params);
  params.q = 'Later edit';
  const items = await collect(iterator);
  assert.equal(items[0].subjectName, 'Example');
  assert.equal(items.length, 2);
  assert.equal(params.cursor, 'first');
  for (const { url } of calls) {
    assert.equal(url.searchParams.get('summary'), 'true');
    assert.equal(url.searchParams.get('status'), 'no_match');
    assert.equal(url.searchParams.get('q'), 'Example name');
    assert.equal(url.searchParams.get('limit'), '2');
  }
});

test('breaking iteration does not prefetch another page', async () => {
  const { client, calls } = mockClient([{ items: [{ id: 'one' }, { id: 'two' }], nextCursor: 'later' }]);
  for await (const item of client.results.iterate()) {
    assert.equal(item.id, 'one');
    break;
  }
  assert.equal(calls.length, 1);
});

test('cursor iterators reject repeated, cyclic, and malformed continuations', async () => {
  for (const nextCursor of ['start', '', 42, undefined]) {
    const { client, calls } = mockClient([{ items: [], nextCursor }]);
    await assert.rejects(collect(client.results.iterate({ cursor: 'start' })), /pagination cursor/);
    assert.equal(calls.length, 1);
  }
  const { client, calls } = mockClient([
    { items: [], nextCursor: 'a' },
    { items: [], nextCursor: 'b' },
    { items: [], nextCursor: 'a' },
  ]);
  await assert.rejects(collect(client.results.iterate()), /pagination cursor/);
  assert.equal(calls.length, 3);
});

test('cursor iterators reject malformed page data before yielding records', async () => {
  for (const data of [null, 'records', [], { items: 'records', nextCursor: null }, { nextCursor: null }]) {
    const { client, calls } = mockClient([Response.json({ data })]);
    await assert.rejects(client.results.iterate().next(), /expected data.items to be an array/);
    assert.equal(calls.length, 1);
  }
});

test('iterators honor cancellation between yields and before the first page', async () => {
  const { client, calls } = mockClient([{ items: [{ id: 'one' }, { id: 'two' }], nextCursor: 'next' }]);
  const controller = new AbortController();
  const reason = new Error('Stop reading');
  const iterator = client.results.iterate({}, { signal: controller.signal });
  await iterator.next();
  controller.abort(reason);
  await assert.rejects(iterator.next(), (error) => error === reason);
  assert.equal(calls.length, 1);
  await assert.rejects(client.policies.iterate({}, { signal: controller.signal }).next(), (error) => error === reason);
  assert.equal(calls.length, 1);
});

test('iteration preserves page failures without retries', async () => {
  const { client, calls } = mockClient([
    { items: [{ id: 'one' }], nextCursor: 'next' },
    Response.json({ error: { code: 'rate_limited', message: 'Wait before retrying.', requestId: 'request-1' } }, { status: 429 }),
  ]);
  const iterator = client.batches.iterate();
  await iterator.next();
  await assert.rejects(iterator.next(), (error) => error instanceof SanctionsKitError && error.code === 'rate_limited');
  assert.equal(calls.length, 2);
});

test('batch rows follow the server offset through short and empty pages', async () => {
  const first = { row_number: 5, status: 'completed', screening_id: 'result-5', error: null };
  const last = { row_number: 9, status: 'failed', screening_id: null, error: { code: 'unavailable', message: 'Unavailable.' } };
  const { client, calls } = mockClient([
    { rows: [first], nextOffset: 6 },
    { rows: [], nextOffset: 8 },
    { rows: [last], nextOffset: null },
  ]);
  const params = { offset: 4, limit: 100 };
  const iterator = client.batches.iterateRows('batch/id', params);
  assert.equal(calls.length, 0);
  assert.deepEqual(await collect(iterator), [first, last]);
  assert.deepEqual(params, { offset: 4, limit: 100 });
  assert.deepEqual(calls.map(({ url }) => url.searchParams.get('offset')), ['4', '6', '8']);
  assert.ok(calls.every(({ url }) => url.pathname === '/api/v1/batches/batch%2Fid' && url.searchParams.get('limit') === '100'));
});

test('batch row iteration stops at null while an importing batch may still grow', async () => {
  const { client, calls } = mockClient([{ status: 'importing', rows: [], nextOffset: null }]);
  assert.deepEqual(await collect(client.batches.iterateRows('batch-1')), []);
  assert.equal(calls.length, 1);
});

test('batch row iteration rejects non-advancing and invalid offsets', async () => {
  for (const nextOffset of [0, -1, 1.5, '1', undefined]) {
    const { client, calls } = mockClient([{ rows: [], nextOffset }]);
    await assert.rejects(collect(client.batches.iterateRows('batch-1')), /row offset/);
    assert.equal(calls.length, 1);
  }
  const { client, calls } = mockClient([]);
  await assert.rejects(collect(client.batches.iterateRows('batch-1', { offset: -1 })), /offset must/);
  assert.equal(calls.length, 0);
});

test('batch row iteration rejects malformed page data before yielding records', async () => {
  for (const data of [null, 'records', [], { rows: 'records', nextOffset: null }, { nextOffset: null }]) {
    const { client, calls } = mockClient([Response.json({ data })]);
    await assert.rejects(client.batches.iterateRows('batch-1').next(), /expected data.rows to be an array/);
    assert.equal(calls.length, 1);
  }
});

test('batch row iteration honors cancellation between rows without prefetch', async () => {
  const { client, calls } = mockClient([{ rows: [{ row_number: 1 }, { row_number: 2 }], nextOffset: 2 }]);
  const controller = new AbortController();
  const iterator = client.batches.iterateRows('batch-1', {}, { signal: controller.signal });
  await iterator.next();
  controller.abort();
  await assert.rejects(iterator.next(), { name: 'AbortError' });
  assert.equal(calls.length, 1);
});
