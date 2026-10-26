# Compatibility

## Stable API

Version 1.x follows semantic versioning. The public API is the documented exports from `sanctionskit`: the client, resource methods, options, TypeScript types, error class, and webhook verifier. Package metadata is available through `sanctionskit/package.json`. Files inside `dist` are implementation details; import through the package name.

- Patch releases fix bugs without changing documented valid calls.
- Minor releases add compatible methods, options, and optional response fields. Deprecations are announced in the changelog before removal.
- Removing or renaming a public method, changing a documented response envelope, making a required option stricter, or breaking supported TypeScript consumers requires a major release. Deprecated APIs remain available throughout 1.x.

The hosted API has its own [contract](https://www.sanctionskit.com/openapi.json). Available sources, account limits, retained data, and screening outcomes can change independently of the SDK. Unknown response fields are preserved. Error codes are strings; applications should retain a fallback for codes introduced by the service.

## Runtime and types

The SDK requires Node.js 22 or later and has no runtime dependencies. CI checks Node 22.0.0, the latest Node 22, and Node 24. Use a current security patch of a supported Node release in production. Browser and edge runtimes are outside this package's support scope.

TypeScript 5.9.3 is the minimum supported compiler. ESM and CommonJS declarations are checked with `module` and `moduleResolution` set to `NodeNext`. JavaScript consumers do not need TypeScript. Raising the minimum supported Node or TypeScript version requires a major SDK release.

Running the `.ts` example directly requires Node 22.18+ or Node 24. This does not change the runtime requirement for the compiled package.

## Request behavior

Each HTTP request makes one attempt. The SDK does not retry automatically. HTTP failures reject with `SanctionsKitError`; network errors, timeouts, and caller cancellation retain their native errors. Keep the same idempotency key and request body when retrying a write. See [errors](https://www.sanctionskit.com/docs/errors) and [idempotency](https://www.sanctionskit.com/docs/idempotency).

Most resource methods preserve the `{ data }` envelope. `results.evidence()` returns the evidence object directly. List methods return one page; iterators fetch lazily and stop at the documented continuation boundary. A request timeout applies to each page, while `batches.waitForCompletion()` also enforces its total waiting deadline. Stopping a wait does not cancel the remote batch.

Result filters `q`, `status`, `review`, and `origin` require `summary: true` on both `results.list()` and `results.iterate()`. Full results accept pagination options and `summary: false` or no summary option. Invalid filter combinations throw a `TypeError` before a request is sent.

`verifyWebhook()` returns `false` for an invalid delivery signature and throws `TypeError` for invalid caller configuration. It verifies the original bytes; event validation and durable deduplication belong in the receiver. See [webhooks](https://www.sanctionskit.com/docs/webhooks).

## Upgrading from 0.2.x

Add `summary: true` wherever a results call uses a filter. Those filters were previously accepted without it but ignored by the server. Summary rows have a different shape from full screening results; call `results.retrieve(row.id)` when full evidence is needed.

```js
for await (const row of client.results.iterate({ summary: true, status: 'potential_match' })) {
  const { data: result } = await client.results.retrieve(row.id);
  console.log(result.id, result.status);
}
```

New optional types expose `result.matching`, `result.warnings`, `match.assessment`, and `policy.matching`. Historical records can omit them, and `assessment.name` can be `null`. Preserve input warnings when presenting results, including no-match outcomes.

`ResultsListParams` is now a union. Interfaces that previously extended it should extend `ResultsFullParams` or `ResultsSummaryParams`, or use a type intersection. Annotate saved filtered options with `ResultsSummaryParams` (or use `satisfies ResultsSummaryParams`) to preserve the literal `summary: true` type.

## Maintenance

Fixes and security updates target the latest 1.x release. Earlier 0.x releases are no longer maintained. Report security issues through [SECURITY.md](https://github.com/SanctionsKit/sanctionskit-node/blob/main/SECURITY.md); routine issues belong in [GitHub Issues](https://github.com/SanctionsKit/sanctionskit-node/issues).
