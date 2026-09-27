import SanctionsKit from 'sanctionskit';

const sourceId = process.env.SOURCE_ID;
if (!sourceId) throw new Error('Set SOURCE_ID to the list you want to screen against.');

const client = new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY });
const { data: sources } = await client.sources.list();
const source = sources.find(({ id }) => id === sourceId);
if (!source || source.availability !== 'available' || source.fresh === false) {
  throw new Error(`Source ${sourceId} is unavailable in this environment.`);
}
if (!source.capabilities.includes('person')) {
  throw new Error(`Source ${sourceId} does not support person screening.`);
}

const { data } = await client.screenings.create(
  {
    subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' },
    sources: [sourceId],
    reference: 'example-list-screening',
  },
  { idempotencyKey: process.env.REQUEST_KEY },
);

console.log(JSON.stringify({ id: data.id, status: data.status, coverage: data.coverage, versions: data.versions }, null, 2));
