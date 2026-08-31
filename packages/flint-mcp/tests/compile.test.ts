// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runCompile, type CompileIo } from '../src/cli.js';

function chartInput(data: unknown): string {
  return JSON.stringify({
    data,
    semantic_types: { region: 'Category', revenue: 'Quantity' },
    chart_spec: {
      chartType: 'Bar Chart',
      title: 'Revenue by region',
      encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
    },
  });
}

const CSV = 'region,revenue\nNorth,120\nSouth,90\nEast,150\n';

interface IoHarness {
  io: CompileIo;
  stdout(): Buffer;
  stdoutText(): string;
  stderrText(): string;
  setStdin(text: string): void;
}

function makeIo(): IoHarness {
  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  let stdinText = '';
  return {
    io: {
      readStdin: () => stdinText,
      stdout: (data) => stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data)),
      stderr: (line) => stderrChunks.push(Buffer.from(line)),
    },
    stdout: () => Buffer.concat(stdoutChunks),
    stdoutText: () => Buffer.concat(stdoutChunks).toString('utf8'),
    stderrText: () => Buffer.concat(stderrChunks).toString('utf8'),
    setStdin: (text) => {
      stdinText = text;
    },
  };
}

let root: string;

beforeEach(() => {
  // realpathSync so macOS /var → /private/var symlink doesn't surprise path
  // resolution in stderr assertions.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'flint-cli-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('compile: argument parsing', () => {
  it('prints help and exits 0 for --help / -h', async () => {
    for (const flag of ['--help', '-h']) {
      const harness = makeIo();
      expect(await runCompile([flag], harness.io)).toBe(0);
      expect(harness.stdoutText()).toContain('flint compile');
    }
  });

  it('help documents data.url resolution', async () => {
    const harness = makeIo();
    await runCompile(['--help'], harness.io);
    expect(harness.stdoutText()).toMatch(/data\.url/i);
    expect(harness.stdoutText()).toMatch(/working directory when reading from stdin/i);
  });

  it('prints version and exits 0 for --version / -v', async () => {
    for (const flag of ['--version', '-v']) {
      const harness = makeIo();
      expect(await runCompile([flag], harness.io)).toBe(0);
      expect(harness.stdoutText().trim()).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it('errors with exit 2 when input is missing', async () => {
    const harness = makeIo();
    expect(await runCompile([], harness.io)).toBe(2);
    expect(harness.stderrText()).toContain('Missing <input> argument.');
  });

  it('errors with exit 2 on unknown options', async () => {
    const harness = makeIo();
    expect(await runCompile(['--bogus', 'x.json'], harness.io)).toBe(2);
    expect(harness.stderrText()).toContain('Unknown compile option: --bogus');
  });

  it('rejects a single-dash "-output" typo as an unknown option (exit 2)', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [] }));
    const harness = makeIo();
    expect(await runCompile(['-output', 'x.svg', chartPath], harness.io)).toBe(2);
    expect(harness.stderrText()).toContain('Unknown compile option: -output');
  });

  it('still accepts the joined -o<path> form', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [{ region: 'North', revenue: 1 }] }));
    const outPath = join(root, 'joined.svg');
    const harness = makeIo();
    expect(await runCompile([`-o${outPath}`, chartPath], harness.io)).toBe(0);
    expect(readFileSync(outPath, 'utf8')).toContain('<svg');
  });

  it('errors with exit 2 on a bad backend, format, or scale', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [] }));
    const harness = makeIo();
    expect(await runCompile([chartPath, '--backend', 'nope'], harness.io)).toBe(2);
    expect(await runCompile([chartPath, '--format', 'gif'], harness.io)).toBe(2);
    expect(await runCompile([chartPath, '--scale', '9'], harness.io)).toBe(2);
    expect(await runCompile([chartPath, '--scale', 'abc'], harness.io)).toBe(2);
  });

  it('rejects chartjs with svg output (exit 2)', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [] }));
    const harness = makeIo();
    expect(await runCompile([chartPath, '--backend', 'chartjs', '--format', 'svg'], harness.io)).toBe(2);
    expect(harness.stderrText()).toMatch(/chartjs backend supports png output only/);
  });
});

describe('compile: input reading and exit codes', () => {
  it('errors with exit 1 for a missing input file', async () => {
    const harness = makeIo();
    expect(await runCompile([join(root, 'missing.json')], harness.io)).toBe(1);
    expect(harness.stderrText()).toContain('Failed to read input file');
  });

  it('errors with exit 1 for invalid JSON', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, '{not json');
    const harness = makeIo();
    expect(await runCompile([chartPath], harness.io)).toBe(1);
    expect(harness.stderrText()).toContain('Invalid JSON');
  });

  it('errors with exit 2 when the JSON is not a ChartAssemblyInput', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, JSON.stringify({ hello: 'world' }));
    const harness = makeIo();
    expect(await runCompile([chartPath], harness.io)).toBe(2);
    expect(harness.stderrText()).toContain('ChartAssemblyInput');
  });

  it('reports render failures with exit 1 (remote data.url)', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ url: 'https://example.com/sales.csv' }));
    const harness = makeIo();
    expect(await runCompile([chartPath], harness.io)).toBe(1);
    expect(harness.stderrText()).toContain('Compile failed');
  });
});

describe('compile: rendering and output', () => {
  it('resolves relative data.url against the input file directory and writes <input>.svg', async () => {
    writeFileSync(join(root, 'sales.csv'), CSV);
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ url: 'sales.csv' }));

    const harness = makeIo();
    expect(await runCompile([chartPath], harness.io)).toBe(0);
    expect(harness.stdoutText()).toBe(''); // written to file, not stdout

    const svgPath = join(root, 'chart.svg');
    const svg = readFileSync(svgPath, 'utf8');
    expect(svg).toContain('<svg');
    expect(harness.stderrText()).toContain('Wrote vegalite · svg');
    expect(harness.stderrText()).toContain(svgPath);
  });

  it('writes PNG binary output for --format png', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [{ region: 'North', revenue: 1 }] }));

    const harness = makeIo();
    expect(await runCompile([chartPath, '--format', 'png'], harness.io)).toBe(0);
    const pngPath = join(root, 'chart.png');
    const bytes = readFileSync(pngPath);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(harness.stderrText()).toContain('Wrote vegalite · png');
  });

  it('writes to stdout with -o - or --output -', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [{ region: 'North', revenue: 1 }] }));

    for (const flag of ['-o', '--output']) {
      const harness = makeIo();
      expect(await runCompile([chartPath, flag, '-'], harness.io)).toBe(0);
      expect(harness.stdoutText()).toContain('<svg');
    }
  });

  it('writes to stdout when input is stdin ("-") and resolves data.url against cwd', async () => {
    writeFileSync(join(root, 'sales.csv'), CSV);
    const harness = makeIo();
    harness.setStdin(chartInput({ url: 'sales.csv' }));

    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      expect(await runCompile(['-'], harness.io)).toBe(0);
    } finally {
      process.chdir(previousCwd);
    }
    expect(harness.stdoutText()).toContain('<svg');
  });

  it('honors --output with a custom path', async () => {
    const chartPath = join(root, 'chart.json');
    writeFileSync(chartPath, chartInput({ values: [{ region: 'North', revenue: 1 }] }));
    const outPath = join(root, 'custom', 'result.svg');
    mkdirSync(join(root, 'custom'), { recursive: true });

    const harness = makeIo();
    expect(await runCompile([chartPath, '--output', outPath], harness.io)).toBe(0);
    expect(readFileSync(outPath, 'utf8')).toContain('<svg');
  });
});
