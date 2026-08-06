import { useId } from 'react';
import { RefreshCw } from 'lucide-react';
import { siteTheme } from '../shared/theme';

const palette = {
  ink: siteTheme.text,
  secondary: siteTheme.textMuted,
  muted: siteTheme.navInactive,
  controlLine: '#2878a8',
  controlMarker: '#2878a8',
  flow: siteTheme.text,
  artifactSurface: '#f1f1ef',
  compilerSurface: '#f7f7f5',
  roleBorder: siteTheme.textMuted,
  surface: siteTheme.bg,
  panel: siteTheme.accentBg,
} as const;

const swissFontSans = "'Helvetica Neue', Helvetica, 'Inter Variable', Inter, sans-serif";

function Lines({ x, y, lines, className, gap = 22 }: {
  x: number;
  y: number;
  lines: string[];
  className: string;
  gap?: number;
}) {
  return (
    <text x={x} y={y} className={className}>
      {lines.map((line, index) => (
        <tspan key={`${line}-${index}`} x={x} dy={index === 0 ? 0 : gap}>{line}</tspan>
      ))}
    </text>
  );
}

type BoxProps = { x: number; y: number; width: number; height: number };

function ArtifactBox({ x, y, width, height }: BoxProps) {
  return <rect x={x} y={y} width={width} height={height} className="fci-artifact-box" />;
}

function ProcessBox({ x, y, width, height }: BoxProps) {
  return <rect x={x} y={y} width={width} height={height} className="fci-process-box" />;
}

function BackendSheet({ x, y, title }: { x: number; y: number; title: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ArtifactBox x={0} y={0} width={135} height={64} />
      <text x="16" y="39" className="fci-artifact-text fci-type-body">{title}</text>
    </g>
  );
}

export function CompilationProcessIllustration() {
  const uid = useId().replace(/:/g, '');
  const flowArrow = `${uid}-flow-arrow`;
  const controlArrow = `${uid}-control-arrow`;

  return (
    <figure className="fci-figure">
      <style>{styles}</style>
      <div className="fci-stage">
        <svg viewBox="0 0 1500 690" role="img" aria-labelledby={`${uid}-title`} preserveAspectRatio="xMidYMid meet">
          <title id={`${uid}-title`}>ThemeSpec controls the Flint compilation process</title>
          <defs>
            <marker id={flowArrow} viewBox="0 0 8 10" refX="7" refY="5" markerWidth="8" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M1 1L7 5L1 9" fill="none" stroke={palette.flow} strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
            </marker>
            <marker id={controlArrow} viewBox="0 0 8 10" refX="7" refY="5" markerWidth="8" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto">
              <path d="M1 1L7 5L1 9" fill="none" stroke={palette.controlMarker} strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" />
            </marker>
          </defs>

          <rect x="50" y="64" width="218" height="74" className="fci-theme-box" />
          <text x="68" y="110" className="fci-theme-title fci-type-title">ThemeSpec</text>

          <path d="M268 101H1308" className="fci-control-bus" />
          {[467, 755, 1074].map((x) => (
            <rect key={x} x={x - 2.5} y="98.5" width="5" height="5" className="fci-control-junction" />
          ))}
          <Lines x={467} y={55} lines={['resolved', 'semantics information']} className="fci-control-heading fci-type-label" gap={24} />
          <Lines x={755} y={55} lines={['layout constraints', '& dynamics']} className="fci-control-heading fci-type-label" gap={24} />
          <Lines x={1074} y={55} lines={['visual', 'preferences']} className="fci-control-heading fci-type-label" gap={24} />
          <Lines x={1308} y={55} lines={['design', 'fixtures']} className="fci-control-heading fci-type-label" gap={24} />

          <rect x="328" y="182" width="858" height="430" className="fci-boundary" />
          <text x="344" y="207" className="fci-boundary-label fci-type-kicker">compiler</text>

          <text x="88" y="295" className="fci-ink-text fci-type-title">Raw data</text>
          <path d="M208 286H411V386" className="fci-flow" markerEnd={`url(#${flowArrow})`} />

          <ArtifactBox x={34} y={379} width={244} height={166} />
          <text x="52" y="418" className="fci-artifact-text fci-type-title">FlintSpec</text>
          <Lines x={52} y={456} lines={['Data semantic types', 'Chart type, visual encoding', 'Chart options']} className="fci-muted-text fci-type-detail" gap={25} />
          <path d="M278 462H354" className="fci-flow" markerEnd={`url(#${flowArrow})`} />

          <ProcessBox x={354} y={386} width={170} height={152} />
          <Lines x={439} y={451} lines={['Compiler', 'Frontend']} className="fci-process-title fci-type-process" gap={31} />

          <path d="M524 462H577" className="fci-flow" markerEnd={`url(#${flowArrow})`} />
          <ArtifactBox x={577} y={365} width={353} height={194} />
          <Lines x={601} y={424} lines={['Library-agnostic', 'chart properties']} className="fci-artifact-text fci-type-title" gap={31} />
          <Lines x={601} y={497} lines={['data parser, mark, axis, scale,', 'format, canvas...']} className="fci-muted-text fci-type-detail" gap={24} />

          <ProcessBox x={585} y={207} width={340} height={73} />
          <text x="755" y="255" textAnchor="middle" className="fci-process-title fci-type-process">Optimizer</text>
          <RefreshCw x={729} y={300} width={52} height={52} strokeWidth={1.75} className="fci-rotate-icon" aria-label="Iterative optimization" />

          <path d="M930 462H989" className="fci-flow" markerEnd={`url(#${flowArrow})`} />
          <ProcessBox x={989} y={386} width={170} height={152} />
          <Lines x={1074} y={451} lines={['Code', 'Generator']} className="fci-process-title fci-type-process" gap={31} />
          <path d="M1159 462H1240" className="fci-flow" markerEnd={`url(#${flowArrow})`} />

          <path d="M467 386V101" className="fci-control-tap" markerEnd={`url(#${controlArrow})`} />
          <Lines x={491} y={126} lines={['series role = ordinal', 'color measure midpoint = 32']} className="fci-control-note fci-type-note" gap={22} />
          <path d="M755 101V207" className="fci-control-tap" markerEnd={`url(#${controlArrow})`} />
          <Lines x={779} y={126} lines={['stretch cap β = 1.5×', 'density padding = 20 px', 'band step = 80 px']} className="fci-control-note fci-type-note" gap={22} />
          <path d="M1074 101V386" className="fci-control-tap" markerEnd={`url(#${controlArrow})`} />
          <Lines x={1098} y={126} lines={['value labels → shown (if fit)', 'legend title → omitted', '(if self-explanatory)']} className="fci-control-note fci-type-note" gap={22} />
          <path d="M1308 101V324" className="fci-control-tap" markerEnd={`url(#${controlArrow})`} />
          <Lines x={1332} y={126} lines={['canvas ink = #1b1a19', 'min type size = 8 px', 'grid weight = 1 px']} className="fci-control-note fci-type-note" gap={22} />

          <BackendSheet x={1240} y={343} title="Vega-Lite" />
          <BackendSheet x={1240} y={430} title="Chart.js" />
          <BackendSheet x={1240} y={517} title="ECharts" />
          <text x="1307" y="606" textAnchor="middle" className="fci-muted-text fci-type-title">...</text>
        </svg>
      </div>
      <figcaption className="fci-caption">
        A ThemeSpec in Flint is a formal specification that shapes compilation across three stages so every generated chart adheres to a coherent design system. Using resolved semantic information, it governs layout constraints and dynamics, conditionally resolves visual preferences, and supplies design fixtures for backend-specific code generation.
      </figcaption>
    </figure>
  );
}

const styles = `
  .fci-figure { width: min(100%, 1400px); margin: 0; color: ${palette.ink}; }
  .fci-stage { width: 100%; overflow-x: auto; background: #fff; }
  .fci-caption { max-width: 1060px; margin: 18px 0 0; color: ${palette.secondary}; font-family: ${swissFontSans}; font-size: 15px; font-weight: 400; line-height: 1.55; }
  .fci-stage svg { display: block; width: 100%; min-width: 980px; height: auto; font-family: ${swissFontSans}; }
  .fci-type-kicker { font-size: 12px; font-weight: 700; text-transform: uppercase; }
  .fci-type-label { font-size: 14px; font-weight: 700; text-transform: uppercase; }
  .fci-type-title { font-size: 22px; font-weight: 600; }
  .fci-type-process { font-size: 25px; font-weight: 500; }
  .fci-type-body { font-size: 19px; font-weight: 500; }
  .fci-type-detail { font-size: 16px; font-weight: 400; }
  .fci-type-note { font-size: 13px; font-weight: 400; }
  .fci-ink-text, .fci-artifact-text, .fci-process-title { fill: ${palette.ink}; }
  .fci-muted-text { fill: ${palette.secondary}; }
  .fci-theme-box { fill: ${palette.controlLine}; stroke: ${palette.controlLine}; stroke-width: 1.5; }
  .fci-theme-title { fill: #fff; }
  .fci-control-bus, .fci-control-tap { fill: none; stroke: ${palette.controlLine}; stroke-linecap: square; stroke-linejoin: miter; }
  .fci-control-bus { stroke-width: 2.25; }
  .fci-control-tap { stroke-width: 2.25; }
  .fci-control-junction { fill: ${palette.controlLine}; }
  .fci-control-heading { fill: ${palette.controlLine}; text-anchor: middle; }
  .fci-control-note { fill: ${palette.controlLine}; text-anchor: start; }
  .fci-boundary { fill: ${palette.compilerSurface}; stroke: none; }
  .fci-boundary-label { fill: ${palette.secondary}; }
  .fci-flow { fill: none; stroke: ${palette.flow}; stroke-width: 2.25; stroke-linecap: square; stroke-linejoin: miter; }
  .fci-artifact-box { fill: ${palette.artifactSurface}; stroke: ${palette.ink}; stroke-width: 1.5; }
  .fci-process-box { fill: #fff; stroke: ${palette.ink}; stroke-width: 1.5; }
  .fci-process-title { text-anchor: middle; }
  .fci-rotate-icon { color: ${palette.secondary}; }
  @media (max-width: 720px) {
    .fci-stage svg { min-width: 980px; }
  }
`;
