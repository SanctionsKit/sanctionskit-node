import SanctionsKit from 'sanctionskit';

const id = process.env.BATCH_ID;
if (!id) throw new Error('Set BATCH_ID to the ID returned by the batch example.');

const client = new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY });
let offset = 0;

do {
  const { data } = await client.batches.retrieve(id, { limit: 100, offset });
  console.log(JSON.stringify(data, null, 2));
  if (data.nextOffset === null) break;
  offset = data.nextOffset;
} while (true);
