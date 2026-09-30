import { Fragment, useCallback, useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ScaleToFit } from '../components/ScaleToFit';
import { VegaLiteView } from '../components/VegaLiteView';
import { BACKENDS } from '../shared/supported-backends';
import { WRAPPING_EXAMPLES, type WrappingExample } from './wrapping-showcase-data';
import baseline from './wrapping-showcase-baseline.json';
import './axis-label-lab.css';

const snapshots = baseline.cases as Record<string, { input: unknown; spec: unknown }>;
type Dimensions = { width: number; height: number };

function Comparison({ example }: { example: WrappingExample }) {
  const [visibleSide, setVisibleSide] = useState<'before' | 'after'>('after');
  const [sizes, setSizes] = useState<Partial<Record<'before' | 'after', Dimensions>>>({});
  const before = snapshots[example.id];
  const built = useMemo(() => {
    try {
      if (JSON.stringify(before.input) !== JSON.stringify(example.input)) throw new Error('The baseline does not match this input.');
      return { spec: BACKENDS.vegalite.assemble(structuredClone(example.input)), error: '' };
    } catch (error) { return { spec: null, error: String(error) }; }
  }, [before, example]);
  const bindBefore = useCallback((svg: SVGSVGElement) => {
    setSizes(previous => ({ ...previous, before: { width: Number(svg.getAttribute('width')), height: Number(svg.getAttribute('height')) } }));
  }, []);
  const bindAfter = useCallback((svg: SVGSVGElement) => {
    setSizes(previous => ({ ...previous, after: { width: Number(svg.getAttribute('width')), height: Number(svg.getAttribute('height')) } }));
  }, []);
  const ready = Boolean(sizes.before && sizes.after && !built.error);
  const width = Math.max(sizes.before?.width ?? 0, sizes.after?.width ?? 0, 1);
  const height = Math.max(sizes.before?.height ?? 0, sizes.after?.height ?? 0, 1);

  return <section className="axis-label-case wrapping-comparison" id={example.id} aria-label={example.label} data-side={visibleSide}>
    <div className="wrapping-side-toggle" role="group" aria-label="Comparison version">
      {(['before', 'after'] as const).map(side => <button key={side} type="button" aria-pressed={visibleSide === side} onClick={() => setVisibleSide(side)}>{side === 'before' ? 'Before' : 'After'}</button>)}
    </div>
    {!ready && !built.error && <div className="accessibility-loading wrapping-loading" role="status" aria-label="Loading comparison"><span /></div>}
    {built.error ? <p role="alert">{built.error}</p> : <div className="axis-label-comparison axis-label-horizontal axis-label-flow" aria-busy={!ready}>
      {(['before', 'after'] as const).map(side => <Fragment key={side}>
        {side === 'after' && <ArrowRight className="axis-label-flow-arrow" size={24} aria-hidden="true" />}
        <figure data-version={side} aria-label={side === 'before' ? 'Before' : 'After'}>
        <div className="axis-label-chart">
          <ScaleToFit height={360}>
            <div style={{ width: ready ? width : 'max-content', height: ready ? height : 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', visibility: ready ? 'visible' : 'hidden' }}>
              <VegaLiteView spec={side === 'before' ? before.spec : built.spec} renderer="svg" onReady={side === 'before' ? bindBefore : bindAfter} />
            </div>
          </ScaleToFit>
        </div>
        </figure>
      </Fragment>)}
    </div>}
  </section>;
}

export function WrappingShowcase() {
  const [selected, setSelected] = useState(0);
  const example = WRAPPING_EXAMPLES[selected];

  return <section className="axis-label-compact wrapping-showcase" id="label-wrapping" aria-labelledby="label-wrapping-heading" tabIndex={-1}>
    <header className="release-demo-heading">
      <h2 id="label-wrapping-heading">Label Wrapping</h2>
    </header>
    <div className="wrapping-tabs" role="tablist" aria-label="Wrapping examples">
      {WRAPPING_EXAMPLES.map((item, exampleIndex) => <button key={item.id} type="button" role="tab" id={`wrapping-tab-${item.id}`} aria-controls="wrapping-panel" aria-selected={selected === exampleIndex} tabIndex={selected === exampleIndex ? 0 : -1}
        onClick={() => setSelected(exampleIndex)}
        onKeyDown={event => {
          const next = event.key === 'ArrowRight' ? (exampleIndex + 1) % WRAPPING_EXAMPLES.length
            : event.key === 'ArrowLeft' ? (exampleIndex + WRAPPING_EXAMPLES.length - 1) % WRAPPING_EXAMPLES.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? WRAPPING_EXAMPLES.length - 1 : undefined;
          if (next === undefined) return;
          event.preventDefault();
          setSelected(next);
          document.getElementById(`wrapping-tab-${WRAPPING_EXAMPLES[next].id}`)?.focus();
        }}>{item.label}</button>)}
    </div>
    <div id="wrapping-panel" role="tabpanel" aria-labelledby={`wrapping-tab-${example.id}`} tabIndex={0}>
      <Comparison key={example.id} example={example} />
    </div>
  </section>;
}