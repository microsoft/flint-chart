// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The preview must render into the room it will actually be shown in.
 *
 * When it renders larger, the `.chart` rule scales the finished SVG down to
 * fit and takes the type with it — an 11px axis label displayed at 0.72x lands
 * at 7.9px, smaller than the app's own 11px chrome. These tests pin the sizing
 * contract that keeps the graphic at 1:1.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';
import type { ChartAssemblyInput } from 'flint-chart';
import { THEME_PRESETS } from 'flint-chart';
import { assemblePreviewSpec, APP_PREVIEW_CANVAS_SIZE } from '../ui/src/render.js';

/** A titled, decked, banded bar chart — the shape a real tool call produces. */
function bars(themeId?: string): ChartAssemblyInput {
  const input: ChartAssemblyInput = {
    data: {
      values: [
        { region: 'North', revenue: 128 },
        { region: 'South', revenue: 94 },
        { region: 'East', revenue: 156 },
        { region: 'West', revenue: 112 },
        { region: 'Central', revenue: 88 },
      ],
    },
    semantic_types: { region: 'Category', revenue: 'Money' },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
      title: 'Revenue by region',
      subtitle: 'FY2024, $m',
    },
  };
  if (themeId) input.theme_spec = THEME_PRESETS[themeId].spec;
  return input;
}

/** The rendered size of a spec, as the browser would lay it out. */
async function renderedSize(spec: Record<string, unknown>): Promise<{ width: number; height: number }> {
  const view = new View(parse(compile(spec as never).spec as never, { background: '#fff' } as never), {
    renderer: 'none',
  });
  await view.runAsync();
  const svg = await view.toSVG();
  view.finalize();
  return {
    width: Number(svg.match(/<svg[^>]*\swidth="([\d.]+)"/)?.[1] ?? 0),
    height: Number(svg.match(/<svg[^>]*\sheight="([\d.]+)"/)?.[1] ?? 0),
  };
}

describe('the preview renders into the room it is given', () => {
  it('keeps the graphic within the frame it was measured at', async () => {
    // 468 is --chart-max-height in styles.css; the frame grows to the chart
    // up to that, so only the width has to be respected exactly.
    for (const width of [320, 440, 584]) {
      for (const house of ['swiss', 'economist', 'nature', 'mckinsey']) {
        const size = await renderedSize(assemblePreviewSpec(bars(house), { width }));
        // A little overshoot is absorbed by the axis chrome that sits outside
        // the plot ceiling; a large one means the type is being scaled down.
        expect(size.width, `${house} at ${width}px`).toBeLessThanOrEqual(width * 1.08);
        expect(size.height, `${house} at ${width}px`).toBeLessThanOrEqual(468 * 1.05);
      }
    }
  });

  it('gives a wider frame a wider chart', async () => {
    const narrow = await renderedSize(assemblePreviewSpec(bars('swiss'), { width: 320 }));
    const wide = await renderedSize(assemblePreviewSpec(bars('swiss'), { width: 584 }));
    expect(wide.width).toBeGreaterThan(narrow.width);
  });

  it('ignores a viewport too small to be a real measurement', async () => {
    // A collapsed or unmounted box must not shrink the chart to nothing.
    const collapsed = await renderedSize(assemblePreviewSpec(bars('swiss'), { width: 0 }));
    const absent = await renderedSize(assemblePreviewSpec(bars('swiss')));
    expect(collapsed).toEqual(absent);
  });

  it('still lets a caller state its own size', async () => {
    // A stated size opts out of the preview's sizing entirely, so the measured
    // frame must make no difference at all.
    const stated = () => {
      const input = bars('swiss');
      input.chart_spec.baseSize = { width: 700, height: 300 };
      input.chart_spec.canvasSize = { width: 700, height: 300 };
      return input;
    };
    const narrowFrame = await renderedSize(assemblePreviewSpec(stated(), { width: 320 }));
    const wideFrame = await renderedSize(assemblePreviewSpec(stated(), { width: 584 }));
    const noFrame = await renderedSize(assemblePreviewSpec(stated()));
    expect(narrowFrame).toEqual(wideFrame);
    expect(narrowFrame).toEqual(noFrame);
  });

  it('leaves the house in charge of the type', async () => {
    // The frame decides how much room there is, not how big the type is: the
    // same house must read the same at any frame width it fits in.
    const at = (width: number) =>
      (assemblePreviewSpec(bars('swiss'), { width }) as any).config?.title?.fontSize;
    expect(at(584)).toBe(at(520));
    expect(at(584)).toBeGreaterThan(14);
  });

  it('draws to the same height the stylesheet will allow', () => {
    // These two are the same measurement written in two languages. If they
    // drift, the chart is drawn to one size and displayed at another, and the
    // difference comes back as a scrollbar or as shrunken type.
    const css = readFileSync(new URL('../ui/src/styles.css', import.meta.url), 'utf8');
    const declared = css.match(/--chart-max-height:\s*(\d+)px/)?.[1];
    expect(declared, '--chart-max-height missing from styles.css').toBeDefined();
    expect(Number(declared)).toBe(APP_PREVIEW_CANVAS_SIZE.height);
  });
});
