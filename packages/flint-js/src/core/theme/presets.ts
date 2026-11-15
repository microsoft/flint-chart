// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The houses Flint ships.
 *
 * Each is measured from a hand-authored redesign of real charts, so naming one
 * is a claim that can be checked against the original rather than a mood.
 * A caller who wants their own house passes a `ThemeSpec` object instead.
 */

import type { ThemePreset, ThemeSpec } from './types';
import { contrastRatio, readableTextInk } from './presence';
import { FLINT_ICON } from './presets/icons';
import { nyt } from './presets/nyt';
import { economist } from './presets/economist';
import { nature } from './presets/nature';
import { mckinsey } from './presets/mckinsey';
import { datawrapper } from './presets/datawrapper';
import { powerbi } from './presets/powerbi';
import { powerbiLight } from './presets/powerbi-light';
import { swiss } from './presets/swiss';
import { pop } from './presets/pop';
import { cartoon } from './presets/cartoon';
import { apple } from './presets/apple';
import { deStijl } from './presets/de-stijl';
import { bbc } from './presets/bbc';
import { material } from './presets/material';
import { deepMerge } from './merge.js';

export const THEME_PRESETS: Record<string, ThemePreset> = {
    nyt,
    economist,
    swiss,
    nature,
    mckinsey,
    datawrapper,
    powerbi,
    'powerbi-light': powerbiLight,
    pop,
    cartoon,
    apple,
    'de-stijl': deStijl,
    bbc,
    material,
};

/**
 * The icon for "no house" — flint's own defaults, so a picker can offer
 * *not* theming as a visible choice rather than an empty slot.
 */
export const DEFAULT_THEME_ICON = FLINT_ICON;

/**
 * The catalogue, without the specs — enough to choose by.
 *
 * Without the icons either: this is what an agent reads to pick a house, and a
 * picture it cannot see costs it context it could have spent on the chart. A
 * picker that wants icons reads them off {@link THEME_PRESETS}.
 */
export function listThemePresets(): Array<Pick<ThemePreset, 'id' | 'label' | 'description'>> {
    return Object.values(THEME_PRESETS).map(({ id, label, description }) => ({ id, label, description }));
}

/**
 * Take what the caller put in `theme_spec` and hand back a ThemeSpec.
 *
 * A string names a house Flint ships; an object is the caller's own. An object
 * may also `extend` one of those houses and state only its overrides. Nested
 * policy objects merge, while arrays and scalar values replace the preset.
 *
 * An unknown name is an error rather than a silent fallback to no theme: a
 * chart that quietly ignores the house it was asked for looks like a bug in
 * the house.
 */
export function resolveThemeSpec(theme: ThemeSpec | string | undefined): ThemeSpec | undefined {
    if (theme === undefined) return undefined;
    if (typeof theme === 'string') return resolveThemeSpec(presetSpec(theme));
    if (theme.extends === undefined) return theme;

    const { extends: presetId, ...overrides } = theme;
    const base = resolveThemeSpec(presetSpec(presetId))!;
    return followInk(base, overrides, deepMerge(base, overrides));
}

/** Type roles set on the page; a value label is set on its mark, whose fill the page does not decide. */
const PAGE_ROLES = ['headline', 'deck', 'axisLabel', 'axisTitle', 'keyLabel', 'keyTitle', 'annotation', 'footnote', 'kicker', 'display'] as const;

const sameColor = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A house that recolours the one it extends takes its type with it. A role the base states in one of
 * its text inks (the NYT sets its headline in its primary ink) follows that ink as recoloured; on a
 * page recoloured, a role whose own colour no longer reads on it is moved until it does. A role
 * whose colour the extension states itself is left as stated.
 */
function followInk(base: ThemeSpec, overrides: Partial<ThemeSpec>, merged: ThemeSpec): ThemeSpec {
    const text = overrides.ink?.text;
    const surface = overrides.ink?.surface;
    if (!text && !surface || !merged.type) return merged;
    const baseText = (base.ink?.text ?? {}) as Record<string, string | undefined>;
    const newText = (merged.ink?.text ?? {}) as Record<string, string | undefined>;
    const page = surface?.canvas ?? surface?.plot;
    const type: Record<string, any> = { ...merged.type };
    for (const role of PAGE_ROLES) {
        const stated = type[role];
        if (!stated || typeof stated.color !== 'string' || (overrides.type as any)?.[role]?.color !== undefined) continue;
        const echoed = Object.keys(baseText).find((key) => sameColor(baseText[key], stated.color));
        let color: string = echoed && text?.[echoed as keyof typeof text] ? newText[echoed]! : stated.color;
        if (page && contrastRatio(color, page) < 3) {
            const fallback = newText[echoed ?? 'primary'];
            color = fallback && contrastRatio(fallback, page) >= 3 ? fallback : readableTextInk(color, page);
        }
        if (color !== stated.color) type[role] = { ...stated, color };
    }
    return { ...merged, type };
}

function presetSpec(id: string): ThemeSpec {
    const preset = THEME_PRESETS[id];
    if (!preset) {
        throw new Error(
            `Unknown theme \`${id}\`. Flint ships: ${Object.keys(THEME_PRESETS).join(', ')}.`,
        );
    }
    return preset.spec;
}
