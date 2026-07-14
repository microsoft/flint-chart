// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom, genDates, genCategories, genRandomNames } from './generators';

// ============================================================================
// Bar Chart Tests — Matrix-driven
//
// Three bar chart variants share a common matrix entry type and generator:
//   - Bar Chart:         x, y, optional color
//   - Stacked Bar Chart: x, y, required color (stacking dimension)
//   - Grouped Bar Chart: x, y, required group (encoding key = 'group')
//
// Matrix dimensions:
//   x axis type:  Q (quantitative), T (temporal), N (nominal)
//   y axis type:  same
//   color/group:  — | N (nominal) | Q (discrete numeric or continuous)
//   n:            total data points (0 → N×N grid mode)
//
// Note: Bar charts don't distinguish nominal from ordinal visually —
// all categorical channels use N (nominal).
//
// Default test canvas: 300 × 300 px.
// ============================================================================

type DimType = 'Q' | 'T' | 'N';

interface BarMatrixEntry {
    x: DimType;
    y: DimType;
    n: number;           // total data points (0 → C×C grid)
    color?: DimType;     // third channel (mapped to 'color' or 'group')
    xCard?: number;
    yCard?: number;
    colorCard?: number;  // cardinality; omit for continuous Q color
    desc?: string;
    extraTags?: string[];
}

// ============================================================================
// THE MATRICES
// ============================================================================

const BAR_MATRIX: BarMatrixEntry[] = [
    // ── N × Q (6 tests) — classic vertical bars ─────────────────────
    { x: 'N', y: 'Q', n: 5,   xCard: 5,   desc: 'Basic bar — 5 categories' },
    { x: 'N', y: 'Q', n: 20,  xCard: 20,  desc: '20 bars — label rotation' },
    { x: 'N', y: 'Q', n: 30,  xCard: 30,  desc: '30 bars — thin bar handling' },
    { x: 'N', y: 'Q', n: 100, xCard: 100, desc: '100 bars — discrete cutoff', extraTags: ['overflow', 'cutoff'] },
    { x: 'N', y: 'Q', n: 15,  xCard: 5,   color: 'N', colorCard: 3, desc: '5 cats × 3 color groups' },
    { x: 'N', y: 'Q', n: 100, xCard: 5,   color: 'N', colorCard: 20, desc: '5 cats × 20 colors — saturation', extraTags: ['overflow'] },

    // ── Q × N (3 tests) — horizontal bars ───────────────────────────
    { x: 'Q', y: 'N', n: 10,  yCard: 10,  desc: 'Horizontal — 10 bars' },
    { x: 'Q', y: 'N', n: 100, yCard: 100, desc: 'Horizontal — 100 bars cutoff', extraTags: ['overflow', 'cutoff'] },
    { x: 'Q', y: 'N', n: 30,  yCard: 10,  color: 'N', colorCard: 3, desc: 'Horizontal + 3 color groups' },

    // ── T × Q (3 tests) — temporal bars ─────────────────────────────
    { x: 'T', y: 'Q', n: 24,  desc: 'Temporal bars — 24 dates' },
    { x: 'T', y: 'Q', n: 100, desc: '100 dates — dynamic bar sizing', extraTags: ['overflow'] },
    { x: 'T', y: 'Q', n: 72,  color: 'N', colorCard: 3, desc: '24 dates × 3 cats — temporal + color' },

    // ── Q × T (2 tests) — horizontal temporal ──────────────────────
    { x: 'Q', y: 'T', n: 18,  desc: 'Horizontal temporal — 18 dates on y' },
    { x: 'Q', y: 'T', n: 54,  color: 'N', colorCard: 3, desc: 'Horizontal temporal + 3 colors' },

    // ── Q × Q (2 tests) — continuous banded ─────────────────────────
    { x: 'Q', y: 'Q', n: 20,  desc: 'Both quantitative — dynamic mark resizing' },
    { x: 'Q', y: 'Q', n: 30,  desc: 'Equally spaced 1..30 — continuous banded', extraTags: ['equally-spaced'] },

    // ── Edge combos (3 tests) ───────────────────────────────────────
    { x: 'N', y: 'N', n: 0,  xCard: 5, yCard: 5, desc: 'Cat × cat bars (degenerate)', extraTags: ['edge-case'] },
    { x: 'T', y: 'N', n: 25, yCard: 5,  desc: 'Temporal x, categorical y' },
    { x: 'N', y: 'T', n: 25, xCard: 5,  desc: 'Categorical x, temporal y' },
];

const STACKED_BAR_MATRIX: BarMatrixEntry[] = [
    // ── N × Q + color (5 tests) ─────────────────────────────────────
    { x: 'N', y: 'Q', n: 12,  xCard: 4,  color: 'N', colorCard: 3, desc: 'Basic stack — 4 cats × 3 colors' },
    { x: 'N', y: 'Q', n: 75,  xCard: 15, color: 'N', colorCard: 5, desc: 'Large — 15 cats × 5 colors' },
    { x: 'N', y: 'Q', n: 240, xCard: 80, color: 'N', colorCard: 3, desc: 'Very large — 80 cats × 3 (cutoff)', extraTags: ['overflow', 'cutoff'] },
    { x: 'N', y: 'Q', n: 24,  xCard: 6,  color: 'Q', colorCard: 4, desc: 'Numeric color (1–4) — small' },
    { x: 'N', y: 'Q', n: 150, xCard: 5,  color: 'Q', colorCard: 30, desc: 'Numeric color (1–30) — large' },

    // ── T × Q + color (2 tests) ─────────────────────────────────────
    { x: 'T', y: 'Q', n: 30,  color: 'N', colorCard: 3, desc: 'Temporal stack — 10 dates × 3' },
    { x: 'T', y: 'Q', n: 80,  color: 'N', colorCard: 4, desc: '20 dates × 4 fuels — temporal stacked' },

    // ── Q × Q + color (1 test) ──────────────────────────────────────
    { x: 'Q', y: 'Q', n: 30,  color: 'N', colorCard: 3, desc: 'Both quant + 3 types — stacked' },

    // ── Horizontal (2 tests) ────────────────────────────────────────
    { x: 'Q', y: 'N', n: 24,  yCard: 8,  color: 'N', colorCard: 3, desc: 'Horizontal stack — 8 cats × 3' },
    { x: 'Q', y: 'T', n: 45,  color: 'N', colorCard: 3, desc: 'Horizontal temporal stack — 15 dates × 3' },

    // ── Edge combos (1 test) ─────────────────────────────────
    { x: 'N', y: 'N', n: 0,  xCard: 5, yCard: 5, color: 'N', colorCard: 3, desc: 'Cat × cat stacked (degenerate)', extraTags: ['edge-case'] },
];

const GROUPED_BAR_MATRIX: BarMatrixEntry[] = [
    // ── N × Q + group (4 tests) ─────────────────────────────────────
    { x: 'N', y: 'Q', n: 12,  xCard: 4,  color: 'N', colorCard: 3, desc: 'Basic grouped — 4 cats × 3 groups' },
    { x: 'N', y: 'Q', n: 8,   xCard: 8,  desc: 'No group field — fallback to simple bar' },
    { x: 'N', y: 'Q', n: 270, xCard: 90, color: 'N', colorCard: 3, desc: 'Very large — 90 cats × 3 (cutoff)', extraTags: ['overflow', 'cutoff'] },
    { x: 'N', y: 'Q', n: 30,  xCard: 6,  color: 'Q', colorCard: 5, desc: 'Numeric group (1–5) — small' },

    // ── T × Q + group (1 test) ──────────────────────────────────────
    { x: 'T', y: 'Q', n: 36,  color: 'N', colorCard: 3, desc: 'Temporal grouped — 12 dates × 3' },

    // ── Q × Q + group (1 test) ──────────────────────────────────────
    { x: 'Q', y: 'Q', n: 20,  color: 'N', colorCard: 4, desc: 'Both quant + group — ensureNominalAxis' },

    // ── Horizontal (2 tests) ────────────────────────────────────────
    { x: 'Q', y: 'N', n: 24,  yCard: 6,  color: 'N', colorCard: 4, desc: 'Horizontal grouped — 6 × 4' },
    { x: 'Q', y: 'T', n: 30,  color: 'N', colorCard: 3, desc: 'Horizontal temporal grouped — 10 dates × 3' },

    // ── Numeric & continuous group (2 tests) ────────────────────────
    { x: 'N', y: 'Q', n: 400, xCard: 8,  color: 'Q', colorCard: 50, desc: 'Numeric group (1–50) — large' },
    { x: 'N', y: 'Q', n: 50,  xCard: 5,  color: 'Q', desc: 'Continuous float on group — gradient' },

    // ── Edge combos (1 test) ─────────────────────────────────
    { x: 'N', y: 'N', n: 0,  xCard: 5, yCard: 5, color: 'N', colorCard: 3, desc: 'Cat × cat grouped (degenerate)', extraTags: ['edge-case'] },
];

// ============================================================================
// Generator internals
// ============================================================================

interface BarCh {
    role: 'x' | 'y' | 'color';
    dimType: DimType;
    fieldName: string;
    card?: number;
    levels?: any[];
    dates?: string[];
}

const BAR_NAMES: Record<string, Record<DimType, string>> = {
    x:     { Q: 'X',        T: 'Date',    N: 'Category' },
    y:     { Q: 'Value',    T: 'EndDate', N: 'Group' },
    color: { Q: 'ColorVal', T: 'DateCol', N: 'Segment' },
};

const BAR_FALLBACKS: Record<DimType, string[]> = {
    Q: ['X', 'Value', 'Score', 'Amount', 'Measure'],
    T: ['Date', 'EndDate', 'Time', 'Timestamp'],
    N: ['Category', 'Group', 'Segment', 'Type', 'Level'],
};

const BAR_CAT_POOLS = ['Product', 'Country', 'Department', 'Category', 'Company'];
const BAR_T_STARTS = [2020, 2023, 2019, 2022];

function buildBarChannels(entry: BarMatrixEntry): BarCh[] {
    const used = new Set<string>();
    const channels: BarCh[] = [];
    let tIdx = 0;
    let cIdx = 0;
    let cSeed = 500;

    function pickName(dim: DimType, role: string): string {
        const primary = BAR_NAMES[role]?.[dim];
        if (primary && !used.has(primary)) { used.add(primary); return primary; }
        for (const n of BAR_FALLBACKS[dim]) {
            if (!used.has(n)) { used.add(n); return n; }
        }
        return `${role}_field`;
    }

    const effectiveN = entry.n || (entry.xCard || 5) * (entry.yCard || 5);

    const specs: { role: 'x' | 'y' | 'color'; dim: DimType; card?: number }[] = [
        { role: 'x', dim: entry.x, card: entry.xCard },
        { role: 'y', dim: entry.y, card: entry.yCard },
    ];
    if (entry.color) specs.push({ role: 'color', dim: entry.color, card: entry.colorCard });

    for (const { role, dim, card } of specs) {
        const ch: BarCh = { role, dimType: dim, fieldName: pickName(dim, role) };

        if (dim === 'N') {
            const c = card || (role === 'color' ? 3 : 5);
            ch.card = c;
            if (c > 30) {
                ch.levels = genRandomNames(c, cSeed);
                cSeed += 100;
            } else {
                ch.levels = genCategories(BAR_CAT_POOLS[cIdx % BAR_CAT_POOLS.length], c);
            }
            cIdx++;
        }

        if (dim === 'T') {
            ch.dates = genDates(effectiveN, BAR_T_STARTS[tIdx % BAR_T_STARTS.length]);
            tIdx++;
        }

        if (dim === 'Q' && role === 'color' && card) {
            // Discrete numeric values 1..card
            ch.card = card;
            ch.levels = Array.from({ length: card }, (_, i) => i + 1);
        }

        channels.push(ch);
    }

    return channels;
}

// ---------------------------------------------------------------------------
// Data generation
// ---------------------------------------------------------------------------

function genBarYValue(yCh: BarCh, rand: () => number): any {
    if (yCh.dimType === 'Q') return Math.round(10 + rand() * 990);
    if (yCh.dimType === 'T') {
        const d = Math.floor(rand() * 365);
        const dt = new Date(2023, 0, 1);
        dt.setDate(dt.getDate() + d);
        return dt.toISOString().slice(0, 10);
    }
    // N
    return yCh.levels![Math.floor(rand() * yCh.levels!.length)];
}

function genBarData(
    entry: BarMatrixEntry, channels: BarCh[], rand: () => number,
): Record<string, any>[] {
    const xCh = channels.find(c => c.role === 'x')!;
    const yCh = channels.find(c => c.role === 'y')!;
    const colorCh = channels.find(c => c.role === 'color');

    // Grid mode for N×N
    if (entry.x === 'N' && entry.y === 'N' && entry.n === 0) {
        const data: Record<string, any>[] = [];
        for (const xVal of xCh.levels!) {
            for (const yVal of yCh.levels!) {
                if (rand() > 0.3) {
                    const row: Record<string, any> = { [xCh.fieldName]: xVal, [yCh.fieldName]: yVal };
                    if (colorCh?.dimType === 'N')
                        row[colorCh.fieldName] = colorCh.levels![Math.floor(rand() * colorCh.levels!.length)];
                    data.push(row);
                }
            }
        }
        return data;
    }

    // T×T date-pair mode
    if (entry.x === 'T' && entry.y === 'T') {
        const data: Record<string, any>[] = [];
        for (let i = 0; i < entry.n; i++) {
            const startDay = Math.floor(rand() * 365);
            const duration = Math.floor(10 + rand() * 180);
            const start = new Date(2023, 0, 1);
            start.setDate(start.getDate() + startDay);
            const end = new Date(start);
            end.setDate(end.getDate() + duration);
            const row: Record<string, any> = {
                [xCh.fieldName]: start.toISOString().slice(0, 10),
                [yCh.fieldName]: end.toISOString().slice(0, 10),
            };
            if (colorCh?.dimType === 'N')
                row[colorCh.fieldName] = colorCh.levels![i % colorCh.levels!.length];
            data.push(row);
        }
        return data;
    }

    // Standard mode
    const data: Record<string, any>[] = [];
    const isContinuousColor = colorCh && !colorCh.levels;

    // Bars are positioned along the *categorical* axis; the other axis carries
    // the measured length. For vertical bars that's x (e.g. N×Q); for horizontal
    // bars the category sits on y (e.g. Q×N), so iterate y to give every
    // category a bar. When neither axis is discrete (Q×Q) fall back to x.
    const isCatDim = (d: DimType) => d === 'N' || d === 'T';
    const useYAsPosition = !isCatDim(xCh.dimType) && isCatDim(yCh.dimType);
    const posCh = useYAsPosition ? yCh : xCh;
    const measCh = useYAsPosition ? xCh : yCh;

    // Determine position values along the categorical axis
    let positions: any[];
    if (posCh.dimType === 'N') {
        positions = posCh.levels!;
    } else if (posCh.dimType === 'T') {
        const nGroups = colorCh?.levels ? colorCh.levels.length : 1;
        const nDates = Math.max(1, Math.floor(entry.n / nGroups));
        positions = genDates(nDates, 2020);
    } else { // Q
        const nGroups = colorCh?.levels ? colorCh.levels.length : 1;
        const nPts = Math.max(1, Math.floor(entry.n / nGroups));
        positions = Array.from({ length: nPts }, (_, i) => i + 1);
    }

    if (isContinuousColor) {
        // Continuous color: multiple rows per position, each a random color float
        const rowsPerPos = Math.max(1, Math.floor(entry.n / positions.length));
        for (const posVal of positions) {
            for (let r = 0; r < rowsPerPos; r++) {
                const row: Record<string, any> = { [posCh.fieldName]: posVal };
                row[measCh.fieldName] = genBarYValue(measCh, rand);
                row[colorCh!.fieldName] = Math.round(rand() * 4000) / 100;
                data.push(row);
            }
        }
    } else if (colorCh?.levels) {
        // Discrete color: one row per (position × color) so every category has a
        // full set of grouped/stacked bars (no missing combinations).
        for (const posVal of positions) {
            for (const cVal of colorCh.levels) {
                const row: Record<string, any> = { [posCh.fieldName]: posVal };
                row[measCh.fieldName] = genBarYValue(measCh, rand);
                row[colorCh.fieldName] = cVal;
                data.push(row);
            }
        }
    } else {
        // No color
        for (const posVal of positions) {
            const row: Record<string, any> = { [posCh.fieldName]: posVal };
            row[measCh.fieldName] = genBarYValue(measCh, rand);
            data.push(row);
        }
    }

    return data;
}

// ---------------------------------------------------------------------------
// Title & tags
// ---------------------------------------------------------------------------

function buildBarTitle(entry: BarMatrixEntry): string {
    const xLabel = entry.x === 'N' && entry.xCard ? `N(${entry.xCard})` : entry.x;
    const yLabel = entry.y === 'N' && entry.yCard ? `N(${entry.yCard})` : entry.y;
    const parts = [`${xLabel}×${yLabel}`];
    if (entry.color) {
        const cLabel = entry.color === 'N'
            ? `N,${entry.colorCard || 3}`
            : entry.colorCard ? `Q,${entry.colorCard}` : 'Q';
        parts.push(`+color(${cLabel})`);
    }
    if (entry.n === 0) parts.push('grid');
    else parts.push(`(${entry.n} pts)`);
    return parts.join(' ');
}

function buildBarTags(entry: BarMatrixEntry, dataLen: number): string[] {
    const tags: string[] = [];
    const dims = new Set<DimType>([entry.x, entry.y]);
    if (entry.color) dims.add(entry.color);
    if (dims.has('Q')) tags.push('quantitative');
    if (dims.has('T')) tags.push('temporal');
    if (dims.has('N')) tags.push('nominal');
    if (entry.color) tags.push('color');
    if (entry.color === 'Q') tags.push('numeric-color');
    const n = dataLen;
    if (n <= 25) tags.push('small');
    else if (n <= 100) tags.push('medium');
    else tags.push('large');
    if (entry.extraTags) tags.push(...entry.extraTags);
    return [...new Set(tags)];
}

// ---------------------------------------------------------------------------
// Matrix entry → TestCase
// ---------------------------------------------------------------------------

function barMatrixToTestCase(
    entry: BarMatrixEntry,
    chartType: string,
    thirdChannelKey: string,
    rand: () => number,
): TestCase {
    const channels = buildBarChannels(entry);
    const data = genBarData(entry, channels, rand);

    const typeMap: Record<DimType, Type> = { Q: Type.Number, T: Type.Date, N: Type.String };
    const semMap: Record<DimType, string> = { Q: 'Quantity', T: 'Date', N: 'Category' };

    const fields = channels.map(ch => makeField(ch.fieldName));
    const metadata: Record<string, { type: Type; semanticType: string; levels: any[] }> = {};
    const encodingMap: Partial<Record<string, any>> = {};

    for (const ch of channels) {
        let semanticType = semMap[ch.dimType];
        if (ch.dimType === 'Q' && ch.levels) semanticType = 'Rank'; // discrete numeric
        metadata[ch.fieldName] = {
            type: typeMap[ch.dimType],
            semanticType,
            levels: ch.levels || [],
        };
        const encKey = ch.role === 'color' ? thirdChannelKey : ch.role;
        encodingMap[encKey] = makeEncodingItem(ch.fieldName);
    }

    return {
        title: buildBarTitle(entry),
        description: entry.desc || buildBarTitle(entry),
        tags: buildBarTags(entry, data.length),
        chartType,
        data,
        fields,
        metadata,
        encodingMap,
    };
}

// ============================================================================
// Public exports
// ============================================================================

export function genBarTests(): TestCase[] {
    const rand = seededRandom(100);
    return BAR_MATRIX.map(entry => barMatrixToTestCase(entry, 'Bar Chart', 'color', rand));
}

export function genStackedBarTests(): TestCase[] {
    const rand = seededRandom(200);
    return STACKED_BAR_MATRIX.map(entry => barMatrixToTestCase(entry, 'Stacked Bar Chart', 'color', rand));
}

export function genGroupedBarTests(): TestCase[] {
    const rand = seededRandom(300);
    const tests = GROUPED_BAR_MATRIX.map(entry => barMatrixToTestCase(entry, 'Grouped Bar Chart', 'group', rand));

    // Group redundant with the x axis (group == x): must render full-width bars,
    // NOT ~1/N slivers. Grouping a bar chart by its own category is degenerate,
    // so the dodge is suppressed and each band shows one bar.
    {
        const cats = genCategories('Region', 5);
        const data = cats.map((c, i) => ({ Region: c, Sales: Math.round(200 + rand() * 800) + i }));
        tests.push({
            title: 'Group == X (redundant group)',
            description: 'group re-encodes the x category — one full-width bar per band, no dodge',
            tags: ['grouped-bar', 'redundant-group', 'nominal', 'gallery-pin'],
            chartType: 'Grouped Bar Chart',
            data,
            fields: [makeField('Region'), makeField('Sales')],
            metadata: {
                Region: { type: Type.String, semanticType: 'Category', levels: cats },
                Sales: { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Region'),
                y: makeEncodingItem('Sales'),
                group: makeEncodingItem('Region'),
            },
        });
    }

    // Sparse / MIDDLE case: neither a perfect cross-product nor all-single-item.
    // Each region carries a SUBSET of the 4 global channels (maxPerBand 2–3,
    // global 4), so the ambiguous-zone heuristic (nestedSnapThreshold) leans to
    // dodge — bars sized by the GLOBAL lane count (4), with gaps where a
    // (region, channel) pair is missing rather than overlapping bars.
    {
        const regions = ['North', 'South', 'East', 'West', 'Central', 'Coast'];
        const channels = ['Retail', 'Online', 'Wholesale', 'Direct'];
        // Each region has 2–3 of the 4 channels (rotating subsets).
        const subset: Record<string, string[]> = {
            North:   ['Retail', 'Online'],
            South:   ['Online', 'Wholesale', 'Direct'],
            East:    ['Wholesale', 'Direct'],
            West:    ['Retail', 'Direct'],
            Central: ['Retail', 'Online', 'Wholesale'],
            Coast:   ['Online', 'Direct'],
        };
        const data: any[] = [];
        regions.forEach((r, ri) => {
            subset[r].forEach((ch, ci) => {
                data.push({ Region: r, Channel: ch, Sales: Math.round(300 + rand() * 700) + ri * 10 + ci });
            });
        });
        tests.push({
            title: 'Sparse groups (region × channel subset)',
            description: 'each region has 2–3 of 4 channels — dodges, bars sized by global lane count (no overlap)',
            tags: ['grouped-bar', 'sparse', 'ambiguous', 'nominal', 'gallery-pin'],
            chartType: 'Grouped Bar Chart',
            data,
            fields: [makeField('Region'), makeField('Sales'), makeField('Channel')],
            metadata: {
                Region:  { type: Type.String, semanticType: 'Category', levels: regions },
                Sales:   { type: Type.Number, semanticType: 'Quantity', levels: [] },
                Channel: { type: Type.String, semanticType: 'Category', levels: channels },
            },
            encodingMap: {
                x: makeEncodingItem('Region'),
                y: makeEncodingItem('Sales'),
                group: makeEncodingItem('Channel'),
            },
        });
    }

    return tests;
}
