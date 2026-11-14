import { useMemo, useState } from 'react';
import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';

// Vega-Lite's own tooltip (exact hit) beside Flint's baseline (Vega's tooltip, plus a few px of
// reach on lines and points), per mark type and density.

type Density = 'sparse' | 'medium' | 'dense';
type Mark = 'point' | 'bar' | 'line';

const SIZES: Record<Density, { points: number; bars: number; months: number; series: number }> = {
    sparse: { points: 40, bars: 5, months: 12, series: 3 },
    medium: { points: 400, bars: 15, months: 48, series: 5 },
    dense: { points: 4000, bars: 40, months: 240, series: 8 },
};

const GROUPS = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta'];

function random(seed: number): () => number {
    let state = seed;
    return () => ((state = (state * 16807) % 2147483647) / 2147483647);
}

function data(mark: Mark, density: Density): Record<string, unknown>[] {
    const size = SIZES[density];
    const rand = random(11);
    if (mark === 'point') {
        return Array.from({ length: size.points }, (_, i) => {
            const group = GROUPS[i % 3];
            const center = [30, 55, 70][i % 3];
            return {
                x: Math.round((center + (rand() - 0.5) * 40) * 100) / 100,
                y: Math.round((50 + (rand() - 0.5) * 60 + (i % 3) * 8) * 100) / 100,
                group,
            };
        });
    }
    if (mark === 'bar') {
        return Array.from({ length: size.bars }, (_, b) => `C${String(b + 1).padStart(2, '0')}`).flatMap((category) =>
            GROUPS.slice(0, 3).map((group) => ({ category, group, value: Math.round(5 + rand() * 30) })));
    }
    return GROUPS.slice(0, size.series).flatMap((group, s) =>
        Array.from({ length: size.months }, (_, m) => ({
            month: `${2000 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-01`,
            group,
            value: Math.round(40 + s * 6 + 12 * Math.sin((m + s * 2) / 4) + (rand() - 0.5) * 10 + m / 6),
        })));
}

function spec(mark: Mark, density: Density): ChartAssemblyInput {
    const values = data(mark, density);
    if (mark === 'point') {
        return { data: { values }, semantic_types: { x: 'Quantity', y: 'Quantity', group: 'Category' }, chart_spec: { chartType: 'Scatter Plot', title: `Points (${values.length})`, encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'group' } } } } as ChartAssemblyInput;
    }
    if (mark === 'bar') {
        return { data: { values }, semantic_types: { category: 'Category', group: 'Category', value: 'Quantity' }, chart_spec: { chartType: 'Stacked Bar Chart', title: `Stacked bars (${SIZES[density].bars} × 3)`, encodings: { x: { field: 'category' }, y: { field: 'value' }, color: { field: 'group' } } } } as ChartAssemblyInput;
    }
    return { data: { values }, semantic_types: { month: 'YearMonth', group: 'Category', value: 'Quantity' }, chart_spec: { chartType: 'Line Chart', title: `Lines (${SIZES[density].series} × ${SIZES[density].months})`, encodings: { x: { field: 'month' }, y: { field: 'value' }, color: { field: 'group' } } } } as ChartAssemblyInput;
}

function withVegaTooltip(input: ChartAssemblyInput): ChartAssemblyInput {
    return { ...input, options: { ...(input as any).options, addTooltips: true }, interaction_spec: { interactions: [], defaults: false } } as ChartAssemblyInput;
}

function withBaseline(input: ChartAssemblyInput, tooltipOnly: boolean): ChartAssemblyInput {
    return { ...input, interaction_spec: { interactions: [], defaults: tooltipOnly ? { tooltip: true, legend: false } : true } } as ChartAssemblyInput;
}

const MARKS: Mark[] = ['point', 'bar', 'line'];

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
    return (
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {label}
            <span style={{ display: 'inline-flex', border: '1px solid #d0d7de', borderRadius: 6, overflow: 'hidden' }}>
                {options.map((option) => (
                    <button
                        key={option}
                        type="button"
                        data-option={option}
                        onClick={() => onChange(option)}
                        style={{ border: 'none', padding: '4px 10px', cursor: 'pointer', background: option === value ? '#0969da' : '#fff', color: option === value ? '#fff' : '#24292f' }}
                    >
                        {option}
                    </button>
                ))}
            </span>
        </label>
    );
}

function Pane({ heading, input, renderer, id }: { heading: string; input: ChartAssemblyInput; renderer: 'svg' | 'canvas'; id: string }) {
    return (
        <div data-pane={id} style={{ flex: '0 0 460px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#57606a', marginBottom: 4 }}>{heading}</div>
            <div className="tc-mount">
                <FlintChart spec={input} renderer={renderer} ariaLabel={heading} width={460} height={340} />
            </div>
        </div>
    );
}

export function TooltipCompare() {
    const [density, setDensity] = useState<Density>('medium');
    const [renderer, setRenderer] = useState<'svg' | 'canvas'>('canvas');
    const [tooltipOnly, setTooltipOnly] = useState(true);
    const specs = useMemo(() => Object.fromEntries(MARKS.map((mark) => [mark, spec(mark, density)])) as Record<Mark, ChartAssemblyInput>, [density]);

    return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1160 }}>
            <header>
                <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Tooltip: Vega-Lite vs Flint baseline</h1>
                <p style={{ maxWidth: 860, lineHeight: 1.5, margin: 0 }}>
                    Left: Vega-Lite's tooltip, shown only while the pointer is exactly on a mark. Right: Flint's baseline, the same
                    tooltip element and content, plus a few px of reach on lines and points so a thin stroke or a small dot is
                    readable without pixel hunting. Bars and other filled marks are read exactly as on the left.
                </p>
            </header>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', position: 'sticky', top: 0, background: '#fff', padding: '8px 0', zIndex: 2, borderBottom: '1px solid #d8dee4' }}>
                <Segmented label="Density" value={density} options={['sparse', 'medium', 'dense'] as const} onChange={setDensity} />
                <Segmented label="Renderer" value={renderer} options={['canvas', 'svg'] as const} onChange={setRenderer} />
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                    <input type="checkbox" checked={tooltipOnly} onChange={(event) => setTooltipOnly(event.target.checked)} />
                    Flint: tooltip only (no legend dim)
                </label>
            </div>
            {MARKS.map((mark) => (
                <article key={`${mark}-${density}-${renderer}-${tooltipOnly}`} data-mark={mark} style={{ border: '1px solid #d8dee4', borderRadius: 8, padding: 12 }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 15, textTransform: 'capitalize' }}>{mark}</h2>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <Pane id="vega" heading="Vega-Lite default" input={withVegaTooltip(specs[mark])} renderer={renderer} />
                        <Pane id="flint" heading="Flint baseline" input={withBaseline(specs[mark], tooltipOnly)} renderer={renderer} />
                    </div>
                </article>
            ))}
        </div>
    );
}
