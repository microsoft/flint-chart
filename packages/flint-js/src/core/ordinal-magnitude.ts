// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Ordinal-as-magnitude detection.
 *
 * An ordinal answers "which position", not "how much". Rank 1 is ahead of rank 5
 * but it is not five times anything, so a bar whose length is the rank invents a
 * magnitude the data does not carry — and reads as the inverse of the ranking,
 * because last place gets the longest bar.
 *
 * Semantics resolve `Rank` to `ordinal`, so the mistake is not made there. It
 * appears when a template overrides that and emits the field as `quantitative` on
 * a position channel. The check therefore reads the compiled spec rather than the
 * resolved semantics: templates that encode the same field by position are left
 * alone, and a template that starts encoding it as a length later is covered
 * without changing this file.
 */

import type { ChannelSemantics, ChartWarning, MarkCognitiveChannel } from './types';

/**
 * Semantic types that carry order but no magnitude.
 *
 * `Rank` only for now. `ID` is deliberately excluded: it is not ordered, so its
 * problem on a length channel is a different one.
 */
const ORDINAL_SEMANTIC_TYPES = new Set(['Rank']);

/** Channels a mark's length is read from. */
const VALUE_CHANNELS = ['x', 'y'] as const;

/**
 * True when `spec` encodes `field` as quantitative on one of the value channels,
 * anywhere in a possibly concatenated / faceted / layered spec.
 */
function encodesAsMagnitude(spec: unknown, field: string): boolean {
    if (!spec || typeof spec !== 'object') return false;

    if (Array.isArray(spec)) {
        return spec.some((entry) => encodesAsMagnitude(entry, field));
    }

    const node = spec as Record<string, any>;
    const encoding = node.encoding;
    if (encoding && typeof encoding === 'object') {
        for (const channel of VALUE_CHANNELS) {
            const def = encoding[channel];
            if (def && def.field === field && def.type === 'quantitative') return true;
        }
    }

    return Object.values(node).some((child) => encodesAsMagnitude(child, field));
}

/**
 * Warn when a length-encoding template compiled an order-only field onto a value
 * channel as a magnitude.
 *
 * @param chartType             Chart type name, for the message.
 * @param markCognitiveChannel  How the template's mark encodes its value.
 * @param channelSemantics      Resolved semantics, source of each channel's field.
 * @param compiledSpec          The assembled backend spec.
 */
export function detectOrdinalAsMagnitude(
    chartType: string,
    markCognitiveChannel: MarkCognitiveChannel | undefined,
    channelSemantics: Record<string, ChannelSemantics>,
    compiledSpec: unknown,
): ChartWarning[] {
    if (markCognitiveChannel !== 'length') return [];

    const warnings: ChartWarning[] = [];
    const seen = new Set<string>();

    for (const channel of VALUE_CHANNELS) {
        const cs = channelSemantics[channel];
        const semanticType = cs?.semanticAnnotation?.semanticType;
        if (!cs?.field || !semanticType || !ORDINAL_SEMANTIC_TYPES.has(semanticType)) continue;
        if (seen.has(cs.field)) continue;
        if (!encodesAsMagnitude(compiledSpec, cs.field)) continue;

        seen.add(cs.field);
        warnings.push({
            severity: 'warning',
            code: 'ordinal-as-magnitude',
            channel,
            field: cs.field,
            message:
                `${channel}: '${cs.field}' is ${semanticType}, an order rather than a magnitude, ` +
                `but ${chartType} encodes it as a bar length, so the longest bar is last place. ` +
                `Bind a measured value to ${channel} and let the ${semanticType.toLowerCase()} order ` +
                `the rows, or pick a chart type that encodes ${channel} by position.`,
        });
    }
    return warnings;
}
