# SanctionsKit: OFAC and sanctions screening for Node.js and TypeScript

The official JavaScript and TypeScript SDK for the [SanctionsKit API](https://www.sanctionskit.com/). Add sanctions checks, watchlist screening, batch screening, and ongoing monitoring to your Node.js application. Select available sources such as OFAC SDN, retrieve screening evidence, and verify incoming webhooks.

[Node.js and TypeScript guide](https://www.sanctionskit.com/integrations/typescript) · [API reference](https://www.sanctionskit.com/docs/api-reference) · [Create an account](https://www.sanctionskit.com/signup) · [Get an API key](https://www.sanctionskit.com/dashboard/keys?environment=sandbox)

## Install

```sh
npm install sanctionskit
```

Requires Node.js 22 or later. Includes TypeScript types, ESM and CommonJS exports, and no runtime dependencies. Use it on your server; API keys must stay out of browser bundles.

See the [changelog](https://github.com/SanctionsKit/sanctionskit-node/blob/main/CHANGELOG.md) for release history. It is also included in the installed package.

Version 1.x provides a stable public API. See the [compatibility and upgrade guide](https://github.com/SanctionsKit/sanctionskit-node/blob/main/COMPATIBILITY.md) for supported runtimes, TypeScript 5.9.3+, and the migration from 0.2.x.

## Your first screening

The synthetic sandbox is free and needs no card. Production screening requires a [paid plan](https://www.sanctionskit.com/pricing).

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

New results also include applied matching settings in `data.matching` and structured comparisons in each match's `assessment`. Preserve any `data.warnings`, including limitations on the supplied name. These fields are optional for historical results, and an assessment's name comparison can be `null`. Approved policies expose their matching settings through `policy.matching`.

For CommonJS:

```js
const { SanctionsKit } = require('sanctionskit');
```

## What you can build

| Workflow | SDK starting point |
| --- | --- |
| Individual and customer screening | Check a person's name and identifying details with `screenings.create()`. |
| Company, vendor, and supplier screening | Screen an organization or business counterparty using `entityType: 'organization'`. |
| Vessel and aircraft screening | Submit `entityType: 'vessel'` or `'aircraft'` with sources that support that subject type. |
| Restricted-party and denied-party screening | Discover available lists with `sources.list()` and select the sources relevant to your request. |
| Bulk sanctions checks | Submit customers or counterparties with `batches.create()`, wait for completion, and read every row. |
| Ongoing sanctions monitoring | Retain a subject with `monitors.create()` and read health and events through `monitoring`. |
| Screening audit trails | Retrieve saved results, selected coverage, source versions, and evidence for your review records. |
| Webhook integration | Verify delivery signatures with `verifyWebhook()` before accepting events into your application. |

Use these checks as the screening step in anti-money laundering (AML), know your customer (KYC), or know your business (KYB) workflows. Your application remains responsible for identity verification, review decisions, and the rest of its due-diligence process. See [KYC, AML, and sanctions screening](https://www.sanctionskit.com/guides/kyc-vs-aml-vs-sanctions-screening) and [customer screening](https://www.sanctionskit.com/guides/customer-screening) for workflow guidance.

## OFAC, sanctions lists, and restricted-party screening

Use the SDK to screen customers and vendors against selected sanctions and watchlist sources. The [OFAC SDN guide](https://www.sanctionskit.com/datasets/ofac-sdn) explains that list's scope, record details, and review limitations.

For production, [create a production API key](https://www.sanctionskit.com/dashboard/keys?environment=production) with `screenings:write`, or `batches:write` for batch sanctions screening. Add `results:read` to retrieve saved results and `sources:read` to call `sources.list()`. Check the returned availability and supported entity types before selecting a source; a catalog entry alone does not guarantee it can be screened.

When available in your environment, select OFAC SDN with `sources: ['ofac-sdn']`, or choose a versioned `package` that includes your required sources. Supply exactly one coverage selector. `sandbox@1` contains synthetic records and does not screen live sanctions lists. See [source discovery](https://www.sanctionskit.com/docs/sources) and [screening requests](https://www.sanctionskit.com/docs/screenings) for coverage selection and result handling.

The [list screening example](https://github.com/SanctionsKit/sanctionskit-node/blob/main/examples/screen-list.mjs) checks availability and person-screening support before making a request. Use these source IDs for discovery; the table is not a guarantee of enabled coverage:

| List | Source ID | Guide |
| --- | --- | --- |
| OFAC Specially Designated Nationals and Blocked Persons List (SDN) | `ofac-sdn` | [Office of Foreign Assets Control designations](https://www.sanctionskit.com/datasets/ofac-sdn) |
| OFAC Non-SDN Consolidated Sanctions List | `ofac-non-sdn` | [Program-specific restrictions](https://www.sanctionskit.com/datasets/ofac-non-sdn) |
| UK Sanctions List (FCDO) | `uk-sanctions` | [Foreign, Commonwealth & Development Office sanctions](https://www.sanctionskit.com/datasets/uk-sanctions) |
| Bureau of Industry and Security Denied Persons List (BIS DPL) | `us-bis-denied` | [Export denial orders and dates](https://www.sanctionskit.com/datasets/us-bis-denied) |
| Canadian Consolidated Autonomous Sanctions List | `ca-autonomous` | [Global Affairs Canada sanctions](https://www.sanctionskit.com/datasets/ca-autonomous) |
| Swiss SECO sanctions and embargoes | `ch-seco` | [State Secretariat for Economic Affairs measures](https://www.sanctionskit.com/datasets/ch-seco) |
| Japan Ministry of Finance sanctions | `jp-mof-sanctions` | [Asset-freezing and related measures](https://www.sanctionskit.com/datasets/jp-mof-sanctions) |
| U.S. Consolidated Screening List (CSL) | `us-csl` | [Commerce, State, and Treasury source scope and activation requirements](https://www.sanctionskit.com/datasets/us-csl) |

These lists have different meanings. Review the relevant designation or order when interpreting a match. The API remains authoritative about the coverage currently usable by your key.

Browse the [source directory](https://www.sanctionskit.com/datasets) for other lists and their availability. A source guide describes the source; only a successful availability check establishes whether your API request can use it.

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
| `monitors.create(body, options)` | Retain a subject for recurring checks | `monitors:write` |
| `monitors.list(params?)` | List compact monitor records | `results:read` |
| `monitors.retrieve(id)` | Read a compact monitor record | `results:read` |
| `monitors.update(id, body, options)` | Replace a monitor definition | `monitors:write` |
| `monitors.delete(id)` | Stop a monitor and clear its saved request | `monitors:write` |
| `monitoring.list(params?)` | Read monitor health and revisions | `results:read` |
| `monitoring.update(id, body, options)` | Pause, resume, change cadence, or queue a check | `monitors:write` |
| `monitoring.inbox.list(params?)` | List monitoring events | `results:read` |
| `monitoring.inbox.retrieve(id)` | Read one monitoring event | `results:read` |

This release covers these 21 operations. The [API reference](https://www.sanctionskit.com/docs/api-reference) also documents webhook endpoint management, uploads, counterparties, and review workflows, which you can call with `fetch`.

List methods return one page per call. Use `data.nextCursor` for results, policies, and batch lists. Batch row pages use `data.nextOffset` with `batches.retrieve(id, { offset })`. Continue until the continuation value is `null`, even if a page is short. `sources.list()` returns its source array in `data`.

Result filters `q`, `status`, `review`, and `origin` require `summary: true`. For example, use `results.list({ summary: true, status: 'potential_match' })`, then `results.retrieve(row.id)` for full evidence. This also applies to `results.iterate()`. Invalid combinations throw `TypeError` before sending a request. Without summary mode, only `limit` and `cursor` filter the returned page.

## Automatic pagination

Use an iterator when you want to read every item without handling page tokens:

```js
for await (const result of client.results.iterate({ summary: true, limit: 100 })) {
  console.log(result.id, result.status);
}
```

`results.iterate()`, `policies.iterate()`, and `batches.iterate()` accept the same filters and request options as their list methods. `batches.iterateRows(id, params?, options?)` yields individual batch rows. They fetch one page at a time and request the next only as the loop needs it. A `break` stops further requests. A supplied `signal` cancels iteration; `timeoutMs` applies to each request. Errors reject the loop without retrying.

## Bulk screening: wait for a batch

```js
const { data: batch } = await client.batches.waitForCompletion('your-batch-id', {
  timeoutMs: 300_000,
  pollIntervalMs: 5000,
});

console.log(batch.status, batch.completed, batch.failed);
for await (const row of client.batches.iterateRows(batch.id)) {
  console.log(row.row_number, row.status, row.screening_id);
}
```

The helper polls an existing batch until it is `completed`, `failed`, or `cancelled`. It does not submit work. The defaults are a five-minute total deadline and five seconds between polls. Pass `signal` to cancel waiting. Cancellation or expiry stops the wait while the batch continues on the service; use `batches.cancel(id)` if you intend to cancel pending work.

A completed batch can contain failed rows. Inspect each row and handle its error before treating the portfolio as processed. The helper returns the batch detail response with one row page; use `iterateRows()` for all rows. See the [batch guide](https://www.sanctionskit.com/docs/batches) and [complete example](https://github.com/SanctionsKit/sanctionskit-node/blob/main/examples/wait-for-batch.mjs).

## Ongoing sanctions monitoring

```js
const { data: monitor } = await client.monitors.create(
  {
    name: 'Example customer monitoring',
    subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' },
    package: 'sandbox@1',
  },
  { idempotencyKey: process.env.REQUEST_KEY },
);

const { data } = await client.monitoring.list({ monitorId: monitor.id });
const current = data.items.find(({ id }) => id === monitor.id);
console.log(current?.health, current?.lastSuccessfulAt);
```

Create and update operations require a saved idempotency key. Monitor creation queues the first screening asynchronously. An `active` monitor has scheduling enabled; inspect health and the latest successful screening before interpreting an outcome. Each completed rescreen uses the applicable screening allowance.

To pause, read the current revision and call `monitoring.update(id, { expectedRevision, status: 'paused' }, options)`; use `status: 'active'` to resume. The same method accepts `intervalHours` (`6`, `24`, or `168`) or `runNow: true`. `monitors.update()` replaces the full name, subject, and coverage definition and also requires `expectedRevision`. After a `stale_revision` error, reload the monitor and reconsider the change with a new operation key.

`monitors` preserves the compact API's snake_case fields. `monitoring` returns richer camelCase health records and an event inbox. API keys can read inbox events; human review acknowledgement stays in the dashboard. See [monitoring](https://www.sanctionskit.com/docs/monitoring) for retention, cadence, and event handling.

## Verify webhook signatures

```js
import { verifyWebhook } from 'sanctionskit';

const rawBody = new Uint8Array(await request.arrayBuffer());
const valid = verifyWebhook(
  process.env.SANCTIONSKIT_WEBHOOK_SECRET,
  request.headers,
  rawBody,
);
```

Call the helper with the exact request bytes before parsing JSON. It checks the signature and a five-minute timestamp window with Node.js built-ins. Use the signing secret returned when registering the endpoint, not your API key. `Headers` and plain string header records are supported. The optional fourth argument accepts `now` in Unix seconds and `toleranceSeconds`; normal receivers should keep the defaults.

Invalid signatures return `false`. Invalid caller configuration throws a `TypeError`. Verification authenticates a delivery; your application must still validate the event and deduplicate its ID. The [receiver example](https://github.com/SanctionsKit/sanctionskit-node/blob/main/examples/webhook-receiver.mjs) accepts a Web `Request` and a durable persistence callback, so it can be used in a Next.js Node route or another server adapter. See [webhook setup and delivery handling](https://www.sanctionskit.com/docs/webhooks).

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

The SDK makes one attempt per HTTP request. It does not retry automatically. Generate an idempotency key once for each new screening or batch and save it with the request. After a timeout, retry with **the same key and body**. A changed body needs a new key. In the quickstart, rerun the script without generating another `REQUEST_KEY`.

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

## Common questions

### Is this an OFAC list download or an API client?

This package calls the hosted SanctionsKit API. It does not bundle sanctions records or provide offline list matching. Use [source discovery](https://www.sanctionskit.com/docs/sources) to select available coverage, then submit a sanction check through `screenings.create()`.

### Do I need an API key? Can I try it for free?

Yes, API calls require a [SanctionsKit API key](https://www.sanctionskit.com/dashboard/keys?environment=sandbox). The free, no-card sandbox uses synthetic records so you can test requests and result handling. Production screening uses a production key and a [paid plan](https://www.sanctionskit.com/pricing).

### Can I screen companies as well as people?

Yes. Use `entityType: 'person'` for an individual or `entityType: 'organization'` for a company. The [batch example](https://github.com/SanctionsKit/sanctionskit-node/blob/main/examples/batch.mjs) includes both. Check each selected source's supported entity types before screening.

### Can I use it with Next.js or Express?

Use the SDK in a Node.js 22+ server route, worker, or backend service. For Next.js, choose the Node.js runtime. Keep API keys in server environment variables and out of browser code. The [webhook receiver example](https://github.com/SanctionsKit/sanctionskit-node/blob/main/examples/README.md#receive-webhooks) includes a Next.js route adapter.

## Examples and development

The [examples directory](https://github.com/SanctionsKit/sanctionskit-node/tree/main/examples) contains short JavaScript and TypeScript scripts. For examples in other languages, see [SanctionsKit API examples](https://github.com/SanctionsKit/sanctions-kit-examples).

```sh
npm ci
npm run check
```

Tests use local fixtures and do not require API keys. See [CONTRIBUTING.md](https://github.com/SanctionsKit/sanctionskit-node/blob/main/CONTRIBUTING.md) for development and release steps.

Release checks also compare the SDK with a versioned API contract, install the packed artifact in a clean consumer, and run a separate synthetic sandbox acceptance check.

## License

[MIT](https://github.com/SanctionsKit/sanctionskit-node/blob/main/LICENSE). The license covers this SDK; use of the hosted API is subject to [SanctionsKit's terms](https://www.sanctionskit.com/terms).
