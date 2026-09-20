import { describe, expect, it } from 'vitest';
import { vlAllTemplateDefs } from '../src/vegalite/templates';

const POLAR = ['Pie Chart', 'Donut Chart', 'Rose Chart', 'Radar Chart'];

describe('Vega-Lite templates declare their interaction support', () => {
    it('every template carries an interactions block', () => {
        const missing = vlAllTemplateDefs.filter((def) => !def.interactionSupport).map((def) => def.chart);
        expect(missing).toEqual([]);
    });

    it('every template resolves marks to data elements', () => {
        const without = vlAllTemplateDefs.filter((def) => !def.interactionSupport?.elements).map((def) => def.chart);
        expect(without).toEqual([]);
    });

    it('polar templates offer the angular region beside the cartesian one, and no axis', () => {
        for (const def of vlAllTemplateDefs) {
            const region = def.interactionSupport?.region ?? [];
            if (POLAR.includes(def.chart)) {
                expect(region, def.chart).toEqual(['cartesian', 'angular']);
                expect(def.interactionSupport?.navigation, def.chart).toBeUndefined();
                expect(def.interactionSupport?.reorder, def.chart).toBeUndefined();
            } else {
                expect(region, def.chart).not.toContain('angular');
            }
        }
    });

    it('projected charts navigate through geo and never through a reorder axis', () => {
        for (const chart of ['Map', 'Choropleth']) {
            const def = vlAllTemplateDefs.find((candidate) => candidate.chart === chart)!;
            expect(def.interactionSupport?.navigation).toEqual({ geo: true });
            expect(def.interactionSupport?.reorder).toBeUndefined();
        }
    });

    it('the donut inherits the pie declaration', () => {
        const pie = vlAllTemplateDefs.find((def) => def.chart === 'Pie Chart')!;
        const donut = vlAllTemplateDefs.find((def) => def.chart === 'Donut Chart')!;
        expect(donut.interactionSupport).toBe(pie.interactionSupport);
    });
});
