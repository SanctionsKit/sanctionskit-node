# SDK examples

Short examples for the [SanctionsKit API](https://www.sanctionskit.com/docs). Use a [sandbox API key](https://www.sanctionskit.com/dashboard/keys?environment=sandbox) and invented subjects while learning. [Create an account](https://www.sanctionskit.com/signup) if you need a workspace.

## Setup

From the repository root:

```sh
npm ci
npm run build
export SANCTIONSKIT_API_KEY='your-sandbox-api-key'
export REQUEST_KEY="$(node -p 'crypto.randomUUID()')"
```

The examples import `sanctionskit` through the local package exports. In your own project, run `npm install sanctionskit` instead.

| Example | Run | Required scopes |
| --- | --- | --- |
| [Screen a person](screen.mjs) | `node examples/screen.mjs` | `screenings:write` |
| [Screen with TypeScript](screen.ts) | `node examples/screen.ts` | `screenings:write` |
| [Discover sources](sources.mjs) | `node examples/sources.mjs` | `sources:read` |
| [Submit a batch](batch.mjs) | `node examples/batch.mjs` | `batches:write` |
| [Read batch progress and rows](batch-results.mjs) | `BATCH_ID='your-batch-id' node examples/batch-results.mjs` | `results:read` |
| [Wait for a batch and read all rows](wait-for-batch.mjs) | `BATCH_ID='your-batch-id' node examples/wait-for-batch.mjs` | `results:read` |
| [Iterate through screening history](results.mjs) | `node examples/results.mjs` | `results:read` |
| [Start monitoring a subject](monitor.mjs) | `node examples/monitor.mjs` | `monitors:write` |

JavaScript examples need Node.js 22 or later. Running the TypeScript file directly needs Node.js 22.18 or later, or Node.js 24.

Generate a new `REQUEST_KEY` for each new screening or batch. If a request fails and you retry it, preserve the key and body. Do not rerun the key-generation command for that retry. See [idempotency](https://www.sanctionskit.com/docs/idempotency).

## Read the output

The screening examples print the full result so you can inspect matches, coverage, and versions. `sandbox@1` uses synthetic records; it does not search live sanctions lists. The [screening guide](https://www.sanctionskit.com/docs/screenings) explains how to interpret `potential_match` and `no_match`.

A batch is accepted before its rows finish processing. The results example reads the currently available row pages once; run it again to check progress. Review the batch status and every row's status and error before considering the work complete. See [batch screening](https://www.sanctionskit.com/docs/batches).

Errors reject the request and exit with a nonzero status. There are no automatic retries. Adapt output handling before using real subjects: keep personal details out of routine logs and store evidence with appropriate access controls.

The batch wait example polls until processing stops, then reads every row with an iterator. It exits with status 1 if the batch or any row is unsuccessful. It uses a five-minute deadline; reaching that deadline stops waiting without cancelling work on the service. The monitoring example queues an initial check. Use `monitoring.list({ monitorId })` with `results:read` to inspect health and the latest successful screening. Call `monitors.delete(id)` when you want to stop the monitor.

## Screen against a named list

[screen-list.mjs](screen-list.mjs) discovers the selected source and checks availability, freshness, and person-screening support before submitting an invented subject. Use a key whose environment makes that source available, with `sources:read` and `screenings:write`. These examples query the selected list and consume the applicable screening allowance. A sandbox key does not grant live list coverage.

Set `SANCTIONSKIT_API_KEY` to your chosen key, then run one of these commands. Generate a new `REQUEST_KEY` for each different source or request body, and retain it for retries.

| List | Command | Source guide |
| --- | --- | --- |
| OFAC SDN | `SOURCE_ID=ofac-sdn node examples/screen-list.mjs` | [OFAC SDN](https://www.sanctionskit.com/datasets/ofac-sdn) |
| UK sanctions | `SOURCE_ID=uk-sanctions node examples/screen-list.mjs` | [UK Sanctions List](https://www.sanctionskit.com/datasets/uk-sanctions) |
| U.S. CSL | `SOURCE_ID=us-csl node examples/screen-list.mjs` | [Consolidated Screening List](https://www.sanctionskit.com/datasets/us-csl) |
| BIS denied persons | `SOURCE_ID=us-bis-denied node examples/screen-list.mjs` | [Denied Persons List](https://www.sanctionskit.com/datasets/us-bis-denied) |

Keep the returned coverage and versions with your application record. A potential match needs review against the specific designation or order. Catalog presence alone does not establish availability for your key. Workspaces that require an approved policy also need its ID and version in the screening body; see [policies](https://www.sanctionskit.com/docs/policies).

## Receive webhooks

[webhook-receiver.mjs](webhook-receiver.mjs) exports `receiveWebhook(request, { secret, persistAndEnqueue })`. It accepts an unparsed Web `Request`, verifies the exact bytes, validates the event, and calls your persistence function before acknowledging delivery. It does not start a server.

For a Next.js App Router application, place the receiver in a server module and adapt a Node route:

```js
import { receiveWebhook } from './webhook-receiver.mjs';
import { persistAndEnqueue } from './event-store.js';

export const runtime = 'nodejs';

export async function POST(request) {
  return receiveWebhook(request, {
    secret: process.env.SANCTIONSKIT_WEBHOOK_SECRET,
    persistAndEnqueue,
  });
}
```

Implement `event-store.js` with your database and queue. In one durable transaction, insert a unique receipt for the endpoint, environment, and event ID, and enqueue work only for a new receipt. Resolving for an already-recorded event is safe; throw if storage fails so the receiver returns 503. The hook must finish durable acceptance before resolving. Configure a request-body size limit in your server adapter.

The signing secret comes from webhook registration. Keep it separate from the API key. Preserve the raw body before JSON middleware, retain deduplication receipts across redeliveries, and fetch current result details in your worker. Follow the [webhook guide](https://www.sanctionskit.com/docs/webhooks) for registration, event types, retries, and delivery ordering.

## Next steps

- [Authentication and key scopes](https://www.sanctionskit.com/docs/authentication)
- [Source discovery and production coverage](https://www.sanctionskit.com/docs/sources)
- [Results and evidence](https://www.sanctionskit.com/docs/evidence)
- [Errors and rate limits](https://www.sanctionskit.com/docs/errors)
- [Complete API reference](https://www.sanctionskit.com/docs/api-reference)
