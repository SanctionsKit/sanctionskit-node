import { SanctionsKit, SanctionsKitError, verifyWebhook, type ScreeningRequest, type MonitorControl, type BatchWaitOptions, type AppliedMatchingPolicy, type MatchAssessment, type ScreeningWarning, type ScreeningResult, type ScreeningSummary, type ResultsListParams } from 'sanctionskit';

const client = new SanctionsKit({ apiKey: 'example-key' });
const request: ScreeningRequest = {
  subject: { name: 'Example Trading' },
  package: 'sandbox@1',
};

async function checkCommonJS() {
  try {
    const response = await client.screenings.create(request, { idempotencyKey: 'screening-example-1' });
    const id: string = response.data.id;
    const matching: AppliedMatchingPolicy | undefined = response.data.matching;
    const assessment: MatchAssessment | undefined = response.data.matches[0]?.assessment;
    const warning: ScreeningWarning | undefined = response.data.warnings?.[0];
    const params: ResultsListParams = { summary: true, q: 'Example', status: 'no_match' };
    const page = await client.results.list(params);
    const summary: ScreeningSummary | undefined = page.data.items[0];
    for await (const item of client.results.iterate({ summary: false })) {
      const full: ScreeningResult = item;
      void full;
    }
    void matching;
    void assessment;
    void warning;
    void summary;
    return id;
  } catch (error) {
    if (error instanceof SanctionsKitError) return error.code;
    throw error;
  }
}

void checkCommonJS;

const control: MonitorControl = { expectedRevision: 1, status: 'paused' };
const wait: BatchWaitOptions = { timeoutMs: 1000 };
const valid: boolean = verifyWebhook('secret', new Headers(), new Uint8Array());
void client.monitoring.update('monitor-1', control, { idempotencyKey: 'monitor-example-1' });
void client.batches.waitForCompletion('batch-1', wait);
void valid;

// @ts-expect-error Full results do not apply summary filters.
client.results.list({ summary: false, status: 'no_match' });
// @ts-expect-error Filtered iteration requires summary mode.
client.results.iterate({ q: 'Example' });
