// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The presence ordinal, resolved.
 *
 * `omit < hairline < quiet < full < emphasised` is a statement about *contrast
 * against the surface the element sits on*, not about opacity or colour. That
 * is the whole reason one ThemeSpec works on white and on Power BI's #1b1a19
 * with no branch: the ordinal is resolved late, against the surface that
 * grounding actually chose.
 */

import type { Presence } from './types.js';

export interface RGB { r: number; g: number; b: number; a: number }

const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX8 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

export function parseColor(input: string | undefined | null): RGB | null {
    if (!input) return null;
    const s = String(input).trim();
    let m = HEX8.exec(s);
    if (m) {
        return {
            r: parseInt(m[1], 16),
            g: parseInt(m[2], 16),
            b: parseInt(m[3], 16),
            a: parseInt(m[4], 16) / 255,
        };
    }
    m = HEX6.exec(s);
    if (m) {
        return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16), a: 1 };
    }
    m = HEX3.exec(s);
    if (m) {
        return {
            r: parseInt(m[1] + m[1], 16),
            g: parseInt(m[2] + m[2], 16),
            b: parseInt(m[3] + m[3], 16),
            a: 1,
        };
    }
    return null;
}

export function toHex(c: RGB): string {
    const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
}

/** Composite a possibly-transparent ink over an opaque surface. */
export function flatten(ink: RGB, surface: RGB): RGB {
    if (ink.a >= 1) return { ...ink, a: 1 };
    return {
        r: ink.r * ink.a + surface.r * (1 - ink.a),
        g: ink.g * ink.a + surface.g * (1 - ink.a),
        b: ink.b * ink.a + surface.b * (1 - ink.a),
        a: 1,
    };
}

/** Linear blend from `a` (t=0) to `b` (t=1). */
export function mix(a: RGB, b: RGB, t: number): RGB {
    const k = Math.max(0, Math.min(1, t));
    return {
        r: a.r + (b.r - a.r) * k,
        g: a.g + (b.g - a.g) * k,
        b: a.b + (b.b - a.b) * k,
        a: 1,
    };
}

export function mixHex(a: string, b: string, t: number, fallback = '#000000'): string {
    const ca = parseColor(a);
    const cb = parseColor(b);
    if (!ca || !cb) return fallback;
    return toHex(mix(ca, cb, t));
}

/** WCAG relative luminance. */
export function luminance(c: RGB): number {
    const f = (v: number) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}

export function isDarkSurface(surface: string): boolean {
    const c = parseColor(surface);
    return c ? luminance(c) < 0.45 : false;
}

/**
 * How far up the ordinal an element sits, expressed as the fraction of the
 * distance from the surface to full-strength role ink.
 *
 * These are the numbers in `fields.md` §presence, restated as a blend factor:
 * `full` means "the ink the house declared", and everything below it is that
 * same ink pulled back toward the surface. Nothing here invents a hue — the
 * hue always comes from `ink.structure.*`.
 */
const PRESENCE_STRENGTH: Record<Presence, number> = {
    omit: 0,
    hairline: 0.42,
    quiet: 0.72,
    full: 1,
    emphasised: 1,
};

/**
 * Contrast targets used only when the house declared no ink for the role.
 * Expressed against the foreground, so a dark surface flips automatically.
 */
const PRESENCE_FALLBACK_CONTRAST: Record<Presence, number> = {
    omit: 0,
    hairline: 0.06,
    quiet: 0.12,
    full: 0.4,
    emphasised: 1,
};

export const PRESENCE_ORDER: Presence[] = ['omit', 'hairline', 'quiet', 'full', 'emphasised'];

export function presenceRank(p: Presence | undefined, dflt: Presence = 'full'): number {
    return PRESENCE_ORDER.indexOf(p ?? dflt);
}

export interface ResolveInkArgs {
    presence: Presence | undefined;
    /** The surface this element sits on, already resolved. */
    surface: string;
    /** `ink.structure.*` for this role, if the house declared one. */
    roleInk?: string;
    /** Full-strength foreground, used for `emphasised` and as ink fallback. */
    foreground: string;
    fallback?: Presence;
}

/**
 * Resolve a presence to a concrete colour, or `null` for `omit`.
 *
 * `emphasised` deliberately ignores the role ink: it means "as strong as text",
 * and text ink is the only thing that knows what that is on this surface.
 */
export function resolvePresenceInk(args: ResolveInkArgs): string | null {
    const p = args.presence ?? args.fallback ?? 'full';
    if (p === 'omit') return null;

    const surface = parseColor(args.surface) ?? { r: 255, g: 255, b: 255, a: 1 };
    const fg = parseColor(args.foreground) ?? { r: 0, g: 0, b: 0, a: 1 };

    if (p === 'emphasised') return toHex(fg);

    const declared = parseColor(args.roleInk ?? undefined);
    if (declared) {
        // A fully transparent declared ink is the house saying "not here".
        if (declared.a === 0) return null;
        const target = flatten(declared, surface);
        return toHex(mix(surface, target, PRESENCE_STRENGTH[p]));
    }
    return toHex(mix(surface, fg, PRESENCE_FALLBACK_CONTRAST[p]));
}

/** Stroke width implied by the ordinal, in px. */
export function presenceWidth(p: Presence | undefined, base = 1): number {
    switch (p ?? 'full') {
        case 'omit': return 0;
        case 'hairline': return Math.min(base, 0.5);
        case 'quiet': return base;
        case 'full': return base;
        case 'emphasised': return base * 1.5;
        default: return base;
    }
}

/** Pick whichever of two inks reads better on `background`. */
export function contrastingInk(background: string, light: string, dark: string): string {
    const bg = parseColor(background);
    if (!bg) return dark;
    return luminance(bg) < 0.5 ? light : dark;
}

/** Sample `n` evenly spaced colours from a ramp's control points. */
export function sampleRamp(stops: string[], n: number): string[] {
    if (stops.length === 0) return [];
    if (n <= 1) return [stops[stops.length - 1]];
    const parsed = stops.map((s) => parseColor(s)).filter(Boolean) as RGB[];
    if (parsed.length === 0) return [];
    if (parsed.length === 1) return new Array(n).fill(toHex(parsed[0]));
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        const t = (i / (n - 1)) * (parsed.length - 1);
        const lo = Math.floor(t);
        const hi = Math.min(parsed.length - 1, lo + 1);
        out.push(toHex(mix(parsed[lo], parsed[hi], t - lo)));
    }
    return out;
}
