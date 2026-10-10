import { useMemo } from 'react';
import stringify from 'json-stringify-pretty-compact';
import { assembleVegaLite } from 'flint-chart';
import { buildMetadata, makeEncodingItem, makeField, type TestCase } from 'flint-chart/test-data';
import { CodeBlock } from './CodeBlock';
import { ScaleToFit } from './ScaleToFit';
import { WallChart } from './WallChart';
import { siteTheme } from '../shared/theme';
import { testCaseToAssemblyInput, testCaseToFlintSummary, withHouse } from '../shared/test-case-utils';

const PAPER = '#ffffff';
const HAIRLINE = 'rgba(0, 0, 0, 0.12)';
export const FIGURE_CANVAS = { width: 720, height: 500 } as const;
const OMITTED = '__omitted__';
const MAX_COMPILED_SPEC_LINES = 38;
const MAX_MOBILE_COMPILED_SPEC_LINES = 24;
type FigureOrientation = 'horizontal' | 'vertical';
const THEME = 'nyt';

const HOVER_ROW = { interactions: [{ type: 'hover-group-focus', options: { groupBy: 'City' } }] } as const;
// Hand-indented so the interaction reads in a few lines; it is the same object as HOVER_ROW.
const HOVER_ROW_TEXT = `  "interaction_spec": {
    "interactions": [{
      "type": "hover-group-focus",
      "options": {
        "groupBy": "City"
      }
    }]
  }`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Monthly mean temperature (°C), rounded 1991–2020 climate normals; north to south, so the seasons flip at the equator.
const CLIMATE_NORMALS: Record<string, number[]> = {
  'Reykjavík': [-1, 0, 0, 3, 6, 9, 11, 10, 8, 4, 1, 0],
  Moscow: [-6, -6, -1, 7, 13, 17, 19, 17, 11, 6, 0, -4],
  London: [5, 5, 8, 10, 13, 16, 19, 18, 16, 12, 8, 6],
  'New York': [1, 2, 6, 12, 17, 22, 25, 25, 21, 15, 9, 4],
  Beijing: [-3, 0, 7, 15, 21, 25, 27, 26, 21, 14, 5, -1],
  Cairo: [14, 15, 18, 22, 26, 28, 29, 29, 27, 24, 20, 16],
  Mumbai: [24, 25, 27, 29, 30, 29, 28, 27, 28, 29, 28, 26],
  Singapore: [27, 27, 28, 28, 28, 28, 28, 28, 28, 28, 27, 26],
  Nairobi: [19, 20, 21, 20, 19, 17, 16, 17, 18, 20, 19, 19],
  'São Paulo': [23, 23, 22, 21, 18, 17, 17, 18, 19, 20, 21, 22],
  Sydney: [23, 23, 22, 19, 16, 14, 13, 14, 16, 18, 20, 22],
  'Cape Town': [22, 22, 21, 18, 16, 14, 13, 14, 15, 17, 19, 21],
};

function climateNormals(): TestCase {
  const data = Object.entries(CLIMATE_NORMALS).flatMap(([City, temps]) =>
    temps.map((Temperature, index) => ({ Month: MONTHS[index], City, Temperature })));
  const metadata = buildMetadata(data);
  metadata.Month.semanticType = 'Month';
  metadata.City.semanticType = 'City';
  metadata.Temperature.semanticType = 'Temperature';
  return {
    title: 'Monthly mean temperature by city',
    description: '',
    tags: [],
    chartType: 'Heatmap',
    data,
    fields: [makeField('Month'), makeField('City'), makeField('Temperature')],
    metadata,
    encodingMap: {
      x: makeEncodingItem('Month'),
      y: makeEncodingItem('City'),
      color: makeEncodingItem('Temperature'),
    },
    interactionSpec: HOVER_ROW,
  };
}

/**
 * Static three-panel pipeline figure: compact Flint spec → compiled
 * backend-native (Vega-Lite) spec → rendered chart. Rendered at its designed
 * size; callers can wrap it in {@link ScaleToFit} to fit a narrower column.
 */
export function SpecPipelineFigure({ orientation = 'horizontal' }: { orientation?: FigureOrientation }) {
  const vertical = orientation === 'vertical';
  const testCase = useMemo<TestCase>(() => climateNormals(), []);
  const specText = useMemo(() => {
    const summary = testCaseToFlintSummary(testCase);
    const body = JSON.stringify({ data: '{...}', ...summary }, null, 2);
    return body.replace('"{...}"', '{...}')
      .replace(/\n}$/, `,\n  "theme_spec": "${THEME}",\n${HOVER_ROW_TEXT}\n}`);
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
        <CodeBlock language="json" variant="light" wrapLongLines customStyle={vertical ? verticalSpecPreStyle : specPreStyle}>{specText}</CodeBlock>
      </div>

      <ArrowColumn orientation={orientation} />

      <div style={vertical ? verticalBorderedPaneStyle : borderedPaneStyle}>
        <div style={vertical ? verticalChartHeaderStyle : chartHeaderStyle}>
          <span style={vertical ? verticalPaneTitleStyle : paneTitleStyle}>Compiled spec <span style={backendLabelStyle}>(Vega-Lite)</span></span>
        </div>
        <CodeBlock language="json" variant="light" wrapLongLines customStyle={vertical ? verticalCompiledPreStyle : compiledPreStyle}>{compiledSpecText}</CodeBlock>
      </div>

      <ArrowColumn orientation={orientation} />

      <div style={vertical ? verticalBorderedVisualPaneStyle : borderedVisualPaneStyle}>
        <div style={vertical ? verticalPaneHeaderStyle : paneHeaderStyle}>
          <span style={vertical ? verticalPaneTitleStyle : paneTitleStyle}>Visualization</span>
        </div>
        <div style={vertical ? verticalChartBodyStyle : chartBodyStyle}>
          {/* The theme sizes the chart below the pane, so let it grow to fill the column. */}
          <ScaleToFit height={vertical ? 360 : 560} minHeight={vertical ? 260 : 520} padding={0} adaptiveHeight maxScale={2}>
            <WallChart testCase={testCase} backend="vegalite" canvasSize={FIGURE_CANVAS} themeId={THEME} />
          </ScaleToFit>
        </div>
      </div>
    </section>
  );
}

function buildCompiledSpecExcerpt(testCase: TestCase, maxLines: number): string {
  const spec = assembleVegaLite(withHouse(testCaseToAssemblyInput(testCase, FIGURE_CANVAS), THEME));
  const excerpt = {
    data: spec.data ? OMITTED : undefined,
    mark: spec.mark,
    ...(spec.width != null ? { width: spec.width } : {}),
    ...(spec.height != null ? { height: spec.height } : {}),
    encoding: spec.encoding,
    ...(spec.config ? { config: compactConfig(spec.config) } : {}),
  };
  const text = condensedJson(excerpt, 36).split(`"${OMITTED}"`).join('{...}');
  return cropCompiledSpec(text, maxLines);
}

/** Short objects stay on one line, and value lists (a sort order) pack into a few lines. */
function condensedJson(value: unknown, width: number): string {
  const arrays: unknown[][] = [];
  const replaced = JSON.parse(JSON.stringify(value), (_key, entry) => {
    if (Array.isArray(entry) && entry.length > 4 && entry.every((item) => item === null || typeof item !== 'object')) {
      arrays.push(entry);
      return `__list${arrays.length - 1}__`;
    }
    return entry;
  });
  let text = stringify(replaced, { maxLength: width });
  arrays.forEach((items, index) => {
    const token = `"__list${index}__"`;
    const at = text.indexOf(token);
    const column = at - text.lastIndexOf('\n', at) - 1;
    const rows: string[] = [];
    let row = '';
    for (const item of items.map((entry) => JSON.stringify(entry))) {
      if (row && column + 1 + row.length + item.length + 2 > width) {
        rows.push(row);
        row = '';
      }
      row += row ? ` ${item},` : `${item},`;
    }
    rows.push(row);
    const packed = `[${rows.join(`\n${' '.repeat(column + 1)}`).replace(/,$/, '')}]`;
    text = text.slice(0, at) + packed + text.slice(at + token.length);
  });
  return text;
}

function cropCompiledSpec(text: string, maxLines: number): string {
  const lines = text.split('\n');
  if (lines.length <= maxLines) return text;
  const visibleLineCount = maxLines - 1;
  const hiddenLines = lines.slice(visibleLineCount);
  return [
    ...lines.slice(0, visibleLineCount),
    `  ... // ${hiddenLines.length} more lines (excluding interaction)`,
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
  gridTemplateColumns: 'minmax(0, 1.3fr) 34px minmax(0, 1fr) 34px minmax(0, 1.4fr)',
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
