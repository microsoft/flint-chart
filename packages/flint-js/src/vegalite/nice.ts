// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** The tick step d3 (and so Vega) takes for `count` ticks over a span. */
export function tickStep(span: number, count: number): number {
    const raw = span / count;
    let step = 10 ** Math.floor(Math.log10(raw));
    const error = raw / step;
    if (error >= Math.sqrt(50)) step *= 10;
    else if (error >= Math.sqrt(10)) step *= 5;
    else if (error >= Math.sqrt(2)) step *= 2;
    return step;
}

/** A linear domain rounded out as Vega's `nice: true` rounds it: to ten ticks, until the step settles. */
export function niceExtent(lo: number, hi: number): [number, number] {
    let start = lo;
    let stop = hi;
    let previous: number | undefined;
    for (let pass = 0; pass < 10 && stop > start; pass++) {
        const step = tickStep(stop - start, 10);
        if (step === previous) break;
        start = Math.floor(start / step) * step;
        stop = Math.ceil(stop / step) * step;
        previous = step;
    }
    return [start, stop];
}
