import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { semanticElementIdentity } from '../src/interactive/presets/utils';

function identityOf(chartType: string, encodings: Record<string, string>, values: Record<string, unknown>[], types: Record<string, string>): readonly string[] {
    const spec = assembleVegaLite({ data: { values }, semantic_types: types, chart_spec: { chartType, encodings } } as any) as any;
    return spec._interactionSemantics.identityFields;
}

describe('element identity', () => {
    it('leaves out what a chart measures, by channel role', () => {
        const rows = [{ Region: 'West', Sales: 3 }, { Region: 'East', Sales: 5 }];
        expect(identityOf('Bar Chart', { x: 'Region', y: 'Sales' }, rows, { Region: 'Category', Sales: 'Quantity' })).toEqual(['Region']);
        const radar = ['Speed', 'Power', 'Stamina'].flatMap((Skill, at) => [{ Skill, Player: 'Ada', Score: 50 + at }, { Skill, Player: 'Ben', Score: 70 - at }]);
        expect(identityOf('Radar Chart', { x: 'Skill', y: 'Score', color: 'Player' }, radar, { Skill: 'Category', Player: 'Name', Score: 'Score' }))
            .toEqual(['Skill', 'Player']);
    });

    it('takes a template\'s own roles where a date is a value, not an index', () => {
        const tasks = [{ Task: 'Build', Start: '2025-01-01', End: '2025-02-01' }, { Task: 'Launch', Start: '2025-02-01', End: '2025-03-01' }];
        expect(identityOf('Gantt Chart', { y: 'Task', x: 'Start', x2: 'End' }, tasks, { Task: 'Category', Start: 'Date', End: 'Date' })).toEqual(['Task']);
    });

    it('counts the panel an element is drawn in, so the same series in two panels is two elements', () => {
        const rows = ['Men', 'Women'].flatMap((Sex) => [15, 16].flatMap((Age) => ['Alone', 'Friends'].map((Who) => ({ Sex, Age, Who, Hours: Age / 10 }))));
        expect(identityOf('Line Chart', { x: 'Age', y: 'Hours', color: 'Who', column: 'Sex' }, rows, { Sex: 'Category', Age: 'Quantity', Who: 'Category', Hours: 'Quantity' }))
            .toEqual(['Who', 'Sex']);
    });

    it('names an element by its identity, so a changed value is the same element', () => {
        const before = { value: { Platform: 'Web', Downloads: 230 }, records: [{ Platform: 'Web', Downloads: 230 }] };
        const after = { value: { Platform: 'Web', Downloads: 380 }, records: [{ Platform: 'Web', Downloads: 380 }] };
        expect(semanticElementIdentity(before, ['Platform'])).toBe(semanticElementIdentity(after, ['Platform']));
        expect(semanticElementIdentity(before)).not.toBe(semanticElementIdentity(after));
    });
});
