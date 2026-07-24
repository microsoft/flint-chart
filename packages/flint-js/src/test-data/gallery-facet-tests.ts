// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Curated *faceted* (small-multiples) examples for the main chart types.
 *
 * Unlike the exhaustive stress cases in `facet-tests.ts`, these are a single,
 * clean, realistic column-faceted example per main chart type (bar, line,
 * scatter, area). They are appended to the corresponding gallery generators so
 * every main chart type advertises a small-multiples variant, and they are
 * pinned by `selectVariants` so the faceted tile always appears on the wall.
 */

import { Type } from './df-types';
import { Channel, EncodingItem } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom } from './generators';

/** Shared tag set so the gallery can detect + pin these examples. */
const FACET_TAGS = ['facet', 'gallery-facet', 'column'];

function meta(type: Type, semanticType: string, levels: any[] = []) {
    return { type, semanticType, levels };
}

/**
 * Column-faceted bar — sales by segment, one small panel per region.
 * Six regions laid out in a fixed 2-column grid (`facetColumns: 2`) → a 2×3
 * small-multiples grid, so the gallery advertises faceting *and* how Flint
 * shrinks each sub-panel to fit.
 */
export function galleryFacetBarExample(): TestCase {
    const rand = seededRandom(4201);
    const regions = ['North', 'Central', 'South', 'East', 'West', 'Pacific'];
    const segments = ['Consumer', 'Corporate', 'Home Office', 'Reseller'];
    const data: any[] = [];
    for (const region of regions) {
        for (const segment of segments) {
            data.push({ Segment: segment, Sales: Math.round(40 + rand() * 360), Region: region });
        }
    }
    const encodingMap: Partial<Record<Channel, EncodingItem>> = {
        x: makeEncodingItem('Segment'),
        y: makeEncodingItem('Sales'),
        column: makeEncodingItem('Region'),
    };
    return {
        title: 'Sales by segment, faceted by region',
        description: 'Small-multiples bar chart — one panel per region in a 2-column grid (column facet).',
        tags: [...FACET_TAGS, 'bar'],
        chartType: 'Bar Chart',
        data,
        fields: [makeField('Segment'), makeField('Sales'), makeField('Region')],
        metadata: {
            Segment: meta(Type.String, 'Category', segments),
            Sales: meta(Type.Number, 'Amount'),
            Region: meta(Type.String, 'Category', regions),
        },
        encodingMap,
        chartProperties: { facetColumns: 2 },
    };
}

/**
 * Wrap-faceted line — full-year (12-month) revenue trend, one panel per region.
 * Ten regions wrap into a 5×2 small-multiples grid rather than a single
 * side-by-side strip, exercising column-facet wrapping. The `minSubplotSize`
 * option keeps each panel wide enough for the 12 monthly points to stay legible,
 * which is what drives the wrap into multiple rows.
 */
export function galleryFacetLineExample(): TestCase {
    const rand = seededRandom(4202);
    const regions = ['North', 'South', 'East', 'West', 'Central', 'Pacific', 'Mountain', 'Atlantic', 'Gulf', 'Midwest'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const data: any[] = [];
    for (const region of regions) {
        let value = 60 + rand() * 60;
        for (const month of months) {
            value = Math.max(20, value + (rand() - 0.4) * 35);
            data.push({ Month: month, Revenue: Math.round(value), Region: region });
        }
    }
    const encodingMap: Partial<Record<Channel, EncodingItem>> = {
        x: makeEncodingItem('Month'),
        y: makeEncodingItem('Revenue'),
        column: makeEncodingItem('Region'),
    };
    return {
        title: 'Monthly revenue, faceted by region',
        description: 'Wrapped small-multiples line chart — a 12-month trend panel per region, wrapping into a 5×2 grid (column facet).',
        tags: [...FACET_TAGS, 'line', 'wrap'],
        chartType: 'Line Chart',
        data,
        fields: [makeField('Month'), makeField('Revenue'), makeField('Region')],
        metadata: {
            Month: meta(Type.String, 'Month', months),
            Revenue: meta(Type.Number, 'Quantity'),
            Region: meta(Type.String, 'Category', regions),
        },
        encodingMap,
        assembleOptions: { minSubplotSize: 180 },
    };
}

/**
 * Column-faceted scatter — height vs. weight, one panel per group.
 */
export function galleryFacetScatterExample(): TestCase {
    const rand = seededRandom(4203);
    const groups = ['Group A', 'Group B', 'Group C'];
    const data: any[] = [];
    for (const group of groups) {
        const base = 150 + rand() * 25;
        for (let i = 0; i < 22; i++) {
            const height = Math.round(base + (rand() - 0.5) * 40);
            const weight = Math.round(height * (0.4 + rand() * 0.18));
            data.push({ Height: height, Weight: weight, Group: group });
        }
    }
    const encodingMap: Partial<Record<Channel, EncodingItem>> = {
        x: makeEncodingItem('Height'),
        y: makeEncodingItem('Weight'),
        column: makeEncodingItem('Group'),
    };
    return {
        title: 'Height vs. weight, faceted by group',
        description: 'Small-multiples scatter plot — one panel per group (column facet).',
        tags: [...FACET_TAGS, 'scatter'],
        chartType: 'Scatter Plot',
        data,
        fields: [makeField('Height'), makeField('Weight'), makeField('Group')],
        metadata: {
            Height: meta(Type.Number, 'Value'),
            Weight: meta(Type.Number, 'Value'),
            Group: meta(Type.String, 'Category', groups),
        },
        encodingMap,
    };
}

/**
 * Column-faceted area — monthly visits, one panel per acquisition channel.
 */
export function galleryFacetAreaExample(): TestCase {
    const rand = seededRandom(4204);
    const channels = ['Organic', 'Paid', 'Referral'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug'];
    const data: any[] = [];
    for (const channel of channels) {
        let value = 200 + rand() * 200;
        for (const month of months) {
            value = Math.max(60, value + (rand() - 0.4) * 120);
            data.push({ Month: month, Visits: Math.round(value), Channel: channel });
        }
    }
    const encodingMap: Partial<Record<Channel, EncodingItem>> = {
        x: makeEncodingItem('Month'),
        y: makeEncodingItem('Visits'),
        column: makeEncodingItem('Channel'),
    };
    return {
        title: 'Monthly visits, faceted by channel',
        description: 'Small-multiples area chart — one panel per acquisition channel (column facet).',
        tags: [...FACET_TAGS, 'area'],
        chartType: 'Area Chart',
        data,
        fields: [makeField('Month'), makeField('Visits'), makeField('Channel')],
        metadata: {
            Month: meta(Type.String, 'Month', months),
            Visits: meta(Type.Number, 'Quantity'),
            Channel: meta(Type.String, 'Category', channels),
        },
        encodingMap,
    };
}
