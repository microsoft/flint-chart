// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress, cxGetTemplateDef } from '../src';
import { genScatter3dTests, genBubbleTests, genTagCloudTests, genTreeTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * New CanvasXpress-exclusive gallery chart types: 3D scatter, packed bubble,
 * tag cloud and hierarchy tree. Each must have a registered template and
 * assemble to the right CanvasXpress graph type / shape.
 */
function toInput(tc: TestCase) {
  const encodings: Record<string, string> = {};
  for (const [channel, item] of Object.entries(tc.encodingMap)) {
    const field = tc.fields.find((f) => f.id === (item as any).fieldID);
    if (field) encodings[channel] = field.name;
  }
  const semantic_types: Record<string, string> = {};
  for (const [name, meta] of Object.entries(tc.metadata)) semantic_types[name] = meta.semanticType;
  return {
    data: { values: tc.data },
    semantic_types,
    chart_spec: { chartType: tc.chartType, encodings, baseSize: { width: 676, height: 436 } },
  } as any;
}

describe('CanvasXpress gallery — new chart types', () => {
  it('registers a template for each new chart type', () => {
    for (const name of ['Scatter 3D', 'Bubble Chart', 'Tag Cloud', 'Tree']) {
      expect(cxGetTemplateDef(name), name).toBeTruthy();
    }
  });

  it('3D scatter → Scatter3D with three axes and a colour group', () => {
    const c = assembleCanvasXpress(toInput(genScatter3dTests()[0])) as any;
    expect(c.config.graphType).toBe('Scatter3D');
    expect(c.config.xAxis).toHaveLength(1);
    expect(c.config.yAxis).toHaveLength(1);
    expect(c.config.zAxis).toHaveLength(1);
    expect(c.config.colorBy).toBe('Species');
    expect(c.data.y.data[0]).toHaveLength(3);
  });

  it('bubble → packed-circle Circular sized + coloured', () => {
    const c = assembleCanvasXpress(toInput(genBubbleTests()[0])) as any;
    expect(c.config.graphType).toBe('Circular');
    expect(c.config.circularType).toBe('bubble');
    expect(c.config.colorBy).toBe('Region');
    expect(c.data.y.smps.length).toBe(genBubbleTests()[0].data.length);
  });

  it('tag cloud → TagCloud sized by weight', () => {
    const c = assembleCanvasXpress(toInput(genTagCloudTests()[0])) as any;
    expect(c.config.graphType).toBe('TagCloud');
    expect(c.data.y.vars).toEqual(['Frequency']);
    expect(c.data.y.smps.length).toBeGreaterThan(5);
  });

  it('tree → a real collapsible node-link tree (graphType Tree), not circle-packing', () => {
    const c = assembleCanvasXpress(toInput(genTreeTests()[0])) as any;
    expect(c.config.graphType).toBe('Tree');
    expect(c.config.circularType).toBeUndefined();
    // The leaf is the terminal node (smps), NOT a hierarchy level.
    expect(c.config.hierarchy).toEqual(['Division', 'Department']);
    expect(c.config.xAxis).toEqual(['Order']);
    expect(c.config.colorBy).toBe('Division');
    expect(c.data.y.vars).toEqual(['Order']);
    expect(c.data.x.Division).toBeTruthy();
  });
});
