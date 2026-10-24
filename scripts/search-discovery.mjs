import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const packageName = 'sanctionskit';
const resultLimit = 250;
const concurrency = 3;
const requestIntervalMs = 2_000;
const queryFamilies = {
  brand: ['sanctionskit'],
  sanctions: ['sanctions', 'sanction', 'sanctions screening', 'sanction screening', 'sanctions api', 'sanctions check'],
  ofac: ['ofac', 'ofac screening', 'ofac api', 'ofac sdn', 'sdn', 'specially designated nationals'],
  watchlists: ['watchlist', 'watchlist screening', 'watchlist monitoring', 'sanctions list'],
  trade: ['restricted party screening', 'restricted party', 'denied party screening', 'denied persons list', 'export control screening', 'trade compliance'],
  lists: ['uk sanctions', 'eu sanctions', 'un sanctions', 'bis', 'bis denied persons', 'consolidated screening list', 'us csl', 'ofsi', 'canada sanctions', 'swiss sanctions', 'seco', 'japan sanctions', 'ofac non sdn'],
  diligence: ['aml', 'aml screening', 'anti money laundering', 'kyc', 'kyb', 'due diligence', 'customer due diligence'],
  entities: ['customer screening', 'customer sanctions screening', 'entity screening', 'vendor screening', 'supplier screening', 'counterparty screening'],
  workflows: ['batch screening', 'bulk screening', 'sanctions monitoring', 'ongoing monitoring', 'sanctions webhook', 'screening audit trail'],
  runtime: ['sanctions nodejs', 'sanctions typescript', 'ofac nodejs', 'ofac typescript', 'watchlist sdk'],
};
const queries = Object.entries(queryFamilies).flatMap(([family, terms]) =>
  terms.map((query) => ({ family, query })));

if (process.argv.length > 3 || process.argv.includes('--help')) {
  console.log('Usage: node scripts/search-discovery.mjs [new-output.json]');
  console.log('Without a path, prints JSON. Existing output files are never overwritten.');
  process.exit(process.argv.includes('--help') ? 0 : 1);
}

const outputPath = process.argv[2] ? resolve(process.argv[2]) : null;
if (outputPath) {
  try {
    await access(outputPath);
    throw new Error(`Output already exists: ${outputPath}`);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

let nextRequestAt = 0;
let requestQueue = Promise.resolve();
let rateLimitError;
async function fetchJSON(url) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (rateLimitError) throw rateLimitError;
    requestQueue = requestQueue.then(async () => {
      while (nextRequestAt > Date.now()) {
        if (rateLimitError) throw rateLimitError;
        await setTimeout(nextRequestAt - Date.now());
      }
      nextRequestAt = Date.now() + requestIntervalMs;
    });
    await requestQueue;
    if (rateLimitError) throw rateLimitError;
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'cache-control': 'no-cache' },
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 429) {
      const retryAfter = response.headers.get('retry-after');
      const seconds = Number(retryAfter);
      const retryMs = retryAfter && Number.isFinite(seconds)
        ? seconds * 1_000 : Date.parse(retryAfter ?? '') - Date.now();
      const cooldownMs = Number.isFinite(retryMs) ? Math.max(retryMs, 1_000) : 30_000;
      await response.body?.cancel();
      nextRequestAt = Math.max(nextRequestAt, Date.now() + cooldownMs);
      if (attempt === 1 || cooldownMs > 60_000) {
        rateLimitError = new Error('npm search rate limit reached; retry this audit later.');
        throw rateLimitError;
      }
      continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.json();
  }
}

async function search({ family, query }) {
  const url = new URL('https://registry.npmjs.org/-/v1/search');
  url.searchParams.set('text', query);
  url.searchParams.set('size', String(resultLimit));
  url.searchParams.set('from', '0');
  const result = await fetchJSON(url);
  if (!Array.isArray(result.objects) || !Number.isFinite(result.total)) {
    throw new Error(`Unexpected search response for ${query}`);
  }
  const index = result.objects.findIndex(({ package: pkg }) => pkg.name === packageName);
  return {
    family,
    query,
    observedAt: new Date().toISOString(),
    total: result.total,
    inspected: result.objects.length,
    rank: index < 0 ? null : index + 1,
    indexedVersion: index < 0 ? null : result.objects[index].package.version,
    registryTime: result.time ?? null,
  };
}

const startedAt = new Date().toISOString();
const jobs = [
  { key: 'latest', run: () => fetchJSON(`https://registry.npmjs.org/${packageName}/latest`) },
  { key: 'lastWeek', run: () => fetchJSON(`https://api.npmjs.org/downloads/point/last-week/${packageName}`) },
  { key: 'lastMonth', run: () => fetchJSON(`https://api.npmjs.org/downloads/point/last-month/${packageName}`) },
  ...queries.map((query) => ({ key: query.query, run: () => search(query) })),
];
const outcomes = new Array(jobs.length);
let next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < jobs.length) {
    const index = next++;
    try {
      outcomes[index] = { value: await jobs[index].run() };
    } catch (error) {
      const cause = error.cause?.code ? ` (${error.cause.code})` : '';
      outcomes[index] = { error: `${error.message}${cause}` };
    }
  }
}));

const results = queries.map((query, index) => outcomes[index + 3].value ?? {
  ...query,
  error: outcomes[index + 3].error,
});
function coverage(items) {
  const measured = items.filter((item) => !item.error);
  return {
    queries: items.length,
    measured: measured.length,
    top20: measured.filter(({ rank }) => rank !== null && rank <= 20).length,
    top50: measured.filter(({ rank }) => rank !== null && rank <= 50).length,
    top250: measured.filter(({ rank }) => rank !== null && rank <= 250).length,
    notObserved: measured.filter(({ rank }) => rank === null).length,
    errors: items.length - measured.length,
  };
}
const errors = outcomes.flatMap((outcome, index) =>
  outcome.error ? [{ request: jobs[index].key, message: outcome.error }] : []);
const latest = outcomes[0].value;
const report = {
  schemaVersion: 1,
  queryMatrixVersion: 1,
  package: packageName,
  startedAt,
  finishedAt: new Date().toISOString(),
  method: {
    endpoint: 'https://registry.npmjs.org/-/v1/search',
    ordering: 'registry default; no custom sort or scoring parameters',
    resultLimit,
    concurrency,
    requestIntervalMs,
    rankMeaning: 'One-based position among returned results; null means not observed in the first 250, not necessarily absent from the index.',
  },
  latest: latest ? {
    version: latest.version,
    description: latest.description,
    keywords: latest.keywords ?? [],
  } : null,
  indexedVersions: [...new Set(results.map(({ indexedVersion }) => indexedVersion).filter(Boolean))],
  downloads: {
    lastWeek: outcomes[1].value ?? null,
    lastMonth: outcomes[2].value ?? null,
  },
  coverage: coverage(results),
  families: Object.fromEntries(Object.keys(queryFamilies).map((family) =>
    [family, coverage(results.filter((result) => result.family === family))])),
  results,
  errors,
};
const json = `${JSON.stringify(report, null, 2)}\n`;
if (outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, json, { flag: 'wx' });
  console.log(`Saved ${results.length} queries to ${outputPath}`);
  console.log(`Top 20: ${report.coverage.top20}; top 250: ${report.coverage.top250}; errors: ${errors.length}`);
} else {
  process.stdout.write(json);
}
if (errors.length) process.exitCode = 1;
