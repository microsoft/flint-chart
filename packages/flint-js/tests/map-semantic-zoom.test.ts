import { compile } from 'vega-lite';
import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';
import { addVegaLiteInteractions, findVegaAxisScale } from '../src/vegalite/interactions/compile';
import { INTERACTION_STORES } from '../src/vegalite/interactions/stores';
import type { CanvasInteractionDef } from '../src/interactive/interactions';
import { clickTrigger } from '../src/interactive/triggers';
import type { ChartAssemblyInput } from '../src/core';

const MAP_CLICK: CanvasInteractionDef = {
  id: 'map-semantic-zoom-click',
  eventSource: clickTrigger,
  handle() {
    return null;
  },
};

const MAP_INPUT: ChartAssemblyInput = {
  data: {
    values: [
      { Place: 'Zhejiang', Province: 'Zhejiang', SemanticGroup: 'East China', Lon: 120.2, Lat: 30.3, DisplaySize: 65.7 },
      { Place: 'Guangdong', Province: 'Guangdong', SemanticGroup: 'South China', Lon: 113.3, Lat: 23.1, DisplaySize: 126.0 },
    ],
  },
  semantic_types: {
    Place: 'Category',
    Province: 'State',
    SemanticGroup: 'Category',
    Lon: 'Longitude',
    Lat: 'Latitude',
    DisplaySize: 'Quantity',
  },
  chart_spec: {
    chartType: 'Map',
    encodings: {
      longitude: 'Lon',
      latitude: 'Lat',
      size: 'DisplaySize',
      color: 'SemanticGroup',
    },
    chartProperties: {
      region: 'world',
      projection: 'mercator',
      projectionCenter: [105, 35],
    },
  },
};

describe('map semantic zoom support', () => {
  it('keeps a mutable inline source that set-data can target', () => {
    const spec = assembleVegaLite(MAP_INPUT) as any;
    const plan = addVegaLiteInteractions(spec, [MAP_CLICK], true);
    const vegaSpec = compile(spec).spec as any;
    const source = vegaSpec.data?.find((entry: any) =>
      Array.isArray(entry.values) && !INTERACTION_STORES.includes(entry.name))?.name;

    expect(plan).not.toBeNull();
    expect(plan?.sourceRecords).toHaveLength(2);
    expect(source).toBeTruthy();
  });

  it('does not expose cartesian overlay scales on Map charts', () => {
    const spec = assembleVegaLite(MAP_INPUT) as any;
    addVegaLiteInteractions(spec, [MAP_CLICK], true);
    const vegaSpec = compile(spec).spec as any;

    expect(findVegaAxisScale(vegaSpec, 'x')).toBeUndefined();
    expect(findVegaAxisScale(vegaSpec, 'y')).toBeUndefined();
  });
});
