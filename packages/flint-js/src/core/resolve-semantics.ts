// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * CHANNEL SEMANTICS RESOLVER
 * =============================================================================
 *
 * Stage 2 of the semantic pipeline:
 *   SemanticAnnotation + data → FieldSemantics → **ChannelSemantics**
 *
 * Takes each channel’s field, builds FieldSemantics (stage 1), then adds
 * channel-specific visualization decisions: encoding type, color scheme,
 * temporal format, ordinal sort, tick constraints, axis reversal, nice
 * rounding, interpolation, and stacking.
 *
 * Zero-baseline is NOT resolved here — it requires template mark knowledge
 * and is finalized by the assembler after this function returns.
 *
 * VL dependency: **None**
 * =============================================================================
 */

import type {
    ChartEncoding,
    ChartWarning,
    ChannelSemantics,
    SemanticResult,
} from './types';
import {
    getVisCategory,
    inferVisCategory,
    getRecommendedColorScheme,
    inferOrdinalSortOrder,
} from './semantic-types';
import {
    resolveEncodingType as resolveEncodingTypeDecision,
} from './decisions';
import {
    resolveFieldSemantics,
    toTypeString,
    resolveNice,
    resolveTickConstraint,
    resolveReversed,
    resolveStackable,
    resolveColorSchemeHint,
    resolveDivergingInfo,
    type SemanticAnnotation,
} from './field-semantics';

export type EncodingSort =
    | { kind: 'channel'; channel: 'x' | 'y' | 'color' }
    | { kind: 'field'; field: string }
    | { kind: 'values'; values: (string | number | boolean)[] };

export interface EncodingSortIssue {
    property: 'sortBy' | 'sortOrder';
    value: unknown;
    /** Message reported by strict validation. */
    error: string;
    /** Message reported when assembly repairs the hint. */
    warning: string;
}

export interface EncodingSortInspection {
    sort?: EncodingSort;
    /** The `sortBy` that remains usable after invalid parts are removed. */
    sortBy?: string;
    sortOrder?: 'ascending' | 'descending';
    issues: EncodingSortIssue[];
}

export interface EncodingSortOptions {
    /** Whether the caller can sort categories by a raw data field. Default: true. */
    fieldSort?: boolean;
}

const isCategoryValue = (value: unknown): value is string | number | boolean =>
    typeof value === 'string' || typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value));

/** Apply the sort-hint rules without throwing; strict and lenient callers share this. */
export function inspectEncodingSort(
    encoding: { sortBy?: unknown; sortOrder?: unknown },
    channel: string,
    encodings: Record<string, unknown>,
    dataFields: ReadonlySet<string>,
    options: EncodingSortOptions = {},
): EncodingSortInspection {
    const issues: EncodingSortIssue[] = [];
    const describe = (property: 'sortBy' | 'sortOrder', value: unknown) =>
        `encodings.${channel}.${property} ${typeof value === 'string' ? `"${value}"` : JSON.stringify(value)}`;
    let sortOrder: EncodingSortInspection['sortOrder'];
    if (encoding.sortOrder === 'ascending' || encoding.sortOrder === 'descending') {
        sortOrder = encoding.sortOrder;
    } else if (encoding.sortOrder !== undefined) {
        issues.push({
            property: 'sortOrder',
            value: encoding.sortOrder,
            error: `encodings.${channel}.sortOrder must be "ascending" or "descending".`,
            warning: `${describe('sortOrder', encoding.sortOrder)} must be "ascending" or "descending"; ignoring it.`,
        });
    }
    const sortBy = encoding.sortBy;
    if (sortBy === undefined) return { sortOrder, issues };
    // A rejected sortBy also drops its sortOrder, so the chart keeps its default order.
    const reject = (error: string, reason: string): EncodingSortInspection => {
        issues.push({
            property: 'sortBy',
            value: sortBy,
            error,
            warning: `${describe('sortBy', sortBy)} ${reason}; using default order.`,
        });
        return { issues };
    };
    const invalid = `encodings.${channel}.sortBy must name an existing data field, a mapped channel (x, y, color), or a JSON category-order array; received ${JSON.stringify(sortBy)}.`;
    if (typeof sortBy !== 'string' || !sortBy.trim()) {
        return reject(invalid, 'is not a data field, mapped channel, or JSON category array');
    }
    if (sortBy === 'x' || sortBy === 'y' || sortBy === 'color') {
        const binding = encodings[sortBy];
        const targets = Array.isArray(binding) ? binding : [binding];
        if (!targets.some(target => typeof target === 'string' ? target.length > 0
            : target && typeof target === 'object' && (typeof target.field === 'string' || target.aggregate === 'count'))) {
            return reject(
                `encodings.${channel}.sortBy: channel "${sortBy}" must be mapped to a field or count aggregation.`,
                'names a channel that is not mapped',
            );
        }
        return { sort: { kind: 'channel', channel: sortBy }, sortBy, sortOrder, issues };
    }
    if (dataFields.has(sortBy)) {
        if (options.fieldSort === false) {
            return reject(
                `chart_spec.encodings.${channel}.sortBy: raw field-name sorting is not supported by this backend; bind the sort field to a supported measure channel and sort by that channel.`,
                'sorts by a raw data field, which this backend does not support',
            );
        }
        return { sort: { kind: 'field', field: sortBy }, sortBy, sortOrder, issues };
    }
    let values: unknown;
    try {
        values = JSON.parse(sortBy);
    } catch {
        return reject(invalid, 'is not a data field');
    }
    if (!Array.isArray(values)) return reject(invalid, 'is not a data field or JSON category array');
    const valid = values.filter(isCategoryValue);
    if (valid.length === 0 && values.length > 0) return reject(invalid, 'contains no valid category values');
    if (valid.length < values.length) {
        const dropped = values.length - valid.length;
        issues.push({
            property: 'sortBy',
            value: sortBy,
            error: invalid,
            warning: `${describe('sortBy', sortBy)} contains ${dropped} invalid category value${dropped === 1 ? '' : 's'}; ignoring ${dropped === 1 ? 'it' : 'them'}.`,
        });
        return { sort: { kind: 'values', values: valid }, sortBy: JSON.stringify(valid), sortOrder, issues };
    }
    return { sort: { kind: 'values', values: valid }, sortBy, sortOrder, issues };
}

/** Strict sort resolution for validation: throws the first rule violation. */
export function resolveEncodingSort(
    encoding: { sortBy?: unknown; sortOrder?: unknown },
    channel: string,
    encodings: Record<string, unknown>,
    dataFields: ReadonlySet<string>,
    options: EncodingSortOptions = {},
): EncodingSort | undefined {
    const inspection = inspectEncodingSort(encoding, channel, encodings, dataFields, options);
    if (inspection.issues.length > 0) throw new Error(inspection.issues[0].error);
    return inspection.sort;
}

/**
 * Lenient sort resolution for assembly: removes unusable sort hints so the
 * chart renders in its default order, and reports each repair as a warning.
 */
export function repairEncodingSorts<T>(
    encodings: Record<string, T>,
    data: readonly unknown[],
    options: EncodingSortOptions = {},
): { encodings: Record<string, T>; warnings: ChartWarning[] } {
    const warnings: ChartWarning[] = [];
    if (!encodings || typeof encodings !== 'object') return { encodings, warnings };
    const dataFields = new Set(data.flatMap(row => row && typeof row === 'object' ? Object.keys(row) : []));
    const repair = (channel: string, entry: unknown): unknown => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
        const encoding = entry as Record<string, unknown>;
        const { sortBy, sortOrder, issues } = inspectEncodingSort(encoding, channel, encodings, dataFields, options);
        if (issues.length === 0) return entry;
        for (const issue of issues) {
            warnings.push({ severity: 'warning', code: 'invalid_sort', message: issue.warning, channel });
        }
        const next = { ...encoding };
        delete next.sortBy;
        delete next.sortOrder;
        if (sortBy !== undefined) next.sortBy = sortBy;
        if (sortOrder !== undefined) next.sortOrder = sortOrder;
        return next;
    };
    const repaired = Object.fromEntries(Object.entries(encodings).map(([channel, value]) => [
        channel,
        Array.isArray(value) ? value.map(entry => repair(channel, entry)) : repair(channel, value),
    ])) as Record<string, T>;
    return { encodings: repaired, warnings };
}

// ---------------------------------------------------------------------------
// Internal helpers (moved from assemble.ts)
// ---------------------------------------------------------------------------

/** Upper bounds for plausible timestamps (~2099-12-31). */
const MAX_TIMESTAMP_SEC = 4102444800;
const MAX_TIMESTAMP_MS = 4102444800000;

function isLikelyTimestamp(val: number): boolean {
    if (val >= 1e9 && val <= MAX_TIMESTAMP_SEC) return true;
    if (val > MAX_TIMESTAMP_SEC && val <= MAX_TIMESTAMP_MS) return true;
    return false;
}

function timestampToMs(val: number): number {
    return val <= MAX_TIMESTAMP_SEC ? val * 1000 : val;
}

function inferImplicitSemanticType(fieldName: string, values: any[]): string {
    const tokens = fieldName
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean);
    if (!tokens.includes('year')) return '';

    const observed = values.filter(value => value != null && value !== '');
    if (new Set(observed.map(String)).size <= 1) return '';
    const allYears = observed.every(value => {
        const numeric = typeof value === 'number' ? value : Number(value);
        return Number.isInteger(numeric) && numeric >= 1500 && numeric <= 2200;
    });
    return allYears ? 'Year' : '';
}

function looksLikeDateString(s: string): boolean {
    const t = s.trim();
    return /^\d|^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(t);
}

// ---------------------------------------------------------------------------
// Temporal field analysis
// ---------------------------------------------------------------------------

interface TemporalAnalysis {
    dates: Date[];
    same: {
        month: boolean;
        day: boolean;
        hour: boolean;
        minute: boolean;
        second: boolean;
    };
    sameYear: boolean;
    sameMonth: boolean;
    sameDay: boolean;
}

function analyzeTemporalField(fieldValues: any[]): TemporalAnalysis | null {
    const dates: Date[] = [];
    let nonNull = 0;
    for (const v of fieldValues.slice(0, 100)) {
        if (v == null) continue;
        nonNull++;
        const d = v instanceof Date ? v : new Date(v);
        if (!isNaN(d.getTime())) dates.push(d);
    }
    if (dates.length < 2 || dates.length < nonNull * 0.5) return null;

    const monthSet  = new Set(dates.map(d => d.getUTCMonth()));
    const daySet    = new Set(dates.map(d => d.getUTCDate()));
    const hourSet   = new Set(dates.map(d => d.getUTCHours()));
    const minuteSet = new Set(dates.map(d => d.getUTCMinutes()));
    const secondSet = new Set(dates.map(d => d.getUTCSeconds()));
    const yearSet   = new Set(dates.map(d => d.getUTCFullYear()));

    const isSmallSpread = (s: Set<number>, maxSpread: number = 1) => {
        if (s.size <= 1) return true;
        const arr = [...s];
        return Math.max(...arr) - Math.min(...arr) <= maxSpread;
    };

    const same = {
        month:  monthSet.size  === 1,
        day:    daySet.size    === 1,
        hour:   isSmallSpread(hourSet, 1),
        minute: minuteSet.size === 1,
        second: secondSet.size === 1,
    };

    const sameYear  = yearSet.size === 1;
    const sameMonth = sameYear && same.month;
    const sameDay   = sameMonth && same.day;

    return { dates, same, sameYear, sameMonth, sameDay };
}

function computeDataVotes(same: TemporalAnalysis['same']): number[] {
    const votes = [0, 0, 0, 0, 0, 0];

    if (same.second)                                                           votes[5] += 1;
    if (same.minute && same.second)                                            votes[5] += 1;
    if (same.hour   && same.minute && same.second)                             votes[5] += 1;
    if (same.day    && same.hour   && same.minute && same.second)              votes[5] += 2;
    if (same.month  && same.day    && same.hour   && same.minute && same.second) votes[5] += 3;

    if (same.second)                                                           votes[4] += 1;
    if (same.minute && same.second)                                            votes[4] += 1;
    if (same.hour   && same.minute && same.second)                             votes[4] += 1;
    if (same.day    && same.hour   && same.minute && same.second)              votes[4] += 2;
    if (!same.month && same.day && same.hour && same.minute && same.second)    votes[4] += 3;

    if (same.second)                                                           votes[3] += 1;
    if (same.minute && same.second)                                            votes[3] += 1;
    if (same.hour   && same.minute && same.second)                             votes[3] += 1;
    if (!same.day && same.hour && same.minute && same.second)                  votes[3] += 3;

    if (same.second)                               votes[2] += 1;
    if (same.minute && same.second)                votes[2] += 1;
    if (!same.hour && same.minute && same.second)  votes[2] += 3;

    if (same.second)                    votes[1] += 1;
    if (!same.minute && same.second)    votes[1] += 3;

    if (!same.second) votes[0] += 4;

    return votes;
}

const SEMANTIC_LEVEL: Record<string, number> = {
    Year:        5, Decade:      5,
    YearMonth:   4, Month:       4, YearQuarter: 4, Quarter: 4,
    Date:        3, Day:         3,
    Hour:        2,
    DateTime:    1,
    Timestamp:   0,
};

function pickBestLevel(votes: number[]): { level: number; score: number } {
    let bestLevel = 0;
    let bestScore = votes[0];
    for (let i = 1; i <= 5; i++) {
        if (votes[i] >= bestScore) {
            bestScore = votes[i];
            bestLevel = i;
        }
    }
    return { level: bestLevel, score: bestScore };
}

function levelToFormat(level: number, analysis: TemporalAnalysis): string | null {
    switch (level) {
        case 5: return '%Y';
        case 4: return analysis.sameYear ? '%b' : '%b %Y';
        case 3: return analysis.sameYear ? '%b %d' : '%b %d, %Y';
        case 2: return analysis.sameDay  ? '%H:00' : '%b %d %H:00';
        case 1: return analysis.sameDay  ? '%H:%M' : '%b %d %H:%M';
        case 0: return analysis.sameDay  ? '%H:%M:%S' : '%b %d %H:%M:%S';
        default: return null;
    }
}

/**
 * Resolve temporal format for a field.
 * Used for both temporal and ordinal-temporal fields.
 */
function resolveTemporalFormat(
    fieldValues: any[],
    semanticType: string,
): string | null {
    const analysis = analyzeTemporalField(fieldValues);
    if (!analysis) return null;

    const votes = computeDataVotes(analysis.same);
    const semLevel = SEMANTIC_LEVEL[semanticType];
    if (semLevel !== undefined) votes[semLevel] += 3;
    const { level } = pickBestLevel(votes);
    return levelToFormat(level, analysis);
}

// ---------------------------------------------------------------------------
// Temporal data conversion
// ---------------------------------------------------------------------------

/**
 * Expand a year string to an unambiguous 4-digit representation.
 *
 * - "98" → "1998",  "07" → "2007",  "00" → "2000"
 * - "1998" → "1998" (already 4+ digits, pass through)
 * - "FY 2018" → "FY 2018" (non-numeric, pass through)
 *
 * Two-digit cutoff: 0–49 → 2000s, 50–99 → 1900s (same heuristic JS Date uses).
 */
function expandToFullYear(val: string): string {
    const trimmed = val.trim();
    if (/^\d{2}$/.test(trimmed)) {
        const n = parseInt(trimmed, 10);
        return String(n <= 49 ? 2000 + n : 1900 + n);
    }
    return val;
}

/**
 * Convert temporal field values in the data table to canonical string
 * representations for Vega-Lite consumption.
 *
 * This is a data-level concern (not VL-specific) — it ensures consistent
 * date parsing across backends.
 */
export function convertTemporalData(
    data: any[],
    semanticTypes: Record<string, string | SemanticAnnotation>,
): any[] {
    if (data.length === 0) return data;

    const keys = Object.keys(data[0]);
    const fieldValues = Object.fromEntries(keys.map(key => [key, data.map(row => row[key])]));
    const effectiveSemanticTypes = Object.fromEntries(keys.map(key => [
        key,
        toTypeString(semanticTypes[key]) || inferImplicitSemanticType(key, fieldValues[key]),
    ]));
    const temporalKeys = keys.filter((k: string) => {
        const st = effectiveSemanticTypes[k];
        const vc = inferVisCategory(fieldValues[k]);
        const stCategory = st ? getVisCategory(st) : null;
        return vc === 'temporal' || stCategory === 'temporal' || st === 'Decade';
    });

    if (temporalKeys.length === 0) return data;

    const values = structuredClone(data);
    return values.map((r: any) => {
        for (const temporalKey of temporalKeys) {
            const val = r[temporalKey];
            const st = effectiveSemanticTypes[temporalKey];

            if (typeof val === 'number') {
                if (st === 'Year' || st === 'Decade') {
                    r[temporalKey] = `${Math.floor(val)}`;
                } else if (isLikelyTimestamp(val)) {
                    r[temporalKey] = new Date(timestampToMs(val)).toISOString();
                } else {
                    r[temporalKey] = String(val);
                }
            } else if (val instanceof Date) {
                r[temporalKey] = val.toISOString();
            } else {
                // For Year/Decade strings, normalise to 4-digit years so
                // Vega-Lite parses them unambiguously and doesn't auto-tick
                // at sub-year intervals (e.g. "98" → "1998").
                if ((st === 'Year' || st === 'Decade') && typeof val === 'string') {
                    r[temporalKey] = expandToFullYear(val);
                } else {
                    r[temporalKey] = String(val);
                }
            }
        }
        return r;
    });
}

/**
 * One value of a temporal field as the compiled chart holds it (UTC epoch ms),
 * read the way {@link convertTemporalData} reads the input rows. A value that
 * does not parse as a date is returned as given.
 */
export function temporalFieldValue(
    field: string,
    value: unknown,
    semanticTypes: Record<string, string | SemanticAnnotation>,
): unknown {
    if (typeof value !== 'string' && typeof value !== 'number') return value;
    const converted = convertTemporalData([{ [field]: value }], semanticTypes)[0][field];
    const time = Date.parse(String(converted));
    return Number.isFinite(time) ? time : value;
}

// ---------------------------------------------------------------------------
// Public API: resolveChannelSemantics
// ---------------------------------------------------------------------------

/**
 * Resolve all channel-level semantic decisions.
 *
 * For each channel, builds FieldSemantics (data identity) then layers on
 * channel-specific visualization decisions (color scheme, temporal format,
 * tick constraints, axis reversal, interpolation, etc.).
 *
 * Zero-baseline (cs.zero) is NOT resolved here -- it requires template
 * mark knowledge (bar vs point) that belongs to the assembler.
 * The assembler finalizes zero after calling this function.
 *
 * @param encodings       Channel -> ChartEncoding from user / AI agent
 * @param data            Array of data rows (original, unconverted)
 * @param semanticTypes   Field name -> semantic type string
 * @param convertedData   Pre-converted temporal data (from convertTemporalData).
 *                        If omitted, falls back to data for temporal format detection.
 */
export function resolveChannelSemantics(
    encodings: Record<string, ChartEncoding>,
    data: any[],
    semanticTypes: Record<string, string | SemanticAnnotation>,
    convertedData?: any[],
): SemanticResult {
    const result: SemanticResult = {};

    // Use pre-converted temporal data for format detection, or fall back to raw data
    const temporalData = convertedData ?? data;

    for (const [channel, encoding] of Object.entries(encodings)) {
        const fieldName = encoding.field;
        if (!fieldName && encoding.aggregate !== 'count') continue;

        // Handle count aggregate without a field
        if (!fieldName && encoding.aggregate === 'count') {
            result[channel] = {
                field: '_count',
                semanticAnnotation: { semanticType: 'Count' },
                type: 'quantitative',
                aggregationDefault: 'sum',
            };
            continue;
        }

        if (!fieldName) continue;

        const rawAnnotation = semanticTypes[fieldName];
        const suppliedSemanticType = typeof rawAnnotation === 'string'
            ? (rawAnnotation || '')
            : (rawAnnotation?.semanticType ?? '');
        const fieldValues = data.map(r => r[fieldName]);
        const semanticType = suppliedSemanticType
            || inferImplicitSemanticType(fieldName, fieldValues);

        // Resolve encoding type
        const typeDecision = resolveEncodingTypeDecision(
            semanticType, fieldValues, channel, data, fieldName,
        );

        // Apply explicit type override
        let resolvedType = typeDecision.vlType;
        if (encoding.type) {
            resolvedType = encoding.type;
        } else if (channel === 'column' || channel === 'row') {
            if (resolvedType !== 'nominal' && resolvedType !== 'ordinal') {
                resolvedType = 'nominal';
            }
        }

        // ISO date hack
        if (resolvedType === 'quantitative') {
            const sampleValues = data.slice(0, 15).filter(r => r[fieldName] != undefined).map(r => r[fieldName]);
            const isoDateRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
            if (sampleValues.length > 0 && sampleValues.every((val: any) => isoDateRegex.test(`${val}`.trim()))) {
                resolvedType = 'temporal';
            }
        }

        // Build ChannelSemantics entry
        // Stage 1: resolve field-level semantics (data identity)
        const fc = resolveFieldSemantics(rawAnnotation || semanticType, fieldName, fieldValues);
        const annotation = fc.semanticAnnotation;

        // Stage 2: layer on channel-specific visualization decisions
        const tickConstraint = resolveTickConstraint(annotation.semanticType, annotation.intrinsicDomain);
        const reversed = resolveReversed(annotation.semanticType, channel);
        const nice = resolveNice(annotation.semanticType, fc.domainConstraint);
        const stackable = resolveStackable(annotation.semanticType);

        const cs: ChannelSemantics = {
            field: fieldName,
            semanticAnnotation: annotation,
            type: resolvedType,

            // From FieldSemantics (data identity)
            format: fc.format,
            tooltipFormat: fc.tooltipFormat,
            aggregationDefault: fc.aggregationDefault,
            scaleType: fc.scaleType,
            domainConstraint: fc.domainConstraint,
            cyclic: fc.cyclic || undefined,
            sortDirection: fc.sortDirection,
            binningSuggested: fc.binningSuggested || undefined,

            // Channel-specific visualization decisions
            nice,
            tickConstraint,
            reversed: reversed || undefined,
            stackable,
        };

        // Adjust field name for aggregated fields (the derived column is either
        // computed by applyAggregation or supplied pre-aggregated by the caller)
        if (encoding.aggregate) {
            if (encoding.aggregate === 'count') {
                cs.field = '_count';
                cs.type = 'quantitative';
            } else {
                cs.field = `${fieldName}_${encoding.aggregate}`;
                cs.type = 'quantitative';
            }
        }

        // --- Channel-specific semantic decisions ---

        // Color scheme (color and group channels)
        if ((channel === 'color' || channel === 'group') && fieldName) {
            if (encoding.scheme && encoding.scheme !== 'default') {
                cs.colorScheme = {
                    scheme: encoding.scheme,
                    type: 'categorical',
                    reason: 'explicit user scheme',
                };
            } else {
                const encodingVLType = cs.type as 'nominal' | 'ordinal' | 'quantitative' | 'temporal';
                // Use design-aligned classification from field-semantics.ts
                const colorHint = resolveColorSchemeHint(semanticType, annotation, fieldValues);
                const uniqueValues = [...new Set(fieldValues)];
                cs.colorScheme = getRecommendedColorScheme(
                    semanticType, encodingVLType, uniqueValues.length, fieldName,
                    fieldValues, { type: colorHint.type },
                );
                // Apply midpoint from design-aligned diverging analysis
                if (cs.colorScheme.type === 'diverging' && encodingVLType === 'quantitative') {
                    const nums = fieldValues.filter((v: any) => typeof v === 'number' && !isNaN(v));
                    const divInfo = resolveDivergingInfo(semanticType, annotation, nums);
                    if (divInfo) {
                        cs.colorScheme.domainMid = divInfo.midpoint;
                    }
                }
            }
        }

        // Temporal format
        if (cs.type === 'temporal' || (semanticType && getVisCategory(semanticType) === 'temporal')) {
            const convertedFieldValues = temporalData.map(r => r[fieldName]);
            const fmt = resolveTemporalFormat(convertedFieldValues, semanticType);
            if (fmt) cs.temporalFormat = fmt;
        }

        // Ordinal sort order (canonical ordering for months, days, quarters, etc.)
        if (cs.type === 'ordinal' || cs.type === 'nominal') {
            if (encoding.sortBy === undefined) {
                const ordinalSort = inferOrdinalSortOrder(semanticType, fieldValues);
                if (ordinalSort) {
                    cs.ordinalSortOrder = ordinalSort;
                }
            }
        }

        result[channel] = cs;
    }

    return result;
}

// Re-export helpers needed by other modules
export {
    analyzeTemporalField,
    resolveTemporalFormat,
    computeDataVotes,
    pickBestLevel,
    levelToFormat,
    looksLikeDateString,
    SEMANTIC_LEVEL,
    type TemporalAnalysis,
};
