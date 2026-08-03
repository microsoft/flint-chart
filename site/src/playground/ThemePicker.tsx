// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Icon-only house switch for the dev playground.
 *
 * The playground is a place for looking at charts, so the control carries no
 * words: each house is its own icon, and the name lives in the tooltip and the
 * accessible name where it can be reached without taking space from the wall.
 *
 * "Flint default" is a choice in the row rather than an empty slot, because
 * not theming is the baseline every house is read against.
 */

import { THEME_PRESETS, DEFAULT_THEME_ICON } from 'flint-chart';
import { siteTheme } from '../shared/theme';

export type ThemeChoice = { id: string | undefined; label: string; icon: string };

export const THEME_CHOICES: ThemeChoice[] = [
    { id: undefined, label: 'Flint default', icon: DEFAULT_THEME_ICON },
    ...Object.values(THEME_PRESETS).map((p) => ({ id: p.id, label: p.label, icon: p.icon })),
];

const iconUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

export function ThemePicker({
    themeId,
    onTheme,
    size = 26,
}: {
    themeId: string | undefined;
    onTheme: (id: string | undefined) => void;
    size?: number;
}) {
    return (
        <div
            role="radiogroup"
            aria-label="Theme"
            style={{
                display: 'inline-flex',
                gap: 2,
                padding: 3,
                borderRadius: 8,
                background: 'rgba(0, 0, 0, 0.05)',
            }}
        >
            {THEME_CHOICES.map((choice) => {
                const selected = choice.id === themeId;
                return (
                    <button
                        key={choice.id ?? 'flint'}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={choice.label}
                        title={choice.label}
                        onClick={() => onTheme(choice.id)}
                        style={{
                            width: size,
                            height: size,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: 0,
                            cursor: 'pointer',
                            borderRadius: 6,
                            border: selected ? `1px solid ${siteTheme.accent}` : '1px solid transparent',
                            background: selected ? siteTheme.surface : 'transparent',
                        }}
                    >
                        <img
                            src={iconUrl(choice.icon)}
                            alt=""
                            style={{
                                width: size - 12,
                                height: size - 12,
                                display: 'block',
                                opacity: selected ? 1 : 0.65,
                            }}
                        />
                    </button>
                );
            })}
        </div>
    );
}
