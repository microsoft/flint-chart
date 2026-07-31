import { useEffect, useMemo, useState } from 'react';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { THEME_PRESETS, assembleVegaLite, vlGetTemplateDef } from 'flint-chart';
import { PREVIEW_CASES } from './new-case-preview-data';
import THEME_META from './theme-lab-assets/_themes.json';
import HEADLINES from './theme-lab-assets/_headlines.json';
import THEME_SPECS from './theme-lab-assets/_themespecs.json';

/**
 * Theme lab — Flint's default Vega-Lite output next to a hand-authored
 * bespoke redesign of the same chart, plus the same chart compiled from the
 * ThemeSpec the human read.
 *
 * Columns 1 and 3 are compiled here, in the browser, by the same compiler the
 * library ships: a change to a preset or to a realize pass shows up on this
 * page as soon as the module reloads. Only column 2 is a file — a human wrote
 * it once, by hand, and it is the reference the other two are judged against.
 */

type ThemeId = keyof typeof THEME_META.themes;

interface ThemeMeta {
    label: string;
    alias: string;
    surface: string;
    ink: string;
    accent: string;
    swatches: string[];
    intent: string;
    signature: string[];
}

interface FlintIndexEntry {
    id: string;
    chartType: string;
    title: string;
    subtitle: string;
    source: string;
    rows: number;
}

const THEMES = THEME_META.themes as unknown as Record<ThemeId, ThemeMeta>;
const THEME_ORDER = THEME_META.order as ThemeId[];
const HEADLINE_MAP = HEADLINES.headlines as Record<string, { title: string; subtitle?: string }>;

// Column 2, and only column 2. `<id>.<theme>.json` is the hand-authored
// redesign; nothing else in this folder is read by the page.
const MANUAL_MODULES = import.meta.glob('./theme-lab-assets/*.json', { eager: true }) as Record<
    string,
    { default: any }
>;

interface ThemeReport {
    stage: 'ground' | 'realize';
    path: string;
    message: string;
}

interface LabRow {
    id: string;
    chartType: string;
    title: string;
    source: string;
    rows: number;
    theme: ThemeId;
    flintSpec: any;
    themedSpec: any;
    compiledSpec?: any;
    compiledReport: ThemeReport[];
    design: string[];
}

/**
 * Flint's `_`-prefixed bookkeeping (`_options`, `_width`, `_theme`) is not part
 * of the Vega-Lite the reader is meant to see. A double underscore is
 * load-bearing (`__geo_id` is a choropleth join key) and stays.
 */
function stripInternal(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
        node.forEach(stripInternal);
        return;
    }
    for (const key of Object.keys(node)) {
        if (/^_[^_]/.test(key)) delete node[key];
        else stripInternal(node[key]);
    }
}

/**
 * The assembly input for a case, built the same way for both compiled columns —
 * the only difference between them is whether a ThemeSpec is attached, which is
 * the whole point of the comparison.
 */
function inputFor(c: (typeof PREVIEW_CASES)[number]): any {
    const headline = HEADLINE_MAP[c.id] ?? { title: c.title };
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            title: headline.title,
            ...(headline.subtitle ? { subtitle: headline.subtitle } : {}),
            encodings: c.encodings,
            baseSize: { width: 340, height: 230 },
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
    };
}

const CASE_INDEX: FlintIndexEntry[] = PREVIEW_CASES
    .filter((c) => vlGetTemplateDef(c.chartType))
    .map((c) => {
        const headline = HEADLINE_MAP[c.id] ?? { title: c.title };
        return {
            id: c.id,
            chartType: c.chartType,
            title: headline.title,
            subtitle: headline.subtitle ?? '',
            source: c.source,
            rows: c.data.length,
        };
    });

function computeRows(): LabRow[] {
    // One row per (id, theme). A case may carry several hand-authored themes —
    // replicating one chart across every language is the only way to tell what
    // the language decided from what the chart forced.
    const manualById = new Map<string, any[]>();
    for (const [path, mod] of Object.entries(MANUAL_MODULES)) {
        const file = path.split('/').pop()!;
        if (file.startsWith('_')) continue;
        const match = /^(.*)\.([a-z0-9-]+)\.json$/.exec(file);
        if (!match || !(match[2] in THEMES)) continue;
        manualById.set(match[1], [...(manualById.get(match[1]) ?? []), mod.default]);
    }

    const caseById = new Map(PREVIEW_CASES.map((c) => [c.id, c]));
    const meta = new Map(CASE_INDEX.map((e) => [e.id, e]));
    const rows: LabRow[] = [];

    for (const [id, manualList] of manualById) {
        const c = caseById.get(id);
        if (!c || !vlGetTemplateDef(c.chartType)) continue;
        const input = inputFor(c);
        const info = meta.get(id);

        let flint: any;
        try {
            flint = assembleVegaLite(input) as any;
            stripInternal(flint);
        } catch (err) {
            console.error(`theme lab: ${id} failed to compile —`, (err as Error).message);
            continue;
        }

        for (const manual of manualList) {
            const theme = manual.__theme__ as ThemeId;
            const preset = (THEME_PRESETS as any)[theme];
            let compiled: any;
            let report: ThemeReport[] = [];
            try {
                compiled = assembleVegaLite({ ...input, theme_spec: preset?.spec }) as any;
                report = compiled._theme?.report ?? [];
                stripInternal(compiled);
            } catch (err) {
                console.error(`theme lab: ${id}.${theme} failed to compile —`, (err as Error).message);
                compiled = undefined;
            }
            rows.push({
                id,
                chartType: info?.chartType ?? '—',
                title: info?.title ?? id,
                source: info?.source ?? '',
                rows: info?.rows ?? 0,
                theme,
                flintSpec: flint,
                themedSpec: manual,
                compiledSpec: compiled,
                compiledReport: report,
                design: (manual.__design__ as string[]) ?? [],
            });
        }
    }
    // Group by case so a fully replicated set sits together on the wall.
    return rows.sort(
        (a, b) => a.id.localeCompare(b.id) || THEME_ORDER.indexOf(a.theme) - THEME_ORDER.indexOf(b.theme),
    );
}

// Compiling every case twice is cheap, but not cheap enough to do it once per
// call site. One pass per module load.
let ROWS_CACHE: LabRow[] | null = null;
function buildRows(): LabRow[] {
    if (!ROWS_CACHE) ROWS_CACHE = computeRows();
    return ROWS_CACHE;
}

/** Vega-Lite ignores unknown top-level keys, but strip ours anyway. */
function cleanSpec(spec: any): any {
    const out: any = {};
    for (const [k, v] of Object.entries(spec)) {
        if (!k.startsWith('__')) out[k] = v;
    }
    return out;
}

function ThemeChip({ theme }: { theme: ThemeId }) {
    const t = THEMES[theme];
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '2px 8px',
                borderRadius: 999,
                border: `1px solid ${siteTheme.border}`,
                fontSize: 11,
                fontWeight: 600,
                color: siteTheme.text,
                whiteSpace: 'nowrap',
            }}
        >
            <span
                style={{
                    width: 9,
                    height: 9,
                    borderRadius: 2,
                    background: t.accent,
                    border: theme === 'powerbi' ? '1px solid #605e5c' : 'none',
                }}
            />
            {t.label}
            <span style={{ fontWeight: 400, color: siteTheme.navInactive }}>{t.alias}</span>
        </span>
    );
}

function SpecCell({ spec, dark, label }: { spec: any; dark: boolean; label: string }) {
    const cleaned = useMemo(() => cleanSpec(spec), [spec]);
    return (
        <div style={{ flex: '1 1 340px', minWidth: 300, maxWidth: '100%' }}>
            <div
                style={{
                    fontSize: 10,
                    textTransform: 'uppercase',
                    letterSpacing: 0.6,
                    color: siteTheme.navInactive,
                    marginBottom: 6,
                }}
            >
                {label}
            </div>
            <div
                style={{
                    background: dark ? '#1b1a19' : '#ffffff',
                    border: `1px solid ${siteTheme.border}`,
                    borderRadius: 8,
                    padding: 12,
                }}
            >
                <ScaleToFit adaptiveHeight height={440} minHeight={180} padding={0}>
                    <VegaLiteView spec={cleaned} renderer="svg" />
                </ScaleToFit>
            </div>
        </div>
    );
}

/** Small, uniform, shrink-to-fit chart tile used on the wall. */
function Thumb({ spec, bg, height }: { spec: any; bg: string; height: number }) {
    return (
        <div
            style={{
                position: 'relative',
                height,
                background: bg,
                border: `1px solid ${siteTheme.border}`,
                borderRadius: 5,
                overflow: 'hidden',
            }}
        >
            <ScaleToFit fill height={height} padding={5}>
                <VegaLiteView spec={spec} renderer="svg" />
            </ScaleToFit>
        </div>
    );
}

/**
 * One wall tile = one (chart, language) triple: baseline, the human's redesign,
 * and the compiler's reading of the same ThemeSpec. Small enough to scan a whole
 * language in one screen; the argument lives in the popup, not here.
 */
function WallTile({ row, showFlint, onOpen }: { row: LabRow; showFlint: boolean; onOpen: () => void }) {
    const t = THEMES[row.theme];
    const flint = useMemo(() => cleanSpec(row.flintSpec), [row.flintSpec]);
    const themed = useMemo(() => cleanSpec(row.themedSpec), [row.themedSpec]);
    const compiled = useMemo(
        () => (row.compiledSpec ? cleanSpec(row.compiledSpec) : null),
        [row.compiledSpec],
    );
    return (
        <button
            onClick={onOpen}
            title={`${row.id} · ${t.label} — open`}
            onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: 8,
                border: 'none',
                borderRadius: 8,
                background: 'transparent',
                cursor: 'pointer',
                font: 'inherit',
                transition: 'background 120ms ease',
            }}
        >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {showFlint ? (
                    <Thumb spec={flint} bg="#ffffff" height={232} />
                ) : (
                    <div
                        style={{
                            height: 232,
                            borderRadius: 5,
                            display: 'grid',
                            placeItems: 'center',
                            textAlign: 'center',
                            padding: 8,
                            fontSize: 10.5,
                            lineHeight: 1.4,
                            color: siteTheme.navInactive,
                            background:
                                'repeating-linear-gradient(135deg, transparent, transparent 7px, rgba(0,0,0,0.02) 7px, rgba(0,0,0,0.02) 8px)',
                        }}
                    >
                        Flint baseline is
                        <br />
                        the same as above ↑
                    </div>
                )}
                <Thumb spec={themed} bg={t.surface} height={232} />
                {compiled ? (
                    <Thumb spec={compiled} bg={t.surface} height={232} />
                ) : (
                    <div
                        style={{
                            height: 232,
                            border: `1px dashed ${siteTheme.border}`,
                            borderRadius: 5,
                            display: 'grid',
                            placeItems: 'center',
                            fontSize: 11,
                            color: siteTheme.navInactive,
                        }}
                    >
                        not compiled
                    </div>
                )}
            </div>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 7,
                    fontSize: 11,
                    color: siteTheme.navInactive,
                    minWidth: 0,
                }}
            >
                <span
                    style={{
                        width: 8,
                        height: 8,
                        borderRadius: 2,
                        flex: '0 0 auto',
                        background: t.accent,
                        border: row.theme === 'powerbi' ? '1px solid #605e5c' : 'none',
                    }}
                />
                <code
                    style={{
                        fontFamily: siteTheme.fontMono,
                        fontSize: 11,
                        color: siteTheme.text,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {row.id}
                </code>
                <span style={{ marginLeft: 'auto', flex: '0 0 auto' }}>{t.label}</span>
            </div>
        </button>
    );
}

type CoverageStatus = 'full' | 'partial' | 'blocked';
interface CoverageEntry {
    status: CoverageStatus;
    notes: string[];
}

const THEMESPEC_BY_THEME = Object.fromEntries(
    Object.entries(THEME_PRESETS).map(([id, preset]) => [id, preset.spec]),
) as Record<string, unknown>;
const THEMESPEC_COVERAGE = THEME_SPECS.coverage as unknown as Record<string, CoverageEntry>;

/** How many charts each single ThemeSpec is on the hook for. */
const ROWS_PER_THEME: Record<string, number> = buildRows().reduce<Record<string, number>>((acc, r) => {
    acc[r.theme as string] = (acc[r.theme as string] ?? 0) + 1;
    return acc;
}, {});

const COVERAGE_INK: Record<CoverageStatus, string> = {
    full: '#2d8659',
    partial: '#b7791f',
    blocked: '#c0392b',
};

const COVERAGE_LABEL: Record<CoverageStatus, string> = {
    full: 'expressible',
    partial: 'partly expressible',
    blocked: 'not expressible',
};

/** Full-size pair, the design argument, and both raw specs. */
function DetailModal({ row, onClose }: { row: LabRow; onClose: () => void }) {
    const [showSpec, setShowSpec] = useState(false);
    const [showThemeSpec, setShowThemeSpec] = useState(false);
    const t = THEMES[row.theme];
    const themeSpec = THEMESPEC_BY_THEME[row.theme as string];
    const coverage: CoverageEntry = THEMESPEC_COVERAGE[row.id] ?? { status: 'full', notes: [] };
    const flint = useMemo(() => cleanSpec(row.flintSpec), [row.flintSpec]);
    const themed = useMemo(() => cleanSpec(row.themedSpec), [row.themedSpec]);
    const compiled = useMemo(
        () => (row.compiledSpec ? cleanSpec(row.compiledSpec) : null),
        [row.compiledSpec],
    );

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div
            onClick={onClose}
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 60,
                background: 'rgba(15, 17, 21, 0.55)',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                padding: '4vh 16px',
                overflowY: 'auto',
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: 'min(100%, 1180px)',
                    background: siteTheme.surface,
                    border: `1px solid ${siteTheme.border}`,
                    borderRadius: 10,
                    padding: 20,
                }}
            >
                <header
                    style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}
                >
                    <ThemeChip theme={row.theme} />
                    <code style={{ fontSize: 12.5, fontFamily: siteTheme.fontMono, color: siteTheme.text }}>
                        {row.id}
                    </code>
                    <span style={{ fontSize: 12, color: siteTheme.navInactive }}>
                        {row.chartType} · {row.rows} rows
                    </span>
                    <button
                        onClick={() => setShowThemeSpec((v) => !v)}
                        style={{
                            marginLeft: 'auto',
                            fontSize: 11,
                            padding: '3px 9px',
                            borderRadius: 6,
                            border: `1px solid ${siteTheme.border}`,
                            background: showThemeSpec ? siteTheme.accentBg : 'transparent',
                            color: siteTheme.text,
                            cursor: 'pointer',
                        }}
                    >
                        {showThemeSpec ? 'Hide ThemeSpec' : 'Show ThemeSpec'}
                    </button>
                    <button
                        onClick={() => setShowSpec((v) => !v)}
                        style={{
                            fontSize: 11,
                            padding: '3px 9px',
                            borderRadius: 6,
                            border: `1px solid ${siteTheme.border}`,
                            background: showSpec ? siteTheme.accentBg : 'transparent',
                            color: siteTheme.text,
                            cursor: 'pointer',
                        }}
                    >
                        {showSpec ? 'Hide specs' : 'Show specs'}
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            fontSize: 11,
                            padding: '3px 9px',
                            borderRadius: 6,
                            border: `1px solid ${siteTheme.border}`,
                            background: 'transparent',
                            color: siteTheme.text,
                            cursor: 'pointer',
                        }}
                    >
                        Close (esc)
                    </button>
                </header>

                <div
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 20,
                        alignItems: 'flex-start',
                    }}
                >
                    <SpecCell spec={flint} dark={false} label="1 · Flint default (Vega-Lite)" />
                    <SpecCell spec={themed} dark={t.surface !== '#ffffff'} label={`2 · ${t.label} redesign`} />
                    {compiled ? (
                        <SpecCell
                            spec={compiled}
                            dark={t.surface !== '#ffffff'}
                            label="3 · ThemeSpec compiled"
                        />
                    ) : (
                        <div style={{ fontSize: 12, color: siteTheme.navInactive }}>
                            3 · not compiled
                        </div>
                    )}
                </div>

                {row.compiledReport.length > 0 && (
                    <>
                        <h3
                            style={{
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: 0.6,
                                color: siteTheme.navInactive,
                                margin: '18px 0 0',
                            }}
                        >
                            What the compiler had to give up ({row.compiledReport.length})
                        </h3>
                        <ul
                            style={{
                                margin: '8px 0 0',
                                paddingLeft: 18,
                                fontSize: 12.5,
                                lineHeight: 1.55,
                                color: siteTheme.textMuted,
                                maxWidth: 900,
                            }}
                        >
                            {row.compiledReport.map((r, i) => (
                                <li key={i}>
                                    <span
                                        style={{
                                            fontFamily: siteTheme.fontMono,
                                            fontSize: 11,
                                            color: r.stage === 'ground' ? '#b7791f' : '#2d8659',
                                        }}
                                    >
                                        {r.stage}
                                    </span>{' '}
                                    <code style={{ fontFamily: siteTheme.fontMono, fontSize: 11 }}>{r.path}</code>{' '}
                                    — {r.message}
                                </li>
                            ))}
                        </ul>
                    </>
                )}

                <h3
                    style={{
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: siteTheme.navInactive,
                        margin: '18px 0 0',
                    }}
                >
                    What had to change ({row.design.length})
                </h3>
                <ol
                    style={{
                        margin: '8px 0 0',
                        paddingLeft: 18,
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: siteTheme.textMuted,
                        maxWidth: 900,
                    }}
                >
                    {row.design.map((d, i) => (
                        <li key={i} style={{ marginBottom: 6 }}>
                            {d}
                        </li>
                    ))}
                </ol>

                {showThemeSpec && (
                    <section style={{ marginTop: 18 }}>
                        <h3
                            style={{
                                fontSize: 11,
                                textTransform: 'uppercase',
                                letterSpacing: 0.6,
                                color: siteTheme.navInactive,
                                margin: 0,
                            }}
                        >
                            ThemeSpec · {t.label}
                        </h3>
                        <p
                            style={{
                                margin: '6px 0 0',
                                fontSize: 12.5,
                                lineHeight: 1.55,
                                color: siteTheme.textMuted,
                                maxWidth: 900,
                            }}
                        >
                            One spec per design language, not one per chart. This is the whole of {t.label} —
                            the same object is what would have to produce all {' '}
                            {ROWS_PER_THEME[row.theme] ?? 0} of its charts in this lab. Written against{' '}
                            <code style={{ fontFamily: siteTheme.fontMono, fontSize: 11.5 }}>
                                themespec.v12
                            </code>
                            .
                        </p>
                        <div
                            style={{
                                display: 'flex',
                                alignItems: 'baseline',
                                gap: 8,
                                margin: '12px 0 6px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <span
                                style={{
                                    fontSize: 10.5,
                                    fontWeight: 600,
                                    textTransform: 'uppercase',
                                    letterSpacing: 0.5,
                                    padding: '2px 7px',
                                    borderRadius: 4,
                                    color: '#ffffff',
                                    background: COVERAGE_INK[coverage.status],
                                }}
                            >
                                {COVERAGE_LABEL[coverage.status]}
                            </span>
                            <span style={{ fontSize: 12, color: siteTheme.navInactive }}>
                                for <code style={{ fontFamily: siteTheme.fontMono }}>{row.id}</code>
                            </span>
                        </div>
                        {coverage.notes.length > 0 && (
                            <ul
                                style={{
                                    margin: '0 0 10px',
                                    paddingLeft: 18,
                                    fontSize: 12.5,
                                    lineHeight: 1.55,
                                    color: siteTheme.textMuted,
                                    maxWidth: 900,
                                }}
                            >
                                {coverage.notes.map((n, i) => (
                                    <li key={i} style={{ marginBottom: 4 }}>
                                        {n}
                                    </li>
                                ))}
                            </ul>
                        )}
                        <pre style={{ ...specPre, maxHeight: 420 }}>{JSON.stringify(themeSpec, null, 2)}</pre>
                    </section>
                )}

                {showSpec && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginTop: 16 }}>
                        <pre style={specPre}>{JSON.stringify(row.flintSpec, null, 2)}</pre>
                        <pre style={specPre}>{JSON.stringify(row.themedSpec, null, 2)}</pre>
                    </div>
                )}
            </div>
        </div>
    );
}

const specPre: React.CSSProperties = {
    margin: 0,
    maxHeight: 340,
    overflow: 'auto',
    fontFamily: siteTheme.fontMono,
    fontSize: 10.5,
    lineHeight: 1.45,
    background: '#fafafa',
    border: `1px solid ${siteTheme.border}`,
    borderRadius: 6,
    padding: 10,
    color: siteTheme.text,
};

export function ThemeLab() {
    const rows = useMemo(buildRows, []);
    const [filter, setFilter] = useState<ThemeId | 'all'>('all');
    const [openKey, setOpenKey] = useState<string | null>(null);
    const shown = filter === 'all' ? rows : rows.filter((r) => r.theme === filter);
    const open = rows.find((r) => `${r.id}-${r.theme}` === openKey) ?? null;
    const counts = useMemo(() => {
        const m = new Map<ThemeId, number>();
        rows.forEach((r) => m.set(r.theme, (m.get(r.theme) ?? 0) + 1));
        return m;
    }, [rows]);

    return (
        <div className="dev-page">
            <div style={{ width: 'min(100%, 1280px)' }}>
            <header className="dev-page-heading" style={{ width: '100%' }}>
                <h1>
                    Theme lab{' '}
                    <span style={{ fontSize: 14, fontWeight: 400, color: siteTheme.navInactive }}>
                        ({rows.length} redesigns)
                    </span>
                </h1>
                <p style={{ color: siteTheme.textMuted, maxWidth: 820, fontSize: 13 }}>
                    Every tile is a pair: on the left what Flint compiles today, on the right a Vega-Lite
                    spec written by hand against a named design language — no theming engine involved.
                    The wall is for scanning; click any tile for the full-size pair, the diff (the
                    concrete list of things a design-theme layer would have to be able to express) and
                    both raw specs. Tiles are grouped by chart, so a case themed in several languages
                    sits together. The Flint baseline is identical across a group, so it is drawn once,
                    on the first tile; the follow-ups pair the redesign against the compiled theme only.
                    Specs live in <code>site/src/playground/theme-lab-assets/</code>, one
                    JSON per chart per theme, tagged with <code>__theme__</code>.
                </p>
                <p
                    style={{
                        maxWidth: 820,
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: siteTheme.textMuted,
                        borderLeft: `2px solid ${siteTheme.border}`,
                        paddingLeft: 12,
                        margin: '4px 0 0',
                    }}
                >
                    <strong style={{ color: siteTheme.text }}>Scope.</strong> Every redesign is reachable
                    from the same data and the same encoding. No annotation layers, no callouts, no
                    editorial headlines that state a conclusion, no invented reference lines, no source
                    credits. Those are worth studying later, but they need information the chart spec
                    does not carry. Nor may a redesign re-sort: which country leads, which age band sits
                    on top, which band rests on the baseline are statements about the data, decided
                    upstream in the Flint spec — where the baseline's order is wrong it is fixed there,
                    so both columns move together. What is in scope: geometry, scales, axis and grid
                    structure, palette, typography, legend placement, and re-encoding data that is
                    already present (for example printing a bar's value as a label).
                </p>
                <p
                    style={{
                        maxWidth: 820,
                        fontSize: 12.5,
                        lineHeight: 1.55,
                        color: siteTheme.textMuted,
                        borderLeft: `2px solid ${siteTheme.border}`,
                        paddingLeft: 12,
                        margin: '10px 0 0',
                    }}
                >
                    <strong style={{ color: siteTheme.text }}>Text is held constant.</strong> Both columns
                    carry byte-identical title and subtitle strings, defined once in{' '}
                    <code>_headlines.json</code>. Flint's <code>ChartAssemblyInput</code> has no title
                    field at all, so the baseline is post-processed to stamp the headline on unstyled —
                    otherwise column 2 would win simply by having words on the page. The difference you
                    are looking at is typography, anchoring, spacing and colour, never wording.{' '}
                    <code>scripts/check-theme-lab.mjs</code> fails the build if the two ever drift apart.
                </p>
            </header>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, margin: '4px 0 18px' }}>
                <button onClick={() => setFilter('all')} style={filterBtn(filter === 'all')}>
                    All ({rows.length})
                </button>
                {THEME_ORDER.map((id) => (
                    <button key={id} onClick={() => setFilter(id)} style={filterBtn(filter === id)}>
                        {THEMES[id].label} ({counts.get(id) ?? 0})
                    </button>
                ))}
            </div>

            <details style={{ marginBottom: 14 }}>
                <summary
                    style={{
                        cursor: 'pointer',
                        fontSize: 11,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                        color: siteTheme.navInactive,
                        marginBottom: 10,
                    }}
                >
                    The {THEME_ORDER.length} design languages — palette, intent, signature
                </summary>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                        gap: 14,
                    }}
                >
                    {THEME_ORDER.filter((id) => filter === 'all' || filter === id).map((id) => {
                        const t = THEMES[id];
                        return (
                            <article
                                key={id}
                                style={{
                                    border: `1px solid ${siteTheme.border}`,
                                    borderRadius: 8,
                                    padding: 12,
                                    background: siteTheme.surface,
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                                    <strong style={{ fontSize: 13, color: siteTheme.text }}>{t.label}</strong>
                                    <span style={{ fontSize: 11, color: siteTheme.navInactive }}>{t.alias}</span>
                                </div>
                                <div style={{ display: 'flex', gap: 3, margin: '8px 0' }}>
                                    {t.swatches.map((c) => (
                                        <span
                                            key={c}
                                            title={c}
                                            style={{ width: 22, height: 12, borderRadius: 2, background: c }}
                                        />
                                    ))}
                                    <span
                                        title={`surface ${t.surface}`}
                                        style={{
                                            width: 22,
                                            height: 12,
                                            borderRadius: 2,
                                            background: t.surface,
                                            border: `1px solid ${siteTheme.border}`,
                                        }}
                                    />
                                </div>
                                <p style={{ margin: '0 0 8px', fontSize: 11.5, lineHeight: 1.5, color: siteTheme.textMuted }}>
                                    {t.intent}
                                </p>
                                <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, lineHeight: 1.5, color: siteTheme.navInactive }}>
                                    {t.signature.map((s, i) => (
                                        <li key={i}>{s}</li>
                                    ))}
                                </ul>
                            </article>
                        );
                    })}
                </div>
            </details>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(880px, 1fr))',
                    gap: 12,
                }}
            >
                {shown.map((row, i) => (
                    <WallTile
                        key={`${row.id}-${row.theme}`}
                        row={row}
                        showFlint={i === 0 || shown[i - 1].id !== row.id}
                        onOpen={() => setOpenKey(`${row.id}-${row.theme}`)}
                    />
                ))}
            </div>

            {open && <DetailModal row={open} onClose={() => setOpenKey(null)} />}

            {shown.length === 0 && (
                <p style={{ color: siteTheme.textMuted, fontSize: 13 }}>
                    No hand-authored specs for this theme yet.
                </p>
            )}

            <CoverageNotes rows={rows} />
            </div>
        </div>
    );
}

/**
 * What the table covers, what it does not, and which additional cases would
 * actually buy new information about the design space.
 */
function CoverageNotes({ rows }: { rows: LabRow[] }) {
    const index = CASE_INDEX;
    const done = new Set(rows.map((r) => r.id));
    const coveredTypes = new Set(rows.map((r) => r.chartType));
    const untouched = index.filter((e) => !done.has(e.id));
    const untouchedNew = untouched.filter((e) => !coveredTypes.has(e.chartType));
    const themesPerCase = new Map<string, number>();
    rows.forEach((r) => themesPerCase.set(r.id, (themesPerCase.get(r.id) ?? 0) + 1));
    const full = [...themesPerCase.entries()].filter(([, n]) => n >= THEME_ORDER.length);
    const once = [...themesPerCase.values()].filter((n) => n === 1).length;

    const bulletList: React.CSSProperties = {
        margin: '6px 0 18px',
        paddingLeft: 18,
        maxWidth: 860,
        fontSize: 13,
        lineHeight: 1.6,
        color: siteTheme.textMuted,
    };
    const heading: React.CSSProperties = {
        fontSize: 13.5,
        fontWeight: 600,
        color: siteTheme.text,
        margin: '18px 0 0',
    };

    return (
        <section style={{ marginTop: 34, paddingTop: 22, borderTop: `1px solid ${siteTheme.border}` }}>
            <h2 style={{ fontSize: 18, margin: '0 0 6px', color: siteTheme.text }}>
                Coverage, and what is still missing
            </h2>
            <p style={{ maxWidth: 860, fontSize: 13, lineHeight: 1.6, color: siteTheme.textMuted, margin: '0 0 6px' }}>
                {rows.length} redesigns across {coveredTypes.size} chart types and {THEME_ORDER.length}{' '}
                design languages, drawn from {index.length} Flint baselines. A case earns its place by
                forcing a decision no theme here has had to make yet — more charts is not the same as more
                evidence.
            </p>

            <h3 style={heading}>The biggest gap is not a missing chart</h3>
            <ul style={bulletList}>
                <li>
                    {full.length === 0
                        ? `No case carries all ${THEME_ORDER.length} languages, and ${once} of ${themesPerCase.size} are themed exactly once.`
                        : `${full.length} of ${themesPerCase.size} cases carry all ${THEME_ORDER.length} languages (${full
                              .map(([id]) => id)
                              .join(', ')}); ${once} are themed exactly once.`}{' '}
                    Themed once, a row cannot separate what the language decided from what the chart
                    demanded.
                </li>
                <li>
                    <em>Print the values or keep the axis</em> is the chart talking, not the house: on the
                    bar most houses print the number on the mark and the Economist and Nature trust the
                    axis instead (Power BI, in either mode, keeps both); on the pie there is no axis to
                    trust, so everyone prints.
                </li>
                <li>
                    <em>Legend or direct labels</em> is the house talking, and it holds across charts: NYT,
                    the Economist and McKinsey label directly on both the line and the pie; Nature,
                    Datawrapper and Power BI (light and dark) keep a key on both.
                </li>
                <li>
                    So what a theme layer has to encode is an attitude to scaffolding, not a rule about
                    marks. Nature keeps the most, and is the only language that answers a problem by adding
                    an encoding rather than removing one; McKinsey keeps the least.
                </li>
            </ul>

            <h3 style={heading}>Missing: structural situations</h3>
            <ul style={bulletList}>
                <li>
                    Dual-axis / combo. Two units in one frame is the hardest thing to theme — which axis
                    keeps the grid, which series takes the accent. Unreachable: Flint has no Vega-Lite
                    combo template, so there is no baseline to argue against.
                </li>
                <li>
                    Missing data. No dataset here has a hole in it. Break the line, interpolate, or shade
                    the gap — a newspaper and a journal answer differently.
                </li>
                <li>
                    High cardinality in colour. The fifty-state row tests fifty axis labels, which is
                    typography. It never tests what happens when hue itself runs out.
                </li>
            </ul>

            <h3 style={heading}>Missing: chart types</h3>
            <ul style={bulletList}>
                <li>
                    Untouched baselines: {untouched.length}, but only {untouchedNew.length} add a chart
                    type never themed here ({untouchedNew.map((e) => e.chartType).join(', ')}). The other{' '}
                    {untouched.length - untouchedNew.length} are repeats of covered types and buy nothing —
                    a second scatter tests the same decisions as the first.
                </li>
                <li>Calendar heatmaps and cycle plots — seasonality is a layout question no case here asks.</li>
                <li>
                    Point-symbol maps. The choropleth settles class breaks and hue ramps; a size legend
                    floating over a basemap is untested.
                </li>
                <li>
                    Radial forms — donut, rose, radar sit unpaired. Angle and area are the hardest channels
                    for a language to legislate, and the pie is the only one of the four any house here has
                    had to argue.
                </li>
                <li>Funnel and gauge — Plotly-only in Flint, so the baseline column cannot be produced at all.</li>
            </ul>

            <h3 style={heading}>Missing: theme languages</h3>
            <ul style={bulletList}>
                <li>
                    The {THEME_ORDER.length} here are six houses plus a light mode of one — the languages
                    below would each force a decision no current house makes, not just widen the table.
                </li>
                <li>
                    Print-mono — one ink, texture and weight only. Every rule that currently leans on hue
                    would have to be restated.
                </li>
                <li>High-density terminal — tiny type, dark ground, no whitespace, information over legibility.</li>
                <li>
                    Accessibility-first — an explicit contrast floor and pattern fills, which would collide
                    productively with the Datawrapper rows.
                </li>
                <li>
                    Raw exploratory — deliberately unstyled and disposable. The null hypothesis: the point
                    below which theming is not worth doing.
                </li>
            </ul>

            <details style={{ marginTop: 6 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13, color: siteTheme.accent }}>
                    Baselines with no bespoke counterpart yet ({untouched.length})
                </summary>
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))',
                        gap: '4px 14px',
                        marginTop: 10,
                        fontSize: 11.5,
                        color: siteTheme.textMuted,
                    }}
                >
                    {untouched.map((e) => (
                        <span key={e.id}>
                            <code style={{ color: siteTheme.text }}>{e.id}</code>{' '}
                            <span style={{ color: siteTheme.navInactive }}>· {e.chartType}</span>
                        </span>
                    ))}
                </div>
            </details>
        </section>
    );
}

function filterBtn(active: boolean): React.CSSProperties {
    return {
        fontSize: 12,
        padding: '4px 12px',
        borderRadius: 999,
        border: `1px solid ${active ? siteTheme.accent : siteTheme.border}`,
        background: active ? siteTheme.accentBg : 'transparent',
        color: active ? siteTheme.accent : siteTheme.text,
        cursor: 'pointer',
    };
}
