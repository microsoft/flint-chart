// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Validates every hand-authored theme-lab spec by compiling it with Vega-Lite
 * and running it through a headless Vega view to SVG. Catches the things a
 * JSON file can't catch on its own: bad channel names, invalid filters,
 * unresolvable fields, layer/axis conflicts.
 *
 * Run: node scripts/check-theme-lab.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import * as vegaLite from 'vega-lite';
import * as vega from 'vega';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = resolve(__dirname, '../site/src/playground/theme-lab-assets');

const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort();

let failures = 0;
let warnings = 0;

for (const file of files) {
    const raw = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'));
    const spec = {};
    for (const [k, v] of Object.entries(raw)) if (!k.startsWith('__')) spec[k] = v;

    const logs = [];
    const logger = {
        level() { return this; },
        error(...a) { logs.push(['error', a.join(' ')]); return this; },
        warn(...a) { logs.push(['warn', a.join(' ')]); return this; },
        info() { return this; },
        debug() { return this; },
    };

    try {
        const { spec: vgSpec } = vegaLite.compile(spec, { logger });
        const view = new vega.View(vega.parse(vgSpec), { renderer: 'none' }).logger(logger);
        await view.runAsync();
        const svg = await view.toSVG();
        view.finalize();
        const errs = logs.filter(([l]) => l === 'error');
        const warns = logs.filter(([l]) => l === 'warn');
        if (errs.length) {
            failures++;
            console.log(`✗ ${file}`);
            errs.slice(0, 4).forEach(([, m]) => console.log(`    error: ${m}`));
        } else if (warns.length) {
            warnings++;
            console.log(`~ ${file}  (${svg.length} bytes)`);
            warns.slice(0, 4).forEach(([, m]) => console.log(`    warn: ${m}`));
        } else {
            console.log(`✓ ${file}  (${svg.length} bytes)`);
        }
    } catch (err) {
        failures++;
        console.log(`✗ ${file}`);
        console.log(`    ${err.message.split('\n')[0]}`);
    }
}

console.log(`\n${files.length} specs · ${failures} failed · ${warnings} with warnings`);

// ---------------------------------------------------------------------------
// Headline parity. The whole point of the lab is that the two columns differ in
// style only, so the baseline and its bespoke counterpart must carry byte-identical
// title and subtitle text. This is the check that stops the comparison quietly
// becoming unfair when a spec is hand-edited.
// ---------------------------------------------------------------------------

function headlineOf(spec) {
    const t = spec.title;
    if (!t) return null;
    if (typeof t === 'string') return { title: t, subtitle: '' };
    const sub = t.subtitle;
    return {
        title: t.text ?? '',
        subtitle: Array.isArray(sub) ? sub.join(' ') : (sub ?? ''),
    };
}

const pairs = new Map();
for (const file of files) {
    const match = /^(.*)\.([a-z-]+)\.json$/.exec(file);
    if (!match) continue;
    const [, id, kind] = match;
    const bucket = pairs.get(id) ?? { themed: [] };
    if (kind === 'flint') bucket.flint = file;
    else bucket.themed.push(file);
    pairs.set(id, bucket);
}

/** Every (id, flint, themed) triple — an id may carry one redesign per language. */
function* columnPairs() {
    for (const [id, { flint, themed }] of pairs) {
        if (!flint) continue;
        for (const t of themed) yield [id, flint, t];
    }
}

let mismatches = 0;
let compared = 0;
for (const [id, flint, themed] of columnPairs()) {
    compared++;
    const a = headlineOf(JSON.parse(readFileSync(resolve(DIR, flint), 'utf8')));
    const b = headlineOf(JSON.parse(readFileSync(resolve(DIR, themed), 'utf8')));
    if (!a || !b) {
        mismatches++;
        console.log(`✗ ${id}: missing title on ${!a ? flint : themed}`);
        continue;
    }
    if (a.title !== b.title || a.subtitle !== b.subtitle) {
        mismatches++;
        console.log(`✗ ${id}: headline text differs between columns`);
        console.log(`    flint : ${a.title} — ${a.subtitle}`);
        console.log(`    themed: ${b.title} — ${b.subtitle}`);
    }
}
console.log(
    mismatches
        ? `${mismatches} headline mismatch(es)`
        : `${compared} pairs · headline text identical in both columns`,
);

// ---------------------------------------------------------------------------
// Offset/band-sizing lint. A mark-level `width`/`height` `{band: n}` combined
// with an xOffset/yOffset channel silently pushes the mark off the centre of
// its sub-band, so bars drift away from the labels and axis ticks that belong
// to them. It is invisible at a glance and only shows up under measurement.
// Size via the offset scale's paddingInner instead.
// ---------------------------------------------------------------------------

function hasBandSize(node) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(hasBandSize);
    for (const [k, v] of Object.entries(node)) {
        if ((k === 'width' || k === 'height') && v && typeof v === 'object' && 'band' in v) return true;
        if (hasBandSize(v)) return true;
    }
    return false;
}

function hasOffsetChannel(node) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(hasOffsetChannel);
    for (const [k, v] of Object.entries(node)) {
        if (k === 'xOffset' || k === 'yOffset') return true;
        if (hasOffsetChannel(v)) return true;
    }
    return false;
}

let lints = 0;
for (const file of files) {
    if (file.endsWith('.flint.json')) continue; // generated, not ours to lint
    const raw = JSON.parse(readFileSync(resolve(DIR, file), 'utf8'));
    if (hasOffsetChannel(raw) && hasBandSize(raw)) {
        lints++;
        console.log(`✗ ${file}: mark band sizing + offset channel — marks will not centre on their sub-band`);
    }
}
if (lints === 0) console.log('no band/offset centring conflicts');

// ---------------------------------------------------------------------------
// Orientation parity. The lab claims the two columns differ in STYLE only, so a
// redesign that also transposes the chart is comparing two different decisions
// at once and the reader cannot tell which one did the work. Whichever
// orientation is right, both columns have to use it.
// ---------------------------------------------------------------------------

function collectEncodings(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => collectEncodings(n, out)); return out; }
    if (node.encoding && typeof node.encoding === 'object') out.push(node.encoding);
    for (const [k, v] of Object.entries(node)) {
        if (k === 'encoding' || k === 'data' || k === 'config') continue;
        collectEncodings(v, out);
    }
    return out;
}

const DISCRETE = new Set(['nominal', 'ordinal']);

/** 'vertical' = categories along x, 'horizontal' = categories along y. */
function orientationOf(spec) {
    let x, y;
    for (const enc of collectEncodings(spec)) {
        // The outermost definition wins; layers only refine it.
        if (x === undefined && enc.x?.type) x = enc.x.type;
        if (y === undefined && enc.y?.type) y = enc.y.type;
    }
    if (!x || !y) return null;
    if (DISCRETE.has(x) && y === 'quantitative') return 'vertical';
    if (DISCRETE.has(y) && x === 'quantitative') return 'horizontal';
    return null; // temporal/continuous on both axes — orientation is not a choice
}

let flips = 0;
for (const [id, flint, themed] of columnPairs()) {
    const a = orientationOf(JSON.parse(readFileSync(resolve(DIR, flint), 'utf8')));
    const b = orientationOf(JSON.parse(readFileSync(resolve(DIR, themed), 'utf8')));
    if (a && b && a !== b) {
        flips++;
        console.log(`✗ ${themed}: orientation differs — flint is ${a}, themed is ${b}`);
    }
}
if (flips === 0) console.log('no orientation mismatches between columns');

// ---------------------------------------------------------------------------
// Sort parity (warning only). What order the categories come in is a statement
// about the data — which country leads, which age band sits on top, which band
// rests on the baseline. That decision belongs upstream in the Flint spec; a
// design language governs how a chart looks, not what it says. So a redesign
// may PIN the order the baseline already produces, but it must not change it.
//
// This is a warning rather than a failure because the effective order has to be
// approximated (sorting by a calculate-derived field cannot be resolved without
// running the transforms), so it can report a difference that does not render.
// ---------------------------------------------------------------------------

function collectValues(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => collectValues(n, out)); return out; }
    if (Array.isArray(node.data?.values)) {
        for (const r of node.data.values) if (r && typeof r === 'object') out.push(r);
    }
    for (const v of Object.values(node)) collectValues(v, out);
    return out;
}

const ORDER_CHANNELS = new Set(['x', 'y', 'color', 'column', 'row']);

/** Every discrete channel that has a field, as [field, sort] pairs. */
function collectSorts(node, out = []) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => collectSorts(n, out)); return out; }
    if (node.encoding && typeof node.encoding === 'object') {
        for (const [ch, def] of Object.entries(node.encoding)) {
            if (!ORDER_CHANNELS.has(ch) || !def || typeof def !== 'object') continue;
            if (!def.field || !DISCRETE.has(def.type)) continue;
            // A hidden legend has no visible order to disagree about.
            if (ch === 'color' && def.legend === null) continue;
            // An explicit scale domain, where present, is what actually orders the legend.
            const domain = def.scale?.domain;
            const explicit = Array.isArray(domain) && domain.every((d) => d === null || typeof d !== 'object');
            out.push([def.field, explicit ? domain : ('sort' in def ? def.sort : '<default>')]);
        }
    }
    if (node.facet?.field) out.push([node.facet.field, 'sort' in node.facet ? node.facet.sort : '<default>']);
    for (const v of Object.values(node)) collectSorts(v, out);
    return out;
}

/** Best-effort reconstruction of the category sequence a channel will render. */
function effectiveOrder(field, sort, rows) {
    const seen = [];
    for (const r of rows) if (field in r && !seen.includes(r[field])) seen.push(r[field]);
    if (Array.isArray(sort)) {
        if (sort.every((s) => s && typeof s === 'object')) return null; // sort-by-field spec
        return sort.filter((v) => seen.includes(v));
    }
    if (sort === null) return seen;
    if (sort === '<default>' || sort === 'ascending') return [...seen].sort();
    if (sort === 'descending') return [...seen].sort().reverse();
    if (sort && typeof sort === 'object' && sort.field) {
        const agg = new Map();
        for (const r of rows) {
            if (!(field in r) || typeof r[sort.field] !== 'number') continue;
            const list = agg.get(r[field]) ?? [];
            list.push(r[sort.field]);
            agg.set(r[field], list);
        }
        if (agg.size !== seen.length) return null; // derived field — cannot resolve here
        const pick = { max: (a) => Math.max(...a), min: (a) => Math.min(...a), sum: (a) => a.reduce((x, y) => x + y, 0), count: (a) => a.length };
        const fn = pick[sort.op] ?? pick.min;
        const ranked = [...seen].sort((p, q) => fn(agg.get(p)) - fn(agg.get(q)));
        return sort.order === 'descending' ? ranked.reverse() : ranked;
    }
    return null;
}

function orderMap(spec) {
    const rows = collectValues(spec);
    const map = new Map();
    for (const [field, sort] of collectSorts(spec)) {
        if (field.startsWith('__')) continue; // helper fields from hand-written transforms
        const order = effectiveOrder(field, sort, rows);
        if (order && order.length && !map.has(field)) map.set(field, order);
    }
    return map;
}

let resorts = 0;
for (const [id, flint, themed] of columnPairs()) {
    const a = orderMap(JSON.parse(readFileSync(resolve(DIR, flint), 'utf8')));
    const b = orderMap(JSON.parse(readFileSync(resolve(DIR, themed), 'utf8')));
    for (const [field, want] of a) {
        const got = b.get(field);
        if (!got) continue;
        const sameSet = want.length === got.length && [...want].sort().join('\u0000') === [...got].sort().join('\u0000');
        if (sameSet && want.join('\u0000') !== got.join('\u0000')) {
            resorts++;
            console.log(`! ${themed}: redesign re-sorts "${field}" — order is a semantic decision, not a theme one`);
            console.log(`    flint : ${want.join(', ')}`);
            console.log(`    themed: ${got.join(', ')}`);
        }
    }
}
console.log(
    resorts
        ? `${resorts} sort-order difference(s) — warning only, verify by rendering`
        : 'no sort-order differences between columns',
);

process.exit(failures || mismatches || lints || flips ? 1 : 0);
