import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';

// The behaviour every mounted chart has without an interaction_spec entry: a tooltip that reads the
// nearest line or point, and a legend click that dims a group. Pan and zoom are the agent's call.

const days = Array.from({ length: 1500 }, (_, i) => {
    const date = new Date(Date.UTC(2020, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    return { date, value: Math.round((100 + 20 * Math.sin(i / 40) + 8 * Math.sin(i / 3) + i / 30) * 10) / 10 };
});

const series = ['North', 'South', 'East', 'West', 'Central'].flatMap((region, r) =>
    Array.from({ length: 24 }, (_, m) => ({
        month: `${2022 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}-01`,
        region,
        sales: Math.round(40 + r * 8 + 12 * Math.sin((m + r * 2) / 3) + m),
    })));

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cloud = Array.from({ length: 4000 }, (_, i) => {
    const group = i % 3 === 0 ? 'A' : i % 3 === 1 ? 'B' : 'C';
    const cx = group === 'A' ? 30 : group === 'B' ? 55 : 70;
    return { x: Math.round((cx + (rand() - 0.5) * 30) * 100) / 100, y: Math.round((50 + (rand() - 0.5) * 60 + (group === 'C' ? 15 : 0)) * 100) / 100, group };
});

const stacked = ['2019', '2020', '2021', '2022', '2023'].flatMap((year) =>
    ['Coal', 'Gas', 'Wind', 'Solar'].map((source, s) => ({ year, source, share: 10 + ((s * 7 + Number(year)) % 13) * 2 })));

interface Case { id: string; title: string; note: string; spec: ChartAssemblyInput }

const CASES: Case[] = [
    {
        id: 'dense-line', title: 'Long line (1,500 days)', note: 'Hover near the line: the tooltip reads the nearest day, and a slim dot marks it. No pan or zoom unless the spec asks.',
        spec: { data: { values: days }, semantic_types: { date: 'Date', value: 'Quantity' }, chart_spec: { chartType: 'Line Chart', title: 'Daily value, 2020–2024', encodings: { x: { field: 'date' }, y: { field: 'value' } } } } as ChartAssemblyInput,
    },
    {
        id: 'multi-line', title: 'Five series, a legend', note: 'Click a legend item to dim its line; click another to dim it too; click again to bring it back; Escape clears.',
        spec: { data: { values: series }, semantic_types: { month: 'YearMonth', region: 'Region', sales: 'Amount' }, chart_spec: { chartType: 'Line Chart', title: 'Monthly sales by region', encodings: { x: { field: 'month' }, y: { field: 'sales' }, color: { field: 'region' } } } } as ChartAssemblyInput,
    },
    {
        id: 'cloud', title: 'Crowded point cloud (4,000 points)', note: 'The tooltip reads the nearest point, with a muted halo; the legend dims a group. No pan or zoom unless the spec asks.',
        spec: { data: { values: cloud }, semantic_types: { x: 'Quantity', y: 'Quantity', group: 'Category' }, chart_spec: { chartType: 'Scatter Plot', title: 'A crowded cloud', encodings: { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'group' } } } } as ChartAssemblyInput,
    },
    {
        id: 'stacked', title: 'Stacked bars, a legend', note: 'The legend dims a source across every bar; a bar reads only under the pointer.',
        spec: { data: { values: stacked }, semantic_types: { year: 'Year', source: 'Category', share: 'Percentage' }, chart_spec: { chartType: 'Stacked Bar Chart', title: 'Generation mix', encodings: { x: { field: 'year' }, y: { field: 'share' }, color: { field: 'source' } } } } as ChartAssemblyInput,
    },
    {
        id: 'asked', title: 'A spec that asks: legend-toggle and brush-x', note: 'What is asked for wins: the legend hides instead of dimming, and the drag brushes.',
        spec: { data: { values: series }, semantic_types: { month: 'YearMonth', region: 'Region', sales: 'Amount' }, chart_spec: { chartType: 'Line Chart', title: 'Monthly sales by region', encodings: { x: { field: 'month' }, y: { field: 'sales' }, color: { field: 'region' } } }, interaction_spec: { interactions: [{ type: 'legend-toggle' }, { type: 'brush-x' }] } } as ChartAssemblyInput,
    },
    {
        id: 'off', title: 'defaults: false', note: 'interaction_spec.defaults: false turns the baseline off: no tooltip, no legend dim.',
        spec: { data: { values: days }, semantic_types: { date: 'Date', value: 'Quantity' }, chart_spec: { chartType: 'Line Chart', title: 'Daily value, 2020–2024', encodings: { x: { field: 'date' }, y: { field: 'value' } } }, interaction_spec: { interactions: [], defaults: false } } as ChartAssemblyInput,
    },
];

export function BaselineLab() {
    return (
        <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
            <header>
                <h1 style={{ margin: '0 0 8px', fontSize: 22 }}>Baseline behaviour</h1>
                <p style={{ maxWidth: 820, lineHeight: 1.5 }}>
                    Every mounted chart has these without an interaction_spec entry, and each gives way to anything the spec
                    asks for: a tooltip that reads the nearest line or point (bars only under the pointer), and a legend
                    click that dims a group (several legends compose). Pan and zoom are never baseline.
                </p>
            </header>
            {CASES.map((item) => (
                <article key={item.id} data-case={item.id} style={{ border: '1px solid #d8dee4', borderRadius: 8, padding: 12 }}>
                    <h2 style={{ margin: '0 0 4px', fontSize: 15 }}>{item.title}</h2>
                    <p style={{ margin: '0 0 8px', color: '#57606a', fontSize: 13 }}>{item.note}</p>
                    <div className="bl-mount" style={{ width: 720 }}>
                        <FlintChart spec={item.spec} renderer="svg" ariaLabel={item.title} />
                    </div>
                </article>
            ))}
        </div>
    );
}
