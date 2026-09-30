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

  return <section className="axis-label-case" id={example.id} aria-label={example.label}>
    <p className="axis-label-source">
      <span aria-hidden="true">&bull; </span>{example.dataNote} Source: <a href={example.sourceUrl} target="_blank" rel="noreferrer">{example.source}</a>.
    </p>
    {!ready && !built.error && <p className="axis-label-source" role="status">Rendering comparison...</p>}
    {built.error ? <p role="alert">{built.error}</p> : <div className="axis-label-comparison axis-label-horizontal axis-label-flow" aria-busy={!ready}>
      {(['before', 'after'] as const).map(side => <Fragment key={side}>
        {side === 'after' && <ArrowRight className="axis-label-flow-arrow" size={24} aria-hidden="true" />}
        <figure data-version={side} aria-label={side === 'before' ? 'Before' : 'After'}>
        <div className="axis-label-chart">
          <ScaleToFit height={ready ? height : 380} adaptiveHeight minHeight={160}>
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
  return <section className="axis-label-compact" id="label-wrapping" aria-labelledby="label-wrapping-heading">
    <h2 id="label-wrapping-heading">Label Wrapping</h2>
    {WRAPPING_EXAMPLES.map(example => <Comparison key={example.id} example={example} />)}
  </section>;
}