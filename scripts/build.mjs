import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url));

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true });
for (const config of ['tsconfig.json', 'tsconfig.cjs.json']) {
  execFileSync(process.execPath, [compiler, '-p', config], { cwd: root, stdio: 'inherit' });
}
mkdirSync(new URL('../dist/cjs', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/cjs/package.json', import.meta.url), '{"type":"commonjs"}\n');
