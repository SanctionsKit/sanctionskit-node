import SanctionsKit from 'sanctionskit';

const apiKey = process.env.SANCTIONSKIT_API_KEY;
const idempotencyKey = process.env.REQUEST_KEY;
if (!apiKey || !idempotencyKey) {
  throw new Error('Set SANCTIONSKIT_API_KEY and REQUEST_KEY before running this example.');
}

const client = new SanctionsKit({ apiKey });
const { data } = await client.batches.create(
  {
    name: 'Sandbox example',
    subjects: [
      { subject: { name: 'Alex Morgan', entityType: 'person' }, package: 'sandbox@1' },
      { subject: { name: 'Example Trading Company', entityType: 'organization' }, package: 'sandbox@1' },
    ],
  },
  { idempotencyKey },
);

console.log('Batch accepted:', data.id, data.status);
console.log('Check progress with: BATCH_ID=' + data.id + ' node examples/batch-results.mjs');
