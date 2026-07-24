// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Gallery generators for two project/BI chart types — Vega-Lite.
 *
 *   - Gantt: one horizontal bar per task, spanning its start → end dates, with
 *     colour grouping tasks into project phases.
 *   - Bullet: one row per item, a measured value bar compared against a target
 *     marker (tick). Items share a common unit so the bars are comparable on a
 *     single axis.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { realGanttCases, realBulletCases } from './real-world-tests';

// ---------------------------------------------------------------------------
// Gantt — a software release schedule
// ---------------------------------------------------------------------------

const RELEASE_PLAN: Array<[string, string, string, string]> = [
    // task, start, end, phase
    ['Requirements', '2024-01-01', '2024-01-22', 'Plan'],
    ['Design', '2024-01-15', '2024-02-12', 'Plan'],
    ['Backend', '2024-02-05', '2024-04-01', 'Build'],
    ['Frontend', '2024-02-19', '2024-04-15', 'Build'],
    ['Integration', '2024-04-01', '2024-04-29', 'Build'],
    ['QA & Testing', '2024-04-15', '2024-05-20', 'Verify'],
    ['Beta', '2024-05-06', '2024-06-03', 'Verify'],
    ['Launch', '2024-06-03', '2024-06-17', 'Release'],
];

// A denser pipeline measured on a *numeric* time axis (elapsed seconds), with
// several overlapping stages. This exercises the quantitative x/x2 path (no zero
// anchor) and a higher task count than the dated release plan above.
const CI_PIPELINE: Array<[string, number, number, string]> = [
    // stage, start (s), end (s), group
    ['Checkout', 0, 8, 'Setup'],
    ['Install deps', 8, 72, 'Setup'],
    ['Lint', 72, 110, 'Check'],
    ['Type check', 72, 128, 'Check'],
    ['Unit tests', 128, 205, 'Test'],
    ['Integration tests', 205, 320, 'Test'],
    ['Build', 320, 372, 'Build'],
    ['Bundle', 372, 410, 'Build'],
    ['Docker image', 410, 465, 'Package'],
    ['Deploy staging', 465, 500, 'Deploy'],
];

export function genGanttTests(): TestCase[] {
    const data = RELEASE_PLAN.map(([task, start, end, phase]) => ({ task, start, end, phase }));
    const pipeline = CI_PIPELINE.map(([stage, start, end, group]) => ({ stage, start, end, group }));
    return [
        {
            title: 'Project schedule',
            description:
                'One horizontal bar per task, spanning its start and end dates. '
                + 'Bars are coloured by project phase and tasks are ordered by '
                + 'start date, so the timeline reads top-to-bottom in chronological '
                + 'order. The interval lives on x/x2, so the time axis is not '
                + 'anchored at zero.',
            tags: ['gantt', 'timeline', 'temporal', 'range', 'gallery'],
            chartType: 'Gantt Chart',
            data,
            fields: [makeField('task'), makeField('start'), makeField('end'), makeField('phase')],
            metadata: {
                task: { type: Type.String, semanticType: 'Category', levels: [] },
                start: { type: Type.Date, semanticType: 'Date', levels: [] },
                end: { type: Type.Date, semanticType: 'Date', levels: [] },
                phase: { type: Type.String, semanticType: 'Category', levels: [] },
            },
            encodingMap: {
                y: makeEncodingItem('task'),
                x: makeEncodingItem('start'),
                x2: makeEncodingItem('end'),
                color: makeEncodingItem('phase'),
            },
        },
        {
            title: 'CI pipeline run',
            description:
                'A build pipeline on a numeric time axis (elapsed seconds) rather '
                + 'than dates. Ten stages, several running in parallel, are coloured '
                + 'by stage group and ordered by start time. Because start/end are '
                + 'quantities the axis still floats off zero to frame the run.',
            tags: ['gantt', 'timeline', 'quantitative', 'range', 'dense', 'gallery'],
            chartType: 'Gantt Chart',
            data: pipeline,
            fields: [makeField('stage'), makeField('start'), makeField('end'), makeField('group')],
            metadata: {
                stage: { type: Type.String, semanticType: 'Category', levels: [] },
                start: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                end: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                group: { type: Type.String, semanticType: 'Category', levels: [] },
            },
            encodingMap: {
                y: makeEncodingItem('stage'),
                x: makeEncodingItem('start'),
                x2: makeEncodingItem('end'),
                color: makeEncodingItem('group'),
            },
        },
        ...realGanttCases(),
    ];
}

// ---------------------------------------------------------------------------
// Bullet — quarterly sales by rep against quota (same unit, $K)
// ---------------------------------------------------------------------------

const SALES_VS_QUOTA: Array<[string, number, number]> = [
    // rep, sales ($K), quota ($K)
    ['Anna', 284, 300],
    ['Ben', 172, 150],
    ['Carla', 248, 220],
    ['Diego', 305, 280],
    ['Eve', 198, 250],
    ['Frank', 226, 210],
];

// A denser bullet on a different domain and magnitude: store revenue ($K)
// against an annual target, twelve stores, with a mix of stores above and below
// their target so both status colours and the per-row quarter bands are visible.
const STORE_REVENUE: Array<[string, number, number]> = [
    // store, revenue ($K), target ($K)
    ['Seattle', 612, 540],
    ['Portland', 388, 420],
    ['Denver', 470, 470],
    ['Austin', 845, 720],
    ['Chicago', 503, 560],
    ['Boston', 266, 350],
    ['Atlanta', 591, 500],
    ['Miami', 432, 480],
    ['Phoenix', 358, 300],
    ['Dallas', 707, 650],
    ['Detroit', 214, 320],
    ['Newark', 489, 460],
];

export function genBulletTests(): TestCase[] {
    const data = SALES_VS_QUOTA.map(([rep, sales, quota]) => ({ rep, sales, quota }));
    const stores = STORE_REVENUE.map(([store, revenue, target]) => ({ store, revenue, target }));
    return [
        {
            title: 'Sales vs quota',
            description:
                'One row per sales rep: a value bar for quarterly sales ($K) with '
                + 'a tick marking the rep\u2019s quota. The value bar reads as '
                + 'length from zero, and the target tick sits a little taller so it '
                + 'stands out as a reference marker.',
            tags: ['bullet', 'kpi', 'target', 'gallery'],
            chartType: 'Bullet Chart',
            data,
            fields: [makeField('rep'), makeField('sales'), makeField('quota')],
            metadata: {
                rep: { type: Type.String, semanticType: 'Category', levels: [] },
                sales: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                quota: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                y: makeEncodingItem('rep'),
                x: makeEncodingItem('sales'),
                goal: makeEncodingItem('quota'),
            },
        },
        {
            title: 'Store revenue vs target',
            description:
                'A denser bullet: twelve stores compared against an annual revenue '
                + 'target ($K). Stores at or above target read in the meets-target '
                + 'colour, those below in the below-target colour, and the muted '
                + 'grey bands behind each bar mark quarters of that store\u2019s own '
                + 'target so partial progress is easy to gauge.',
            tags: ['bullet', 'kpi', 'target', 'dense', 'gallery'],
            chartType: 'Bullet Chart',
            data: stores,
            fields: [makeField('store'), makeField('revenue'), makeField('target')],
            metadata: {
                store: { type: Type.String, semanticType: 'Category', levels: [] },
                revenue: { type: Type.Number, semanticType: 'Quantity', levels: [] },
                target: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                y: makeEncodingItem('store'),
                x: makeEncodingItem('revenue'),
                goal: makeEncodingItem('target'),
            },
        },
        ...realBulletCases(),
    ];
}
