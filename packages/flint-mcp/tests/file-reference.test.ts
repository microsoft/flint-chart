// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ChartAssemblyInput } from 'flint-chart';
import { resolveDataSource } from '../src/render/index.js';

const CHART_SPEC = {
  chartType: 'Bar Chart',
  encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
};

function inputWithUrl(url: string): ChartAssemblyInput {
  return {
    data: { url },
    semantic_types: { region: 'Category', revenue: 'Quantity' },
    chart_spec: CHART_SPEC,
  } as unknown as ChartAssemblyInput;
}

const CSV = 'region,revenue\nNorth,120\nSouth,90\nEast,150\n';

let root: string;

beforeEach(() => {
  // realpathSync so macOS /var → /private/var symlink doesn't surprise the
  // path resolution.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'flint-file-ref-')));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('trust mode (default): local data.url loading', () => {
  it('reads a relative reference against the working directory', () => {
    writeFileSync(join(root, 'sales.csv'), CSV);
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const out = resolveDataSource(inputWithUrl('sales.csv'), {});
      expect((out.data as any).values).toHaveLength(3);
      expect((out.data as any).values[0]).toEqual({ region: 'North', revenue: 120 });
      expect((out.data as any).url).toBeUndefined();
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('reads a relative reference from the first client root that has it', () => {
    mkdirSync(join(root, 'empty'));
    mkdirSync(join(root, 'project'));
    writeFileSync(join(root, 'project', 'sales.csv'), CSV);
    const out = resolveDataSource(inputWithUrl('sales.csv'), { roots: [join(root, 'empty'), join(root, 'project')] });
    expect((out.data as any).values).toHaveLength(3);
  });

  it('lists every place it looked and asks for an absolute path when a relative reference is missing', () => {
    expect(() => resolveDataSource(inputWithUrl('missing.csv'), { roots: [root] })).toThrow(
      new RegExp(`looked in: ${join(root, 'missing.csv')}, .*missing\\.csv\\); pass an absolute path$`),
    );
  });

  it('reads a "./"-prefixed relative reference', () => {
    writeFileSync(join(root, 'sales.csv'), CSV);
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const out = resolveDataSource(inputWithUrl('./sales.csv'), {});
      expect((out.data as any).values).toHaveLength(3);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('reads a nested relative reference', () => {
    mkdirSync(join(root, 'reports', '2026'), { recursive: true });
    writeFileSync(join(root, 'reports', '2026', 'sales.csv'), CSV);
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      const out = resolveDataSource(inputWithUrl('reports/2026/sales.csv'), {});
      expect((out.data as any).values).toHaveLength(3);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('reads an absolute path', () => {
    const abs = join(root, 'sales.csv');
    writeFileSync(abs, CSV);
    const out = resolveDataSource(inputWithUrl(abs), {});
    expect((out.data as any).values).toHaveLength(3);
  });

  it('reads a file:// URL', () => {
    const abs = join(root, 'sales.csv');
    writeFileSync(abs, CSV);
    const url = pathToFileURL(abs).href;
    const out = resolveDataSource(inputWithUrl(url), {});
    expect((out.data as any).values).toHaveLength(3);
  });

  it('loads a JSON array file', () => {
    const abs = join(root, 'sales.json');
    writeFileSync(abs, JSON.stringify([{ region: 'North', revenue: 120 }]));
    const out = resolveDataSource(inputWithUrl(abs), {});
    expect((out.data as any).values).toEqual([{ region: 'North', revenue: 120 }]);
  });

  it('loads a JSON { values: [...] } wrapper file', () => {
    const abs = join(root, 'sales.json');
    writeFileSync(abs, JSON.stringify({ values: [{ region: 'North', revenue: 120 }] }));
    const out = resolveDataSource(inputWithUrl(abs), {});
    expect((out.data as any).values).toEqual([{ region: 'North', revenue: 120 }]);
  });

  it('loads a TSV file', () => {
    const abs = join(root, 'sales.tsv');
    writeFileSync(abs, 'region\trevenue\nNorth\t120\n');
    const out = resolveDataSource(inputWithUrl(abs), {});
    expect((out.data as any).values).toEqual([{ region: 'North', revenue: 120 }]);
  });
});

describe('trust mode (default): error handling', () => {
  it('reports a not-found error for a missing local reference', () => {
    expect(() =>
      resolveDataSource(inputWithUrl(join(root, 'definitely-missing.csv')), {}),
    ).toThrow(/not found/i);
  });

  it('rejects an unsupported file extension', () => {
    const abs = join(root, 'notes.txt');
    writeFileSync(abs, 'hello');
    expect(() => resolveDataSource(inputWithUrl(abs), {})).toThrow(
      /\.json, \.csv, or \.tsv/i,
    );
  });

  it('blocks remote http(s) URLs', () => {
    expect(() =>
      resolveDataSource(inputWithUrl('https://example.com/sales.csv'), {}),
    ).toThrow(/remote data\.url fetching is disabled/i);
  });
});

describe('disableFileReference: local file references rejected', () => {
  it('rejects a local relative data.url reference', () => {
    writeFileSync(join(root, 'sales.csv'), CSV);
    const previousCwd = process.cwd();
    try {
      process.chdir(root);
      expect(() =>
        resolveDataSource(inputWithUrl('sales.csv'), { disableFileReference: true }),
      ).toThrow(/disabled on this server/i);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('rejects a local absolute data.url reference', () => {
    const abs = join(root, 'sales.csv');
    writeFileSync(abs, CSV);
    expect(() =>
      resolveDataSource(inputWithUrl(abs), { disableFileReference: true }),
    ).toThrow(/disabled on this server/i);
  });

  it('rejects a local file:// URL reference', () => {
    const abs = join(root, 'sales.csv');
    writeFileSync(abs, CSV);
    const url = pathToFileURL(abs).href;
    expect(() =>
      resolveDataSource(inputWithUrl(url), { disableFileReference: true }),
    ).toThrow(/disabled on this server/i);
  });

  it('still accepts inline data.values', () => {
    const out = resolveDataSource(
      {
        data: { values: [{ region: 'North', revenue: 120 }] },
        semantic_types: { region: 'Category', revenue: 'Quantity' },
        chart_spec: CHART_SPEC,
      } as unknown as ChartAssemblyInput,
      { disableFileReference: true },
    );
    expect((out.data as any).values).toEqual([{ region: 'North', revenue: 120 }]);
  });

  it('still blocks remote http(s) URLs', () => {
    expect(() =>
      resolveDataSource(inputWithUrl('https://example.com/sales.csv'), {
        disableFileReference: true,
      }),
    ).toThrow(/remote data\.url fetching is disabled/i);
  });
});
