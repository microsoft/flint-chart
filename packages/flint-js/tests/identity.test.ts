import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { semanticElementIdentity } from '../src/interactive/presets/utils';
import { namesElement } from '../src/core/type-registry';

function semanticsOf(chartType: string, encodings: Record<string, string>, values: Record<string, unknown>[], types: Record<string, string>): any {
    const spec = assembleVegaLite({ data: { values }, semantic_types: types, chart_spec: { chartType, encodings } } as any) as any;
    return spec._interactionSemantics;
}

function identityOf(chartType: string, encodings: Record<string, string>, values: Record<string, unknown>[], types: Record<string, string>): readonly string[] {
    return semanticsOf(chartType, encodings, values, types).identityFields;
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

    it('names a curve by its group, so the outline bends rather than its sample points fading', () => {
        const scores = ['A', 'B'].flatMap((Group, at) => [50, 55, 60, 65].map((Value) => ({ Group, Value: Value + at })));
        const types = { Group: 'Category', Value: 'Score' };
        expect(identityOf('Density Plot', { x: 'Value', color: 'Group' }, scores, types)).toEqual(['Group']);
        expect(identityOf('Ridgeline Plot', { x: 'Value', y: 'Group' }, scores, types)).toEqual(['Group']);
    });

    it('takes a bump chart\'s rank as its value, so a team that climbs moves', () => {
        const ranks = ['W1', 'W2'].flatMap((Week, at) => ['Owls', 'Foxes'].map((Team, place) => ({ Week, Team, Rank: (place + at) % 2 + 1 })));
        expect(identityOf('Bump Chart', { x: 'Week', y: 'Rank', color: 'Team' }, ranks, { Week: 'Category', Team: 'Name', Rank: 'Rank' })).toEqual(['Week', 'Team']);
    });

    it('offers the fields typed as names of things, drawn or not, to join the identity', () => {
        const rows = [{ Country: 'Chile', Region: 'Americas', GDP: 30, Life: 80, Rank: 1 }, { Country: 'Peru', Region: 'Americas', GDP: 20, Life: 75, Rank: 2 }];
        const semantics = semanticsOf('Scatter Plot', { x: 'GDP', y: 'Life', color: 'Region' }, rows,
            { Country: 'Country', Region: 'Region', GDP: 'Amount', Life: 'Quantity', Rank: 'Rank' });
        expect(semantics.identityFields).toEqual(['Region']);
        expect(semantics.identityCandidates).toEqual(['Country', 'Region']);
    });

    it('reads which types name things from the type registry', () => {
        expect(['ID', 'Name', 'Category', 'Country', 'City', 'ZipCode'].every(namesElement)).toBe(true);
        expect(['Rank', 'Score', 'Amount', 'Date', 'Status', 'Direction'].some(namesElement)).toBe(false);
    });
});
