import { useCallback, type CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import { SiteShell } from '../components/SiteShell';
import { SidebarNav, SidebarNavItem, SidebarNavSection } from '../components/SidebarNav';
import { useLocale } from '../i18n/LocaleContext';
import { CHART_CATEGORIES } from '../shared/chart-categories';
import { CONTENT_MAX_WIDTH, GITHUB_REPO, siteTheme } from '../shared/theme';
import groupedBar from '../assets/excel-gallery/grouped-bar.png';
import multiSeriesLine from '../assets/excel-gallery/multi-series-line.png';
import stackedArea from '../assets/excel-gallery/stacked-area.png';
import treemap from '../assets/excel-gallery/treemap.png';
import sunburst from '../assets/excel-gallery/sunburst.png';
import waterfall from '../assets/excel-gallery/waterfall.png';
import pyramid from '../assets/excel-gallery/pyramid.png';
import radar from '../assets/excel-gallery/radar.png';
import candlestick from '../assets/excel-gallery/candlestick.png';

const HARNESS_URL = `${GITHUB_REPO}/tree/main/test-harness/excel`;
const EXAMPLES_URL = `${GITHUB_REPO}/tree/main/test-harness/excel/evaluations/examples`;

const EXAMPLES = [
  { id: 'grouped-bar', title: 'Grouped bar', image: groupedBar, nativeType: 'ColumnClustered' },
  { id: 'multi-series-line', title: 'Multi-series line', image: multiSeriesLine, nativeType: 'XYScatterLines' },
  { id: 'stacked-area', title: 'Stacked area', image: stackedArea, nativeType: 'AreaStacked' },
  { id: 'treemap', title: 'Treemap', image: treemap, nativeType: 'Treemap' },
  { id: 'sunburst', title: 'Sunburst', image: sunburst, nativeType: 'Sunburst' },
  { id: 'waterfall', title: 'Waterfall', image: waterfall, nativeType: 'Waterfall' },
  { id: 'pyramid', title: 'Population pyramid', image: pyramid, nativeType: 'BarStacked' },
  { id: 'radar', title: 'Radar', image: radar, nativeType: 'RadarMarkers' },
  { id: 'candlestick', title: 'Candlestick', image: candlestick, nativeType: 'StockOHLC' },
];

const COPY = {
  en: {
    title: 'Chart gallery',
    backend: 'Excel backend',
    galleries: 'Galleries',
    examples: 'Native chart examples',
    intro: 'Flint compiles semantic chart specs into native, editable Excel charts through Office.js. Because Excel is the renderer, this gallery shows verified captures from the real Excel for Mac worker instead of a browser preview.',
    provenance: 'These are unedited Chart.getImage() captures. The source data, titles, axes, formatting, and series remain editable in the workbook.',
    harnessTitle: 'Render with the test harness',
    steps: [
      'Install the Office add-in development certificate and sideload the Flint Render manifest once.',
      'Start the supervised HTTPS worker from test-harness/excel.',
      'Open Flint Render in Excel, then run a gallery or targeted evaluation command.',
    ],
    harnessLink: 'Test harness guide',
    examplesLink: 'Snapshot provenance',
  },
  'zh-CN': {
    title: '图表示例',
    backend: 'Excel 后端',
    galleries: '示例库',
    examples: '原生图表示例',
    intro: 'Flint 通过 Office.js 将语义图表规范编译为可编辑的原生 Excel 图表。由于渲染器是 Excel，本页展示真实 Excel for Mac 工作进程生成并验证过的截图，而不是浏览器实时预览。',
    provenance: '这些图片是未经编辑的 Chart.getImage() 输出；工作簿中的源数据、标题、坐标轴、格式和系列仍可继续编辑。',
    harnessTitle: '使用测试工具渲染',
    steps: [
      '安装 Office 加载项开发证书，并一次性旁加载 Flint Render manifest。',
      '在 test-harness/excel 中启动受监控的 HTTPS 工作进程。',
      '在 Excel 中打开 Flint Render，再运行示例库或指定图表的评估命令。',
    ],
    harnessLink: '测试工具指南',
    examplesLink: '截图来源',
  },
} as const;

export function ExcelGallery() {
  const { locale, lp } = useLocale();
  const navigate = useNavigate();
  const copy = COPY[locale];
  const navigateToExample = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <SiteShell>
      <style>{responsiveStyles}</style>
      <div className="excel-gallery-scroll" style={scrollStyle}>
        <div className="excel-gallery-layout" style={layoutStyle}>
          <SidebarNav>
            <SidebarNavSection label={copy.galleries} first>
              {CHART_CATEGORIES.map((category) => (
                <SidebarNavItem
                  key={category.id}
                  active={false}
                  onClick={() => navigate(lp(`/gallery/${category.id}`))}
                >
                  {category.label}
                </SidebarNavItem>
              ))}
              <SidebarNavItem active onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                Excel
              </SidebarNavItem>
            </SidebarNavSection>
            <SidebarNavSection label={copy.examples}>
              {EXAMPLES.map((example) => (
                <SidebarNavItem key={example.id} active={false} onClick={() => navigateToExample(example.id)}>
                  {example.title}
                </SidebarNavItem>
              ))}
            </SidebarNavSection>
          </SidebarNav>

          <main className="excel-gallery-main" style={mainStyle}>
            <header style={headerStyle}>
              <h1 style={titleStyle}>
                {copy.title} <span style={backendTitleStyle}>({copy.backend})</span>
              </h1>
              <nav className="excel-gallery-mobile-tabs" aria-label={copy.galleries}>
                {CHART_CATEGORIES.map((category) => (
                  <button key={category.id} type="button" onClick={() => navigate(lp(`/gallery/${category.id}`))}>
                    {category.label}
                  </button>
                ))}
                <button type="button" aria-current="page" className="is-active">Excel</button>
              </nav>
              <p style={introStyle}>{copy.intro}</p>
              <p style={provenanceStyle}>{copy.provenance}</p>
            </header>

            <section className="excel-gallery-grid" aria-label={copy.examples}>
              {EXAMPLES.map((example) => (
                <figure key={example.id} id={example.id} style={cardStyle}>
                  <div style={imageFrameStyle}>
                    <img
                      src={example.image}
                      alt={`${example.title} rendered as a native Excel chart`}
                      loading="lazy"
                      style={imageStyle}
                    />
                  </div>
                  <figcaption style={captionStyle}>
                    <strong style={captionTitleStyle}>{example.title}</strong>
                    <span style={nativeTypeStyle}>{example.nativeType}</span>
                  </figcaption>
                </figure>
              ))}
            </section>

            <section style={harnessStyle}>
              <h2 style={harnessTitleStyle}>{copy.harnessTitle}</h2>
              <ol style={stepsStyle}>
                {copy.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              <div style={linkRowStyle}>
                <a className="excel-gallery-action excel-gallery-action--primary" href={HARNESS_URL} target="_blank" rel="noreferrer">
                  {copy.harnessLink}
                </a>
                <a className="excel-gallery-action excel-gallery-action--secondary" href={EXAMPLES_URL} target="_blank" rel="noreferrer">
                  {copy.examplesLink}
                </a>
              </div>
            </section>
          </main>
        </div>
      </div>
    </SiteShell>
  );
}

const scrollStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', background: siteTheme.surface };
const layoutStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', width: '100%', maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto' };
const mainStyle: CSSProperties = { flex: 1, minWidth: 0, maxWidth: 1100, margin: '0 auto', padding: '36px 40px 96px' };
const headerStyle: CSSProperties = { maxWidth: 820, marginBottom: 32 };
const titleStyle: CSSProperties = { margin: 0, color: siteTheme.text, fontSize: 28, fontWeight: 600, letterSpacing: 0 };
const backendTitleStyle: CSSProperties = { color: siteTheme.textMuted, fontWeight: 400 };
const introStyle: CSSProperties = { margin: '20px 0 0', color: siteTheme.text, fontSize: 17, lineHeight: 1.65 };
const provenanceStyle: CSSProperties = { margin: '10px 0 0', color: siteTheme.textMuted, fontSize: 14, lineHeight: 1.6 };
const cardStyle: CSSProperties = { margin: 0, minWidth: 0, scrollMarginTop: 16 };
const imageFrameStyle: CSSProperties = { aspectRatio: '4 / 3', overflow: 'hidden', border: `1px solid ${siteTheme.border}`, background: '#fff' };
const imageStyle: CSSProperties = { display: 'block', width: '100%', height: '100%', objectFit: 'contain' };
const captionStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, paddingTop: 10 };
const captionTitleStyle: CSSProperties = { color: siteTheme.text, fontSize: 14, fontWeight: 600 };
const nativeTypeStyle: CSSProperties = { color: siteTheme.textMuted, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 11 };
const harnessStyle: CSSProperties = { marginTop: 64, paddingTop: 28, borderTop: `1px solid ${siteTheme.border}`, maxWidth: 820 };
const harnessTitleStyle: CSSProperties = { margin: 0, color: siteTheme.text, fontSize: 20, fontWeight: 600, letterSpacing: 0 };
const stepsStyle: CSSProperties = { margin: '18px 0 0', paddingLeft: 22, color: siteTheme.text, fontSize: 14, lineHeight: 1.7 };
const linkRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 22 };

const responsiveStyles = `
  .excel-gallery-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 210px;
    min-height: 44px;
    box-sizing: border-box;
    padding: 11px 18px;
    border: 1px solid transparent;
    border-radius: ${siteTheme.radius}px;
    color: ${siteTheme.text};
    background: ${siteTheme.surface};
    text-align: center;
    text-decoration: none;
    font-size: 14.5px;
    font-weight: 600;
    line-height: 1.2;
    transform: translateY(0);
    transition: background 120ms ease, border-color 120ms ease, transform 120ms ease;
  }
  .excel-gallery-action:hover,
  .excel-gallery-action:focus-visible {
    transform: translateY(-1px);
  }
  .excel-gallery-action:focus-visible {
    outline: 2px solid ${siteTheme.accent};
    outline-offset: 2px;
  }
  .excel-gallery-action--primary {
    color: #fff;
    background: #217346;
  }
  .excel-gallery-action--primary:hover,
  .excel-gallery-action--primary:focus-visible {
    background: #185c37;
  }
  .excel-gallery-action--secondary {
    border-color: rgba(0, 0, 0, 0.24);
  }
  .excel-gallery-action--secondary:hover,
  .excel-gallery-action--secondary:focus-visible {
    border-color: rgba(0, 0, 0, 0.42);
    background: ${siteTheme.hover};
  }
  .excel-gallery-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 34px 28px;
  }
  .excel-gallery-mobile-tabs { display: none; }
  @media (max-width: 980px) {
    .excel-gallery-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 760px) {
    .excel-gallery-layout > aside { display: none; }
    .excel-gallery-main { padding: 24px 18px 64px !important; }
    .excel-gallery-mobile-tabs {
      display: flex;
      gap: 6px;
      overflow-x: auto;
      margin-top: 16px;
      padding-bottom: 4px;
    }
    .excel-gallery-mobile-tabs button {
      flex: 0 0 auto;
      padding: 7px 10px;
      border: 1px solid ${siteTheme.border};
      background: ${siteTheme.surface};
      color: ${siteTheme.textMuted};
      font: inherit;
      font-size: 12px;
    }
    .excel-gallery-mobile-tabs button.is-active {
      border-color: #217346;
      color: #217346;
      font-weight: 600;
    }
  }
  @media (max-width: 560px) {
    .excel-gallery-grid { grid-template-columns: 1fr; gap: 28px; }
  }
`;