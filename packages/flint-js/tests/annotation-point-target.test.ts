import { describe, expect, it } from 'vitest';
import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { addVegaLiteInteractions, injectVegaInteractionStore } from '../src/vegalite/interactions/compile';
import { INTERACTION_KEY, oneMarkHits, renderHit, sceneItems } from '../src/vegalite/interactions/hit-adapter';
import { temporalFieldValue } from '../src/core/resolve-semantics';
import { selectorPredicate } from '../src/core/target-selector';
import type { ChartAssemblyInput } from '../src';
import type { RenderHit, SemanticTargetSelector } from '../src/core/interaction-contracts';

const semanticTypes = { year: 'Year', value: 'Quantity', source: 'Category' };

async function energyLine(showPoints: boolean) {
    const values: Record<string, unknown>[] = [];
    for (const source of ['Fossil fuels', 'Nuclear', 'Renewables']) {
        for (let year = 1990; year <= 2020; year += 5) values.push({ year, source, value: year - 1900 + source.length * 3 });
    }
    const input = {
        semantic_types: semanticTypes,
        chart_spec: {
            chartType: 'Line Chart',
            encodings: { x: { field: 'year' }, y: { field: 'value' }, color: { field: 'source' } },
            baseSize: { width: 400, height: 300 },
            chartProperties: { showPoints },
        },
        theme_spec: 'nyt',
        data: { values },
    } as ChartAssemblyInput;
    const spec = assembleVegaLite(input) as Record<string, any>;
    const plan = addVegaLiteInteractions(spec, [], true)!;
    const compiled = compile(spec as any).spec as Record<string, any>;
    injectVegaInteractionStore(compiled, plan);
    const view = new View(parse(compiled), { renderer: 'none' });
    await view.runAsync();
    const all = sceneItems(view).map(renderHit).filter((hit): hit is RenderHit => hit !== null);
    const hitsFor = (target: SemanticTargetSelector): RenderHit[] => {
        const matches = selectorPredicate(target, plan.fields, (field, value) => temporalFieldValue(field, value, semanticTypes))!;
        return all.filter((hit) => matches(hit.datum));
    };
    const resolve = (hits: RenderHit[]) => plan.resolve!(
        { gesture: 'rectangle', role: 'external-selection', hits } as any,
        { allHits: hits, keyField: INTERACTION_KEY, categoryField: plan.categoryField, seriesField: plan.seriesField },
    );
    return { hitsFor, resolve };
}

const key = (year: number, source = 'Fossil fuels'): SemanticTargetSelector => ({ select: { key: { year, source } } });

describe('a note keyed to one point of a line drawn with points', () => {
    it('resolves an interior point to the one point mark, not the point and its segment', async () => {
        const { hitsFor, resolve } = await energyLine(true);
        const hits = hitsFor(key(2000));
        expect(hits.map((hit) => hit.markType).sort()).toEqual(['line', 'symbol']);
        expect(resolve(hits)?.elements).toHaveLength(2);

        const target = resolve(oneMarkHits(hits));
        expect(target?.visual).toEqual({ kind: 'mark', role: 'symbol' });
        expect(target?.elements).toHaveLength(1);
        expect(target?.elements[0].value).toMatchObject({ year: Date.UTC(2000, 0, 1), source: 'Fossil fuels', value: 136 });
    });

    it('keeps the segment when the selector names a path', async () => {
        const { hitsFor, resolve } = await energyLine(true);
        const target = resolve(oneMarkHits(hitsFor(key(2000)), true));
        expect(target?.visual).toEqual({ kind: 'path', role: 'line' });
        expect(target?.elements).toHaveLength(1);
    });

    it('leaves a series last point and a line without points as they were', async () => {
        const withPoints = await energyLine(true);
        const last = withPoints.hitsFor(key(2020));
        expect(oneMarkHits(last)).toEqual(last);
        expect(withPoints.resolve(last)?.elements).toHaveLength(1);

        const plain = await energyLine(false);
        const segment = plain.hitsFor(key(2000));
        expect(segment.map((hit) => hit.markType)).toEqual(['line']);
        expect(oneMarkHits(segment)).toEqual(segment);
    });

    it('still reports a key that matches several rows as more than one mark', async () => {
        const { hitsFor, resolve } = await energyLine(true);
        const series = oneMarkHits(hitsFor({ select: { key: { source: 'Nuclear' } } }));
        expect(new Set(series.map((hit) => hit.markType))).toEqual(new Set(['symbol']));
        expect(resolve(series)!.elements.length).toBeGreaterThan(1);
    });
});
