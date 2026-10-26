import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'sanctionskit-package-'));
const consumer = join(temporary, 'consumer');
const cache = join(temporary, 'npm-cache');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const npmCLI = process.env.npm_execpath;

function run(command, args, cwd) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, NODE_PATH: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    if (error.stdout) process.stderr.write(error.stdout);
    if (error.stderr) process.stderr.write(error.stderr);
    throw error;
  }
}

function npm(args, cwd) {
  const flags = [...args, '--offline', '--cache', cache, '--no-audit', '--no-fund'];
  return npmCLI
    ? run(process.execPath, [npmCLI, ...flags], cwd)
    : run(process.platform === 'win32' ? 'npm.cmd' : 'npm', flags, cwd);
}

try {
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(manifest[field] ?? {}, {}, `The SDK must not require ${field}.`);
  }

  npm(['pack', '--pack-destination', temporary], root);
  const archives = readdirSync(temporary).filter((name) => name.endsWith('.tgz'));
  assert.equal(archives.length, 1, 'Expected one package tarball.');

  cpSync(join(root, 'tests/package-consumer'), consumer, { recursive: true });
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  npm(['install', '--ignore-scripts', '--package-lock=false', join(temporary, archives[0])], consumer);

  const installed = join(consumer, 'node_modules', manifest.name);
  const installedManifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  assert.equal(installedManifest.version, manifest.version);
  assert.deepEqual(readdirSync(installed).sort(), ['CHANGELOG.md', 'COMPATIBILITY.md', 'LICENSE', 'README.md', 'dist', 'package.json']);
  for (const mode of ['esm.mjs', 'commonjs.cjs']) {
    run(process.execPath, [mode], consumer);
  }

  for (const fixture of ['types.mts', 'types.cts']) {
    cpSync(join(root, 'tests', fixture), join(consumer, fixture));
  }
  run(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.json'], consumer);
  console.log(`Verified ${manifest.name}@${manifest.version}: installed tarball, ESM, CommonJS, and TypeScript consumers.`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
