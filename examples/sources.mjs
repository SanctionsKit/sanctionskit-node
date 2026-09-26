import SanctionsKit from 'sanctionskit';

const client = new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY });
const { data } = await client.sources.list();
console.log(JSON.stringify(data, null, 2));
