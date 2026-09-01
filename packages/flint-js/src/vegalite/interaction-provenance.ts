// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export const INTERACTION_PROVENANCE = '__flintInteractionProvenance';

export interface InteractionProvenance {
    role: 'text-label' | 'legend-label' | 'decorative';
    identity: 'inherit' | { fields: readonly string[] };
    presentation: 'on-mark' | 'independent';
    legend?: { channel: string; field: string };
}

/** Declare a generated series label that acts as a direct legend entry. */
export function withInteractionLegendLabel<T extends Record<string, any>>(
    node: T,
    legend: { channel: string; field: string },
): T {
    return {
        ...node,
        [INTERACTION_PROVENANCE]: {
            role: 'legend-label',
            identity: 'inherit',
            presentation: 'independent',
            legend,
        } satisfies InteractionProvenance,
    };
}

/** Exclude a structural or ornamental mark from semantic hit instrumentation. */
export function withInteractionDecorative<T extends Record<string, any>>(node: T): T {
    return {
        ...node,
        [INTERACTION_PROVENANCE]: {
            role: 'decorative',
            identity: 'inherit',
            presentation: 'independent',
        } satisfies InteractionProvenance,
    };
}

/** Declare a generated text mark and the data identity it represents. */
export function withInteractionTextLabel<T extends Record<string, any>>(
    node: T,
    options: {
        fields?: readonly string[];
        presentation: InteractionProvenance['presentation'];
    },
): T {
    return {
        ...node,
        [INTERACTION_PROVENANCE]: {
            role: 'text-label',
            identity: options.fields ? { fields: options.fields } : 'inherit',
            presentation: options.presentation,
        } satisfies InteractionProvenance,
    };
}
