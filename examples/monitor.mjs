import SanctionsKit from 'sanctionskit';

const client = new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY });
const { data } = await client.monitors.create(
  {
    name: 'Example customer monitoring',
    subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' },
    package: 'sandbox@1',
  },
  { idempotencyKey: process.env.REQUEST_KEY },
);

console.log(JSON.stringify({ id: data.id, status: data.status }));
console.log('The first screening is queued. Read monitoring health for the completed result.');
