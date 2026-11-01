import { describe, expect, it } from 'vitest';
import { mixNumbersInText } from '../src/interactive/transition';

describe('text that says the same but for its numbers', () => {
    it('counts each number from one end to the other, with the decimals either end shows', () => {
        expect(mixNumbersInText('72', '88', 0.5)).toBe('80');
        expect(mixNumbersInText('90% of 80', '104% of 85', 0.5)).toBe('97% of 83');
        expect(mixNumbersInText('$1.2M', '$2.45M', 0.5)).toBe('$1.83M');
        expect(mixNumbersInText('1,200', '3,400', 0.5)).toBe('2,300');
        expect(mixNumbersInText('−10', '30', 0.25)).toBe('0');
    });

    it('does not count text whose words change, or text that does not change', () => {
        expect(mixNumbersInText('Goal: 80', 'Target: 85', 0.5)).toBeUndefined();
        expect(mixNumbersInText('72', '72', 0.5)).toBeUndefined();
        expect(mixNumbersInText('North', 'South', 0.5)).toBeUndefined();
        expect(mixNumbersInText('3 of 4', '3', 0.5)).toBeUndefined();
    });
});
