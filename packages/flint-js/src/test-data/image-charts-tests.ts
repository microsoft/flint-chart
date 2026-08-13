// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Gallery generators for the Image-Charts backend.
 *
 * These cases exercise the URL-grammar paths the backend builds: a plain bar
 * (`cht=bvg`, `chxl` categories), a multi-series grouped bar (`chco` + `chdl`
 * legend), a line, a filled area (`chm=B`), a pie (per-slice `chl` + `chco`),
 * and a scatter (`cht=lxy` + `chm=s` markers). The data is backend-agnostic —
 * the gallery renders it through `assembleImageCharts`.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';

const CATEGORY_META = { type: Type.String, semanticType: 'Category', levels: [] as any[] };
const QUANTITY_META = { type: Type.Number, semanticType: 'Quantity', levels: [] as any[] };

export function genImageChartsTests(): TestCase[] {
    return [
        {
            title: 'Bar — sales by region',
            description: 'A single-series vertical bar, category labels on the x axis.',
            tags: ['bar', 'nominal', 'quantitative', 'image-charts'],
            chartType: 'Bar Chart',
            data: [
                { Region: 'North', Sales: 42 },
                { Region: 'South', Sales: 35 },
                { Region: 'East', Sales: 58 },
                { Region: 'West', Sales: 27 },
            ],
            fields: [makeField('Region'), makeField('Sales')],
            metadata: { Region: CATEGORY_META, Sales: QUANTITY_META },
            encodingMap: { x: makeEncodingItem('Region'), y: makeEncodingItem('Sales') },
        },
        {
            title: 'Grouped bar — sales by region and channel',
            description: 'Two series dodge per category, driving a per-series palette and a legend.',
            tags: ['bar', 'grouped', 'series', 'legend', 'image-charts'],
            chartType: 'Grouped Bar Chart',
            data: [
                { Region: 'North', Sales: 42, Channel: 'Retail' },
                { Region: 'North', Sales: 20, Channel: 'Online' },
                { Region: 'South', Sales: 35, Channel: 'Retail' },
                { Region: 'South', Sales: 31, Channel: 'Online' },
            ],
            fields: [makeField('Region'), makeField('Sales'), makeField('Channel')],
            metadata: { Region: CATEGORY_META, Sales: QUANTITY_META, Channel: CATEGORY_META },
            encodingMap: {
                x: makeEncodingItem('Region'),
                y: makeEncodingItem('Sales'),
                group: makeEncodingItem('Channel'),
            },
        },
        {
            title: 'Line — monthly signups',
            description: 'An ordered category axis with a single quantitative series.',
            tags: ['line', 'temporal', 'quantitative', 'image-charts'],
            chartType: 'Line Chart',
            data: [
                { Month: '2026-01', Signups: 120 },
                { Month: '2026-02', Signups: 150 },
                { Month: '2026-03', Signups: 138 },
                { Month: '2026-04', Signups: 176 },
            ],
            fields: [makeField('Month'), makeField('Signups')],
            metadata: {
                Month: { type: Type.String, semanticType: 'YearMonth', levels: [] },
                Signups: QUANTITY_META,
            },
            encodingMap: { x: makeEncodingItem('Month'), y: makeEncodingItem('Signups') },
        },
        {
            title: 'Area — traffic over time',
            description: 'A line filled to the baseline via a chm=B marker.',
            tags: ['area', 'temporal', 'quantitative', 'image-charts'],
            chartType: 'Area Chart',
            data: [
                { Day: '2026-01-01', Visits: 30 },
                { Day: '2026-01-02', Visits: 52 },
                { Day: '2026-01-03', Visits: 41 },
                { Day: '2026-01-04', Visits: 66 },
            ],
            fields: [makeField('Day'), makeField('Visits')],
            metadata: {
                Day: { type: Type.Date, semanticType: 'Date', levels: [] },
                Visits: QUANTITY_META,
            },
            encodingMap: { x: makeEncodingItem('Day'), y: makeEncodingItem('Visits') },
        },
        {
            title: 'Pie — market share',
            description: 'Slice labels and a per-slice palette.',
            tags: ['pie', 'part-to-whole', 'image-charts'],
            chartType: 'Pie Chart',
            data: [
                { Vendor: 'Acme', Share: 45 },
                { Vendor: 'Globex', Share: 30 },
                { Vendor: 'Initech', Share: 15 },
                { Vendor: 'Umbrella', Share: 10 },
            ],
            fields: [makeField('Vendor'), makeField('Share')],
            metadata: { Vendor: CATEGORY_META, Share: QUANTITY_META },
            encodingMap: { color: makeEncodingItem('Vendor'), size: makeEncodingItem('Share') },
        },
        {
            title: 'Scatter — weight vs mpg',
            description: 'Two measures on lxy, drawn as chm=s point markers.',
            tags: ['scatter', 'quantitative', 'image-charts'],
            chartType: 'Scatter Plot',
            data: [
                { Weight: 1.6, Mpg: 32 },
                { Weight: 2.1, Mpg: 27 },
                { Weight: 1.9, Mpg: 29 },
                { Weight: 2.4, Mpg: 24 },
            ],
            fields: [makeField('Weight'), makeField('Mpg')],
            metadata: { Weight: QUANTITY_META, Mpg: QUANTITY_META },
            encodingMap: { x: makeEncodingItem('Weight'), y: makeEncodingItem('Mpg') },
        },
    ];
}
