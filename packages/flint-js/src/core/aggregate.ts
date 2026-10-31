// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Optional data aggregation transform.
 *
 * Flint's default contract is "callers own the data" — the host passes in rows
 * that are already shaped for the chart. As a convenience, an encoding may set
 * `aggregate` to ask Flint to collapse the rows itself, mirroring the way
 * Vega-Lite derives an aggregated field:
 *
 *   - Rows are grouped by every channel that has a `field` and no `aggregate`
 *     (the dimensions).
 *   - For each group, each aggregated channel produces a derived column named
 *     `${field}_${op}` (`count` produces `_count`), which the backend assemblers
 *     already reference once `aggregate` is set.
 *
 * The derived column name IS the contract: if a caller has already
 * pre-aggregated, they simply reference that column by name (e.g. `revenue_sum`)
 * and omit `aggregate`, and this transform is a no-op. `average` and `mean` are
 * synonyms (both arithmetic mean) and keep distinct suffixes by design.
 *
 * This is a deliberate, opt-in exception to the no-transform principle — most
 * callers should still aggregate upstream.
 */

import { ChartEncoding, ChartWarning } from './types';
import { resolveAggregationDefault, toTypeString, type SemanticAnnotation } from './field-semantics';

/**
 * Chart types that draw one mark per key, and the channels that carry their measure.
 * Several rows on one key would draw several marks on one spot (the last one wins),
 * so the measure is aggregated instead.
 */
const ONE_MARK_PER_KEY: Record<string, readonly string[]> = {
    Heatmap: ['color'],
};

/**
 * When a one-mark-per-key chart gets several rows for one key and the measure has no
 * `aggregate`, set one from the measure's semantic type (additive types sum, the rest
 * average) and warn. Returns the encodings unchanged otherwise.
 */
export function resolveImplicitAggregation(
    chartType: string,
    encodings: Record<string, ChartEncoding>,
    data: any[],
    semanticTypes: Record<string, string | SemanticAnnotation>,
    versionFields: readonly string[] = [],
): { encodings: Record<string, ChartEncoding>; warnings: ChartWarning[] } {
    const measures = ONE_MARK_PER_KEY[chartType];
    if (!measures || !data || data.length < 2) return { encodings, warnings: [] };
    const open = measures.filter((ch) => encodings[ch]?.field && !encodings[ch].aggregate);
    if (open.length === 0) return { encodings, warnings: [] };

    const keyFields = [...new Set([...Object.entries(encodings)
        .filter(([ch, enc]) => !measures.includes(ch) && enc?.field && !enc.aggregate)
        .map(([, enc]) => enc.field as string), ...versionFields])];
    const seen = new Set<string>();
    let rowsPerKey = 1;
    const counts = new Map<string, number>();
    for (const row of data) {
        const key = JSON.stringify(keyFields.map((f) => row[f] ?? null));
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        if (n > rowsPerKey) rowsPerKey = n;
        seen.add(key);
    }
    if (rowsPerKey < 2) return { encodings, warnings: [] };

    const next = { ...encodings };
    const warnings: ChartWarning[] = [];
    for (const ch of open) {
        const field = encodings[ch].field as string;
        const values = data.map((r) => r[field]).filter((v) => v != null);
        if (!values.length || !values.every((v) => typeof v === 'number' || Number.isFinite(Number(v)))) continue;
        const op = resolveAggregationDefault(toTypeString(semanticTypes[field])) === 'sum' ? 'sum' : 'average';
        next[ch] = { ...encodings[ch], aggregate: op };
        warnings.push({
            severity: 'warning',
            code: 'implicit-aggregate',
            channel: ch,
            field,
            message: `Up to ${rowsPerKey} rows share one ${keyFields.join(' × ')} cell; `
                + `${field} is aggregated with ${op} (${seen.size} cells from ${data.length} rows). `
                + `Set "aggregate" on ${ch} to choose another operation.`,
        });
    }
    return { encodings: next, warnings };
}

interface AggSpec {
    field?: string;
    op: string;
    /** Derived column name the assemblers expect (`${field}_${op}` or `_count`). */
    target: string;
}

/**
 * Apply requested `aggregate` operations to the data, returning grouped rows.
 *
 * Returns the input unchanged when no encoding requests aggregation, or when the
 * derived columns are already present (caller pre-aggregated).
 */
export function applyAggregation(
    encodings: Record<string, ChartEncoding>,
    data: any[],
    versionFields: readonly string[] = [],
): any[] {
    if (!data || data.length === 0) return data;

    // Collect aggregate requests from the input encodings.
    const specs: AggSpec[] = [];
    for (const enc of Object.values(encodings)) {
        if (!enc || !enc.aggregate) continue;
        const op = enc.aggregate;
        if (op !== 'count' && !enc.field) continue; // nothing to reduce
        const target = op === 'count' ? '_count' : `${enc.field}_${op}`;
        specs.push({ field: enc.field, op, target });
    }
    if (specs.length === 0) return data;

    // If every derived column already exists, the caller pre-aggregated — trust
    // the supplied data and do nothing.
    const firstRow = data[0];
    const allPresent = specs.every(s =>
        Object.prototype.hasOwnProperty.call(firstRow, s.target),
    );
    if (allPresent) return data;

    // Group-by dimensions: every channel with a field and no aggregate.
    const groupFields: string[] = [];
    const seen = new Set<string>();
    for (const enc of Object.values(encodings)) {
        if (!enc || enc.aggregate || !enc.field) continue;
        if (seen.has(enc.field)) continue;
        seen.add(enc.field);
        groupFields.push(enc.field);
    }
    // Rows of different versions are never one value: each version aggregates on its own.
    for (const field of versionFields) {
        if (seen.has(field) || !Object.prototype.hasOwnProperty.call(firstRow, field)) continue;
        seen.add(field);
        groupFields.push(field);
    }

    // Bucket rows by the tuple of group-field values (insertion order preserved).
    const groups = new Map<string, any[]>();
    for (const row of data) {
        const key = JSON.stringify(groupFields.map(f => row[f] ?? null));
        let bucket = groups.get(key);
        if (!bucket) {
            bucket = [];
            groups.set(key, bucket);
        }
        bucket.push(row);
    }

    const toNum = (v: any): number => (typeof v === 'number' ? v : Number(v));
    const reduceOp = (rows: any[], spec: AggSpec): number => {
        if (spec.op === 'count') return rows.length;
        const nums = rows
            .map(r => toNum(r[spec.field as string]))
            .filter(v => Number.isFinite(v));
        if (nums.length === 0) return 0;
        const sum = nums.reduce((a, b) => a + b, 0);
        // 'average' and 'mean' are synonyms (arithmetic mean); 'sum' totals.
        return spec.op === 'sum' ? sum : sum / nums.length;
    };

    const out: any[] = [];
    for (const rows of groups.values()) {
        const head = rows[0];
        const aggregated: Record<string, any> = {};
        for (const f of groupFields) aggregated[f] = head[f];
        for (const spec of specs) {
            const val = reduceOp(rows, spec);
            aggregated[spec.target] = val;
            // Keep the source column populated so semantic/format inference for
            // the measure channel still sees representative numeric values.
            if (spec.op !== 'count' && spec.field) aggregated[spec.field] = val;
        }
        out.push(aggregated);
    }
    return out;
}
