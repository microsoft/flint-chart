// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

export const INTERACTION_PROVENANCE = '__flintInteractionProvenance';

export interface InteractionProvenance {
    role: 'text-label' | 'decorative';
    identity: 'inherit' | { fields: readonly string[] };
    presentation: 'on-mark' | 'independent';
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
