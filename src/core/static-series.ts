// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Static Series Normalization
 *
 * Detects array-valued encodings (static series) in the input spec,
 * validates them, and folds (unpivots) the data into long form so
 * the rest of the pipeline can process it as a standard single-field
 * encoding with a color discriminator.
 *
 * This runs BEFORE Phase 0 (resolveChannelSemantics).
 */

import type { ChartEncoding, EncodingValue, StaticSeriesMetadata } from './types';
import type { SemanticAnnotation } from './field-semantics';
import { getVisCategory, inferVisCategory } from './semantic-types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Synthetic column names injected by the fold transform */
export const STATIC_SERIES_KEY_COLUMN = '__flint_series_key';
export const STATIC_SERIES_VALUE_COLUMN = '__flint_series_value';

/** Channels that may accept array-valued (multi-field) encodings */
const MEASURE_CHANNELS = new Set(['x', 'y']);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Result of normalizing static series from the input spec.
 */
export interface NormalizeStaticSeriesResult {
    /** Normalized encodings (all single-valued) */
    encodings: Record<string, ChartEncoding>;
    /** Folded data (or original if no static series detected) */
    data: any[];
    /** Static series metadata (present only when fold was applied) */
    staticSeries?: StaticSeriesMetadata;
}

/**
 * Detect, validate, and normalize static series (array-valued encodings).
 *
 * If no array-valued encodings are present, returns the input unchanged.
 * If one is found, validates constraints and returns folded data +
 * rewritten encodings.
 *
 * @throws Error if validation fails (non-quantitative field, conflicting
 *         color binding, multiple array channels, etc.)
 */
export function normalizeStaticSeries(
    encodings: Record<string, EncodingValue>,
    data: any[],
    semanticTypes: Record<string, string | SemanticAnnotation>,
): NormalizeStaticSeriesResult {
    // Find array-valued channels
    const arrayChannels: { channel: string; entries: ChartEncoding[] }[] = [];
    for (const [channel, enc] of Object.entries(encodings)) {
        if (Array.isArray(enc)) {
            arrayChannels.push({ channel, entries: enc });
        }
    }

    // No static series — pass through unchanged
    if (arrayChannels.length === 0) {
        return {
            encodings: encodings as Record<string, ChartEncoding>,
            data,
        };
    }

    // --- Validation ---

    // Only one channel may have an array encoding
    if (arrayChannels.length > 1) {
        const channelNames = arrayChannels.map(c => c.channel).join(', ');
        throw new Error(
            `Static series (array encoding) found on multiple channels: ${channelNames}. ` +
            `Only one channel may use array encoding at a time.`
        );
    }

    const { channel, entries } = arrayChannels[0];

    // Must be a measure channel
    if (!MEASURE_CHANNELS.has(channel)) {
        throw new Error(
            `Static series (array encoding) is only allowed on measure channels (${[...MEASURE_CHANNELS].join(', ')}), ` +
            `not "${channel}".`
        );
    }

    // Must have at least 2 entries
    if (entries.length < 2) {
        throw new Error(
            `Static series requires at least 2 fields, got ${entries.length} on channel "${channel}".`
        );
    }

    // Each entry must specify a field
    const fields: string[] = [];
    for (const entry of entries) {
        if (!entry.field) {
            throw new Error(
                `Each static series entry must have a "field" property.`
            );
        }
        fields.push(entry.field);
    }

    // Duplicate field check
    const fieldSet = new Set(fields);
    if (fieldSet.size !== fields.length) {
        throw new Error(
            `Static series contains duplicate fields. Each field must be unique.`
        );
    }

    // Fields must exist in data columns (if data is available)
    if (data.length > 0) {
        const dataColumns = new Set(Object.keys(data[0]));
        for (const field of fields) {
            if (!dataColumns.has(field)) {
                throw new Error(
                    `Static series field "${field}" not found in data columns. ` +
                    `Available columns: ${[...dataColumns].join(', ')}`
                );
            }
        }
    }

    // Fields must resolve to quantitative (not nominal/ordinal)
    for (const entry of entries) {
        const field = entry.field!;
        const explicitType = entry.type;
        if (explicitType === 'nominal' || explicitType === 'ordinal') {
            throw new Error(
                `Static series field "${field}" has type "${explicitType}" — ` +
                `only quantitative or temporal fields are allowed in static series.`
            );
        }
        // Infer if no explicit type
        if (!explicitType && data.length > 0) {
            const semType = semanticTypes[field];
            const semTypeStr = typeof semType === 'string' ? semType : semType?.semanticType || '';
            // Try semantic type registry first, then infer from data values
            const fromRegistry = semTypeStr ? getVisCategory(semTypeStr) : null;
            const inferred = fromRegistry ?? inferVisCategory(data.map(r => r[field]));
            if (inferred === 'nominal' || inferred === 'ordinal') {
                throw new Error(
                    `Static series field "${field}" infers as "${inferred}" from data — ` +
                    `only quantitative or temporal fields are allowed in static series.`
                );
            }
        }
    }

    // Cannot combine with explicit color field binding
    const colorEnc = encodings.color;
    if (colorEnc && !Array.isArray(colorEnc) && colorEnc.field) {
        throw new Error(
            `Cannot use static series on "${channel}" when the color channel is already bound to ` +
            `field "${colorEnc.field}". Static series implicitly uses the color channel for ` +
            `series discrimination.`
        );
    }

    // --- Fold (unpivot) the data ---
    const foldedData = foldData(data, fields);

    // --- Rewrite encodings ---
    const normalizedEncodings: Record<string, ChartEncoding> = {};
    for (const [ch, enc] of Object.entries(encodings)) {
        if (ch === channel) {
            // Replace array with single encoding on the synthetic value column
            normalizedEncodings[ch] = { field: STATIC_SERIES_VALUE_COLUMN, type: 'quantitative' };
        } else if (Array.isArray(enc)) {
            // Shouldn't reach here (validated above), but handle gracefully
            normalizedEncodings[ch] = enc[0];
        } else {
            normalizedEncodings[ch] = enc;
        }
    }

    // Add color encoding for the synthetic key column (preserving any user-specified scheme)
    const colorScheme = (!Array.isArray(colorEnc) && colorEnc?.scheme) ? colorEnc.scheme : undefined;
    normalizedEncodings.color = {
        field: STATIC_SERIES_KEY_COLUMN,
        type: 'nominal',
        ...(colorScheme ? { scheme: colorScheme } : {}),
    };

    const metadata: StaticSeriesMetadata = {
        channel,
        fields,
        keyColumn: STATIC_SERIES_KEY_COLUMN,
        valueColumn: STATIC_SERIES_VALUE_COLUMN,
    };

    return {
        encodings: normalizedEncodings,
        data: foldedData,
        staticSeries: metadata,
    };
}

// ---------------------------------------------------------------------------
// Internal: fold/unpivot
// ---------------------------------------------------------------------------

/**
 * Unpivot (fold) wide-format data into long form.
 *
 * Each input row produces N output rows (one per field in `fields`).
 * Non-measure columns are preserved. Two synthetic columns are added:
 * - `__flint_series_key`: the field name (series identifier)
 * - `__flint_series_value`: the value from that field
 *
 * Rows where all fold values are null/undefined are skipped.
 */
function foldData(data: any[], fields: string[]): any[] {
    const fieldSet = new Set(fields);
    const result: any[] = [];

    for (const row of data) {
        // Collect non-fold columns
        const baseRow: Record<string, any> = {};
        for (const [key, value] of Object.entries(row)) {
            if (!fieldSet.has(key)) {
                baseRow[key] = value;
            }
        }

        // Create one row per fold field
        for (const field of fields) {
            const value = row[field];
            // Skip null/undefined values to avoid phantom data points
            if (value == null) continue;
            result.push({
                ...baseRow,
                [STATIC_SERIES_KEY_COLUMN]: field,
                [STATIC_SERIES_VALUE_COLUMN]: value,
            });
        }
    }

    return result;
}
