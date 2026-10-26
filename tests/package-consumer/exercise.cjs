const assert = require('node:assert/strict');

module.exports = async function exercise(sdk, defaultExport) {
  assert.equal(defaultExport, sdk.SanctionsKit);
  assert.equal(sdk.default, sdk.SanctionsKit);
  assert.equal(typeof sdk.SanctionsKitError, 'function');
  assert.equal(sdk.verifyWebhook('example-secret', {}, new Uint8Array()), false);

  let calls = 0;
  const client = new sdk.SanctionsKit({
    apiKey: 'package-test-key',
    fetch: async (input, init) => {
      const request = new Request(input, init);
      assert.equal(request.url, 'https://www.sanctionskit.com/api/v1/sources');
      assert.equal(request.headers.get('authorization'), 'Bearer package-test-key');
      calls++;
      return calls === 1
        ? Response.json({ data: [] })
        : Response.json({ error: { code: 'unauthorized', message: 'Invalid credentials.' } }, { status: 401 });
    },
  });
  assert.deepEqual(await client.sources.list(), { data: [] });
  await assert.rejects(client.sources.list(), (error) => {
    assert.ok(error instanceof sdk.SanctionsKitError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'unauthorized');
    return true;
  });
  assert.equal(calls, 2);
};
