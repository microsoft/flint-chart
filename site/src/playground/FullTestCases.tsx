import { useMemo, useState } from 'react';
import { TEST_GENERATORS, type TestCase } from 'flint-chart/test-data';
import { WallChart } from '../components/WallChart';
import { ScaleToFit } from '../components/ScaleToFit';
import { BACKENDS, type PreviewBackend } from '../shared/supported-backends';
import { siteTheme } from '../shared/theme';

/** First backend (in preference order) that has a template for this chart type. */
const BACKEND_ORDER: PreviewBackend[] = ['vegalite', 'echarts', 'plotly', 'chartjs'];
function pickAnyBackend(chartType: string): PreviewBackend {
    for (const b of BACKEND_ORDER) {
        if (BACKENDS[b].getTemplateDef(chartType)) return b;
    }
    return 'vegalite';
}

function safeCases(gen: () => TestCase[]): TestCase[] {
    try {
        return gen();
    } catch {
        return [];
    }
}

function TestCaseCard({ tc }: { tc: TestCase }) {
    const backend = pickAnyBackend(tc.chartType);
    return (
        <article
            title={tc.description || tc.title}
            style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
            <ScaleToFit height={150} minHeight={96} adaptiveHeight padding={2}>
                <WallChart testCase={tc} backend={backend} canvasSize={{ width: 280, height: 180 }} />
            </ScaleToFit>
            <div style={{ marginTop: 6, fontSize: 11.5, fontWeight: 600, lineHeight: 1.3, color: siteTheme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {tc.title}
            </div>
            <div style={{ marginTop: 2, fontSize: 10, color: siteTheme.navInactive }}>
                {tc.chartType} · {backend} · {tc.data.length} rows
            </div>
        </article>
    );
}

/** One generator's cases, rendered lazily (only when the section is expanded). */
function GeneratorSection({ name, gen }: { name: string; gen: () => TestCase[] }) {
    const [open, setOpen] = useState(false);
    const cases = useMemo(() => (open ? safeCases(gen) : []), [open, gen]);

    return (
        <section style={{ width: 'min(100%, 1500px)', margin: '4px 0' }}>
            <button
                onClick={() => setOpen((o) => !o)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '8px 4px', background: 'transparent', border: 'none',
                    borderBottom: `1px solid ${siteTheme.border}`, cursor: 'pointer',
                    font: 'inherit', color: siteTheme.text, textAlign: 'left',
                }}
            >
                <span style={{ color: siteTheme.navInactive, fontSize: 12, width: 12 }}>{open ? '▾' : '▸'}</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{name}</span>
                {open && <span style={{ fontSize: 12, fontWeight: 400, color: siteTheme.navInactive }}>· {cases.length} cases</span>}
            </button>
            {open && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, margin: '12px 0 8px' }}>
                    {cases.map((tc, i) => (
                        <TestCaseCard key={`${name}-${i}`} tc={tc} />
                    ))}
                </div>
            )}
        </section>
    );
}

export function FullTestCases() {
    const names = useMemo(() => Object.keys(TEST_GENERATORS).sort((a, b) => a.localeCompare(b)), []);

    return (
        <div className="dev-page">
            <header className="dev-page-heading">
                <h1>Full test cases <span style={{ fontSize: 14, fontWeight: 400, color: siteTheme.navInactive }}>({names.length} generators)</span></h1>
                <p style={{ color: siteTheme.textMuted, maxWidth: 760, fontSize: 13 }}>
                    Every case from every test-data generator — the complete reference set used for
                    regression and new-backend bring-up. Expand a generator to render its cases (on
                    the first backend that supports each chart type). Heavy, so sections render lazily.
                </p>
            </header>
            {names.map((name) => (
                <GeneratorSection key={name} name={name} gen={TEST_GENERATORS[name]} />
            ))}
        </div>
    );
}
