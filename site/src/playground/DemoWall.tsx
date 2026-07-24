import { useMemo } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { PlotlyView } from '../components/PlotlyView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { PREVIEW_CASES, type PreviewCase } from './new-case-preview-data';

/** VL if it has a template for the chart type, else fall back to Plotly. */
function pickBackend(chartType: string): 'vegalite' | 'plotly' {
    return BACKENDS.vegalite.getTemplateDef(chartType) ? 'vegalite' : 'plotly';
}

function buildInput(c: PreviewCase) {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            encodings: c.encodings,
            baseSize: { width: 300, height: 200 },
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
    } as any;
}

// Coarse families so related cases cluster for review.
const FAMILY_ORDER = [
    'Points & correlation',
    'Distributions',
    'Bars & ranking',
    'Time & trends',
    'Parts & radial',
    'Single value & schedule',
    'Maps & matrices',
] as const;

const FAMILY_OF: Record<string, (typeof FAMILY_ORDER)[number]> = {
    'Scatter Plot': 'Points & correlation',
    'Connected Scatter Plot': 'Points & correlation',
    'Regression': 'Points & correlation',
    'Ranged Dot Plot': 'Points & correlation',
    'Strip Plot': 'Points & correlation',
    'Histogram': 'Distributions',
    'Density Plot': 'Distributions',
    'Boxplot': 'Distributions',
    'Violin Plot': 'Distributions',
    'ECDF Plot': 'Distributions',
    'Bar Chart': 'Bars & ranking',
    'Grouped Bar Chart': 'Bars & ranking',
    'Stacked Bar Chart': 'Bars & ranking',
    'Lollipop Chart': 'Bars & ranking',
    'Pyramid Chart': 'Bars & ranking',
    'Bar Table': 'Bars & ranking',
    'Line Chart': 'Time & trends',
    'Area Chart': 'Time & trends',
    'Streamgraph': 'Time & trends',
    'Slope Chart': 'Time & trends',
    'Range Area Chart': 'Time & trends',
    'Bump Chart': 'Time & trends',
    'Sparkline': 'Time & trends',
    'Candlestick Chart': 'Time & trends',
    'Pie Chart': 'Parts & radial',
    'Donut Chart': 'Parts & radial',
    'Rose Chart': 'Parts & radial',
    'Radar Chart': 'Parts & radial',
    'Funnel Chart': 'Parts & radial',
    'Waterfall Chart': 'Parts & radial',
    'KPI Card': 'Single value & schedule',
    'Gauge Chart': 'Single value & schedule',
    'Bullet Chart': 'Single value & schedule',
    'Gantt Chart': 'Single value & schedule',
    'Map': 'Maps & matrices',
    'Choropleth': 'Maps & matrices',
    'Heatmap': 'Maps & matrices',
};

const familyOf = (chartType: string) => FAMILY_OF[chartType] ?? 'Points & correlation';

function CaseCard({ c }: { c: PreviewCase }) {
    const backend = pickBackend(c.chartType);
    const compiled = useMemo(() => {
        try {
            return { ok: true as const, value: BACKENDS[backend].assemble(buildInput(c)) };
        } catch (err) {
            return { ok: false as const, err };
        }
    }, [c, backend]);

    return (
        <article
            title={`${c.blurb}\n${c.source} · ${c.license} · ${c.data.length} rows`}
            style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
            <ScaleToFit height={168} minHeight={110} adaptiveHeight padding={2}>
                {compiled.ok ? (
                    backend === 'vegalite'
                        ? <VegaLiteView spec={compiled.value} />
                        : <PlotlyView figure={compiled.value} constrain={false} />
                ) : (
                    <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
                        {String((compiled.err as Error)?.message ?? compiled.err)}
                    </pre>
                )}
            </ScaleToFit>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: siteTheme.text }}>{c.title}</div>
            <div style={{ marginTop: 2, fontSize: 10.5, color: siteTheme.navInactive, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.chartType}{backend === 'plotly' ? ' · plotly' : ''} · {c.source}
            </div>
        </article>
    );
}

export function DemoWall() {
    const groups = useMemo(() => {
        const byFamily = new Map<string, { c: PreviewCase; index: number }[]>();
        PREVIEW_CASES.forEach((c, index) => {
            const fam = familyOf(c.chartType);
            if (!byFamily.has(fam)) byFamily.set(fam, []);
            byFamily.get(fam)!.push({ c, index });
        });
        return FAMILY_ORDER
            .map((fam) => ({ fam, items: byFamily.get(fam) ?? [] }))
            .filter((g) => g.items.length > 0);
    }, []);

    return (
        <div className="dev-page">
            <header className="dev-page-heading">
                <h1>Demo wall <span style={{ fontSize: 14, fontWeight: 400, color: siteTheme.navInactive }}>({PREVIEW_CASES.length} candidates)</span></h1>
                <p style={{ color: siteTheme.textMuted, maxWidth: 760, fontSize: 13 }}>
                    Candidate real-world datasets, grouped by family. Rendered with Vega-Lite by
                    default, Plotly where the chart type isn't in Vega-Lite. Hover a tile for its
                    source, license and row count.
                </p>
            </header>
            {groups.map(({ fam, items }) => (
                <section key={fam} style={{ margin: '18px 0 6px', width: 'min(100%, 1500px)' }}>
                    <h2 style={{ fontSize: 15, margin: '0 0 10px', paddingBottom: 6, borderBottom: `1px solid ${siteTheme.border}`, color: siteTheme.text }}>
                        {fam} <span style={{ fontSize: 12, fontWeight: 400, color: siteTheme.navInactive }}>· {items.length}</span>
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 10 }}>
                        {items.map(({ c }) => (
                            <CaseCard key={c.id} c={c} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}
