import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
export const snapshotPath = resolve(root, 'tests/contracts/api-v1.json');
const sourceURL = 'https://www.sanctionskit.com/openapi.json';

export const bindings = [
  { sdk: 'sources.list', method: 'get', path: '/sources', options: 0 },
  { sdk: 'policies.list', method: 'get', path: '/policies', query: 0, options: 1 },
  { sdk: 'policies.retrieve', method: 'get', path: '/policies/{id}', id: 0, options: 1 },
  { sdk: 'screenings.create', method: 'post', path: '/screenings', body: 0, options: 1 },
  { sdk: 'results.list', method: 'get', path: '/results', query: 0, options: 1 },
  { sdk: 'results.retrieve', method: 'get', path: '/results/{id}', id: 0, options: 1 },
  { sdk: 'results.evidence', method: 'get', path: '/results/{id}/evidence', id: 0, options: 1 },
  { sdk: 'batches.list', method: 'get', path: '/batches', query: 0, options: 1 },
  { sdk: 'batches.create', method: 'post', path: '/batches', body: 0, options: 1 },
  { sdk: 'batches.retrieve', method: 'get', path: '/batches/{id}', id: 0, query: 1, options: 2 },
  { sdk: 'batches.cancel', method: 'delete', path: '/batches/{id}', id: 0, options: 1 },
  { sdk: 'monitors.list', method: 'get', path: '/monitors', query: 0, options: 1 },
  { sdk: 'monitors.create', method: 'post', path: '/monitors', body: 0, options: 1 },
  { sdk: 'monitors.retrieve', method: 'get', path: '/monitors/{id}', id: 0, options: 1 },
  { sdk: 'monitors.update', method: 'patch', path: '/monitors/{id}', id: 0, body: 1, options: 2 },
  { sdk: 'monitors.delete', method: 'delete', path: '/monitors/{id}', id: 0, options: 1 },
  { sdk: 'monitoring.list', method: 'get', path: '/monitoring', query: 0, options: 1 },
  { sdk: 'monitoring.update', method: 'patch', path: '/monitoring/{id}', id: 0, body: 1, options: 2 },
  { sdk: 'monitoring.inbox.list', method: 'get', path: '/monitoring/inbox', query: 0, options: 1 },
  { sdk: 'monitoring.inbox.retrieve', method: 'get', path: '/monitoring/inbox/{id}', id: 0, options: 1 },
  { sdk: 'usage.retrieve', method: 'get', path: '/usage', options: 0 },
];

const schemaKeys = new Set([
  '$ref', 'type', 'properties', 'required', 'items', 'enum', 'const',
  'allOf', 'anyOf', 'oneOf', 'not', 'additionalProperties', 'propertyNames',
  'format', 'pattern', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'minItems', 'maxItems', 'uniqueItems', 'default',
]);

function compactSchema(schema) {
  if (typeof schema !== 'object' || schema === null) return schema;
  if (Array.isArray(schema)) return schema.map(compactSchema);
  return Object.fromEntries(Object.keys(schema).sort().filter((key) => schemaKeys.has(key)).map((key) => [
    key,
    key === 'properties'
      ? Object.fromEntries(Object.keys(schema[key]).sort().map((name) => [name, compactSchema(schema[key][name])]))
      : compactSchema(schema[key]),
  ]));
}

export function projectContract(document) {
  const schemas = {};
  function references(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      const prefix = '#/components/schemas/';
      if (!value.$ref.startsWith(prefix)) throw new Error(`Unsupported schema reference: ${value.$ref}`);
      const name = value.$ref.slice(prefix.length);
      if (!schemas[name]) {
        if (!document.components?.schemas?.[name]) throw new Error(`Missing API schema: ${name}`);
        schemas[name] = compactSchema(document.components.schemas[name]);
        references(schemas[name]);
      }
    }
    for (const nested of Object.values(value)) references(nested);
  }
  const operations = {};
  for (const binding of bindings) {
    const operation = document.paths?.[binding.path]?.[binding.method];
    if (!operation) throw new Error(`Missing API operation: ${binding.method.toUpperCase()} ${binding.path}`);
    const parameters = (operation.parameters ?? []).map((parameter) => ({
      in: parameter.in,
      name: parameter.name,
      required: parameter.required ?? false,
      schema: compactSchema(parameter.schema),
      ...(parameter.in === 'query' ? { description: parameter.description ?? '' } : {}),
    }));
    const projected = {
      operationId: operation.operationId,
      scope: operation.description?.match(/Required API key scope: ([\w:]+)/)?.[1] ?? null,
      security: operation.security,
      parameters,
      ...(operation.requestBody ? {
        request: {
          required: operation.requestBody.required ?? false,
          schema: compactSchema(operation.requestBody.content?.['application/json']?.schema),
        },
      } : {}),
      responses: Object.fromEntries(Object.entries(operation.responses).map(([status, response]) => [status, {
        schema: compactSchema(response.content?.['application/json']?.schema),
        ...(Number(status) >= 400 ? {
          codes: [...new Set(Object.values(response.content?.['application/json']?.examples ?? {})
            .map((example) => example.value?.error?.code).filter(Boolean))].sort(),
        } : {}),
      }])),
    };
    if (binding.path === '/results') {
      const summary = parameters.find((parameter) => parameter.name === 'summary');
      if (!summary?.description.includes('enables the following filters')) {
        throw new Error('Review the GET /results summary/filter dependency in the published contract.');
      }
      projected.summaryOnly = parameters.filter((parameter) => parameter.in === 'query' &&
        !['limit', 'cursor', 'summary'].includes(parameter.name)).map((parameter) => parameter.name).sort();
    }
    operations[binding.sdk] = projected;
    references(projected);
  }
  return {
    format: 'sanctionskit-sdk-contract@1',
    source: sourceURL,
    apiVersion: document.info.version,
    operations,
    schemas: Object.fromEntries(Object.entries(schemas).sort(([a], [b]) => a.localeCompare(b))),
  };
}

function schemaType(schema) {
  if (schema === false) return 'never';
  if (!schema || schema === true) return 'unknown';
  if (schema.$ref) return `Contract_${schema.$ref.split('/').at(-1)}`;
  if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  const alternatives = schema.oneOf ?? schema.anyOf;
  if (alternatives) {
    if (schema.properties) {
      return alternatives.map((branch) => schemaType({
        ...schema, oneOf: undefined, anyOf: undefined,
        properties: { ...schema.properties, ...branch.properties },
        required: [...(schema.required ?? []), ...(branch.required ?? [])],
        forbidden: branch.not?.required ?? [],
      })).map((type) => `(${type})`).join(' | ');
    }
    return alternatives.map(schemaType).map((type) => `(${type})`).join(' | ');
  }
  if (schema.allOf) {
    const own = { ...schema, allOf: undefined };
    return [own, ...schema.allOf].map(schemaType).map((type) => `(${type})`).join(' & ');
  }
  if (Array.isArray(schema.type)) return schema.type.map((type) => schemaType({ ...schema, type })).join(' | ');
  if (schema.type === 'array') return `(${schemaType(schema.items)})[]`;
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
    const properties = Object.entries(schema.properties ?? {}).map(([name, property]) =>
      `${JSON.stringify(name)}${schema.required?.includes(name) ? '' : '?'}: ${schema.forbidden?.includes(name) ? 'never' : schemaType(property)};`);
    if (schema.propertyNames?.enum && !properties.length) {
      return `Partial<Record<${schemaType(schema.propertyNames)}, ${schemaType(schema.additionalProperties)}>>`;
    }
    if (schema.additionalProperties && schema.additionalProperties !== false) {
      properties.push(`[key: string]: ${schemaType(schema.additionalProperties)};`);
    }
    return `{ ${properties.join(' ')} }`;
  }
  if (['string', 'number', 'boolean', 'null'].includes(schema.type)) return schema.type;
  if (schema.type === 'integer') return 'number';
  return 'unknown';
}

function queryType(operation) {
  const query = operation.parameters.filter((parameter) => parameter.in === 'query');
  const object = (summary) => `{ ${query.map((parameter) => {
    if (summary !== undefined && parameter.name === 'summary') return `summary${summary ? '' : '?'}: ${summary};`;
    const type = summary === false && operation.summaryOnly.includes(parameter.name) ? 'never' : schemaType(parameter.schema);
    return `${JSON.stringify(parameter.name)}${parameter.required ? '' : '?'}: ${type};`;
  }).join(' ')} }`;
  return operation.summaryOnly ? `(${object(false)}) | (${object(true)})` : object();
}

function typeShape(checker, type, stack = new Set()) {
  const flags = ts.TypeFlags;
  if (type.flags & flags.Any) return 'any';
  if (type.flags & flags.Unknown) return 'unknown';
  if (type.flags & flags.Never) return 'never';
  if (type.flags & flags.Undefined) return 'undefined';
  if (type.flags & flags.Null) return 'null';
  if (type.isStringLiteral()) return { literal: type.value };
  if (type.isNumberLiteral()) return { literal: type.value };
  if (type.flags & flags.BooleanLiteral) return { literal: type.intrinsicName === 'true' };
  if (type.flags & flags.String) return 'string';
  if (type.flags & flags.Number) return 'number';
  if (type.isUnion()) {
    return { union: [...new Set(type.types.map((part) => JSON.stringify(typeShape(checker, part, stack))))].sort().map(JSON.parse) };
  }
  if (checker.isArrayType(type)) return { array: typeShape(checker, checker.getTypeArguments(type)[0], stack) };
  if (stack.has(type)) throw new Error('Recursive SDK contract types require an explicit comparison rule.');
  const nextStack = new Set([...stack, type]);
  const properties = Object.fromEntries(checker.getPropertiesOfType(type).sort((a, b) => a.name.localeCompare(b.name)).map((property) => {
    const optional = Boolean(property.flags & ts.SymbolFlags.Optional);
    let value = checker.getTypeOfPropertyOfType(type, property.name);
    if (optional && value.isUnion()) {
      const parts = value.types.filter((part) => !(part.flags & flags.Undefined));
      if (parts.length === 1) value = parts[0];
    }
    return [property.name, { optional, type: typeShape(checker, value, nextStack) }];
  }));
  const indexes = checker.getIndexInfosOfType(type).map((index) => ({
    key: typeShape(checker, index.keyType, nextStack),
    value: typeShape(checker, index.type, nextStack),
  }));
  return { properties, ...(indexes.length ? { indexes } : {}) };
}

export function differences(expected, actual, path = '', output = []) {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return output;
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' &&
      !Array.isArray(expected) && !Array.isArray(actual)) {
    for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
      if (output.length >= 20) break;
      differences(expected[key], actual[key], path ? `${path}.${key}` : key, output);
    }
  } else {
    output.push(`${path}: expected ${JSON.stringify(expected) ?? 'absent'}, received ${JSON.stringify(actual) ?? 'absent'}`);
  }
  return output;
}

export function checkSdkTypes(contract) {
  const filename = resolve(root, '__contract_probe__.mts');
  const lines = ['import type * as SDK from "./src/index.js";'];
  const comparisons = [];
  for (const [name, schema] of Object.entries(contract.schemas)) lines.push(`type Contract_${name} = ${schemaType(schema)};`);
  bindings.forEach((binding, index) => {
    const operation = contract.operations[binding.sdk];
    if (!operation) throw new Error(`Snapshot is missing ${binding.sdk}.`);
    const method = `SDK.SanctionsKit${binding.sdk.split('.').map((part) => `[${JSON.stringify(part)}]`).join('')}`;
    lines.push(`type Method_${index} = ${method};`);
    lines.push(`type Arguments_${index} = Parameters<Method_${index}>;`);
    const success = Object.entries(operation.responses).filter(([status]) => Number(status) >= 200 && Number(status) < 300);
    const expected = success.map(([, response]) => schemaType(response.schema)).join(' | ');
    lines.push(`type Actual_${index}_response = Awaited<ReturnType<${method}>>;`);
    lines.push(`type Expected_${index}_response = ${expected};`);
    comparisons.push([`${binding.sdk} response`, `Actual_${index}_response`, `Expected_${index}_response`]);
    for (const [kind, position] of [['body', binding.body], ['query', binding.query], ['id', binding.id]]) {
      if (position === undefined) continue;
      lines.push(`type Actual_${index}_${kind} = Exclude<Arguments_${index}[${position}], undefined>;`);
      lines.push(`type Expected_${index}_${kind} = ${kind === 'body' ? schemaType(operation.request.schema) : kind === 'query' ? queryType(operation) : 'string'};`);
      comparisons.push([`${binding.sdk} ${kind}`, `Actual_${index}_${kind}`, `Expected_${index}_${kind}`]);
    }
    const idempotent = operation.parameters.some((parameter) => parameter.in === 'header' && parameter.name.toLowerCase() === 'idempotency-key' && parameter.required);
    if (idempotent) {
      lines.push(`type Actual_${index}_key = Exclude<Arguments_${index}[${binding.options}], undefined>["idempotencyKey"];`);
      lines.push(`type Expected_${index}_key = string;`);
      comparisons.push([`${binding.sdk} idempotency key`, `Actual_${index}_key`, `Expected_${index}_key`]);
    }
  });
  const source = lines.join('\n');
  const options = {
    noEmit: true, strict: true, exactOptionalPropertyTypes: true, skipLibCheck: true,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
  };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  host.readFile = (path) => path === filename ? source : read(path);
  host.fileExists = (path) => path === filename || exists(path);
  const program = ts.createProgram([filename], options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) return diagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
  const checker = program.getTypeChecker();
  const declarations = new Map(program.getSourceFile(filename).statements.filter(ts.isTypeAliasDeclaration).map((node) => [node.name.text, node]));
  const getType = (name) => checker.getTypeAtLocation(declarations.get(name));
  const issues = [];
  for (const [label, actual, expected] of comparisons) {
    const difference = differences(typeShape(checker, getType(expected)), typeShape(checker, getType(actual)));
    if (difference.length) issues.push(`${label}: ${difference.join('; ')}`);
  }
  bindings.forEach((binding, index) => {
    const operation = contract.operations[binding.sdk];
    const signatures = checker.getSignaturesOfType(getType(`Method_${index}`), ts.SignatureKind.Call);
    const minimumArguments = Math.min(...signatures.map((signature) => signature.minArgumentCount));
    if (Math.max(...signatures.map((signature) => signature.parameters.length)) !== binding.options + 1) {
      issues.push(`${binding.sdk}: expected ${binding.options + 1} public arguments, including request options.`);
    }
    const required = new Set([binding.id, ...(operation.request?.required ? [binding.body] : []),
      ...(operation.parameters.some((parameter) => parameter.in === 'header' && parameter.name.toLowerCase() === 'idempotency-key' && parameter.required) ? [binding.options] : []),
    ].filter((position) => position !== undefined));
    for (let position = 0; position <= binding.options; position += 1) {
      if ((position < minimumArguments) !== required.has(position)) {
        issues.push(`${binding.sdk}: argument ${position + 1} must be ${required.has(position) ? 'required' : 'optional'}.`);
      }
    }
  });
  return issues;
}

async function main(args) {
  if (args[0] === '--update-from' && args.length === 2) {
    const document = JSON.parse(await readFile(resolve(args[1]), 'utf8'));
    const { operations, schemas, ...metadata } = projectContract(document);
    const entries = (values) => Object.entries(values).map(([name, value]) => `    ${JSON.stringify(name)}: ${JSON.stringify(value)}`).join(',\n');
    const snapshot = [
      '{',
      ...Object.entries(metadata).map(([name, value]) => `  ${JSON.stringify(name)}: ${JSON.stringify(value)},`),
      '  "operations": {', entries(operations), '  },',
      '  "schemas": {', entries(schemas), '  }', '}', '',
    ].join('\n');
    await writeFile(snapshotPath, snapshot);
    console.log('Updated the contract snapshot. Review its diff and run the offline check.');
    return;
  }
  if (args.length && !(args.length === 1 && args[0] === '--online')) {
    throw new Error('Usage: node scripts/contract-check.mjs [--online | --update-from OPENAPI_FILE]');
  }
  const contract = JSON.parse(await readFile(snapshotPath, 'utf8'));
  const issues = checkSdkTypes(contract);
  if (issues.length) throw new Error(issues.join('\n'));
  console.log(`SDK types match ${bindings.length} operations and ${Object.keys(contract.schemas).length} referenced schemas.`);
  if (args[0] === '--online') {
    const response = await fetch(sourceURL, { redirect: 'error', signal: AbortSignal.timeout(15_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`OpenAPI request failed: HTTP ${response.status}.`);
    const current = projectContract(await response.json());
    const changes = differences(contract, current);
    if (changes.length) throw new Error(`Published API contract changed:\n${changes.join('\n')}`);
    console.log('The published API contract matches the reviewed snapshot.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
