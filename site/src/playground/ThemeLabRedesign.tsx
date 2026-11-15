import { useEffect, useMemo, useState } from 'react';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { THEME_PRESETS, assembleVegaLite, vlGetTemplateDef } from 'flint-chart';
import { PREVIEW_CASES } from '../shared/preview-cases';
import THEME_META from './theme-lab-assets/_themes.json';
import HEADLINES from './theme-lab-assets/_headlines.json';
import THEME_SPECS from './theme-lab-assets/_themespecs.json';

/**
 * Hand-authored redesigns for the theme lab: for a real case and a house, Flint's default, the redesign a human
 * wrote by hand (`theme-lab-assets/<id>.<theme>.json`, the reference), and the same chart compiled from the house's
 * ThemeSpec. The lab's grid marks the cells that have one; `DetailModal` shows the three side by side with the
 * design argument and the raw specs.
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

export interface LabRow {
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
export function buildRows(): LabRow[] {
    if (!ROWS_CACHE) ROWS_CACHE = computeRows();
    return ROWS_CACHE;
}

/** Redesigns by case id, then by house. */
export function redesignsByCase(): Map<string, Map<string, LabRow>> {
    const byCase = new Map<string, Map<string, LabRow>>();
    for (const row of buildRows()) {
        if (!byCase.has(row.id)) byCase.set(row.id, new Map());
        byCase.get(row.id)!.set(row.theme as string, row);
    }
    return byCase;
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
export function DetailModal({ row, onClose }: { row: LabRow; onClose: () => void }) {
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
