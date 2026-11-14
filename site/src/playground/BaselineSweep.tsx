import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlintChart } from 'flint-chart/react';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { selectVariants } from '../shared/wall-variants';
import { testCaseToAssemblyInput, thumbnailCanvasSize } from '../shared/test-case-utils';
import { getSupportedBackends } from '../shared/supported-backends';

// A test target for the baseline (nearest-mark tooltip, legend dim): the gallery's variants of one
// chart type at a time, drawn as SVG so a script can read plot frames, legends and mark opacity.

// Only what Vega-Lite draws: the baseline lives in the Vega-Lite mount (Density Contour, say, is Plotly-only).
// A group is kept when any of its cases is a chart type Vega-Lite has a template for.
const drawsInVegaLite = (testCase: { chartType: string }): boolean => getSupportedBackends(testCase.chartType).includes('vegalite');
const TYPES = Object.keys(TEST_GENERATORS).filter((type) => TEST_GENERATORS[type]().some(drawsInVegaLite));

export function BaselineSweep() {
    const [params, setParams] = useSearchParams();
    const index = Math.min(Math.max(Number(params.get('type') ?? 0) || 0, 0), TYPES.length - 1);
    // `?inspect=1` asks every case for `inspect-index`, to check the inspect presets the same way.
    const inspect = params.get('inspect') === '1';
    const chartType = TYPES[index] ?? TYPES[0];
    const cases = useMemo(() => selectVariants(TEST_GENERATORS[chartType]().filter(drawsInVegaLite)), [chartType]);

    const go = (next: { type?: number; inspect?: boolean }): void => {
        const type = next.type ?? index;
        const withInspect = next.inspect ?? inspect;
        setParams(withInspect ? { type: String(type), inspect: '1' } : { type: String(type) });
        window.scrollTo(0, 0);
    };

    useEffect(() => {
        (window as any).__sweepTypes = TYPES;
    }, []);

    return (
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: '#fff', padding: '8px 0', borderBottom: '1px solid #d8dee4', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', fontSize: 13 }}>
                <h1 style={{ fontSize: 18, margin: 0 }} data-sweep-type={chartType}>Baseline sweep</h1>
                <button type="button" disabled={index === 0} onClick={() => go({ type: index - 1 })}>←</button>
                <select value={index} onChange={(event) => go({ type: Number(event.target.value) })} aria-label="Chart type">
                    {TYPES.map((type, i) => <option key={type} value={i}>{i}: {type}</option>)}
                </select>
                <button type="button" disabled={index === TYPES.length - 1} onClick={() => go({ type: index + 1 })}>→</button>
                <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                    <input type="checkbox" checked={inspect} onChange={(event) => go({ inspect: event.target.checked })} />
                    Ask for inspect-index
                </label>
                <span style={{ color: '#57606a' }}>{cases.length} variant{cases.length === 1 ? '' : 's'}</span>
            </div>
            {cases.map((testCase, i) => (
                <section key={`${chartType}-${i}`} data-sweep-case={i} data-sweep-title={testCase.title} style={{ width: 'fit-content' }}>
                    <div style={{ fontSize: 12, color: '#57606a', marginBottom: 4 }}>{testCase.title}</div>
                    <FlintChart spec={{ ...testCaseToAssemblyInput(testCase, thumbnailCanvasSize(testCase)), ...(inspect ? { interaction_spec: { interactions: [{ type: 'inspect-index' }] } } : {}) } as any} renderer="svg" ariaLabel={testCase.title} />
                </section>
            ))}
        </div>
    );
}
