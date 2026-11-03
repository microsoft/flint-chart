// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { luminance, parseColor as parseHex, toHex, type RGB } from '../theme/presence';

/**
 * The colours an annotation is drawn in, after Blabber's: a region's wash distinct from the marks and
 * the other regions, a cluster's outline in the colour its points share, other outlines in a neutral
 * grey, and words in a readable shade of the colour they belong to.
 */

const NAMED: Record<string, string> = {
    black: '#000000', white: '#ffffff', red: '#ff0000', blue: '#0000ff', green: '#008000', orange: '#ffa500',
    purple: '#800080', brown: '#a52a2a', pink: '#ffc0cb', grey: '#808080', gray: '#808080', yellow: '#ffff00',
    teal: '#008080', crimson: '#dc143c', navy: '#000080', gold: '#ffd700', goldenrod: '#daa520',
    steelblue: '#4682b4', lightskyblue: '#87cefa', transparent: '',
};

/** A CSS colour as RGB: hex, `rgb()`/`rgba()`, or a common name. Null for anything else. */
export function cssColor(input: string | null | undefined): RGB | null {
    if (!input) return null;
    const value = input.trim().toLowerCase();
    const named = NAMED[value];
    if (named !== undefined) return named ? parseHex(named) : null;
    const rgb = /^rgba?\(([^)]+)\)$/.exec(value);
    if (rgb) {
        const parts = rgb[1].split(/[\s,/]+/).filter(Boolean).map(Number);
        if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
            return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
        }
        return null;
    }
    return parseHex(value);
}

function hexOf(input: string | null | undefined): string | undefined {
    const color = cssColor(input);
    return color && color.a > 0 ? toHex(color) : undefined;
}

function contrast(a: RGB, b: RGB): number {
    const la = luminance(a);
    const lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function oklab({ r, g, b }: RGB): [number, number, number] {
    const linear = (value: number): number => {
        const x = value / 255;
        return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const lr = linear(r);
    const lg = linear(g);
    const lb = linear(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return [
        0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
}

function fromOklab([L, a, b]: [number, number, number]): RGB {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    const channel = (value: number): number => {
        const x = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
        return Math.max(0, Math.min(255, Math.round(x * 255)));
    };
    return {
        r: channel(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
        g: channel(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
        b: channel(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
        a: 1,
    };
}

function distance(a: RGB, b: RGB): number {
    const x = oklab(a);
    const y = oklab(b);
    return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

const PAPER = '#ffffff';

/** The hues a region's wash is chosen from. */
const CALLOUT_PALETTE = ['#e45756', '#f58518', '#54a24b', '#b279a2', '#ff9da6', '#9d755d', '#17becf', '#d95f02', '#7570b3'];

/**
 * A region's wash: of the callout hues that read on the page, the one furthest (in OKLab) from every
 * mark's fill and every region already shaded.
 */
export function distinctRegionColor(existing: readonly (string | null | undefined)[], background = PAPER): string {
    const paper = cssColor(background) ?? cssColor(PAPER)!;
    const colours = existing.map(cssColor).filter((colour): colour is RGB => colour !== null && colour.a > 0);
    let best = CALLOUT_PALETTE[0];
    let bestScore = -Infinity;
    for (const candidate of CALLOUT_PALETTE) {
        const rgb = cssColor(candidate)!;
        const reads = contrast(rgb, paper);
        if (reads < 2.5) continue;
        const separation = colours.length === 0 ? distance(rgb, paper) : Math.min(...colours.map((colour) => distance(rgb, colour)));
        const score = separation + reads * 0.01;
        if (score > bestScore) {
            best = candidate;
            bestScore = score;
        }
    }
    return best;
}

/**
 * The same hue, made darker (lighter on a dark page) in OKLab lightness only, so it keeps its hue and
 * chroma, until it reaches `minimum`:1 against the page: words in the colour they belong to.
 */
export function readableShade(colour: string, background = PAPER, minimum = 4.5): string {
    const paper = cssColor(background) ?? cssColor(PAPER)!;
    let rgb = cssColor(colour);
    if (!rgb) return luminance(paper) > 0.4 ? '#1a1a1a' : '#f5f5f5';
    const darken = luminance(paper) > 0.18;
    for (let step = 0; step < 12 && contrast(rgb, paper) < minimum; step++) {
        const [L, a, b] = oklab(rgb);
        rgb = fromOklab([darken ? Math.max(0, L * 0.88) : Math.min(1, L + (1 - L) * 0.18), a, b]);
    }
    return toHex(rgb);
}

/** A colour drawn at `alpha` over the page, as it reads there. */
export function over(colour: string, background: string, alpha: number): string {
    const fg = cssColor(colour);
    const bg = cssColor(background) ?? cssColor(PAPER)!;
    if (!fg) return toHex(bg);
    const t = Math.max(0, Math.min(1, alpha));
    return toHex({ r: bg.r + (fg.r - bg.r) * t, g: bg.g + (fg.g - bg.g) * t, b: bg.b + (fg.b - bg.b) * t, a: 1 });
}

/**
 * The neutral annotation ink: the grey Blabber draws leaders and unclaimed outlines in (#5a5a5a), or
 * its counterpart on a dark page. It reads at 4.5:1 without the weight of black.
 */
export function neutralInk(background = PAPER): string {
    return isDarkPage(background) ? '#b4b4b4' : readableShade('#5a5a5a', background, 4.5);
}

/**
 * A cluster's outline and caption colour: the colour most of its points share, where that reads at
 * 4.5:1 on the page (their stroke, for hollow points); else that colour darkened until it does; else,
 * with no shared colour, the neutral annotation ink.
 */
export function clusterColor(marks: readonly { fill?: string | null; stroke?: string | null }[], background = PAPER): string {
    const page = hexOf(background) ?? PAPER;
    const paper = cssColor(page)!;
    const majority = (colours: (string | undefined)[]): string | undefined => {
        const counts = new Map<string, number>();
        for (const colour of colours) if (colour) counts.set(colour, (counts.get(colour) ?? 0) + 1);
        const [top] = [...counts].sort((a, b) => b[1] - a[1]);
        return top && top[1] > colours.length / 2 ? top[0] : undefined;
    };
    // A cluster is known by its fill; its stroke only where it has none (a theme's outline round every
    // dot is the same for all clusters, and would outline each in the same ink).
    const hue = majority(marks.map((mark) => hexOf(mark.fill))) ?? majority(marks.map((mark) => hexOf(mark.stroke)));
    if (!hue || hue === page) return neutralInk(page);
    return contrast(cssColor(hue)!, paper) >= 4.5 ? hue : readableShade(hue, page, 4.5);
}

/** Whether the page is dark: a wash then lightens what it covers rather than darkening it. */
export function isDarkPage(background: string | null | undefined): boolean {
    const rgb = cssColor(background ?? PAPER);
    return rgb ? luminance(rgb) < 0.18 : false;
}
