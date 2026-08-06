// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { THEME_PRESETS } from '../src';

/**
 * A diverging ramp is read before the key is: the warm end is the high end.
 * A house that runs the ramp the other way paints a hot July blue and a cold
 * January red, and the chart says the opposite of the data to anyone who does
 * not stop to check the legend.
 */

/** Rough warmth: how far red sits above blue in the stop. */
function warmth(hex: string): number {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) - (n & 255);
}

describe('a diverging ramp runs cool to warm', () => {
    const houses = Object.values(THEME_PRESETS)
        .map((p: any) => [p.id, p.spec?.ink?.series?.diverging?.stops] as const)
        .filter(([, stops]) => Array.isArray(stops) && stops.length >= 2);

    it('is stated by more than one house, or this test proves nothing', () => {
        expect(houses.length).toBeGreaterThan(1);
    });

    for (const [id, stops] of houses) {
        it(`${id} puts its warm end at the top`, () => {
            const low = warmth(stops![0]);
            const high = warmth(stops![stops!.length - 1]);
            expect(high).toBeGreaterThan(low);
        });
    }
});
