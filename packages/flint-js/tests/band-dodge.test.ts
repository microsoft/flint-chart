// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { planBandDodge, resolveDodge, laneCountForMode } from '../src/core/band-dodge';

/** Build rows for a band→sub-values map (each pair repeated a few times). */
function rows(bands: Record<string, string[]>) {
  const out: { cat: string; sub: string }[] = [];
  for (const [cat, subs] of Object.entries(bands)) {
    for (const sub of subs) for (let i = 0; i < 3; i++) out.push({ cat, sub });
  }
  return out;
}

describe('planBandDodge — mode recommendation', () => {
  it('color == x (every band 1 value) → none', () => {
    const plan = planBandDodge(rows({ A: ['A'], B: ['B'], C: ['C'] }), 'cat', 'sub');
    expect(plan.mode).toBe('none');
    expect(plan.dodge).toBe(false);
    expect(plan.maxPerBand).toBe(1);
  });

  it('1:1 different field (bijection) → none', () => {
    const plan = planBandDodge(rows({ US: ['United States'], CA: ['Canada'], MX: ['Mexico'] }), 'cat', 'sub');
    expect(plan.mode).toBe('none');
  });

  it('full cross-product (every band all values) → global', () => {
    const plan = planBandDodge(rows({ A: ['M', 'F'], B: ['M', 'F'], C: ['M', 'F'] }), 'cat', 'sub');
    expect(plan.mode).toBe('global');
    expect(plan.maxPerBand).toBe(2);
    expect(plan.global).toBe(2);
    expect(plan.ambiguous).toBe(false);
  });

  it('sparse cross-product (1 < maxPerBand < global) → local', () => {
    const plan = planBandDodge(
      rows({ Eng: ['L1', 'L2'], Sales: ['L2', 'L3'], HR: ['L3', 'L4'], Ops: ['L4', 'L5'] }),
      'cat', 'sub',
    );
    expect(plan.mode).toBe('local');
    expect(plan.maxPerBand).toBe(2);
    expect(plan.global).toBe(5);
  });

  it('spiky (mostly 1, one band with 2, near-unique colors) → local', () => {
    const plan = planBandDodge(
      rows({ Mon: ['a'], Tue: ['b'], Wed: ['c'], Thu: ['d', 'e'], Fri: ['f'], Sat: ['g'] }),
      'cat', 'sub',
    );
    // 5/6 bands single = 0.83 < 0.9 threshold → still dodges; maxPerBand 2 < global 7 → local.
    expect(plan.mode).toBe('local');
    expect(plan.maxPerBand).toBe(2);
    expect(plan.global).toBe(7);
  });

  it('dirty near-1:1 (≥90% single bands) → none (snap)', () => {
    // 20 clean 1:1 bands + 1 band with a stray second value → 20/21 ≈ 0.95 ≥ 0.9.
    const bands: Record<string, string[]> = {};
    for (let i = 0; i < 20; i++) bands['c' + i] = ['n' + i];
    bands['dirty'] = ['nA', 'nB'];
    const plan = planBandDodge(rows(bands), 'cat', 'sub');
    expect(plan.mode).toBe('none');
    expect(plan.maxPerBand).toBe(2);
  });

  it('ambiguous flag is set only when local and global layouts can differ', () => {
    const sparse = planBandDodge(rows({ A: ['x', 'y'], B: ['y', 'z'] }), 'cat', 'sub');
    expect(sparse.ambiguous).toBe(true);
    const complete = planBandDodge(rows({ A: ['x', 'y'], B: ['x', 'y'] }), 'cat', 'sub');
    expect(complete.ambiguous).toBe(false);
    const none = planBandDodge(rows({ A: ['A'], B: ['B'] }), 'cat', 'sub');
    expect(none.ambiguous).toBe(false);
  });
});

describe('resolveDodge — user override', () => {
  const sparse = planBandDodge(
    rows({ Eng: ['L1', 'L2'], Sales: ['L2', 'L3'], HR: ['L3', 'L4'], Ops: ['L4', 'L5'] }),
    'cat', 'sub',
  );

  it('auto follows the compiler recommendation', () => {
    expect(resolveDodge(sparse, 'auto').mode).toBe('local');
    expect(resolveDodge(sparse, undefined).mode).toBe('local');
  });

  it('explicit modes override', () => {
    expect(resolveDodge(sparse, 'none').mode).toBe('none');
    expect(resolveDodge(sparse, 'global').mode).toBe('global');
    expect(resolveDodge(sparse, 'local').mode).toBe('local');
  });

  it('lane count is maxPerBand for local, global distinct for global', () => {
    expect(resolveDodge(sparse, 'local').laneCount).toBe(2);
    expect(resolveDodge(sparse, 'global').laneCount).toBe(5);
    expect(resolveDodge(sparse, 'none').laneCount).toBe(1);
  });

  it('forcing a dodge mode on redundant color downgrades to none', () => {
    const redundant = planBandDodge(rows({ A: ['A'], B: ['B'] }), 'cat', 'sub');
    expect(resolveDodge(redundant, 'global').mode).toBe('none');
    expect(resolveDodge(redundant, 'local').mode).toBe('none');
  });

  it('laneCountForMode matches resolveDodge', () => {
    expect(laneCountForMode(sparse, 'global')).toBe(5);
    expect(laneCountForMode(sparse, 'local')).toBe(2);
    expect(laneCountForMode(sparse, 'none')).toBe(1);
  });
});
