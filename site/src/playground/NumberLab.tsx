import { useMemo, useState } from 'react';
import { BACKENDS } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import { ThemePicker } from './ThemePicker';

/**
 * What a printed value *reads* as, across the number shapes a chart runs into.
 *
 * Every tile is the same bar chart with the same eight bands; only the numbers
 * differ. That is the whole point: the format is inferred from the data, so
 * the way to see whether the inference is any good is to hold everything else
 * still and vary the numbers. Each tile prints the d3 pattern Flint chose, so
 * a wrong-looking label can be traced to the decision that produced it rather
 * than guessed at.
 */

type Case = { id: string; values: number[]; unit?: string };

/** Eight bands each — enough to crowd the axis without hiding the numbers. */
const CASES: Case[] = [
    { id: 'counts', values: [3, 17, 42, 8, 25, 11, 36, 6] },
    { id: 'hundreds', values: [120, 340, 275, 410, 95, 388, 210, 460] },
    { id: 'thousands', values: [1234, 5678, 4321, 2468, 8765, 3141, 6072, 1999] },
    { id: 'millions', values: [1234567, 2345678, 987654, 4200000, 3141592, 1750000, 2600000, 890000] },
    { id: 'billions', values: [1.2e9, 3.4e9, 8.8e9, 2.1e9, 5.6e9, 9.9e9, 4.3e9, 7.1e9] },
    { id: 'decimals', values: [3.14159265, 2.71828182, 1.41421356, 4.66920161, 2.23606797, 1.61803398, 3.35988566, 2.50290787] },
    { id: 'sub-one', values: [0.45, 0.82, 0.13, 0.67, 0.29, 0.94, 0.51, 0.38] },
    { id: 'thousandths', values: [0.00123456, 0.0034, 0.0021, 0.0047, 0.0015, 0.0039, 0.0028, 0.0052] },
    { id: 'micro', values: [1e-7, 3.5e-7, 2.2e-7, 4.8e-7, 1.6e-7, 2.9e-7, 3.1e-7, 5.4e-7] },
    { id: 'mixed magnitudes', values: [0.001, 0.05, 3.2, 180, 5000, 42, 0.7, 960] },
    { id: 'signed', values: [-1234.5, -88, 12, 940, -3, 560, -720, 145] },
    { id: 'all negative', values: [-3, -17, -42, -8, -25, -11, -36, -6] },
    { id: 'suffix boundary', values: [999, 1000, 9999, 10000, 10001, 4500, 880, 12500] },
    { id: 'long decimals', values: [1234.5678, 2345.6789, 987.6543, 4210.9876, 3141.5926, 1750.2468, 2600.1357, 890.8642] },
    { id: 'with zeros', values: [0, 17, 0, 8, 25, 0, 36, 6] },
    { id: 'one outlier', values: [4, 7, 3, 9, 5, 8, 6, 250000] },
    { id: 'near-identical', values: [100.1, 100.2, 100.15, 100.05, 100.25, 100.12, 100.18, 100.08] },
    { id: 'percent-ish', values: [12.5, 33.4, 54.1, 8.9, 71.2, 46.8, 25.3, 60.7], unit: '%' },
    { id: 'currency', values: [1250.5, 98000, 4300000, 76500, 512000, 8900, 235000, 1450000], unit: '$' },
    { id: 'huge integers', values: [123456789, 987654321, 456789123, 789123456, 321654987, 654987321, 147258369, 963852741] },
];

const CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

function buildInput(c: Case, themeId: string | undefined, horizontal: boolean, labels: boolean) {
    const field = c.unit === '%' ? 'Share (%)' : c.unit === '$' ? 'Revenue ($)' : 'Value';
    return {
        data: { values: c.values.map((v, i) => ({ Band: CATEGORIES[i], [field]: v })) },
        semantic_types: { Band: 'Category', [field]: 'Quantity' },
        chart_spec: {
            chartType: 'Bar Chart',
            encodings: horizontal ? { y: 'Band', x: field } : { x: 'Band', y: field },
            baseSize: { width: 320, height: 220 },
            chartProperties: { showValueLabels: labels },
        },
        ...(themeId ? { theme_spec: themeId } : {}),
    } as any;
}

function CaseCard({ c, themeId, horizontal, labels }: {
    c: Case; themeId: string | undefined; horizontal: boolean; labels: boolean;
}) {
    const compiled = useMemo(() => {
        try {
            return { ok: true as const, value: BACKENDS.vegalite.assemble(buildInput(c, themeId, horizontal, labels)) };
        } catch (err) {
            return { ok: false as const, err };
        }
    }, [c, themeId, horizontal, labels]);

    const decisions = compiled.ok ? (compiled.value as any)?._theme?.decisions?.dataLabels : undefined;
    // The pattern is the decision under test; without it a wrong-looking
    // label is just a wrong-looking label.
    const pattern = decisions?.format ?? '—';
    const placement = decisions?.placement;

    return (
        <article
            style={{ padding: 8, borderRadius: 10, minWidth: 0, transition: 'background 120ms ease' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = siteTheme.hover)}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
            <ScaleToFit height={200} minHeight={130} adaptiveHeight padding={2}>
                {compiled.ok ? (
                    <VegaLiteView spec={compiled.value} />
                ) : (
                    <pre style={{ color: siteTheme.error, fontSize: 11, whiteSpace: 'pre-wrap', margin: 0 }}>
                        {String((compiled.err as Error)?.message ?? compiled.err)}
                    </pre>
                )}
            </ScaleToFit>
            <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, lineHeight: 1.3, color: siteTheme.text }}>{c.id}</div>
            <div style={{ marginTop: 2, fontSize: 10.5, color: siteTheme.navInactive, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
                {pattern}{placement ? ` · ${placement}` : ''}
            </div>
        </article>
    );
}

const toggleStyle = (on: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    fontSize: 12,
    borderRadius: 6,
    cursor: 'pointer',
    border: `1px solid ${on ? siteTheme.accent : siteTheme.border}`,
    background: on ? siteTheme.accent : 'transparent',
    color: on ? '#fff' : siteTheme.text,
});

export function NumberLab() {
    const [themeId, setThemeId] = useState<string | undefined>(undefined);
    const [horizontal, setHorizontal] = useState(false);
    const [labels, setLabels] = useState(true);

    return (
        <div className="dev-page">
            <header className="dev-page-heading">
                <h1>Number lab <span style={{ fontSize: 14, fontWeight: 400, color: siteTheme.navInactive }}>({CASES.length} × 8 bars)</span></h1>
                <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <ThemePicker themeId={themeId} onTheme={setThemeId} />
                    <button type="button" style={toggleStyle(horizontal)} onClick={() => setHorizontal((v) => !v)}>
                        {horizontal ? 'horizontal' : 'vertical'}
                    </button>
                    <button type="button" style={toggleStyle(labels)} onClick={() => setLabels((v) => !v)}>
                        {labels ? 'labels on' : 'labels off'}
                    </button>
                </div>
            </header>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, width: 'min(100%, 1500px)' }}>
                {CASES.map((c) => (
                    <CaseCard key={c.id} c={c} themeId={themeId} horizontal={horizontal} labels={labels} />
                ))}
            </div>
        </div>
    );
}
