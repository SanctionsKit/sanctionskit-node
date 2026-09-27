import { SanctionsKit, SanctionsKitError, verifyWebhook, type ScreeningRequest, type MonitorControl, type BatchWaitOptions } from 'sanctionskit';

const client = new SanctionsKit({ apiKey: 'example-key' });
const request: ScreeningRequest = {
  subject: { name: 'Example Trading' },
  package: 'sandbox@1',
};

async function checkCommonJS() {
  try {
    const response = await client.screenings.create(request, { idempotencyKey: 'screening-example-1' });
    const id: string = response.data.id;
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
