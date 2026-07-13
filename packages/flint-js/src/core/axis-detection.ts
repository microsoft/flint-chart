// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChannelSemantics } from './types';

type EncodingType = 'nominal' | 'ordinal' | 'quantitative' | 'temporal';

type BandedAxisResult = {
    axis: 'x' | 'y';
    resolvedTypes?: Record<string, EncodingType>;
};

const isDiscrete = (type: string | undefined): boolean =>
    type === 'nominal' || type === 'ordinal';

const getFieldCardinality = (field: string, table: any[]): number =>
    new Set(table.map((row: any) => row[field]).filter((value: any) => value != null)).size;

/** Resolve a backend-neutral discrete encoding type for a field. */
export function resolveDiscreteType(
    currentType: string,
    field: string | undefined,
    table: any[],
): 'nominal' | 'ordinal' {
    if (currentType === 'nominal') return 'nominal';
    if (currentType === 'ordinal') return 'ordinal';
    if (currentType === 'temporal') return 'ordinal';
    if (currentType === 'quantitative' && field && table.length > 0) {
        return getFieldCardinality(field, table) <= 20 ? 'ordinal' : 'nominal';
    }
    return 'nominal';
}

/** Choose the position axis that should use banded layout. */
export function detectBandedAxisFromSemantics(
    channelSemantics: Record<string, ChannelSemantics>,
    table: any[],
    options: { preferAxis?: 'x' | 'y' } = {},
): BandedAxisResult | null {
    const xType = channelSemantics.x?.type;
    const yType = channelSemantics.y?.type;

    if (xType && isDiscrete(xType)) return { axis: 'x' };
    if (yType && isDiscrete(yType)) return { axis: 'y' };

    if (xType && yType) {
        if (xType === 'quantitative' && yType !== 'quantitative') {
            return { axis: 'y' };
        }
        if (yType === 'quantitative' && xType !== 'quantitative') {
            return { axis: 'x' };
        }
        return { axis: options.preferAxis || 'x' };
    }

    if (xType) {
        const newType = resolveDiscreteType(xType, channelSemantics.x?.field, table);
        return { axis: 'x', resolvedTypes: { x: newType } };
    }
    if (yType) {
        const newType = resolveDiscreteType(yType, channelSemantics.y?.field, table);
        return { axis: 'y', resolvedTypes: { y: newType } };
    }

    return null;
}

/** Choose a banded axis and force its encoding type to be discrete. */
export function detectBandedAxisForceDiscrete(
    channelSemantics: Record<string, ChannelSemantics>,
    table: any[],
    options: { preferAxis?: 'x' | 'y' } = {},
): BandedAxisResult | null {
    const result = detectBandedAxisFromSemantics(channelSemantics, table, options);
    if (!result) return null;

    const axis = result.axis;
    const semantics = channelSemantics[axis];
    if (!semantics) return result;

    if (!isDiscrete(semantics.type)) {
        const newType = resolveDiscreteType(semantics.type, semantics.field, table);
        return {
            axis,
            resolvedTypes: { ...result.resolvedTypes, [axis]: newType },
        };
    }

    return result;
}