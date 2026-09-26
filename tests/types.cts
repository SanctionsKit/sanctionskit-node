import { SanctionsKit, SanctionsKitError, type ScreeningRequest } from 'sanctionskit';

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
