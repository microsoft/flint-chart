/**
 * The compiler-wiring figure from the talk, for the landing page: the four spec parts wired by the Flint compiler
 * into rendering-library specs, with a faint log of the instructions the compiler runs. Only the wires are hand-drawn;
 * boxes and words are plain HTML in the site's style. Laid out in design units (W x H) that scale with the figure.
 */
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { C, stroke } from '../talk/sketch';
import { siteTheme } from '../shared/theme';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

const W = 1440;
const H = 620;
const u = (v: number) => `calc(${v} * 100cqw / ${W})`;
const at = (x: number, y: number, w?: number, h?: number): CSSProperties => ({
  position: 'absolute', left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%`,
  width: w === undefined ? undefined : `${(w / W) * 100}%`, height: h === undefined ? undefined : `${(h / H) * 100}%`,
});

// The grid: a label column on the left; every row spans the same content column to its right.
const LABEL_W = 236;
const CONTENT_X = 266;
const CONTENT_W = W - CONTENT_X;

const PARTS = [
  { id: 'data', color: C.green },
  { id: 'chart', color: C.meaning },
  { id: 'theme', color: C.look },
  { id: 'interaction', color: C.behavior },
] as const;
const CHIP = { y: 8, h: 64, gap: 48, w: (CONTENT_W - 3 * 48) / 4 };
const chipX = (i: number) => CONTENT_X + i * (CHIP.w + CHIP.gap);
const centre = (i: number) => chipX(i) + CHIP.w / 2;
const NOTE_Y = CHIP.y + CHIP.h + 10;
const WIRES_FROM = NOTE_Y + 36;
/** The compiler box under the first two parts; its log under the last two. */
const BOX = { x: CONTENT_X, y: 200, w: 2 * CHIP.w + CHIP.gap, h: 180 };
const LOG_X = chipX(2);
/** Where the threads gather and weave, inside the compiler box's right end. */
const WIRE_X = BOX.x + BOX.w - 96;
const [D, L, T, I, E] = [C.green, C.meaning, C.look, C.behavior, C.ink2];
/**
 * The compiler at work, as a faint, loose log: texture more than text, so it stays untranslated.
 * Most lines join two parts, in their colours, the way the threads cross.
 */
const LOG: [string, string][][] = [
  [[D, 'resolve channel semantics'], [L, ' for each encoding']],
  [[L, 'compute channel budgets'], [D, ' from field cardinality']],
  [[T, 'assign color schemes'], [D, ' by semantic role']],
  [[D, 'infer temporal parsing and order']],
  [[L, 'elastic step budget'], [T, ' within theme spacing']],
  [[I, 'map pointer events'], [D, ' to field values']],
  [[D, 'decide zero baselines'], [L, ' per mark type']],
  [[T, 'place axes and legends'], [L, ' around the plot']],
  [[L, 'stretch dense axes, wrap facets']],
  [[I, 'link emphasis'], [T, ' with theme accents']],
  [[D, 'derive number formats'], [T, ' in theme typography']],
  [[I, 'resolve selections'], [L, ' across linked views']],
  [[E, 'instantiate the backend template']],
  [[E, 'emit native encodings and layout']],
];
const logIndent = (i: number) => ((i * 37) % 6) * 22;
const logFade = (i: number) => 0.45 + ((i * 53) % 5) * 0.08;
/**
 * The libraries, sized and placed like the four parts above. Under each, a faint run of its native spec that fades
 * out: the low-level detail the compiler writes so the Flint spec does not have to.
 */
const BACKENDS = [
  { name: 'Vega-Lite', code: ['{', '  "mark": {"type": "rect", ...},', '  "encoding": {', '    "x": {"timeUnit": "yearmonth", ...', '    "color": {"scale": {"domainMid": ...', '  "params": [{"select": {"type": ...', '  "config": {"axis": {"labelFont": ...'] },
  { name: 'ECharts', code: ['{', '  "xAxis": {"type": "category", ...},', '  "visualMap": {"min": ..., "max": ...', '  "series": [{"type": "heatmap",', '    "emphasis": {"focus": "series", ...', '  "grid": {"left": 64, "top": 48, ...', '  "textStyle": {"fontFamily": ...'] },
  { name: 'Chart.js', code: ['{', '  "type": "bar",', '  "data": {"labels": [...],', '    "datasets": [{"backgroundColor": ...', '  "options": {"scales": {"x": {...', '    "plugins": {"legend": {"position": ...', '    "onClick": ...'] },
  { name: 'Plotly', code: ['{', '  "data": [{"type": "heatmap",', '    "z": [[...]], "colorscale": [...],', '  "layout": {', '    "xaxis": {"tickformat": "%b %Y", ...', '    "margin": {"l": 64, "t": 48, ...', '    "hovermode": "closest", ...'] },
];
const BACKEND_Y = 464;
const CODE_Y = BACKEND_Y + CHIP.h + 10;

function draw(ctx: Ctx, w: number, h: number) {
  const s = Math.min(w / W, h / H);
  const X = (v: number) => v * s, Y = (v: number) => v * s, S = (v: number) => v * s;

  // From each part's note, a few threads run into the box and weave together inside it.
  const top = WIRES_FROM, weaveTop = BOX.y + 24, weaveBottom = BOX.y + BOX.h + 10;
  for (let strand = 0; strand < 3; strand++) {
    PARTS.forEach(({ color }, i) => {
      const points: Pt[] = [];
      const offset = (strand - 1) * 4, lane = (i - 1.5) * 16 + offset, phase = i * 1.7 + strand * 0.8;
      for (let k = 0; k <= 32; k++) {
        const t = k / 32, ease = t * t * (3 - 2 * t);
        points.push([X(centre(i) + offset + (WIRE_X + lane - centre(i) - offset) * ease), Y(top + (weaveTop - top) * t)]);
      }
      for (let k = 1; k <= 144; k++) {
        const t = k / 144, blend = Math.min(1, t * 5);
        const weave = 30 * Math.sin(t * Math.PI * 5 + phase) + 16 * Math.sin(t * Math.PI * 11 - phase) + 8 * Math.sin(t * Math.PI * 17 + strand);
        const x = WIRE_X + lane * (1 - blend) + weave * blend * Math.min(1, (1 - t) * 6);
        const y = weaveTop + t * (weaveBottom - weaveTop) + Math.sin(t * Math.PI) * 7 * Math.sin(t * Math.PI * 9 + phase);
        points.push([X(x), Y(y)]);
      }
      const seed = 1680 + strand * 4 + i;
      stroke(ctx, points, { w: S(4.5), color: C.card, seed, taper: false, wobble: 0.5, alpha: 0.85 });
      stroke(ctx, points, { w: S(2.2), color, seed, taper: false, wobble: 0.5 });
    });
  }

  BACKENDS.forEach((_, i) => {
    const c = centre(i);
    PARTS.forEach(({ color }, source) => {
      const points: Pt[] = [];
      for (let k = 0; k <= 64; k++) {
        const t = k / 64, ease = t * t * (3 - 2 * t);
        const dx = (c - WIRE_X) * 6 * t * (1 - t), length = Math.hypot(dx, 66);
        const weave = (source - 1.5) * 4 * Math.sin(t * Math.PI) * Math.cos(t * Math.PI * 6);
        points.push([X(WIRE_X + (c - WIRE_X) * ease - (66 / length) * weave), Y(weaveBottom + t * (BACKEND_Y - weaveBottom) + (dx / length) * weave)]);
      }
      stroke(ctx, points, { w: S(2.2), color, seed: 1720 + i * 4 + source, taper: false, wobble: 0.3 });
    });
  });
}

const LINE = 'rgba(0, 0, 0, 0.16)';
const box = (x: number, y: number, w: number, h: number, extra: CSSProperties = {}): CSSProperties => ({
  ...at(x, y, w, h), boxSizing: 'border-box', borderRadius: u(12), border: `1px solid ${LINE}`, background: '#fff', ...extra,
});

/** The figure's type scale: headings, names, notes; the log and library code are faint mono texture. */
const HEAD = 28, NAME = 24, NOTE = 20, LOG_SIZE = 11;

const textStyle = (size: number, extra: CSSProperties = {}): CSSProperties => ({
  margin: 0, fontSize: u(size), lineHeight: 1.25, color: siteTheme.text, whiteSpace: 'nowrap', ...extra,
});
/** The left column's row labels, right-aligned and centred on their rows. */
const rowLabel = textStyle(NAME, {
  fontWeight: 600, lineHeight: 1.2, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
});

export function CompilerWiring() {
  const { t } = useTranslation();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const paint = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.max(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      draw(ctx, w, h);
    };
    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  const label = (node: ReactNode, style: CSSProperties) => <div style={style}>{node}</div>;
  return (
    <div role="img" aria-label={t('landing.wiring.alt')}
      style={{ position: 'relative', width: '100%', aspectRatio: `${W} / ${H}`, containerType: 'inline-size', fontFamily: siteTheme.fontSans }}>
      <div aria-hidden="true" style={box(BOX.x, BOX.y, BOX.w, BOX.h, { background: '#f4f3ef', border: '1px solid rgba(0, 0, 0, 0.28)' })} />
      <canvas ref={ref} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      <div aria-hidden="true">
        {label(t('landing.wiring.spec'), { ...at(0, CHIP.y, LABEL_W, CHIP.h), ...rowLabel })}
        {PARTS.map(({ id, color }, i) => (
          <div key={id}>
            {label(t(`landing.wiring.parts.${id}.name`), {
              ...box(chipX(i), CHIP.y, CHIP.w, CHIP.h, { background: `${color}1a`, border: `1.5px solid ${color}` }),
              ...textStyle(NAME, { color, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
            })}
            {i < PARTS.length - 1 && label('+', {
              ...at(chipX(i) + CHIP.w, CHIP.y, CHIP.gap, CHIP.h),
              ...textStyle(NAME, { fontWeight: 600, color: siteTheme.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
            })}
            {label(t(`landing.wiring.parts.${id}.note`), { ...at(chipX(i), NOTE_Y, CHIP.w), ...textStyle(NOTE, { color, textAlign: 'center' }) })}
          </div>
        ))}
        <div style={{ ...at(BOX.x, BOX.y, BOX.w, BOX.h), boxSizing: 'border-box', padding: `0 ${u(40)}`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: u(6) }}>
          <div style={textStyle(HEAD, { fontWeight: 700, letterSpacing: '-0.01em' })}>{t('landing.wiring.compiler')}</div>
          <div style={textStyle(NOTE, { color: siteTheme.textMuted })}>{t('landing.wiring.compilerNote')}</div>
        </div>
        <div style={{ ...at(LOG_X, BOX.y, W - LOG_X, BOX.h), boxSizing: 'border-box', padding: `${u(10)} 0`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          {LOG.map((parts, i) => (
            <div key={i} style={textStyle(LOG_SIZE, {
              fontFamily: siteTheme.fontMono, color: siteTheme.textMuted, lineHeight: 1,
              marginLeft: u(logIndent(i)), opacity: logFade(i),
            })}>› {parts.map(([color, text]) => <span key={text} style={{ color }}>{text}</span>)}</div>
          ))}
        </div>
        {label(t('landing.wiring.backends'), { ...at(0, BACKEND_Y, LABEL_W, CHIP.h), ...rowLabel, whiteSpace: 'normal' })}
        {BACKENDS.map((backend, i) => (
          <div key={backend.name}>
            {label(backend.name, {
              ...box(chipX(i), BACKEND_Y, CHIP.w, CHIP.h, { border: '1.5px solid rgba(0, 0, 0, 0.32)' }),
              ...textStyle(NAME, { fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
            })}
            <pre style={{
              ...at(chipX(i) + 14, CODE_Y, CHIP.w - 14, H - CODE_Y), overflow: 'hidden',
              ...textStyle(LOG_SIZE, { fontFamily: siteTheme.fontMono, color: siteTheme.textMuted, whiteSpace: 'pre', lineHeight: 1.35, opacity: 0.75 }),
              maskImage: 'linear-gradient(to bottom, #000 35%, transparent)', WebkitMaskImage: 'linear-gradient(to bottom, #000 35%, transparent)',
            }}>{backend.code.join('\n')}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
