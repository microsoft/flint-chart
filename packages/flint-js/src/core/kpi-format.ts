// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * How a KPI tile prints its big number and its goal.
 *
 * A tile is read alone, so each value carries its own magnitude: `1.18M`, `$12.3k`, `42.5%`. The
 * unit comes from the value field's declared unit, the percent form from its semantic type, and
 * compaction follows the same field rules as value labels (an amount or a count, never a share,
 * a year or a value already counted in millions). Strings print as they are.
 */
import { format as formatNumber } from 'd3-format';
import type { ChannelSemantics } from './types';
import { percentRepresentation, resolveDisplayUnit, type DisplayUnit } from './field-semantics';
import { COMPACT_SUFFIXES, DEFAULT_COMPACT_TYPES, compactApplies } from './number-compact';
import { getRegistryEntry, isRegistered } from './type-registry';

/** The least magnitude a tile prints compacted. */
const COMPACT_ABOVE = 10_000;

/** One value's print: the number divided, its d3 pattern, and the text around it. */
export interface KpiNumberParts {
    divisor: number;
    pattern: string;
    prefix: string;
    suffix: string;
}

export interface KpiNumberFormat {
    /** The parts a number prints with; `said` is the tile's caption, which may already state a scale. */
    parts(value: number, said?: string): KpiNumberParts;
    /** A value as the tile prints it. */
    print(value: unknown, said?: string): string;
    /** The unit that belongs beside the field name rather than the number. */
    fieldUnit?: DisplayUnit;
}

/** The KPI number format for a value field, read from its semantics and the values it holds. */
export function kpiNumberFormat(cs: ChannelSemantics | undefined, values: readonly unknown[]): KpiNumberFormat {
    const annotation = cs?.semanticAnnotation;
    const semanticType = typeof annotation?.semanticType === 'string' ? annotation.semanticType : undefined;
    const registered = semanticType !== undefined && isRegistered(semanticType);
    const entry = registered ? getRegistryEntry(semanticType!) : undefined;
    const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

    const unit = resolveDisplayUnit(annotation);
    const statedPercent = /%/.test(cs?.format?.pattern ?? '');
    const percent = statedPercent || entry?.formatClass === 'percent';
    const fractional = percent && (statedPercent || ((nums.length > 0 || !!annotation?.percentScale) && percentRepresentation(annotation, nums) === '0-1'));

    const prefix = unit?.placement === 'value' && unit.position === 'prefix' ? unit.text : '';
    const unitSuffix = unit?.placement === 'value' && unit.position === 'suffix'
        ? (/^[A-Za-z]/.test(unit.text) ? ` ${unit.text}` : unit.text)
        : '';
    const suffix = fractional ? '' : percent && !unitSuffix ? '%' : unitSuffix;

    // A year, a rank or an id is a label, not an amount: no grouping, no compaction.
    const plain = registered && entry?.t0 !== 'Measure';
    const cents = entry?.formatClass === 'currency' && semanticType === 'Price';

    const parts = (value: number, said?: string): KpiNumberParts => {
        if (fractional) return { divisor: 1, pattern: ',.1~%', prefix, suffix };
        if (plain) return { divisor: 1, pattern: '.12~r', prefix, suffix };
        const a = Math.abs(value);
        const compact = a >= COMPACT_ABOVE && compactApplies({
            name: cs?.field,
            semanticType,
            unit: typeof annotation?.unit === 'string' ? annotation.unit : undefined,
            isPercent: percent,
            said,
        }, DEFAULT_COMPACT_TYPES);
        if (compact) {
            let power = Math.min(4, Math.floor(Math.log10(a) / 3));
            // 999,960 rounds to 1000k; it prints as 1M.
            if (power < 4 && Number((a / 10 ** (3 * power)).toPrecision(3)) >= 1000) power += 1;
            return { divisor: 10 ** (3 * power), pattern: '.3~r', prefix, suffix: COMPACT_SUFFIXES.short[power - 1] + suffix };
        }
        return { divisor: 1, pattern: cents && !Number.isInteger(value) ? ',.2f' : ',.2~f', prefix, suffix };
    };

    const print = (value: unknown, said?: string): string => {
        if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
        const v = Math.abs(value) < 1e-9 ? 0 : value;
        const p = parts(v, said);
        return `${p.prefix}${formatNumber(p.pattern)(v / p.divisor)}${p.suffix}`;
    };

    return { parts, print, ...(unit?.placement === 'field' ? { fieldUnit: unit } : {}) };
}
