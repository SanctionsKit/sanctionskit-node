# SanctionsKit for JavaScript and TypeScript

The official Node.js SDK for the [SanctionsKit API](https://www.sanctionskit.com/). Screen people and organizations against selected sanctions and watchlist sources, retrieve saved evidence, and submit batch screenings.

[Documentation](https://www.sanctionskit.com/docs) · [API reference](https://www.sanctionskit.com/docs/api-reference) · [Create an account](https://www.sanctionskit.com/signup) · [Get an API key](https://www.sanctionskit.com/dashboard/keys?environment=sandbox)

## Install

```sh
npm install sanctionskit
```

Requires Node.js 22 or later. Includes TypeScript types, ESM and CommonJS exports, and no runtime dependencies. Use it on your server; API keys must stay out of browser bundles.

## Your first screening

1. [Create a workspace](https://www.sanctionskit.com/signup) and open [API keys](https://www.sanctionskit.com/dashboard/keys?environment=sandbox).
2. Create a **sandbox** key with `screenings:write` and `results:read` scopes.
3. Set the key in your server environment, then save this example as `screen.mjs`.

```sh
export SANCTIONSKIT_API_KEY='your-sandbox-api-key'
export REQUEST_KEY="$(node -p 'crypto.randomUUID()')"
```

```js
import SanctionsKit from 'sanctionskit';

const client = new SanctionsKit({
  apiKey: process.env.SANCTIONSKIT_API_KEY,
});

const { data } = await client.screenings.create(
  {
    subject: {
      name: 'Alex Morgan',
      entityType: 'person',
      birthDate: '1984',
    },
    package: 'sandbox@1',
    reference: 'example-customer-001',
  },
  { idempotencyKey: process.env.REQUEST_KEY },
);

console.log(data.id, data.status);
```

```sh
node screen.mjs
```

Alex Morgan is an invented subject. `sandbox@1` uses synthetic records and does not search live sanctions lists. Follow the [quickstart](https://www.sanctionskit.com/docs/quickstart) for the full walkthrough.

`potential_match` means the candidates need review. `no_match` applies to the supplied information and selected coverage; it is not a clearance decision. Inspect `data.matches`, `data.coverage`, and `data.versions` before taking the next step. An error is an incomplete request, never a no-match result. See [screening results](https://www.sanctionskit.com/docs/screenings).

For CommonJS:

```js
const { SanctionsKit } = require('sanctionskit');
```

## Retrieve results and evidence

```js
const result = await client.results.retrieve('your-screening-id');
const evidence = await client.results.evidence(result.data.id);
```

The SDK preserves the API response shape. Most methods return `{ data }`; `results.evidence()` returns the evidence object directly. Keep evidence in access-controlled storage. See [results and evidence](https://www.sanctionskit.com/docs/evidence).

## Methods

| Method | Purpose | Key scope |
| --- | --- | --- |
| `sources.list()` | Discover available sources | `sources:read` |
| `policies.list(params?)` | List approved policies | `sources:read` |
| `policies.retrieve(id)` | Read a policy | `sources:read` |
| `screenings.create(body, options)` | Screen one subject | `screenings:write` |
| `results.list(params?)` | Page through screening history | `results:read` |
| `results.retrieve(id)` | Read a saved screening | `results:read` |
| `results.evidence(id)` | Read its evidence | `results:read` |
| `batches.create(body, options)` | Submit a batch | `batches:write` |
| `batches.list(params?)` | List batches | `results:read` |
| `batches.retrieve(id, params?)` | Read progress and row outcomes | `results:read` |
| `batches.cancel(id)` | Cancel a batch | `batches:write` |
| `usage.retrieve()` | Read usage and limits | `usage:read` |

This release covers these 12 operations. The [API reference](https://www.sanctionskit.com/docs/api-reference) also documents monitoring, webhooks, uploads, counterparties, and review workflows, which you can call with `fetch`.

List methods return one page per call. Use `data.nextCursor` for results, policies, and batch lists. Batch row pages use `data.nextOffset` with `batches.retrieve(id, { offset })`. Continue until the continuation value is `null`, even if a page is short. `sources.list()` returns its source array in `data`.

## Errors and retries

```js
import { SanctionsKitError } from 'sanctionskit';

try {
  const { data } = await client.usage.retrieve();
  console.log(data);
} catch (error) {
  if (error instanceof SanctionsKitError) {
    console.error(error.status, error.code, error.requestId);
  }
  throw error;
}
```

API errors expose `status`, `code`, `message`, `requestId`, `retryAfter`, and optional `details`. `retryAfter` is the raw `Retry-After` header. Network failures and cancellations reject the request too.

The SDK makes one attempt per call. It does not retry automatically. Generate an idempotency key once for each new screening or batch and save it with the request. After a timeout, retry with **the same key and body**. A changed body needs a new key. In the quickstart, rerun the script without generating another `REQUEST_KEY`.

Read [idempotency](https://www.sanctionskit.com/docs/idempotency) and [errors and rate limits](https://www.sanctionskit.com/docs/errors) before adding retries. `rate_limited` and `usage_cap_reached` both use HTTP 429, but waiting alone does not fix an exhausted allowance.

## Configuration

```js
const client = new SanctionsKit({
  apiKey: process.env.SANCTIONSKIT_API_KEY,
  timeoutMs: 30_000,
});

const controller = new AbortController();
const result = await client.results.retrieve('your-screening-id', {
  signal: controller.signal,
  timeoutMs: 10_000,
});
```

Requests default to a 30-second timeout. You can supply `fetch` for testing and `baseURL` for a trusted API deployment. The default is `https://www.sanctionskit.com/api/v1`.

Your API key determines the environment. For production, create a production key, replace `sandbox@1` with an available production package, or use `sources` instead of `package`. Supply exactly one coverage selector. Workspaces that require approved policies also need a policy ID and version. Review [authentication](https://www.sanctionskit.com/docs/authentication), [source availability](https://www.sanctionskit.com/docs/sources), [policies](https://www.sanctionskit.com/docs/policies), and [plans](https://www.sanctionskit.com/pricing).

## Examples and development

The [examples directory](https://github.com/SanctionsKit/sanctionskit-node/tree/main/examples) contains short JavaScript and TypeScript scripts. For examples in other languages, see [SanctionsKit API examples](https://github.com/SanctionsKit/sanctions-kit-examples).

```sh
npm ci
npm run check
```

Tests use local fixtures and do not require API keys. See [CONTRIBUTING.md](https://github.com/SanctionsKit/sanctionskit-node/blob/main/CONTRIBUTING.md) for development and release steps.

## License

[MIT](https://github.com/SanctionsKit/sanctionskit-node/blob/main/LICENSE). The license covers this SDK; use of the hosted API is subject to [SanctionsKit's terms](https://www.sanctionskit.com/terms).
