import SanctionsKit from 'sanctionskit';

const id = process.env.BATCH_ID;
if (!id) throw new Error('Set BATCH_ID to the ID returned by the batch example.');

const client = new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY });
const { data: batch } = await client.batches.waitForCompletion(id, {
  timeoutMs: 300_000,
  pollIntervalMs: 5000,
});
console.log(JSON.stringify({ id, status: batch.status, completed: batch.completed, failed: batch.failed }));

let unsuccessful = batch.status !== 'completed' || batch.failed > 0;
for await (const row of client.batches.iterateRows(id, { limit: 100 })) {
  if (row.status !== 'completed') unsuccessful = true;
  console.log(JSON.stringify({
    row: row.row_number,
    status: row.status,
    screeningId: row.screening_id,
    errorCode: row.error?.code,
  }));
}
if (unsuccessful) process.exitCode = 1;
