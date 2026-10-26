import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import SanctionsKit from '../dist/index.js';
import { bindings, checkSdkTypes, differences, projectContract, snapshotPath } from '../scripts/contract-check.mjs';

const contract = JSON.parse(await readFile(snapshotPath, 'utf8'));
const id = '00000000-0000-4000-8000-000000000001';

test('public method types match the reviewed API request and response contract', () => {
  assert.equal(bindings.length, 21);
  assert.deepEqual(checkSdkTypes(contract), []);
});

test('contract checks detect new optional response fields and requiredness changes', () => {
  const changed = structuredClone(contract);
  changed.schemas.ScreeningResult.properties.futureEvidence = { type: 'string' };
  changed.schemas.ScreeningResult.required.push('warnings');
  const issues = checkSdkTypes(changed);
  assert.ok(issues.some((issue) => issue.includes('screenings.create response') && issue.includes('futureEvidence')));
  assert.ok(issues.some((issue) => issue.includes('warnings.optional')));
});

test('contract checks detect request, enum, and nullability drift', () => {
  const changed = structuredClone(contract);
  changed.schemas.ScreeningRequest.required.push('reference');
  changed.schemas.AppliedMatchingPolicy.properties.profile.enum.push('additional-profile');
  changed.schemas.ScreeningEvidence.properties.subject = { $ref: '#/components/schemas/Subject' };
  const issues = checkSdkTypes(changed);
  assert.ok(issues.some((issue) => issue.includes('screenings.create body')));
  assert.ok(issues.some((issue) => issue.includes('additional-profile')));
  assert.ok(issues.some((issue) => issue.includes('results.evidence response') && issue.includes('subject')));
});

test('contract checks keep filters conditional on summary mode', () => {
  const changed = structuredClone(contract);
  delete changed.operations['results.list'].summaryOnly;
  assert.ok(checkSdkTypes(changed).some((issue) => issue.startsWith('results.list query:')));
});

test('published-contract projection reports added fields while excluding examples', () => {
  const document = {
    info: { version: contract.apiVersion },
    components: { schemas: structuredClone(contract.schemas) },
    paths: {},
  };
  for (const binding of bindings) {
    const operation = contract.operations[binding.sdk];
    (document.paths[binding.path] ??= {})[binding.method] = {
      operationId: operation.operationId,
      description: `Required API key scope: ${operation.scope}.`,
      security: operation.security,
      parameters: operation.parameters,
      ...(operation.request ? { requestBody: { required: operation.request.required, content: { 'application/json': { schema: operation.request.schema } } } } : {}),
      responses: Object.fromEntries(Object.entries(operation.responses).map(([status, response]) => [status, {
        content: { 'application/json': {
          schema: response.schema,
          examples: Object.fromEntries((response.codes ?? []).map((code) => [code, { value: { error: { code } } }])),
        } },
      }])),
    };
  }
  assert.deepEqual(differences(contract, projectContract(document)), []);
  document.components.schemas.ScreeningResult.description = 'Documentation wording can change.';
  document.components.schemas.ScreeningResult.example = { id: 'example-only' };
  assert.deepEqual(differences(contract, projectContract(document)), []);
  document.components.schemas.ScreeningResult.properties.newField = { type: 'boolean' };
  assert.ok(differences(contract, projectContract(document)).some((change) => change.includes('ScreeningResult.properties.newField')));
});

function sample(schema) {
  if (schema.$ref) return sample(contract.schemas[schema.$ref.split('/').at(-1)]);
  if (Object.hasOwn(schema, 'const')) return schema.const;
  if (schema.enum) return schema.enum.includes('no_match') ? 'no_match' : schema.enum[0];
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives) {
    const branch = alternatives.find((candidate) => candidate.type === 'null') ?? alternatives[0];
    return schema.properties
      ? sample({ ...schema, oneOf: undefined, anyOf: undefined, required: [...(schema.required ?? []), ...(branch.required ?? [])] })
      : sample(branch);
  }
  if (schema.allOf) return Object.assign({}, ...schema.allOf.map(sample));
  if (Array.isArray(schema.type)) return sample({ ...schema, type: schema.type.includes('null') ? 'null' : schema.type[0] });
  if (schema.type === 'array') return Array.from({ length: schema.minItems ?? 0 }, () => sample(schema.items));
  if (schema.type === 'object' || schema.properties) {
    return Object.fromEntries((schema.required ?? []).map((name) => [name, sample(schema.properties[name])]));
  }
  if (schema.type === 'null') return null;
  if (schema.type === 'boolean') return false;
  if (schema.type === 'integer' || schema.type === 'number') return schema.minimum ?? 1;
  if (schema.format === 'uuid') return id;
  if (schema.format === 'date-time') return '2026-10-26T12:00:00.000Z';
  return 'Example';
}

test('all supported methods send the reviewed routes, queries, bodies and operation keys', async (t) => {
  for (const binding of bindings) {
    await t.test(binding.sdk, async () => {
      const operation = contract.operations[binding.sdk];
      const [status, success] = Object.entries(operation.responses).find(([code]) => Number(code) >= 200 && Number(code) < 300);
      const response = sample(success.schema);
      const calls = [];
      const client = new SanctionsKit({
        apiKey: 'sk_test_example_not_a_real_key',
        fetch: async (url, init) => {
          calls.push(new Request(url, init));
          return Response.json(response, { status: Number(status) });
        },
      });
      const args = [];
      const expectedURL = new URL(`https://www.sanctionskit.com/api/v1${binding.path.replace('{id}', id)}`);
      if (binding.id !== undefined) args[binding.id] = id;
      if (binding.body !== undefined) args[binding.body] = sample(operation.request.schema);
      if (binding.query !== undefined) {
        const query = Object.fromEntries(operation.parameters.filter((parameter) => parameter.in === 'query')
          .map((parameter) => [parameter.name, parameter.name === 'q' ? 'Example & Co' : sample(parameter.schema)]));
        if (operation.summaryOnly) query.summary = true;
        args[binding.query] = query;
        for (const [name, value] of Object.entries(query)) expectedURL.searchParams.set(name, String(value));
      }
      const idempotent = operation.parameters.some((parameter) => parameter.name.toLowerCase() === 'idempotency-key' && parameter.required);
      args[binding.options] = idempotent ? { idempotencyKey: 'contract-example-001' } : {};
      const parts = binding.sdk.split('.');
      const method = parts.pop();
      const resource = parts.reduce((value, part) => value[part], client);
      assert.deepEqual(await resource[method](...args), response);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, binding.method.toUpperCase());
      assert.equal(calls[0].url, expectedURL.href);
      assert.equal(calls[0].headers.get('idempotency-key'), idempotent ? 'contract-example-001' : null);
      if (binding.body !== undefined) assert.deepEqual(await calls[0].json(), args[binding.body]);
      else assert.equal(calls[0].body, null);
    });
  }
});
