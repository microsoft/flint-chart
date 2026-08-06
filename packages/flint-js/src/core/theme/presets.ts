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
    return deepMerge(resolveThemeSpec(presetSpec(presetId))!, overrides);
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
