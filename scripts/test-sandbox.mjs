import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import SanctionsKit, { SanctionsKitError } from '../dist/index.js';

export async function checkSandbox(client, { runId = randomUUID(), record = () => {}, resource = () => {} } = {}) {
  const write = (operation) => ({ idempotencyKey: `sdk-acceptance:${runId}:${operation}` });
  const { data: usage } = await client.usage.retrieve();
  assert.equal(usage.environment, 'sandbox', 'Sandbox verification refuses a production key.');
  assert.ok(usage.remaining >= 5, 'At least five sandbox screening units must remain.');
  record('sandbox environment');

  const { data: policies } = await client.policies.list();
  assert.equal(policies.requirePolicy, false, 'Use a sandbox test workspace without a required policy.');
  const { data: sources } = await client.sources.list();
  assert.ok(Array.isArray(sources), 'Source discovery must return an array.');
  record('source and policy discovery');

  const matchRequest = {
    subject: { name: 'Alex Morgan', entityType: 'person', birthDate: '1984' },
    package: 'sandbox@1',
    reference: `sdk-acceptance:${runId}:match`,
  };
  const noMatchRequest = {
    subject: { name: 'Juniper Example Cooperative', entityType: 'organization' },
    package: 'sandbox@1',
    reference: `sdk-acceptance:${runId}:no-match`,
  };
  const { data: match } = await client.screenings.create(matchRequest, write('match'));
  assert.equal(match.environment, 'sandbox');
  assert.equal(match.status, 'potential_match');
  assert.ok(match.matches.length > 0);
  assert.ok(match.matching?.version, 'New results must retain the applied matching profile.');
  assert.ok(match.matches[0].assessment, 'New matches must include their assessment.');
  assert.ok(match.coverage.length > 0);
  assert.ok(match.coverage.every((source) => source.sourceId === 'sandbox-synthetic'));
  const { data: replay } = await client.screenings.create(matchRequest, write('match'));
  assert.equal(replay.id, match.id, 'An idempotent replay must return the same screening.');
  await assert.rejects(
    client.screenings.create(noMatchRequest, write('match')),
    (error) => error instanceof SanctionsKitError && error.status === 409,
  );
  const { data: noMatch } = await client.screenings.create(noMatchRequest, write('no-match'));
  assert.equal(noMatch.environment, 'sandbox');
  assert.equal(noMatch.status, 'no_match');
  assert.equal(noMatch.matches.length, 0);
  record('screening outcomes and idempotency');

  const { data: retained } = await client.results.retrieve(match.id);
  assert.equal(retained.id, match.id);
  assert.equal(retained.subject.name, matchRequest.subject.name);
  assert.equal(retained.subject.entityType, matchRequest.subject.entityType);
  assert.equal(retained.subject.birthDate, matchRequest.subject.birthDate);
  const evidence = await client.results.evidence(match.id);
  assert.equal(evidence.format, 'sanctionskit-evidence@1');
  assert.equal(evidence.result.id, match.id);
  assert.equal(evidence.retainedInputs, true);
  assert.deepEqual(evidence.result.matching, match.matching);
  const { data: filtered } = await client.results.list({ summary: true, q: noMatch.id, status: 'no_match' });
  assert.equal(filtered.items.length, 1);
  assert.equal(filtered.items[0].id, noMatch.id);
  const seen = new Set();
  for await (const item of client.results.iterate({ limit: 1 }, { signal: AbortSignal.timeout(30_000) })) {
    assert.equal(item.environment, 'sandbox');
    assert.ok(!seen.has(item.id), 'Pagination must advance.');
    seen.add(item.id);
    if (seen.size === 2) break;
  }
  assert.equal(seen.size, 2);
  record('retained evidence, summary filters, and pagination');

  let batchId;
  let batchFinished = false;
  let monitorId;
  let primaryError;
  try {
    const { data: accepted } = await client.batches.create({
      name: `SDK acceptance ${runId}`,
      subjects: [matchRequest, noMatchRequest],
    }, write('batch'));
    batchId = accepted.id;
    resource('batch', batchId);
    const { data: batch } = await client.batches.waitForCompletion(batchId, { timeoutMs: 180_000, pollIntervalMs: 2000 });
    batchFinished = true;
    assert.equal(batch.status, 'completed');
    assert.equal(batch.completed, 2);
    assert.equal(batch.failed, 0);
    const rows = [];
    for await (const row of client.batches.iterateRows(batchId, { limit: 1 }, { signal: AbortSignal.timeout(30_000) })) {
      rows.push(row);
      assert.ok(rows.length <= 2, 'The acceptance batch must contain only two rows.');
    }
    assert.equal(rows.length, 2);
    assert.equal(new Set(rows.map((row) => row.row_number)).size, 2);
    assert.ok(rows.every((row) => row.status === 'completed' && row.screening_id));
    record('batch completion and row pagination');

    const { data: created } = await client.monitors.create({
      name: `SDK acceptance ${runId}`,
      subject: matchRequest.subject,
      package: 'sandbox@1',
    }, write('monitor'));
    monitorId = created.id;
    resource('monitor', monitorId);
    const deadline = Date.now() + 180_000;
    let current;
    do {
      const { data } = await client.monitoring.list({ monitorId });
      current = data.items.find((item) => item.id === monitorId);
      assert.ok(current, 'The created monitor must be readable.');
      assert.notEqual(current.health, 'failed', 'The initial sandbox monitor screening failed.');
      if (current.lastSuccessfulAt && current.lastScreeningId) break;
      assert.ok(Date.now() < deadline, 'The sandbox monitor did not finish within three minutes.');
      await delay(2000);
    } while (true);
    const { data: monitored } = await client.results.retrieve(current.lastScreeningId);
    assert.equal(monitored.environment, 'sandbox');
    assert.equal(monitored.status, 'potential_match');
    await client.monitoring.update(monitorId, { expectedRevision: current.revision, status: 'paused' }, write('pause'));
    const { data: paused } = await client.monitors.retrieve(monitorId);
    assert.equal(paused.status, 'paused');
    await client.monitoring.update(monitorId, { expectedRevision: paused.revision, status: 'active' }, write('resume'));
    const { data: resumed } = await client.monitors.retrieve(monitorId);
    assert.equal(resumed.status, 'active');
    const { data: inbox } = await client.monitoring.inbox.list({ monitorId, status: 'all' });
    assert.ok(Array.isArray(inbox.items));
    record('monitor screening, controls, and inbox');
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    if (monitorId) {
      try {
        const { data: deleted } = await client.monitors.delete(monitorId);
        assert.equal(deleted.status, 'deleted');
        record('test monitor removed');
      } catch (error) { cleanupErrors.push(error); }
    }
    if (batchId && !batchFinished) {
      try { await client.batches.cancel(batchId); }
      catch (error) { cleanupErrors.push(error); }
    }
    if (cleanupErrors.length) throw new AggregateError(
      [...(primaryError ? [primaryError] : []), ...cleanupErrors],
      'Sandbox resource cleanup failed; inspect the resources in .sandbox-report.json.',
    );
  }
}

async function main() {
  if (!process.env.SANCTIONSKIT_API_KEY && existsSync('.env.sandbox')) process.loadEnvFile('.env.sandbox');
  if (!process.env.SANCTIONSKIT_API_KEY) throw new Error('Set a sandbox SANCTIONSKIT_API_KEY or save it in .env.sandbox.');
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const report = { version, runId: randomUUID(), startedAt: new Date().toISOString(), status: 'running', resources: {}, checks: [], webhookDelivery: 'not exercised; signature verification is covered by offline tests' };
  const describeError = (error) => error instanceof SanctionsKitError
    ? { code: error.code, status: error.status, requestId: error.requestId }
    : { message: error.message, ...(error instanceof AggregateError ? { errors: error.errors.map(describeError) } : {}) };
  try {
    await checkSandbox(new SanctionsKit({ apiKey: process.env.SANCTIONSKIT_API_KEY }), {
      runId: report.runId,
      record(check) { report.checks.push(check); console.log(`Passed: ${check}`); },
      resource(kind, id) { report.resources[kind] = id; },
    });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = describeError(error);
    process.exitCode = 1;
    console.error('Sandbox verification failed. See .sandbox-report.json.');
  } finally {
    report.finishedAt = new Date().toISOString();
    writeFileSync('.sandbox-report.json', `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
