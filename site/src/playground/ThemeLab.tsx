// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme lab: one row per case, one column per house (Flint's default first), on either Vega-Lite or Plotly.
 *
 * - Real data: the real-world datasets in `shared/preview-cases.ts` (real category names, distributions,
 *   negatives, long labels), the browser twin of `scripts/theme-real.ts`. A house with a hand-made redesign of
 *   the case carries a "ref" badge that opens it beside the compiled chart.
 * - Generated: the synthetic gallery cases of `theme-lab-r2-data.ts`, paged by family: does a house break,
 *   turn illegible, or stop being recognisable on a chart nobody tuned it against.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { plGetTemplateDef, vlGetTemplateDef, type ChartAssemblyInput } from 'flint-chart';
import { siteTheme } from '../shared/theme';
import { PREVIEW_CASES, type PreviewCase } from '../shared/preview-cases';
import { R2_CASES, R2_FAMILY_ORDER, r2Input, type R2Family } from './theme-lab-r2-data';
import { LAB_COLUMNS, LabCell, type LabBackend } from './ThemeLabCell';
import { DetailModal, redesignsByCase, type LabRow } from './ThemeLabRedesign';

const PAGE_SIZE = 6;

/** Assembly input for a real case — mirrors `scripts/theme-real.ts` `inputFor`. */
function realInput(c: PreviewCase): ChartAssemblyInput {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            title: c.title,
            encodings: c.encodings,
            baseSize: { width: 300, height: 300 },
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
    } as ChartAssemblyInput;
}

interface GridCase {
    id: string;
    title: string;
    note?: string;
    pills: string[];
    input: ChartAssemblyInput;
}

function Pill({ children }: { children: ReactNode }) {
    return (
        <span
            style={{
                display: 'inline-block',
                fontSize: 11,
                lineHeight: 1.5,
                padding: '1px 8px',
                borderRadius: 999,
                background: siteTheme.bg,
                border: `1px solid ${siteTheme.border}`,
                color: siteTheme.textMuted,
            }}
        >
            {children}
        </span>
    );
}

function Choice<T extends string>({ label, value, options, onChange }: {
    label?: string;
    value: T;
    options: [T, string][];
    onChange: (value: T) => void;
}) {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {label ? <span style={{ fontSize: 11, color: siteTheme.textMuted }}>{label}</span> : null}
            {options.map(([key, text]) => {
                const active = key === value;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        style={{
                            fontSize: 12,
                            padding: '3px 10px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            border: `1px solid ${active ? siteTheme.accent : siteTheme.border}`,
                            background: active ? siteTheme.accent : 'transparent',
                            color: active ? '#fff' : siteTheme.text,
                        }}
                    >
                        {text}
                    </button>
                );
            })}
        </div>
    );
}

function Row({ c, backend, refs, onRef }: {
    c: GridCase;
    backend: LabBackend;
    refs?: Map<string, LabRow>;
    onRef: (row: LabRow) => void;
}) {
    return (
        <section style={{ marginBottom: 28 }}>
            <header style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: siteTheme.text }}>
                    <code style={{ fontSize: 12, color: siteTheme.accent }}>{c.id}</code> · {c.title}
                    {c.note ? <span style={{ fontWeight: 400, color: siteTheme.textMuted }}> — {c.note}</span> : null}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                    {c.pills.map((p) => <Pill key={p}>{p}</Pill>)}
                </div>
            </header>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingBottom: 10 }}>
                {LAB_COLUMNS.map((col) => {
                    const ref = refs?.get(col);
                    return <LabCell key={col} input={c.input} column={col} backend={backend} onRef={ref ? () => onRef(ref) : undefined} />;
                })}
            </div>
        </section>
    );
}

export function ThemeLab() {
    const [params, setParams] = useSearchParams();
    const data = params.get('data') === 'generated' ? 'generated' : 'real';
    const [backend, setBackend] = useState<LabBackend>('vegalite');
    const [family, setFamily] = useState<R2Family>(R2_FAMILY_ORDER[0]);
    const [page, setPage] = useState(0);
    const [onlyRefs, setOnlyRefs] = useState(false);
    const [open, setOpen] = useState<LabRow | null>(null);
    const redesigns = useMemo(redesignsByCase, []);

    const realCases = useMemo(() => {
        const has = backend === 'plotly' ? plGetTemplateDef : vlGetTemplateDef;
        return PREVIEW_CASES.filter((c) => has(c.chartType) && (!onlyRefs || redesigns.has(c.id)));
    }, [backend, onlyRefs, redesigns]);
    const pageCount = Math.max(1, Math.ceil(realCases.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);

    const cases: GridCase[] = data === 'real'
        ? realCases.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE).map((c) => ({
            id: c.id,
            title: c.title,
            note: c.blurb,
            pills: [c.chartType, ...(c.source ? [`src: ${c.source}`] : [])],
            input: realInput(c),
        }))
        : R2_CASES.filter((c) => c.family === family).map((c) => ({
            id: c.id,
            title: c.title,
            note: c.subtitle,
            pills: [c.gen, `probe: ${c.probe}`],
            input: r2Input(c) as ChartAssemblyInput,
        }));
    const refCount = [...redesigns.values()].reduce((n, m) => n + m.size, 0);

    return (
        <div style={{ padding: '8px 4px 64px' }}>
            <h2 style={{ margin: '0 0 10px', fontSize: 18, color: siteTheme.text }}>Theme lab</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 24px', alignItems: 'center', marginBottom: 8 }}>
                <Choice
                    value={data}
                    options={[['real', `Real data (${realCases.length})`], ['generated', `Generated (${R2_CASES.length})`]]}
                    onChange={(value) => setParams(value === 'real' ? {} : { data: value })}
                />
                <Choice label="backend" value={backend} options={[['vegalite', 'vegalite'], ['plotly', 'plotly']]} onChange={setBackend} />
                {data === 'real' ? (
                    <label style={{ fontSize: 12, color: siteTheme.text, display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input type="checkbox" checked={onlyRefs} onChange={(e) => { setOnlyRefs(e.target.checked); setPage(0); }} />
                        only cases with a hand-made redesign ({refCount} in all)
                    </label>
                ) : null}
            </div>

            <nav
                style={{
                    marginBottom: 20,
                    position: 'sticky',
                    top: 52,
                    background: siteTheme.surface,
                    padding: '8px 0',
                    zIndex: 2,
                    borderBottom: `1px solid ${siteTheme.border}`,
                }}
            >
                {data === 'real' ? (
                    <Choice
                        value={String(safePage)}
                        options={Array.from({ length: pageCount }, (_, i): [string, string] => [
                            String(i),
                            `${i * PAGE_SIZE + 1}–${Math.min((i + 1) * PAGE_SIZE, realCases.length)}`,
                        ])}
                        onChange={(value) => setPage(Number(value))}
                    />
                ) : (
                    <Choice
                        value={family}
                        options={R2_FAMILY_ORDER.map((f): [R2Family, string] => [f, `${f} (${R2_CASES.filter((c) => c.family === f).length})`])}
                        onChange={setFamily}
                    />
                )}
            </nav>

            {cases.map((c) => (
                <Row key={`${data}:${backend}:${c.id}`} c={c} backend={backend} refs={data === 'real' ? redesigns.get(c.id) : undefined} onRef={setOpen} />
            ))}

            {open && <DetailModal row={open} onClose={() => setOpen(null)} />}
        </div>
    );
}
