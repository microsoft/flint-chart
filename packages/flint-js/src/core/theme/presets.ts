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
import { nyt } from './presets/nyt';
import { economist } from './presets/economist';
import { nature } from './presets/nature';
import { mckinsey } from './presets/mckinsey';
import { datawrapper } from './presets/datawrapper';
import { powerbi } from './presets/powerbi';
import { powerbiLight } from './presets/powerbi-light';
import { swiss } from './presets/swiss';

export const THEME_PRESETS: Record<string, ThemePreset> = {
    nyt,
    economist,
    nature,
    mckinsey,
    datawrapper,
    powerbi,
    'powerbi-light': powerbiLight,
    swiss,
};

/** The catalogue, without the specs — enough to choose by. */
export function listThemePresets(): Array<Pick<ThemePreset, 'id' | 'label' | 'description'>> {
    return Object.values(THEME_PRESETS).map(({ id, label, description }) => ({ id, label, description }));
}

/**
 * Take what the caller put in `theme_spec` and hand back a ThemeSpec.
 *
 * A string names a house Flint ships; an object is the caller's own. An
 * unknown name is an error rather than a silent fallback to no theme: a chart
 * that quietly ignores the house it was asked for looks like a bug in the
 * house.
 */
export function resolveThemeSpec(theme: ThemeSpec | string | undefined): ThemeSpec | undefined {
    if (theme === undefined) return undefined;
    if (typeof theme !== 'string') return theme;
    const preset = THEME_PRESETS[theme];
    if (!preset) {
        throw new Error(
            `Unknown theme \`${theme}\`. Flint ships: ${Object.keys(THEME_PRESETS).join(', ')}.`,
        );
    }
    return preset.spec;
}
