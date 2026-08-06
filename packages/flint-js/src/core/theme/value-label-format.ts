// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * How many digits a value printed *on a mark* should carry, and how wide the
 * result will be.
 *
 * A value label is a reading aid, not a table cell. It is read in place, next
 * to its neighbours, in whatever room the mark leaves — so it wants the digits
 * that let a reader take the value and compare it, and no more. Left to
 * itself Vega-Lite prints the number as JavaScript renders it, which is how a
 * tidy bar chart ends up captioned `3.14159265`.
 *
 * Two jobs live here, and they belong together because neither is right
 * without the other: choosing the digits, and measuring what those digits will
 * take up. Flint's fit tests — is the slot wide enough, is the segment thick
 * enough — used to measure `String(Math.round(value))`, which is the width of
 * a number nobody prints: it ignores decimals, separators, signs and the
 * format itself. A chart of decimals was measured four times narrower than it
 * drew, so the labels were offered and then overlapped.
 */

/** Significant digits a printed value carries at the top of its scale. */
const SIGNIFICANT_DIGITS = 3;

/**
 * Past this, digits stop being information and start being magnitude: a
 * reader takes `1.23M` off a chart faster than `1,234,567`, and the mark
 * rarely has room for the latter anyway.
 */
const SUFFIX_ABOVE = 10_000;

/** The SI suffixes d3-format uses, smallest to largest. */
const SI_SUFFIX = ['y', 'z', 'a', 'f', 'p', 'n', 'µ', 'm', '', 'k', 'M', 'G', 'T', 'P', 'E', 'Z', 'Y'];

/**
 * The decimals the data itself carries.
 *
 * Read off `toFixed(10)`, which already discards floating-point noise
 * (0.1 + 0.2 comes to 0.30000000000000004 but fixes to 0.3000000000), and
 * capped at 6 — past that a value label is no longer being read, it is being
 * transcribed.
 */
function dataDecimals(values: number[]): number {
    let most = 0;
    for (const v of values) {
        if (!Number.isFinite(v)) continue;
        const s = v.toFixed(10);
        const dot = s.indexOf('.');
        if (dot === -1) continue;
        let end = s.length - 1;
        while (end > dot && s[end] === '0') end -= 1;
        const decimals = end > dot ? end - dot : 0;
        if (decimals > most) most = decimals;
    }
    return Math.min(most, 6);
}

/** The largest magnitude in the data — the number that sets the width. */
function maxMagnitude(values: number[]): number {
    let max = 0;
    for (const v of values) {
        if (typeof v === 'number' && Number.isFinite(v)) max = Math.max(max, Math.abs(v));
    }
    return max;
}

/**
 * The decimals it takes for the printed labels to keep the distinctions the
 * marks are already showing.
 *
 * Precision chosen from magnitude alone answers "how big is this number", but
 * a value label is read *against its neighbours*, and what a reader wants from
 * it is often the difference. Eight bars of visibly different height captioned
 * `100` eight times, or a row of fractions all captioned `0`, is a caption the
 * chart itself contradicts — the worst thing a label can be, because the
 * reader trusts the number over the pixels.
 *
 * So the series gets whatever decimals it takes to keep two values that differ
 * printing differently, and to keep a value that is not zero from printing as
 * zero. Never more than the data carries, and never more than six: past that
 * the distinction is too fine to have been the point of the chart.
 */
function decimalsToDistinguish(values: number[], cap: number): number {
    const distinct = new Set<number>();
    for (const v of values) if (Number.isFinite(v)) distinct.add(v);
    if (distinct.size === 0) return 0;
    const list = [...distinct];
    for (let d = 0; d <= cap; d += 1) {
        const scale = 10 ** d;
        const printed = new Set<number>();
        let zeroedOut = false;
        for (const v of list) {
            const r = Math.round(v * scale) / scale;
            if (r === 0 && v !== 0) zeroedOut = true;
            printed.add(r);
        }
        if (!zeroedOut && printed.size === list.length) return d;
    }
    return cap;
}

/** Whether a d3 format pattern already states a precision (`.2f`, `.3~s`). */
function statesPrecision(pattern: string): boolean {
    return /\.\d/.test(pattern);
}

/**
 * Choose the format a value label is printed with.
 *
 * The house's own pattern outranks this: a stated format is a decision
 * someone made. But a house states a *style* — "use a k/M suffix", "group the
 * thousands" — and a style says nothing about precision, which is why
 * `~s` prints `1.23457M`. Where the house left the precision open, it is
 * filled in from the data.
 *
 * Where the house stated one it is kept, with a single exception: a stated
 * precision that would print two different values the same, or a value that
 * is not zero as zero, is raised until it does not. `precision: 'integer'` is
 * a house saying how numbers should read, not a house asking for eight bars
 * of different heights all captioned `100`.
 *
 * With no house at all the whole pattern is inferred, because the alternative
 * is Vega-Lite's raw rendering, and that is the case this exists to fix.
 */
export function inferValueLabelFormat(values: number[], house: string | undefined): string | undefined {
    const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
    if (nums.length === 0) return house;

    const max = maxMagnitude(nums);
    const sign = house?.startsWith('+') ? '+' : '';
    // What it would take for the labels to stay as distinct as the marks.
    // This is a floor on precision, not a target: it is consulted both when
    // the house left the precision open and when it stated one, because a
    // stated precision is a preference about how numbers should read, not a
    // licence to print one the chart contradicts.
    const needed = decimalsToDistinguish(nums, dataDecimals(nums));
    if (house && statesPrecision(house)) {
        // A suffix format states *significant* digits, not decimals, and
        // shortens by design; the two rules do not compose, so it is left as
        // the house wrote it.
        if (/[se]$/.test(house)) return house;
        const stated = Number(/\.(\d+)/.exec(house)?.[1] ?? 0);
        if (stated >= needed) return house;
        // Keep everything the house said — sign, grouping, suffix-free `f` —
        // and raise only the digits, with `~` so the values that did not need
        // them are not padded out with zeros.
        return house.replace(/\.\d+~?f$/, `.${needed}~f`);
    }
    // A house that asked for a suffix keeps its suffix; it is only the number
    // of digits in front of it that was left open. But a suffix means `k` and
    // `M` — the house is asking to shorten large numbers, not to reach for SI
    // in the other direction. d3 applies `s` both ways, and `0.00123` comes
    // out as `1.23m`, which on a chart reads as millions. So the suffix is
    // used only where every value is at least 1, and so cannot pick up a
    // negative-exponent prefix.
    let smallest = Infinity;
    for (const v of nums) {
        const a = Math.abs(v);
        if (a > 0) smallest = Math.min(smallest, a);
    }
    const suffixIsSafe = max >= 1000 && (smallest === Infinity || smallest >= 1);
    // A suffix is a deliberate shortening, but not to the point of printing
    // two different bars the same. Three significant figures separate
    // 123M from 988M; they do not separate 1,000,000 from 1,000,400.
    const sigFigsHold = (() => {
        const distinct = new Set(nums);
        const rounded = new Set<number>();
        for (const v of distinct) rounded.add(Number(v.toPrecision(SIGNIFICANT_DIGITS)));
        return rounded.size === distinct.size;
    })();
    const wantsSuffix = (house ? /s$/.test(house) : max >= SUFFIX_ABOVE) && suffixIsSafe && sigFigsHold;
    if (wantsSuffix) return `${sign}.${SIGNIFICANT_DIGITS}~s`;

    // Three significant digits at the top of the scale. `1999.9` keeps none of
    // its decimals, `3.14159` keeps two — in each case the digits that
    // separate one value from the next, and no more.
    const grouping = house === undefined || house.includes(',') ? ',' : '';
    const magnitude = max > 0 ? Math.floor(Math.log10(max)) : 0;
    const wanted = SIGNIFICANT_DIGITS - 1 - magnitude;

    // But a series is not all one size. Sizing the decimals off the largest
    // value alone prints 0.001 and 0.05 both as `0` when a 5000 shares the
    // axis — the small values are rounded out of existence, and a label that
    // reads `0` on a bar that plainly is not zero is worse than no label. So
    // the smallest value gets to claim the decimals it needs to say anything
    // at all, and `~` trims the trailing zeros this leaves on the large ones,
    // so `5000` is still printed `5,000` and not `5,000.000`.
    const floor = smallest === Infinity ? 0 : Math.max(0, -Math.floor(Math.log10(smallest)));

    // Below this even the exponent is shorter than the zeros in front of it.
    if (max > 0 && max < 1e-4) return `${sign}.2~e`;

    // Never invent precision the data does not have: whole numbers stay whole.
    // `needed` is the exception that is not an exception — it is already
    // bounded by what the data carries, so honouring it never invents a digit.
    const decimals = Math.max(0, Math.min(Math.max(wanted, floor), dataDecimals(nums), 6), needed);
    return decimals === 0 ? `${sign}${grouping}d` : `${sign}${grouping}.${decimals}~f`;
}

/**
 * Render a value approximately as d3-format would.
 *
 * Approximately, and deliberately: flint-js carries no runtime dependencies,
 * and what the fit tests need is the *width* of the label, not the label. This
 * covers the patterns Flint itself produces and the ones a house can state;
 * anything else falls back to the raw rendering, which is what Vega-Lite would
 * print if the pattern were dropped, and is never narrower than the truth.
 */
export function formatValueApprox(value: number, pattern: string | undefined): string {
    if (!Number.isFinite(value)) return '';
    if (!pattern) return String(value);

    const match = /^([+\-( ])?(,)?(?:\.(\d+))?(~)?([a-z%])?$/i.exec(pattern)
        ?? /^([+\-( ])?(?:\.(\d+))?(~)?([a-z%])?(,)?$/i.exec(pattern);
    if (!match) return String(value);
    const forceSign = pattern.startsWith('+');
    const group = pattern.includes(',');
    const precisionText = /\.(\d+)/.exec(pattern)?.[1];
    const precision = precisionText === undefined ? undefined : Number(precisionText);
    const trim = pattern.includes('~');
    const type = /([a-z%])\s*$/i.exec(pattern.replace(/,$/, ''))?.[1];

    const negative = value < 0;
    const abs = Math.abs(value);
    let body: string;
    let suffix = '';

    if (type === 's') {
        // SI: bring the mantissa into 1–999 and name the exponent.
        const exponent = abs === 0 ? 0 : Math.floor(Math.log10(abs) / 3) * 3;
        const clamped = Math.max(-24, Math.min(24, exponent));
        const mantissa = abs / 10 ** clamped;
        body = mantissa.toPrecision(precision ?? 6);
        if (body.includes('e')) body = String(mantissa);
        suffix = SI_SUFFIX[clamped / 3 + 8] ?? '';
    } else if (type === '%') {
        body = (abs * 100).toFixed(precision ?? 0);
        suffix = '%';
    } else if (type === 'd') {
        body = String(Math.round(abs));
    } else if (type === 'f') {
        body = abs.toFixed(precision ?? 6);
    } else if (type === 'e') {
        body = abs.toExponential(precision ?? 6);
    } else {
        // No type: d3 renders the shortest form that keeps the precision, so
        // the raw rendering is the honest estimate.
        body = precision === undefined ? String(abs) : String(Number(abs.toPrecision(precision)));
    }

    // `~` drops trailing zeros — and the point along with them.
    if (trim && body.includes('.')) {
        const [mantissa, exponent] = body.split(/e/i);
        const trimmed = mantissa.replace(/0+$/, '').replace(/\.$/, '');
        body = exponent === undefined ? trimmed : `${trimmed}e${exponent}`;
    }

    if (group) {
        const dot = body.indexOf('.');
        const whole = dot === -1 ? body : body.slice(0, dot);
        const rest = dot === -1 ? '' : body.slice(dot);
        body = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + rest;
    }

    const signText = negative ? '-' : forceSign ? '+' : '';
    return `${signText}${body}${suffix}`;
}

/**
 * The longest label this data will print, in characters.
 *
 * This is what the fit tests must measure: a slot has to hold the widest
 * number that will land in it, not the widest number in some other notation.
 */
export function longestLabelChars(values: number[], pattern: string | undefined): number {
    let longest = 1;
    for (const v of values) {
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        longest = Math.max(longest, formatValueApprox(v, pattern).length);
    }
    return longest;
}
