import { useMemo, useState, type CSSProperties } from 'react';
import { assembleVegaLite } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import { siteTheme } from '../shared/theme';
import { SMALL_CANVAS_CASES, snapshotName, type Size, type SmallCanvasCase } from './small-canvas-cases';
import './axis-label-lab.css';

/**
 * Small canvases: what the key and header rules change. On a canvas smaller than its house's own
 * size, a colour ramp slims, the header's gaps come in by the share of that room the canvas has, the
 * key's text is never set larger than the axis labels, and a stepped key stands as one bar. At the
 * house's size or more, and with no size asked, nothing should change.
 *
 * "Before" is a snapshot drawn by the code without these rules, saved locally to
 * `site/public/eval/small-canvas-before/`; "after" is drawn live.
 */

const BEFORE = `${import.meta.env.BASE_URL}eval/small-canvas-before/`;

/** What the compiled spec says about the parts these rules touch. */
function readout(spec: any): string[] {
  const text = JSON.stringify(spec);
  const legend = text.match(/"legend":\{"(?:format|title|orient|offset|direction)[^}]*\}/)?.[0] ?? '';
  const ramp = text.match(/"gradientThickness":(\d+)/)?.[1];
  const config = spec.config ?? {};
  const keyed = Boolean(config.legend?.labelFontSize) && /"legend":\{/.test(text);
  return [
    `title gap ${config.title?.offset ?? '–'}`,
    `axis text ${config.axisY?.labelFontSize ?? config.axis?.labelFontSize ?? '–'}`,
    ...(keyed ? [`key text ${config.legend.labelFontSize}`, `ramp ${ramp ?? 16}`, /"titleOrient":"left"/.test(legend) ? 'key title beside' : 'key title above'] : []),
  ];
}

const frame = (size: Size | null): CSSProperties => ({
  border: `1px dashed ${siteTheme.border}`, ...(size ? { width: size.width, minHeight: size.height } : {}), overflow: 'visible', background: '#fff',
});

function Before({ id, size }: { id: string; size: Size | null }) {
  const [missing, setMissing] = useState(false);
  return (
    <div style={frame(size)}>
      {missing
        ? <p style={{ margin: 8, fontSize: 11, color: siteTheme.textMuted }}>No local snapshot.</p>
        : <img src={BEFORE + snapshotName(id, size)} alt="" style={{ display: 'block' }} onError={() => setMissing(true)} />}
    </div>
  );
}

function Pair({ c, size }: { c: SmallCanvasCase; size: Size | null }) {
  const input = useMemo(() => c.input(size), [c, size]);
  const notes = useMemo(() => { try { return readout(assembleVegaLite(input)); } catch { return []; } }, [input]);
  const label = (text: string) => <div style={{ fontSize: 11, color: siteTheme.textMuted, marginBottom: 3 }}>{text}</div>;
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 4, alignContent: 'start' }}>
      <strong style={{ fontSize: 12 }}>{size ? `${size.width}×${size.height}` : 'no size (default)'}</strong>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
        <div>{label('before')}<Before id={c.id} size={size} /></div>
        <div>{label('after')}<div style={frame(size)}><FlintView spec={input} renderer="svg" compact /></div></div>
      </div>
      <figcaption style={{ fontSize: 11, color: siteTheme.textMuted }}>{notes.join(' · ')}</figcaption>
    </figure>
  );
}

export function SmallCanvasLab() {
  return <section className="axis-label-lab" style={{ maxWidth: 1280 }}>
    <header className="axis-label-heading">
      <div>
        <h1>Small canvases: keys and gaps</h1>
        <p>
          Below its house&apos;s own size a chart&apos;s colour ramp slims and its header&apos;s gaps come in, both by the share of
          that room the canvas has; the key&apos;s text is never larger than the axis labels; a stepped key is one bar. Each pair
          shows the code before these rules (a local snapshot) and after (live). At the house&apos;s size, and with no size, the
          two should match.
        </p>
      </div>
    </header>
    {SMALL_CANVAS_CASES.map((c) => (
      <section key={c.id} className="axis-label-case">
        <h2>{c.label}</h2>
        <p style={{ margin: '-6px 0 12px', fontSize: 12, color: siteTheme.textMuted }}>{c.note}</p>
        <div style={{ display: 'grid', gap: 22 }}>
          {c.sizes.map((size) => <Pair key={size ? `${size.width}x${size.height}` : 'default'} c={c} size={size} />)}
        </div>
      </section>
    ))}
  </section>;
}
