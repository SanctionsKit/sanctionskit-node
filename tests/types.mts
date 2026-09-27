import SanctionsKit, {
  SanctionsKit as NamedSanctionsKit,
  SanctionsKitError,
  type BatchRequest,
  type ScreeningRequest,
  type ScreeningResult,
  type ScreeningSummary,
  verifyWebhook,
  type BatchWaitOptions,
  type MonitorRequest,
  type MonitorUpdate,
  type MonitorControl,
  type VerifyWebhookOptions,
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

async function checkNewResources() {
  for await (const result of client.results.iterate({ summary: true }, options)) {
    const summary: ScreeningSummary = result;
    void summary;
  }
  for await (const result of client.results.iterate({}, options)) {
    const full: ScreeningResult = result;
    void full;
  }
  for await (const policy of client.policies.iterate()) void policy.version;
  for await (const batch of client.batches.iterate()) void batch.completed;
  for await (const row of client.batches.iterateRows('batch-1', {}, options)) void row.screening_id;
  const wait: BatchWaitOptions = { signal, timeoutMs: 10_000, pollIntervalMs: 100 };
  const batch = await client.batches.waitForCompletion('batch-1', wait);
  const monitor: MonitorRequest = { name: 'Example', subject: screening.subject, package: 'sandbox@1' };
  const write = { idempotencyKey: 'monitor-example-1', ...options };
  const created = await client.monitors.create(monitor, write);
  const compact = await client.monitors.retrieve(created.data.id, options);
  const last: string | null = compact.data.last_screening_id;
  const monitors = await client.monitors.list({}, options);
  await client.monitors.update(created.data.id, { ...monitor, expectedRevision: 1 }, write);
  const control: MonitorControl = { expectedRevision: 2, status: 'paused' };
  await client.monitoring.update(created.data.id, control, write);
  const health = await client.monitoring.list({ monitorId: created.data.id }, options);
  const inbox = await client.monitoring.inbox.list({ status: 'unread', kind: 'match_added' }, options);
  const event = await client.monitoring.inbox.retrieve('event-1', options);
  const stopped = await client.monitors.delete(created.data.id, options);
  const verifyOptions: VerifyWebhookOptions = { now: 1_800_000_000, toleranceSeconds: 300 };
  const verified: boolean = verifyWebhook('example-secret', new Headers(), new Uint8Array(), verifyOptions);
  return { batch, last, monitors, health, inbox, event, stopped, verified };
}

// @ts-expect-error A monitor requires one coverage selector.
const noMonitorCoverage: MonitorRequest = { name: 'Example', subject: { name: 'Example' } };
// @ts-expect-error A monitor cannot combine coverage selectors.
const bothMonitorCoverage: MonitorRequest = { name: 'Example', subject: { name: 'Example' }, sources: ['ofac-sdn'], package: 'sandbox@1' };
// @ts-expect-error Monitor creation has fixed retention.
const monitorRetention: MonitorRequest = { name: 'Example', subject: { name: 'Example' }, package: 'sandbox@1', retention: 'minimal' };
// @ts-expect-error Replacement requires a full definition.
const partialMonitor: MonitorUpdate = { expectedRevision: 1, name: 'Example' };
// @ts-expect-error Control requires an action.
const noMonitorAction: MonitorControl = { expectedRevision: 1 };
// @ts-expect-error A current revision is required.
const noMonitorRevision: MonitorControl = { status: 'paused' };
// @ts-expect-error Queuing a run uses true.
const noMonitorRun: MonitorControl = { expectedRevision: 1, runNow: false };
// @ts-expect-error Cadence must be supported by the API.
const invalidMonitorInterval: MonitorControl = { expectedRevision: 1, intervalHours: 12 };
// @ts-expect-error Monitor creation requires an operation key.
client.monitors.create({ name: 'Example', subject: { name: 'Example' }, package: 'sandbox@1' });
// @ts-expect-error Verification takes raw bytes.
verifyWebhook('secret', new Headers(), '{}');
void checkNewResources;
void noMonitorCoverage;
void bothMonitorCoverage;
void monitorRetention;
void partialMonitor;
void noMonitorAction;
void noMonitorRevision;
void noMonitorRun;
void invalidMonitorInterval;
