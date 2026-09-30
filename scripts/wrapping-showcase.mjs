import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const checking = process.argv.includes('--check');
const revision = process.argv.find((arg, index) => index > 1 && arg !== '--check') ?? 'bad6ebd';
const destination = join(root, 'site/src/playground/wrapping-showcase-baseline.json');
const temporary = await mkdtemp(join(tmpdir(), 'flint-wrapping-'));
const bundle = async (entry, name) => {
  const outfile = join(temporary, `${name}.mjs`);
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external' });
  return import(pathToFileURL(outfile).href);
};

try {
  await symlink(join(root, 'node_modules'), join(temporary, 'node_modules'), 'dir');
  const { WRAPPING_EXAMPLES } = await bundle(join(root, 'site/src/playground/wrapping-showcase-data.ts'), 'examples');
  assert.equal(WRAPPING_EXAMPLES.length, 5);
  let baseline;
  if (checking) {
    baseline = JSON.parse(await readFile(destination, 'utf8'));
  } else {
    const commit = execFileSync('git', ['rev-parse', `${revision}^{commit}`], { cwd: root, encoding: 'utf8' }).trim();
    const archive = execFileSync('git', ['archive', commit, 'packages/flint-js/src'], { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    const archivePath = join(temporary, 'source.tar');
    await writeFile(archivePath, archive);
    execFileSync('tar', ['-xf', archivePath, '-C', temporary]);
    const { assembleVegaLite } = await bundle(join(temporary, 'packages/flint-js/src/vegalite/assemble.ts'), 'before');
    baseline = { commit, cases: Object.fromEntries(WRAPPING_EXAMPLES.map(example => [example.id, {
      input: example.input, spec: assembleVegaLite(structuredClone(example.input)),
    }])) };
  }
  const { assembleVegaLite } = await bundle(join(root, 'packages/flint-js/src/vegalite/assemble.ts'), 'after');
  for (const example of WRAPPING_EXAMPLES) {
    const stored = baseline.cases[example.id];
    assert.deepEqual(stored.input, example.input, `${example.id}: regenerate baseline after changing an input`);
    const metrics = [];
    for (const spec of [stored.spec, assembleVegaLite(structuredClone(example.input))]) {
      const view = new View(parse(compile(spec).spec), { renderer: 'none' });
      try {
        await view.runAsync();
        let wrapped = 0;
        let marks = 0;
        const visit = item => {
          if (item.opacity !== 0 && ['axis-label', 'legend-label', 'legend-title'].includes(item.mark?.role)
            && Array.isArray(item.text) && item.text.length > 1) wrapped++;
          if (item.mark?.role === 'mark' && ['rect', 'symbol'].includes(item.mark.marktype)) marks++;
          for (const child of item.items ?? []) visit(child);
        };
        visit(view.scenegraph().root);
        metrics.push({ wrapped, marks });
      } finally { view.finalize(); }
    }
    assert.equal(metrics[0].marks, metrics[1].marks, `${example.id}: data marks changed`);
    assert.ok(metrics[1].marks > 0, `${example.id}: empty chart`);
    assert.ok(metrics[1].wrapped > metrics[0].wrapped, `${example.id}: no demonstrable wrapping improvement`);
    console.log(`${example.id}: ${metrics[0].wrapped} -> ${metrics[1].wrapped} wrapped guides; ${metrics[1].marks} marks`);
  }
  if (!checking) {
    await writeFile(destination, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Frozen before snapshots from ${baseline.commit}`);
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}