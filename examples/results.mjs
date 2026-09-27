import SanctionsKit from 'sanctionskit';

const client = new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY });
for await (const result of client.results.iterate({ summary: true, limit: 100 })) {
  console.log(JSON.stringify({ id: result.id, status: result.status }));
}
