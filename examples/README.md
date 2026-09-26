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

JavaScript examples need Node.js 22 or later. Running the TypeScript file directly needs Node.js 22.18 or later, or Node.js 24.

Generate a new `REQUEST_KEY` for each new screening or batch. If a request fails and you retry it, preserve the key and body. Do not rerun the key-generation command for that retry. See [idempotency](https://www.sanctionskit.com/docs/idempotency).

## Read the output

The screening examples print the full result so you can inspect matches, coverage, and versions. `sandbox@1` uses synthetic records; it does not search live sanctions lists. The [screening guide](https://www.sanctionskit.com/docs/screenings) explains how to interpret `potential_match` and `no_match`.

A batch is accepted before its rows finish processing. The results example reads the currently available row pages once; run it again to check progress. Review the batch status and every row's status and error before considering the work complete. See [batch screening](https://www.sanctionskit.com/docs/batches).

Errors reject the request and exit with a nonzero status. There are no automatic retries. Adapt output handling before using real subjects: keep personal details out of routine logs and store evidence with appropriate access controls.

## Next steps

- [Authentication and key scopes](https://www.sanctionskit.com/docs/authentication)
- [Source discovery and production coverage](https://www.sanctionskit.com/docs/sources)
- [Results and evidence](https://www.sanctionskit.com/docs/evidence)
- [Errors and rate limits](https://www.sanctionskit.com/docs/errors)
- [Complete API reference](https://www.sanctionskit.com/docs/api-reference)
