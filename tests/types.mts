import SanctionsKit, {
  SanctionsKit as NamedSanctionsKit,
  SanctionsKitError,
  type BatchRequest,
  type ScreeningRequest,
  type ScreeningResult,
  type ScreeningSummary,
  type AppliedMatchingPolicy,
  type IdentityComparisonStatus,
  type MatchAssessment,
  type MatchingProfile,
  type NameAssessment,
  type PartialNamePolicy,
  type PolicyMatchingSettings,
  type ResultsFullParams,
  type ResultsListParams,
  type ResultsSummaryParams,
  type ScreeningMatch,
  type ScreeningPolicySnapshot,
  type ScreeningWarning,
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
  const assessment: MatchAssessment | undefined = result.matches[0]?.assessment;
  const assessedName: NameAssessment | null | undefined = assessment?.name;
  const comparison: IdentityComparisonStatus | undefined = assessment?.birthDate.status;
  const matching: AppliedMatchingPolicy | undefined = result.matching;
  const warning: ScreeningWarning | undefined = result.warnings?.[0];
  const policyMatching: PolicyMatchingSettings | undefined = result.policySnapshot?.matching;
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
  const dynamicParams: ResultsListParams = { summary: Math.random() > 0.5, limit: 10 };
  const dynamicResults = await client.results.list(dynamicParams);
  const dynamicItem: ScreeningResult | ScreeningSummary | undefined = dynamicResults.data.items[0];
  const createdBatch = await client.batches.create(batch, { ...options, idempotencyKey: 'batch-example-1' });
  const batches = await client.batches.list({ cursor: 'cursor-1' }, options);
  const retrievedBatch = await client.batches.retrieve(createdBatch.data.id, { offset: 0, limit: 10 }, options);
  const nextOffset: number | null = retrievedBatch.data.nextOffset;
  const cancelled = await client.batches.cancel(createdBatch.data.id, options);
  const usage = await client.usage.retrieve(options);
  const remaining: number = usage.data.remaining;
  return { sourceId, required, version, name, format, item, summaryItem, plainItem, dynamicItem, batches, nextOffset, cancelled, remaining, assessment, assessedName, comparison, matching, warning, policyMatching };
}

const profile: MatchingProfile = 'focused';
const partialNames: PartialNamePolicy = 'review';
const policyMatching: PolicyMatchingSettings = { profile, partialNames };
const appliedMatching: AppliedMatchingPolicy = {
  version: 'matching-1', profile: 'standard', nameThreshold: 90,
  corroboratedNameThreshold: 85, retrievalVersion: 'retrieval-1',
};
const assessment: MatchAssessment = {
  name: null,
  identifiers: { status: 'agreement', matched: 1, issuerAgreements: 0, issuerUnknown: 1, conflicts: 0 },
  birthDate: { status: 'not_supplied' },
  country: { status: 'unavailable' },
  entityType: { status: 'agreement' },
  reviewTier: 'identifier', alertBasis: 'identifier', hasConflicts: false, sameNameCandidates: 0,
};
const summaryParams: ResultsSummaryParams = { summary: true, q: 'Example', status: 'no_match', review: 'open', origin: 'api' };
const fullParams: ResultsFullParams = { summary: false, limit: 10 };
declare const historicalMatch: Omit<ScreeningMatch, 'assessment'>;
declare const historicalResult: Omit<ScreeningResult, 'matching' | 'warnings'>;
declare const historicalPolicy: Omit<ScreeningPolicySnapshot, 'matching'>;
const oldMatch: ScreeningMatch = historicalMatch;
const oldResult: ScreeningResult = historicalResult;
const oldPolicy: ScreeningPolicySnapshot = historicalPolicy;

// @ts-expect-error Assessment may be omitted, but is not null.
const nullAssessment: ScreeningMatch = { ...historicalMatch, assessment: null };
// @ts-expect-error The assessed name is required, even when null.
const omittedName: MatchAssessment['name'] = undefined;
// @ts-expect-error Matching evidence may be omitted, but is not null.
const nullMatching: ScreeningResult = { ...historicalResult, matching: null };
// @ts-expect-error Warnings may be omitted, but are not null.
const nullWarnings: ScreeningResult = { ...historicalResult, warnings: null };
// @ts-expect-error Policy matching may be omitted, but is not null.
const nullPolicyMatching: ScreeningPolicySnapshot = { ...historicalPolicy, matching: null };

void policyMatching;
void appliedMatching;
void assessment;
void summaryParams;
void fullParams;
void oldMatch;
void oldResult;
void oldPolicy;
void nullAssessment;
void omittedName;
void nullMatching;
void nullWarnings;
void nullPolicyMatching;

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
client.results.list({ summary: true, status: 'approved' });
// @ts-expect-error Search requires summary mode.
client.results.list({ q: 'Example' });
// @ts-expect-error Status filtering requires summary mode.
client.results.list({ status: 'no_match' });
// @ts-expect-error Review filtering requires summary mode.
client.results.list({ review: 'open' });
// @ts-expect-error Origin filtering requires summary mode.
client.results.list({ origin: 'api' });
// @ts-expect-error Search is unavailable for full results.
client.results.list({ summary: false, q: 'Example' });
// @ts-expect-error Status filtering is unavailable for full results.
client.results.list({ summary: false, status: 'no_match' });
// @ts-expect-error Review filtering is unavailable for full results.
client.results.list({ summary: false, review: 'open' });
// @ts-expect-error Origin filtering is unavailable for full results.
client.results.list({ summary: false, origin: 'api' });
// @ts-expect-error Search requires summary mode.
client.results.iterate({ q: 'Example' });
// @ts-expect-error Status filtering requires summary mode.
client.results.iterate({ status: 'no_match' });
// @ts-expect-error Review filtering requires summary mode.
client.results.iterate({ review: 'open' });
// @ts-expect-error Origin filtering requires summary mode.
client.results.iterate({ origin: 'api' });
// @ts-expect-error Search is unavailable for full results.
client.results.iterate({ summary: false, q: 'Example' });
// @ts-expect-error Status filtering is unavailable for full results.
client.results.iterate({ summary: false, status: 'no_match' });
// @ts-expect-error Review filtering is unavailable for full results.
client.results.iterate({ summary: false, review: 'open' });
// @ts-expect-error Origin filtering is unavailable for full results.
client.results.iterate({ summary: false, origin: 'api' });
// @ts-expect-error A dynamic mode cannot guarantee filters are applied.
client.results.list({ summary: Math.random() > 0.5, q: 'Example' });

void checkResources;
void checkErrors;
void bothCoverage;
void missingCoverage;
void bothBatchInputs;
void minimalBatch;

async function checkNewResources() {
  for await (const result of client.results.iterate(summaryParams, options)) {
    const summary: ScreeningSummary = result;
    void summary;
  }
  for await (const result of client.results.iterate({}, options)) {
    const full: ScreeningResult = result;
    void full;
  }
  for await (const result of client.results.iterate(fullParams, options)) {
    const full: ScreeningResult = result;
    void full;
  }
  for await (const result of client.results.iterate({ summary: Math.random() > 0.5 }, options)) {
    const dynamic: ScreeningResult | ScreeningSummary = result;
    void dynamic;
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
