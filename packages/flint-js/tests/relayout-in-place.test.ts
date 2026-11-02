import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TEST_GENERATORS } from '../src/test-data';
import { THEME_PRESETS } from '../src/core/theme/presets';
import { withCanvasSize } from '../src/core/compute-layout';
import { vlGetTemplateDef } from '../src/vegalite/templates';
import { openVegaLiteSession } from '../src/vegalite/assemble';
import { shapeInteractiveVega } from '../src/vegalite/interactive';
import { bindLiveValues, liveValuesChange } from '../src/vegalite/live-values';
import type { ChartAssemblyInput } from '../src/core/types';

/** The charts that still mount again for a new room; the list may only shrink. */
const KNOWN = new URL('./fixtures/relayout-remounts.json', import.meta.url);
const CASES_PER_TYPE = 3;
const ROOM = { width: 560, height: 380 };
const SMALLER = { width: 460, height: 320 };

function input(testCase: any, theme: string | undefined): ChartAssemblyInput {
    const names = new Map(testCase.fields.map((field: any) => [field.id, field.name]));
    const encodings: Record<string, any> = {};
    for (const [channel, encoding] of Object.entries<any>(testCase.encodingMap)) {
        const field = names.get(encoding?.fieldID);
        if (field) encodings[channel] = { field, ...(encoding.aggregate ? { aggregate: encoding.aggregate } : {}) };
    }
    const semanticTypes = Object.fromEntries(Object.entries<any>(testCase.metadata).map(([field, meta]) => [field, meta.semanticType]));
    return {
        data: { values: testCase.data },
        semantic_types: semanticTypes,
        ...(theme ? { theme_spec: theme } : {}),
        chart_spec: { chartType: testCase.chartType, encodings, chartProperties: testCase.chartProperties },
        options: testCase.assembleOptions,
    } as ChartAssemblyInput;
}

/** Every chart drawn with every theme that mounts again, rather than laying out in place, for a smaller room. */
function remounts(): string[] {
    const found: string[] = [];
    const taken = new Map<string, number>();
    const themes = [undefined, ...Object.keys(THEME_PRESETS)];
    for (const [section, generate] of Object.entries(TEST_GENERATORS as Record<string, () => any[]>)) {
        let cases: any[] = [];
        try {
            cases = generate();
        } catch {
            continue;
        }
        for (const testCase of cases) {
            if (!vlGetTemplateDef(testCase.chartType) || (taken.get(testCase.chartType) ?? 0) >= CASES_PER_TYPE) continue;
            taken.set(testCase.chartType, (taken.get(testCase.chartType) ?? 0) + 1);
            for (const theme of themes) {
                const sized = withCanvasSize(input(testCase, theme), ROOM);
                const session = openVegaLiteSession(sized);
                if ((session.spec._viewports ?? []).length > 0) continue;
                const setup = { input: sized, interactions: [], enableSemanticUpdates: true, viewports: [], filtersRows: false, replan: session.replan };
                const live = bindLiveValues(shapeInteractiveVega(session, setup).vegaSpec);
                const next = shapeInteractiveVega(session.replan({ size: SMALLER }), setup).vegaSpec;
                if (!liveValuesChange(live, next)) found.push(`${section} | ${testCase.title} | ${theme ?? 'none'}`);
            }
        }
    }
    return found.sort();
}

describe('a chart laid out for its room', () => {
    // A new room changes the values a chart is laid out with, never its structure, so it lays out
    // again in place. Charts known to mount again instead are listed; set UPDATE_RELAYOUT_REMOUNTS=1
    // to write the list again once a fix shortens it.
    it('lays out again in place for a new room, apart from the charts known not to yet', () => {
        const found = remounts();
        if (process.env.UPDATE_RELAYOUT_REMOUNTS) writeFileSync(KNOWN, `${JSON.stringify(found, null, 2)}\n`);
        const known: string[] = existsSync(KNOWN) ? JSON.parse(readFileSync(KNOWN, 'utf8')) : [];
        expect({ newRemounts: found.filter((entry) => !known.includes(entry)), nowInPlace: known.filter((entry) => !found.includes(entry)) })
            .toEqual({ newRemounts: [], nowInPlace: [] });
    }, 300_000);
});
