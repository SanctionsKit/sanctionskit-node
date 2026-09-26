import SanctionsKit, {
  SanctionsKit as NamedSanctionsKit,
  SanctionsKitError,
  type BatchRequest,
  type ScreeningRequest,
  type ScreeningResult,
  type ScreeningSummary,
} from 'sanctionskit';

const client: NamedSanctionsKit = new SanctionsKit({ apiKey: 'example-key' });
const screening: ScreeningRequest = {
  subject: { name: 'Example Trading', entityType: 'organization' },
  package: 'sandbox@1',
};
const batch: BatchRequest = {
  name: 'Example batch',
  subjects: [{ ...screening, retention: 'standard' }],
};
const signal = new AbortController().signal;
const options = { signal, timeoutMs: 5000 };

async function checkResources() {
  const sources = await client.sources.list(options);
  const sourceId: string | undefined = sources.data[0]?.id;
  const policies = await client.policies.list({ limit: 10 }, options);
  const required: boolean = policies.data.requirePolicy;
  const policy = await client.policies.retrieve('policy-1', options);
  const version: number | undefined = policy.data.items[0]?.version;
  const created = await client.screenings.create(screening, { ...options, idempotencyKey: 'screening-example-1' });
  const result: ScreeningResult = created.data;
  const retained = await client.results.retrieve(result.id, options);
  const name: string | undefined = retained.data.subject?.name;
  const evidence = await client.results.evidence(result.id, options);
  const format: 'sanctionskit-evidence@1' = evidence.format;
  const results = await client.results.list({ limit: 10 }, options);
  const summary = await client.results.list({ summary: true, review: 'unreviewed' }, options);
  const plain = await client.results.list({ summary: false }, options);
  const item: ScreeningResult | undefined = results.data.items[0];
  const summaryItem: ScreeningSummary | undefined = summary.data.items[0];
  const plainItem: ScreeningResult | undefined = plain.data.items[0];
  const createdBatch = await client.batches.create(batch, { ...options, idempotencyKey: 'batch-example-1' });
  const batches = await client.batches.list({ cursor: 'cursor-1' }, options);
  const retrievedBatch = await client.batches.retrieve(createdBatch.data.id, { offset: 0, limit: 10 }, options);
  const nextOffset: number | null = retrievedBatch.data.nextOffset;
  const cancelled = await client.batches.cancel(createdBatch.data.id, options);
  const usage = await client.usage.retrieve(options);
  const remaining: number = usage.data.remaining;
  return { sourceId, required, version, name, format, item, summaryItem, plainItem, batches, nextOffset, cancelled, remaining };
}

function checkErrors(error: unknown) {
  if (error instanceof SanctionsKitError) {
    const status: number = error.status;
    const code: string = error.code;
    const requestId: string | undefined = error.requestId;
    const retryAfter: string | undefined = error.retryAfter;
    const details: unknown = error.details;
    return { status, code, requestId, retryAfter, details };
  }
}

// @ts-expect-error Choose sources or a package.
const bothCoverage: ScreeningRequest = { subject: { name: 'Example' }, sources: ['ofac'], package: 'sandbox@1' };
// @ts-expect-error Coverage is required.
const missingCoverage: ScreeningRequest = { subject: { name: 'Example' } };
// @ts-expect-error Batch input has one source.
const bothBatchInputs: BatchRequest = { name: 'Example', subjects: [screening], uploadId: 'upload-1' };
// @ts-expect-error Batches require standard retention.
const minimalBatch: BatchRequest = { name: 'Example', subjects: [{ ...screening, retention: 'minimal' }] };
// @ts-expect-error An idempotency key is required.
client.screenings.create(screening);
// @ts-expect-error An idempotency key is required.
client.batches.create(batch, options);
// @ts-expect-error Only documented statuses are accepted.
client.results.list({ status: 'approved' });

void checkResources;
void checkErrors;
void bothCoverage;
void missingCoverage;
void bothBatchInputs;
void minimalBatch;
