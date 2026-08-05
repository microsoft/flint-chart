import { useMemo } from 'react';
import { assembleVegaLite } from 'flint-chart';
import { TEST_GENERATORS, type TestCase } from 'flint-chart/test-data';
import { ScaleToFit } from './ScaleToFit';
import { WallChart } from './WallChart';
import { siteTheme } from '../shared/theme';
import { testCaseToAssemblyInput, testCaseToFlintSummary } from '../shared/test-case-utils';

const PAPER = '#ffffff';
const HAIRLINE = 'rgba(0, 0, 0, 0.12)';
export const FIGURE_CANVAS = { width: 720, height: 500 } as const;
const OMITTED = '__omitted__';
const MAX_COMPILED_SPEC_LINES = 38;
const MAX_MOBILE_COMPILED_SPEC_LINES = 24;
type FigureOrientation = 'horizontal' | 'vertical';

/**
 * Static three-panel pipeline figure: compact Flint spec → compiled
 * backend-native (Vega-Lite) spec → rendered chart. Rendered at its designed
 * size; callers can wrap it in {@link ScaleToFit} to fit a narrower column.
 */
export function SpecPipelineFigure({ orientation = 'horizontal' }: { orientation?: FigureOrientation }) {
  const vertical = orientation === 'vertical';
  const testCase = useMemo(() => TEST_GENERATORS['Omni: Heatmap']()[0], []);
  const specText = useMemo(() => {
    const summary = testCaseToFlintSummary(testCase);
    const body = JSON.stringify({ data: '{...}', ...summary }, null, 2);
    return body.replace('"{...}"', '{...}');
  }, [testCase]);
  const compiledSpecText = useMemo(
    () => buildCompiledSpecExcerpt(testCase, vertical ? MAX_MOBILE_COMPILED_SPEC_LINES : MAX_COMPILED_SPEC_LINES),
    [testCase, vertical],
  );

  return (
    <section className={`dev-playground-spec-figure dev-playground-spec-figure--${orientation}`} style={vertical ? verticalFigureStyle : figureStyle}>
      <div style={vertical ? verticalPaneStyle : paneStyle}>
        <div style={vertical ? verticalPaneHeaderStyle : paneHeaderStyle}>
          <span style={vertical ? verticalPaneTitleStyle : paneTitleStyle}>Flint spec</span>
        </div>
        <pre style={vertical ? verticalSpecPreStyle : specPreStyle}>{specText}</pre>
      </div>

      <ArrowColumn orientation={orientation} />

      <div style={vertical ? verticalBorderedPaneStyle : borderedPaneStyle}>
        <div style={vertical ? verticalChartHeaderStyle : chartHeaderStyle}>
          <span style={vertical ? verticalPaneTitleStyle : paneTitleStyle}>Compiled spec <span style={backendLabelStyle}>(Vega-Lite)</span></span>
        </div>
        <pre style={vertical ? verticalCompiledPreStyle : compiledPreStyle}>{compiledSpecText}</pre>
      </div>

      <ArrowColumn orientation={orientation} />

      <div style={vertical ? verticalBorderedVisualPaneStyle : borderedVisualPaneStyle}>
        <div style={vertical ? verticalPaneHeaderStyle : paneHeaderStyle}>
          <span style={vertical ? verticalPaneTitleStyle : paneTitleStyle}>Visualization</span>
        </div>
        <div style={vertical ? verticalChartBodyStyle : chartBodyStyle}>
          <ScaleToFit height={vertical ? 360 : 560} minHeight={vertical ? 260 : 520} padding={0} adaptiveHeight>
            <WallChart testCase={testCase} backend="vegalite" canvasSize={FIGURE_CANVAS} />
          </ScaleToFit>
        </div>
      </div>
    </section>
  );
}

function buildCompiledSpecExcerpt(testCase: TestCase, maxLines: number): string {
  const spec = assembleVegaLite(testCaseToAssemblyInput(testCase, FIGURE_CANVAS));
  const excerpt = {
    data: spec.data ? OMITTED : undefined,
    mark: spec.mark,
    ...(spec.width != null ? { width: spec.width } : {}),
    ...(spec.height != null ? { height: spec.height } : {}),
    encoding: spec.encoding,
    ...(spec.config ? { config: compactConfig(spec.config) } : {}),
  };
  const text = JSON.stringify(excerpt, null, 2).split(`"${OMITTED}"`).join('{...}');
  return cropCompiledSpec(text, maxLines);
}

function cropCompiledSpec(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  const visibleLineCount = maxLines - 1;
  const hiddenLines = lines.slice(visibleLineCount);
  return [
    ...lines.slice(0, visibleLineCount),
    `  ... // ${hiddenLines.length} more lines`,
  ].join('\n');
}

function compactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const compact: Record<string, unknown> = {};
  for (const key of ['view', 'axisX', 'axisY']) {
    if (key in config) compact[key] = config[key];
  }
  return compact;
}

function ArrowColumn({ orientation }: { orientation: FigureOrientation }) {
  return (
    <div style={orientation === 'vertical' ? verticalArrowColumnStyle : arrowColumnStyle} aria-hidden="true">
      <svg width="30" height="20" viewBox="0 0 30 20" fill="none" style={orientation === 'vertical' ? verticalArrowSvgStyle : undefined}>
        <path d="M1 10H27" stroke={siteTheme.accent} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M20 3L27 10L20 17" stroke={siteTheme.accent} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

const figureStyle: React.CSSProperties = {
  width: 1400,
  maxWidth: '100%',
  minHeight: 680,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 34px minmax(0, 1.1fr) 34px minmax(0, 1.55fr)',
  columnGap: 14,
  padding: '0 18px',
  boxSizing: 'border-box',
  overflow: 'hidden',
  border: `1px solid ${HAIRLINE}`,
  borderRadius: siteTheme.radius,
  background: PAPER,
};

const paneStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};

const visualPaneStyle: React.CSSProperties = {
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
};

const borderedPaneStyle: React.CSSProperties = {
  ...paneStyle,
  borderLeft: `1px solid ${HAIRLINE}`,
};

const borderedVisualPaneStyle: React.CSSProperties = {
  ...visualPaneStyle,
  borderLeft: `1px solid ${HAIRLINE}`,
};

const arrowColumnStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: PAPER,
};

const paneHeaderStyle: React.CSSProperties = {
  minHeight: 60,
  display: 'flex',
  alignItems: 'center',
  padding: '0 18px',
  boxSizing: 'border-box',
};

const chartHeaderStyle: React.CSSProperties = {
  ...paneHeaderStyle,
  justifyContent: 'flex-start',
  gap: 8,
};

const paneTitleStyle: React.CSSProperties = {
  fontSize: 18.5,
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: siteTheme.textMuted,
};

const backendLabelStyle: React.CSSProperties = {
  color: siteTheme.accent,
  letterSpacing: '0.02em',
};

const specPreStyle: React.CSSProperties = {
  margin: 0,
  padding: '0 18px 20px',
  fontFamily: siteTheme.fontMono,
  fontSize: 17.8,
  lineHeight: 1.33,
  color: siteTheme.text,
  whiteSpace: 'pre-wrap',
  overflow: 'hidden',
  background: PAPER,
};

const compiledPreStyle: React.CSSProperties = {
  ...specPreStyle,
  fontSize: 13.4,
  lineHeight: 1.18,
};

const chartBodyStyle: React.CSSProperties = {
  flex: 1,
  padding: '2px 6px 18px',
  boxSizing: 'border-box',
  background: PAPER,
};

const verticalFigureStyle: React.CSSProperties = {
  ...figureStyle,
  width: '100%',
  minHeight: 0,
  gridTemplateColumns: 'minmax(0, 1fr)',
  columnGap: 0,
  padding: 0,
};

const verticalPaneStyle: React.CSSProperties = {
  ...paneStyle,
};

const verticalBorderedPaneStyle: React.CSSProperties = {
  ...verticalPaneStyle,
  borderTop: `1px solid ${HAIRLINE}`,
};

const verticalBorderedVisualPaneStyle: React.CSSProperties = {
  ...visualPaneStyle,
  borderTop: `1px solid ${HAIRLINE}`,
};

const verticalArrowColumnStyle: React.CSSProperties = {
  ...arrowColumnStyle,
  minHeight: 44,
};

const verticalArrowSvgStyle: React.CSSProperties = {
  transform: 'rotate(90deg)',
};

const verticalPaneHeaderStyle: React.CSSProperties = {
  ...paneHeaderStyle,
  minHeight: 44,
  padding: '0 12px',
};

const verticalChartHeaderStyle: React.CSSProperties = {
  ...verticalPaneHeaderStyle,
  gap: 6,
};

const verticalPaneTitleStyle: React.CSSProperties = {
  ...paneTitleStyle,
  fontSize: 10.5,
  letterSpacing: '0.07em',
};

const verticalSpecPreStyle: React.CSSProperties = {
  ...specPreStyle,
  padding: '0 12px 14px',
  fontSize: 11.2,
  lineHeight: 1.36,
};

const verticalCompiledPreStyle: React.CSSProperties = {
  ...verticalSpecPreStyle,
  fontSize: 9.8,
  lineHeight: 1.22,
};

const verticalChartBodyStyle: React.CSSProperties = {
  ...chartBodyStyle,
  padding: '0 8px 12px',
};
