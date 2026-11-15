import { describe, expect, it } from 'vitest';
import { filledLines, fullestLines, textPx } from '../src/core/title-fit';

const DECK = 'GDP per capita (log scale) vs life expectancy, 2007; bubble size = population; X: GDP per capita ($, log scale); Y: Life expectancy (years)';
const width = (line: string) => textPx(line, 14);

describe('filledLines', () => {
    it('leaves text that fits the block on one line', () => {
        expect(filledLines('Wealthier countries live longer', 600, 14, textPx)).toEqual(['Wealthier countries live longer']);
    });

    it('fills each line to the block where no widow is left', () => {
        const lines = filledLines('one two three four five six seven eight nine ten', textPx('one two three four five six', 14), 14, textPx);
        expect(lines).toEqual(['one two three four five six', 'seven eight nine ten']);
    });

    it('breaks a deck that would end in a widow over the same lines, as full as they can be', () => {
        const block = 470;
        const lines = filledLines(DECK, block, 14, textPx);
        expect(lines).toHaveLength(3);
        expect(lines.join(' ')).toBe(DECK);
        for (const line of lines) expect(width(line)).toBeLessThanOrEqual(block);
        expect(width(lines[2])).toBeGreaterThanOrEqual(block / 3);
        // The block keeps its measure: the first line stays as full as greedy fill set it.
        expect(width(lines[0])).toBeGreaterThan(block * 0.9);
    });
});

describe('fullestLines', () => {
    it('takes the room a short last line needs across the lines above it', () => {
        const block = 470;
        const lines = fullestLines(DECK, 3, block, block / 3, 14, textPx)!;
        const room = lines.slice(0, -1).map((line) => block - width(line));
        expect(Math.max(...room)).toBeLessThan(block / 3);
    });

    it('is undefined where no breaks keep every line within the block', () => {
        expect(fullestLines('Supercalifragilistic word', 2, 20, 0, 14, textPx)).toBeUndefined();
    });

    it('is undefined where the last line cannot reach its shortest', () => {
        expect(fullestLines('a b', 2, 100, 90, 14, textPx)).toBeUndefined();
    });
});
