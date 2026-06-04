/**
 * scripts/pack-compiler.mjs
 *
 * Builds and packs the @microsoft/flint-chart-compiler package as a .tgz.
 *
 * Usage: node scripts/pack-compiler.mjs
 *
 * Steps:
 *   1. Run tsup with the compiler config to produce dist-compiler/
 *   2. Create a staging directory with dist-compiler/, package.json, README, LICENSE
 *   3. Run `pnpm pack` in the staging directory
 *   4. Move the .tgz to the repo root
 *   5. Clean up staging directory
 */

import { execSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, readdirSync, renameSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const STAGING = join(ROOT, '.compiler-pack-staging');
const DIST_COMPILER = join(ROOT, 'dist-compiler');
const TSUP_BIN = join(ROOT, 'node_modules', '.bin', 'tsup');

function run(cmd, opts = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, shell: true, ...opts });
}

// Step 1: Build compiler output
console.log('\n📦 Building @microsoft/flint-chart-compiler...\n');
run(`"${TSUP_BIN}" --config tsup.config.compiler.ts`);

// Step 2: Create staging directory
console.log('\n📁 Staging package...\n');
if (existsSync(STAGING)) {
  rmSync(STAGING, { recursive: true });
}
mkdirSync(STAGING, { recursive: true });

// Copy dist-compiler/ into staging as dist-compiler/
cpSync(DIST_COMPILER, join(STAGING, 'dist-compiler'), { recursive: true });

// Copy package.json, README, LICENSE
cpSync(join(ROOT, 'compiler.package.json'), join(STAGING, 'package.json'));
cpSync(join(ROOT, 'README.md'), join(STAGING, 'README.md'));
cpSync(join(ROOT, 'LICENSE'), join(STAGING, 'LICENSE'));

// Step 3: Pack
console.log('\n🎁 Running pnpm pack...\n');
run('pnpm pack', { cwd: STAGING });

// Step 4: Move .tgz to root
const tgzFiles = readdirSync(STAGING).filter(f => f.endsWith('.tgz'));
if (tgzFiles.length === 0) {
  console.error('❌ No .tgz file produced!');
  process.exit(1);
}

const tgzName = tgzFiles[0];
const dest = join(ROOT, tgzName);
if (existsSync(dest)) {
  rmSync(dest);
}
renameSync(join(STAGING, tgzName), dest);

// Step 5: Clean up
rmSync(STAGING, { recursive: true });

console.log(`\n✅ Package ready: ${tgzName}`);
console.log(`\n   Install in sister repo with:`);
console.log(`   pnpm add ../flint-chart/${tgzName}\n`);
