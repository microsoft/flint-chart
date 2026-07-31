// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

/**
 * Waterfall Chart axis titles (Vega-Lite).
 *
 * A waterfall is built from window transforms, so several layers bind internal
 * `__wf_*` columns to the same x/y scales as the user's own fields. Vega-Lite
 * derives an axis title by concatenating the titles of every field on a shared
 * scale, so any internal field left untitled surfaces in the rendered axis
 * ("Week, __wf_lead"). These tests assert the two invariants that keep the axes
 * readable:
 *
 *   - the titles the assembler resolved (including `field_display_names`) are
 *     the ones that reach the axes, and
 *   - no internal `__wf_*` column can contribute to an axis title.
 */

const DATA = [
  { week: '2026-06-01', wsu_change: 1200 },
  { week: '2026-06-08', wsu_change: -430 },
  { week: '2026-06-15', wsu_change: 880 },
  { week: '2026-06-22', wsu_change: -210 },
];

function build(
  fieldDisplayNames?: Record<string, string>,
  chartProperties?: Record<string, unknown>,
) {
  return assembleVegaLite({
    data: { values: DATA },
    semantic_types: { week: 'Date', wsu_change: 'Quantity' },
    chart_spec: {
      chartType: 'Waterfall Chart',
      encodings: { x: { field: 'week' }, y: { field: 'wsu_change' } },
      baseSize: { width: 500, height: 320 },
      ...(chartProperties ? { chartProperties } : {}),
    },
    ...(fieldDisplayNames ? { field_display_names: fieldDisplayNames } : {}),
  } as never) as any;
}

/** The same chart split into small multiples, which nests the layered unit. */
function buildFaceted() {
  const rows = DATA.flatMap((r) => [
    { ...r, region: 'East' },
    { ...r, region: 'West' },
  ]);
  return assembleVegaLite({
    data: { values: rows },
    semantic_types: { week: 'Date', wsu_change: 'Quantity', region: 'Category' },
    chart_spec: {
      chartType: 'Waterfall Chart',
      encodings: {
        x: { field: 'week' },
        y: { field: 'wsu_change' },
        column: { field: 'region' },
      },
      baseSize: { width: 640, height: 320 },
    },
    field_display_names: { wsu_change: 'WSU weekly change', week: 'Week (Mon, JST)' },
  } as never) as any;
}

/**
 * Every encoding object in the spec. Faceted output nests the layered unit under
 * `spec.spec`, so recurse rather than only reading the top level.
 */
function allEncodings(spec: any): Array<[string, any]> {
  const out: Array<[string, any]> = [];
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    for (const [channel, def] of Object.entries(node.encoding ?? {})) {
      if (def && typeof def === 'object') out.push([channel, def]);
    }
    for (const layer of node.layer ?? []) visit(layer);
    visit(node.spec);
  };
  visit(spec);
  return out;
}

describe('Waterfall Chart axis titles', () => {
  it('applies field_display_names to the x and y axes', () => {
    const spec = build({ wsu_change: 'WSU weekly change', week: 'Week (Mon, JST)' });

    expect(spec.encoding.x.title).toBe('Week (Mon, JST)');

    const bar = spec.layer.find((l: any) => (l.mark?.type ?? l.mark) === 'bar');
    expect(bar.encoding.y.title).toBe('WSU weekly change');
  });

  it('falls back to the raw field names when no display names are given', () => {
    const spec = build();

    expect(spec.encoding.x.title).toBe('week');

    const bar = spec.layer.find((l: any) => (l.mark?.type ?? l.mark) === 'bar');
    expect(bar.encoding.y.title).toBe('wsu_change');
  });

  it('never lets an internal __wf_* column contribute to an axis title', () => {
    const specs = [
      build(),
      build({ week: 'Week (Mon, JST)' }),
      // Value labels bind two more internal columns to the y scale.
      build({ week: 'Week (Mon, JST)' }, { showTextLabels: true }),
      // Faceted output nests the layered unit one level down.
      buildFaceted(),
    ];

    for (const spec of specs) {
      // Vega-Lite derives a title from the field name whenever a positional
      // encoding leaves `title` undefined, and concatenates every derived title
      // on a shared scale — but an explicit title on the scale's primary
      // channel wins outright. So an untitled internal column is only safe on a
      // scale whose primary channel carries an explicit title.
      for (const scale of ['x', 'y'] as const) {
        const onScale = allEncodings(spec).filter(([channel]) => channel === scale || channel === `${scale}2`);

        const untitledInternal = onScale.filter(
          ([, def]) => typeof def.field === 'string' && def.field.startsWith('__wf_') && def.title === undefined,
        );
        if (untitledInternal.length === 0) continue;

        const titled = onScale.filter(([channel, def]) => channel === scale && typeof def.title === 'string');

        expect(
          titled.length,
          `${scale} carries internal columns ${untitledInternal
            .map(([, d]) => d.field)
            .join(', ')} but no explicit title to stop Vega-Lite naming the axis after them`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('never suppresses a shared axis title with a null on a primary channel', () => {
    // Vega-Lite merges the titles of every layer on a shared scale, and an
    // explicit null anywhere in that set wins — so a `title: null` used to hide
    // an internal column on x or y blanks the axis for the whole chart. Only
    // secondary channels (x2/y2) may opt out that way.
    for (const spec of [build(), build({ week: 'W' }, { showTextLabels: true })]) {
      const nulled = allEncodings(spec)
        .filter(([channel, def]) => /^(x|y)$/.test(channel) && def.title === null)
        .map(([channel, def]) => `${channel}:${def.field}`);

      expect(nulled).toEqual([]);
    }
  });
});
