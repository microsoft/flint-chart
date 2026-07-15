// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Violin Plot test data.
 *
 * A violin plot draws a mirrored kernel-density curve per category, showing the
 * full distribution SHAPE of a quantitative measure (bimodality, skew, spread)
 * rather than just quartiles. Every case maps `x` (the category — one violin per
 * value) and `y` (the quantitative measure whose distribution is drawn), exactly
 * mirroring the Boxplot contract.
 *
 * The generators below cover the shapes a violin is built for: a basic spread of
 * classes with clearly different distribution shapes (bimodal / skewed / tight /
 * normal), a strongly bimodal category (two separated humps — proves the KDE
 * renders the shape, not a blob), a measure that crosses zero (negatives),
 * uneven group sizes, higher category cardinality (6 groups), a single violin,
 * an explicit color = category mapping, and a row-faceted small-multiples violin
 * (the advanced gallery case). Sample sizes are 40–120 per group so the KDE is
 * smooth.
 */

import { Type } from './df-types';
import { TestCase, makeField, makeEncodingItem } from './types';
import { seededRandom, genCategories } from './generators';

/** One standard-normal draw via the Box–Muller transform. */
function gauss(rand: () => number): number {
    let u1 = rand();
    if (u1 < 1e-9) u1 = 1e-9;
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** A normal sample with the given mean / sd. */
const normal = (rand: () => number, mean: number, sd: number) => mean + gauss(rand) * sd;

/**
 * A bimodal sample: two well-separated normal humps, chosen with probability
 * `mix` for the first. Produces a genuine two-hump violin (not an oversmoothed
 * blob) for reasonable bandwidths.
 */
function bimodal(rand: () => number, m1: number, m2: number, sd: number, mix = 0.5): number {
    return rand() < mix ? normal(rand, m1, sd) : normal(rand, m2, sd);
}

/** A right-skewed sample (log-normal-ish): a floor plus an exponential tail. */
function rightSkew(rand: () => number, floor: number, scale: number): number {
    let u = rand();
    if (u < 1e-9) u = 1e-9;
    return floor + -Math.log(u) * scale;
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function genViolinTests(): TestCase[] {
    const tests: TestCase[] = [];
    const rand = seededRandom(5101);

    // 1. BASIC — exam scores across 4 classes with clearly different shapes:
    //    one bimodal, one right-skewed, one tight, one broad/normal.
    {
        const data: any[] = [];
        const shapes: Record<string, (r: () => number) => number> = {
            'Class A': (r) => bimodal(r, 58, 86, 5),      // two clusters
            'Class B': (r) => rightSkew(r, 45, 12),       // skewed toward high
            'Class C': (r) => normal(r, 74, 4),           // tight
            'Class D': (r) => normal(r, 68, 13),          // broad
        };
        for (const [cls, fn] of Object.entries(shapes)) {
            for (let i = 0; i < 90; i++) {
                const v = Math.max(0, Math.min(100, fn(rand)));
                data.push({ Class: cls, Score: Math.round(v) });
            }
        }
        tests.push({
            title: 'Exam scores by class (basic)',
            description: 'One violin per class — bimodal, skewed, tight and broad score distributions',
            tags: ['nominal', 'quantitative', 'distribution', 'gallery', 'small'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Class'), makeField('Score')],
            metadata: {
                Class: { type: Type.String, semanticType: 'Category', levels: Object.keys(shapes) },
                Score: { type: Type.Number, semanticType: 'Score', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Class'), y: makeEncodingItem('Score') },
        });
    }

    // 2. ADVANCED — reaction time by treatment, faceted into small multiples by
    //    site (outer ROW facet). Exercises the optional outer facet + a realistic
    //    multi-panel layout.
    {
        const treatments = ['Placebo', 'Low Dose', 'High Dose'];
        const sites = ['Site 1', 'Site 2'];
        const baseByTreatment: Record<string, number> = { 'Placebo': 420, 'Low Dose': 360, 'High Dose': 300 };
        const data: any[] = [];
        for (const site of sites) {
            const siteShift = site === 'Site 2' ? 25 : 0;
            for (const t of treatments) {
                const base = baseByTreatment[t] + siteShift;
                for (let i = 0; i < 70; i++) {
                    // Mild right skew (reaction times have a long upper tail).
                    const v = base + rightSkew(rand, 0, 40) - 30 + gauss(rand) * 18;
                    data.push({ Treatment: t, Site: site, 'Reaction (ms)': Math.round(Math.max(150, v)) });
                }
            }
        }
        tests.push({
            title: 'Reaction time by treatment, faceted by site (row)',
            description: 'Per-treatment violins as small multiples, one panel row per study site',
            tags: ['nominal', 'quantitative', 'distribution', 'facet', 'row', 'gallery', 'medium'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Treatment'), makeField('Reaction (ms)'), makeField('Site')],
            metadata: {
                Treatment: { type: Type.String, semanticType: 'Category', levels: treatments },
                'Reaction (ms)': { type: Type.Number, semanticType: 'Duration', levels: [] },
                Site: { type: Type.String, semanticType: 'Category', levels: sites },
            },
            encodingMap: {
                x: makeEncodingItem('Treatment'),
                y: makeEncodingItem('Reaction (ms)'),
                row: makeEncodingItem('Site'),
            },
        });
    }

    // 3. Strongly BIMODAL category — sensor readings where one machine is clearly
    //    bimodal (two separated humps). Proves the KDE renders two humps.
    {
        const data: any[] = [];
        const machines: Record<string, (r: () => number) => number> = {
            'Machine 1': (r) => normal(r, 50, 5),               // unimodal
            'Machine 2': (r) => bimodal(r, 30, 72, 5),          // strong two-hump
            'Machine 3': (r) => bimodal(r, 40, 60, 4, 0.35),    // asymmetric two-hump
        };
        for (const [m, fn] of Object.entries(machines)) {
            for (let i = 0; i < 120; i++) {
                data.push({ Machine: m, 'Pressure (psi)': r1(fn(rand)) });
            }
        }
        tests.push({
            title: 'Bimodal sensor readings by machine',
            description: 'Two machines show clearly separated double humps — KDE shape, not a single blob',
            tags: ['nominal', 'quantitative', 'distribution', 'bimodal', 'large'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Machine'), makeField('Pressure (psi)')],
            metadata: {
                Machine: { type: Type.String, semanticType: 'Category', levels: Object.keys(machines) },
                'Pressure (psi)': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Machine'), y: makeEncodingItem('Pressure (psi)') },
        });
    }

    // 4. Zero-crossing measure — daily returns by asset, spanning negatives.
    {
        const assets: Record<string, { mean: number; sd: number }> = {
            'Bonds': { mean: 0.2, sd: 1.2 },
            'Equities': { mean: 0.6, sd: 4.5 },
            'Crypto': { mean: 0.4, sd: 9.0 },
        };
        const data: any[] = [];
        for (const [asset, p] of Object.entries(assets)) {
            for (let i = 0; i < 100; i++) {
                data.push({ Asset: asset, 'Daily Return %': r1(normal(rand, p.mean, p.sd)) });
            }
        }
        tests.push({
            title: 'Daily returns by asset (crosses zero)',
            description: 'Return distributions straddling zero — the value axis spans negative to positive',
            tags: ['nominal', 'quantitative', 'distribution', 'negative', 'medium'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Asset'), makeField('Daily Return %')],
            metadata: {
                Asset: { type: Type.String, semanticType: 'Category', levels: Object.keys(assets) },
                'Daily Return %': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Asset'), y: makeEncodingItem('Daily Return %') },
        });
    }

    // 5. Uneven group sizes — household income by region, n varies per group.
    {
        const regions: Array<{ name: string; n: number; mean: number; sd: number }> = [
            { name: 'North', n: 45, mean: 52, sd: 14 },
            { name: 'South', n: 110, mean: 41, sd: 11 },
            { name: 'East', n: 65, mean: 60, sd: 20 },
            { name: 'West', n: 90, mean: 48, sd: 16 },
        ];
        const data: any[] = [];
        for (const reg of regions) {
            for (let i = 0; i < reg.n; i++) {
                const v = Math.max(8, rightSkew(rand, reg.mean - reg.sd, reg.sd));
                data.push({ Region: reg.name, 'Income (k$)': r1(v) });
            }
        }
        tests.push({
            title: 'Income by region (uneven group sizes)',
            description: 'Right-skewed income violins where each region has a different sample count',
            tags: ['nominal', 'quantitative', 'distribution', 'uneven', 'medium'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Region'), makeField('Income (k$)')],
            metadata: {
                Region: { type: Type.String, semanticType: 'Category', levels: regions.map(r => r.name) },
                'Income (k$)': { type: Type.Number, semanticType: 'Amount', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Region'), y: makeEncodingItem('Income (k$)') },
        });
    }

    // 6. Higher cardinality — 6 subjects, checks spacing/faceting of the strip.
    {
        const subjects = genCategories('Subject', 6);
        const data: any[] = [];
        subjects.forEach((sub, idx) => {
            const mean = 60 + idx * 3;
            const sd = 8 + (idx % 3) * 3;
            for (let i = 0; i < 60; i++) {
                const v = Math.max(0, Math.min(100, normal(rand, mean, sd)));
                data.push({ Subject: sub, Grade: Math.round(v) });
            }
        });
        tests.push({
            title: 'Grades across 6 subjects (higher cardinality)',
            description: 'Six per-subject violins — checks panel spacing and facet layout',
            tags: ['nominal', 'quantitative', 'distribution', 'high-cardinality', 'medium'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Subject'), makeField('Grade')],
            metadata: {
                Subject: { type: Type.String, semanticType: 'Category', levels: subjects },
                Grade: { type: Type.Number, semanticType: 'Score', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Subject'), y: makeEncodingItem('Grade') },
        });
    }

    // 7. Single category — exactly one violin.
    {
        const data: any[] = [];
        for (let i = 0; i < 100; i++) {
            const v = Math.max(120, Math.min(210, normal(rand, 168, 9)));
            data.push({ Cohort: 'All Adults', 'Height (cm)': r1(v) });
        }
        tests.push({
            title: 'Single distribution — adult height (one violin)',
            description: 'A single violin for one cohort — minimal cardinality',
            tags: ['nominal', 'quantitative', 'distribution', 'single', 'small'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Cohort'), makeField('Height (cm)')],
            metadata: {
                Cohort: { type: Type.String, semanticType: 'Category', levels: ['All Adults'] },
                'Height (cm)': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: { x: makeEncodingItem('Cohort'), y: makeEncodingItem('Height (cm)') },
        });
    }

    // 8. Explicit color = category — same field on x and color (the documented
    //    "color usually mirrors the category" case).
    {
        const species = ['Adelie', 'Chinstrap', 'Gentoo'];
        const bodyMass: Record<string, { mean: number; sd: number }> = {
            'Adelie': { mean: 3700, sd: 460 },
            'Chinstrap': { mean: 3730, sd: 380 },
            'Gentoo': { mean: 5080, sd: 500 },
        };
        const data: any[] = [];
        for (const sp of species) {
            const p = bodyMass[sp];
            for (let i = 0; i < 80; i++) {
                data.push({ Species: sp, 'Body Mass (g)': Math.round(normal(rand, p.mean, p.sd)) });
            }
        }
        tests.push({
            title: 'Penguin body mass by species (color = category)',
            description: 'Per-species violins with color mirroring the category for distinct hues',
            tags: ['nominal', 'quantitative', 'distribution', 'color', 'small'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Species'), makeField('Body Mass (g)')],
            metadata: {
                Species: { type: Type.String, semanticType: 'Category', levels: species },
                'Body Mass (g)': { type: Type.Number, semanticType: 'Quantity', levels: [] },
            },
            encodingMap: {
                x: makeEncodingItem('Species'),
                y: makeEncodingItem('Body Mass (g)'),
                color: makeEncodingItem('Species'),
            },
        });
    }

    // 9. SPLIT violin — a genuine 2-value colour sub-group. Each category holds
    //    two groups (Day / Night), so the mirror seats one on each half: the
    //    classic split violin for comparing two distributions per category.
    {
        const depts = ['Eng', 'Sales', 'Support', 'Ops'];
        const shifts = ['Day', 'Night'];
        const data: any[] = [];
        depts.forEach((d, di) => shifts.forEach((s, si) => {
            for (let i = 0; i < 70; i++) {
                const v = normal(rand, 62000 + di * 9000 + si * 7000, 12000);
                data.push({ Department: d, Shift: s, Salary: Math.round(Math.max(28000, v)) });
            }
        }));
        tests.push({
            title: 'Salary by department, split by shift (2 groups)',
            description: 'Split violin — Day vs Night distributions share each department band',
            tags: ['nominal', 'quantitative', 'distribution', 'color', 'group', 'gallery', 'medium'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Department'), makeField('Salary'), makeField('Shift')],
            metadata: {
                Department: { type: Type.String, semanticType: 'Category', levels: depts },
                Salary: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Shift: { type: Type.String, semanticType: 'Category', levels: shifts },
            },
            encodingMap: {
                x: makeEncodingItem('Department'),
                y: makeEncodingItem('Salary'),
                color: makeEncodingItem('Shift'),
            },
        });
    }

    // 10. GRID violin — a 3+ value colour sub-group. A centre stack of three
    //     densities would misread each layer, so the sub-group is laid out as a
    //     category × sub-group grid of independent full violins.
    {
        const depts = ['Eng', 'Sales', 'Support'];
        const levels = ['Junior', 'Mid', 'Senior'];
        const data: any[] = [];
        depts.forEach((d, di) => levels.forEach((l, li) => {
            for (let i = 0; i < 60; i++) {
                const v = normal(rand, 55000 + di * 8000 + li * 22000, 10000 + li * 3000);
                data.push({ Department: d, Level: l, Salary: Math.round(Math.max(30000, v)) });
            }
        }));
        tests.push({
            title: 'Salary by department and level (3 groups, grid)',
            description: 'Grouped violins as a department × level grid, one independent shape per cell',
            tags: ['nominal', 'quantitative', 'distribution', 'color', 'group', 'grid', 'gallery', 'medium'],
            chartType: 'Violin Plot',
            data,
            fields: [makeField('Department'), makeField('Salary'), makeField('Level')],
            metadata: {
                Department: { type: Type.String, semanticType: 'Category', levels: depts },
                Salary: { type: Type.Number, semanticType: 'Amount', levels: [] },
                Level: { type: Type.String, semanticType: 'Category', levels: levels },
            },
            encodingMap: {
                x: makeEncodingItem('Department'),
                y: makeEncodingItem('Salary'),
                color: makeEncodingItem('Level'),
            },
        });
    }

    return tests;
}
