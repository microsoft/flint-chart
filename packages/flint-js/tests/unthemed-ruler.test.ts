import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';

const rows = [5.5, 21, 35, 47].map((GDP, at) => ({ Country: `C${at}`, GDP, Life: 60 + at * 4 }));
const types = { Country: 'Country', GDP: 'Amount', Life: 'Quantity' };
const scaleOf = (channel: 'x' | 'y', chart_spec: Record<string, unknown>, semantic_types: Record<string, unknown> = types): any => {
    const spec: any = assembleVegaLite({ data: { values: rows }, semantic_types, chart_spec } as any);
    return (spec.encoding ?? spec.spec?.encoding)[channel].scale;
};
const xScale = (chart_spec: Record<string, unknown>, semantic_types?: Record<string, unknown>): any => scaleOf('x', chart_spec, semantic_types);

describe('a gridded measure axis without a theme', () => {
    it('ends on labeled ticks, about one label per 40 px, as a themed ruler does', () => {
        const scale = scaleOf('y', { chartType: 'Bar Chart', encodings: { x: 'Country', y: 'GDP' }, baseSize: { width: 160, height: 120 } });
        expect([scale.domainMin, scale.domainMax, scale.nice]).toEqual([0, 60, false]);
    });

    it('rounds a dot axis the same way, and opens its range by a dot\'s radius where the ends leave no room', () => {
        const scale = xScale({ chartType: 'Scatter Plot', encodings: { x: 'GDP', y: 'Life' }, baseSize: { width: 160, height: 120 } });
        expect(scale.domain ?? [scale.domainMin, scale.domainMax]).toEqual([0, 50]);
        const tight = scaleOf('y', { chartType: 'Scatter Plot', encodings: { x: 'GDP', y: 'Life' }, baseSize: { width: 160, height: 120 } });
        expect(tight.padding).toBeGreaterThan(0);
    });

    it('keeps the ends a field\'s own domain states', () => {
        const scale = xScale({ chartType: 'Scatter Plot', encodings: { x: 'GDP', y: 'Life' }, baseSize: { width: 160, height: 120 } },
            { ...types, GDP: { semanticType: 'Score', intrinsicDomain: [0, 100] } });
        expect(scale.domain ?? [scale.domainMin, scale.domainMax]).toEqual([0, 100]);
    });
});
