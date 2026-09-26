import SanctionsKit, { type ScreeningRequest } from 'sanctionskit';

const apiKey = process.env.SANCTIONSKIT_API_KEY;
const idempotencyKey = process.env.REQUEST_KEY;
if (!apiKey || !idempotencyKey) {
  throw new Error('Set SANCTIONSKIT_API_KEY and REQUEST_KEY before running this example.');
}

const client = new SanctionsKit({ apiKey });
const request: ScreeningRequest = {
  subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' },
  package: 'sandbox@1',
  reference: 'example-customer-001',
};

const { data } = await client.screenings.create(request, { idempotencyKey });
console.log(JSON.stringify(data, null, 2));
