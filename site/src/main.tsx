import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter/index.css';
import './global.css';
import './i18n';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Landing } from './routes/Landing';
import { ChartWall } from './routes/ChartWall';
import { ExcelGallery } from './routes/ExcelGallery';
import { Editor } from './routes/Editor';
import { McpServer } from './routes/McpServer';
import { Themes } from './routes/Themes';
import { ThemeLab as PublicThemeLab } from './routes/ThemeLab';
import { RowNamesDemo } from './playground/RowNamesDemo';
import { AutoLayoutPlayground } from './routes/AutoLayoutPlayground';
import { DocSectionPage } from './routes/DocSectionPage';
import { PlaygroundShell } from './playground/PlaygroundShell';
import { Illustrations } from './playground/Illustrations';
import { ArchitectureIllustrations } from './playground/ArchitectureIllustrations';
import { McpUi } from './playground/McpUi';
import { McpStories } from './playground/McpStories';
import { Labs } from './playground/Labs';
import { DemoWall } from './playground/DemoWall';
import { ThemeLab } from './playground/ThemeLab';
import { ThemeLabR2 } from './playground/ThemeLabR2';
import { ThemeLabReal } from './playground/ThemeLabReal';
import { NewThemeTest } from './playground/new-theme-test/NewThemeTest';
import { ThemeImprovement } from './playground/theme-improvement/ThemeImprovement';
import { LabelAngles } from './playground/label-angles/LabelAngles';
import { CanvasSqueeze } from './playground/canvas-squeeze/CanvasSqueeze';
import { ColorLab } from './playground/ColorLab';
import { TalkDeck } from './talk/TalkDeck';
import { BandStretchingLab } from './playground/BandStretchingLab';
import { LabelExperimentLab } from './playground/LabelExperimentLab';
import { AxisLabelLab } from './playground/AxisLabelLab';
import { TitleWrapLab } from './playground/TitleWrapLab';
import { CalendarAxisLab } from './playground/CalendarAxisLab';
import { CategoricalTemporalLab } from './playground/CategoricalTemporalLab';
import { ReleaseExamples100 } from './playground/release-examples/1.0.0';
import { TestExamples } from './playground/release-examples/test-examples';
import { OverflowViewportLab } from './playground/OverflowViewportLab';
import { ZoomClippingLab } from './playground/ZoomClippingLab';
import { LayoutInspector } from './playground/LayoutInspector';
import { UpdateAnimationLab } from './playground/UpdateAnimationLab';
import { LayoutPlanLab } from './playground/LayoutPlanLab';
import { FlintInteractive, InteractionGallery } from './routes/InteractionGallery';
import { AdvancedInteractions } from './routes/AdvancedInteractions';
import { ClickFocusLab } from './playground/ClickFocusLab';
import { InteractionCoverageLab } from './playground/InteractionCoverageLab';
import { InteractionConflictsLab } from './playground/InteractionConflictsLab';
import { ChartApiDesign } from './playground/ChartApiDesign';
import { AnnotationLab } from './playground/AnnotationLab';
import { InteractionDashboardLab } from './playground/InteractionDashboardLab';
import { ExternalToChartLab } from './playground/ExternalToChartLab';
import { ChartToExternalLab } from './playground/ChartToExternalLab';
import { InteractiveDataReportLab } from './playground/InteractiveDataReportLab';
import { StyleReferences } from './playground/StyleReferences';
import { FullTestCases } from './playground/FullTestCases';
import { DebugGym } from './playground/DebugGym';
import { AgentComparison } from './playground/AgentComparison';
import { DenseMarks } from './playground/DenseMarks';
import { DensityLab } from './playground/DensityLab';
import { LegendLab } from './playground/LegendLab';
import { BackendLayoutLab } from './playground/backend-layout/BackendLayoutLab';
import { EChartsFixesLab } from './playground/backend-layout/EChartsFixesLab';
import { LocaleProvider, useLocale } from './i18n/LocaleContext';
import type { Locale } from './i18n/locales';
import { localePath } from './i18n/paths';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/zh/*" element={<AppRoutes locale="zh-CN" />} />
        <Route path="/*" element={<AppRoutes locale="en" />} />
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);

function AppRoutes({ locale }: { locale: Locale }) {
  return (
    <LocaleProvider locale={locale}>
      <Routes>
        <Route index element={<Landing />} />
        <Route path="gallery/excel" element={<ExcelGallery />} />
        <Route path="gallery/:backend?" element={<ChartWall />} />
        <Route path="interactions" element={<FlintInteractive />} />
        <Route path="interactions/gallery" element={<InteractionGallery />} />
        <Route path="interactions/gallery/:mode" element={<InteractionGallery />} />
        <Route path="interactions/advanced" element={<AdvancedInteractions />} />
        {/* Bespoke interactions and applications merged into one page. */}
        <Route path="interactions/bespoke" element={<Navigate to={localePath('/interactions/advanced', locale)} replace />} />
        <Route path="interactions/applications" element={<Navigate to={localePath('/interactions/advanced', locale)} replace />} />
        <Route path="interactions/:mode" element={<InteractionGallery />} />
        {/* Keep old /wall links working; /gallery is canonical. */}
        <Route path="wall" element={<WallRedirect />} />
        <Route path="wall/:backend" element={<WallRedirect />} />
        <Route path="editor" element={<Editor />} />
        <Route path="talk" element={<TalkDeck />} />
        <Route path="mcp" element={<McpServer />} />
        <Route path="themes" element={<Themes />} />
        <Route path="theme-lab" element={<PublicThemeLab />} />
        <Route path="playgrounds/auto-layout" element={<AutoLayoutPlayground />} />
        <Route path="themes/lab" element={<Navigate to={localePath('/theme-lab', locale)} replace />} />
        {/* Playground is public — poke around and play with the widgets. */}
        <Route path="dev-playground" element={<Navigate to={localePath('/playground/illustrations', locale)} replace />} />
        <Route path="dev/*" element={<Navigate to={localePath('/playground', locale)} replace />} />
        <Route path="playground" element={<PlaygroundShell />}>
          <Route index element={<Navigate to="illustrations" replace />} />
          <Route path="illustrations" element={<Illustrations />} />
          <Route path="illustrations/architecture" element={<ArchitectureIllustrations />} />
          <Route path="mcp-ui" element={<McpUi />} />
          <Route path="mcp-stories" element={<McpStories />} />
          <Route path="labs" element={<Labs />} />
          <Route path="demo-wall" element={<DemoWall />} />
          {/* The theme wall graduated to the public /themes page. */}
          <Route path="theme-wall" element={<Navigate to={localePath('/themes', locale)} replace />} />
          <Route path="theme-labs" element={<ThemeLab />} />
          <Route path="row-names" element={<RowNamesDemo />} />
          <Route path="theme-lab-r2" element={<ThemeLabR2 />} />
          <Route path="theme-lab-real" element={<ThemeLabReal />} />
          <Route path="new-theme-test" element={<NewThemeTest />} />
          <Route path="theme-improvement" element={<ThemeImprovement />} />
          <Route path="label-angles" element={<LabelAngles />} />
          <Route path="canvas-squeeze" element={<CanvasSqueeze />} />
          <Route path="color" element={<ColorLab />} />
          <Route path="band-stretching" element={<BandStretchingLab />} />
          <Route path="label-experiment" element={<LabelExperimentLab />} />
          <Route path="axis-label" element={<AxisLabelLab />} />
          <Route path="title-wrap" element={<TitleWrapLab />} />
          <Route path="calendar-axis" element={<CalendarAxisLab />} />
          <Route path="categorical-temporal" element={<CategoricalTemporalLab />} />
          <Route path="release-examples">
            <Route index element={<Navigate to="1.0.0" replace />} />
            <Route path="1.0.0" element={<ReleaseExamples100 />} />
            <Route path="application-demos" element={<Navigate to={localePath('/interactions/advanced', locale)} replace />} />
            <Route path="test-examples" element={<TestExamples />} />
          </Route>
          <Route path="wrapping-examples" element={<Navigate to="../release-examples/1.0.0" replace />} />
          <Route path="overflow-viewport" element={<OverflowViewportLab />} />
          <Route path="zoom-clipping" element={<ZoomClippingLab />} />
          <Route path="layout-inspector" element={<LayoutInspector />} />
          <Route path="layout-plan" element={<LayoutPlanLab />} />
          <Route path="interaction-test-cases" element={<ClickFocusLab />} />
          <Route path="click-focus" element={<Navigate to="../interaction-test-cases" replace />} />
          <Route path="annotation-lab" element={<AnnotationLab />} />
          <Route path="update-animation" element={<UpdateAnimationLab />} />
          <Route path="interaction-coverage" element={<InteractionCoverageLab />} />
          <Route path="interaction-conflicts" element={<InteractionConflictsLab />} />
          <Route path="chart-api-design" element={<ChartApiDesign />} />
          <Route path="pan-zoom" element={<Navigate to={localePath('/interactions/navigate', locale)} replace />} />
          <Route path="interaction-dashboard" element={<InteractionDashboardLab />} />
          <Route path="external-to-chart" element={<ExternalToChartLab />} />
          <Route path="chart-to-external" element={<ChartToExternalLab />} />
          <Route path="bespoke-interaction" element={<Navigate to={localePath('/interactions/advanced', locale)} replace />} />
          <Route path="interactive-data-report" element={<InteractiveDataReportLab />} />
          <Route path="style-references/:house?" element={<StyleReferences />} />
          <Route path="debug-gym" element={<DebugGym />} />
          <Route path="agent-comparison" element={<AgentComparison />} />
          <Route path="dense-marks" element={<DenseMarks />} />
          <Route path="density" element={<DensityLab />} />
          <Route path="legend" element={<LegendLab />} />
          <Route path="backend-layout" element={<Navigate to="echarts" replace />} />
          <Route path="backend-layout-echarts-fixes" element={<EChartsFixesLab />} />
          <Route path="backend-layout/:backend" element={<BackendLayoutLab />} />
          <Route path="year-legend" element={<Navigate to="../debug-gym" replace />} />
          {/* The Swiss and cartoon labs were the same page twice; keep the
              links they were reached by working. */}
          <Route path="swiss-lab" element={<Navigate to="../style-references/swiss" replace />} />
          <Route path="cartoon-lab" element={<Navigate to="../style-references/cartoon" replace />} />
          <Route path="full-test-cases" element={<FullTestCases />} />
        </Route>
        {/* Tutorials merged into Documentation as the "Quick start" group. */}
        <Route
          path="tutorials"
          element={<Navigate to={localePath('/documentation/getting-started', locale)} replace />}
        />
        <Route path="tutorials/:slug" element={<TutorialRedirect />} />
        <Route path="documentation" element={<DocSectionPage section="documentation" />} />
        <Route
          path="documentation/chart-sizing"
          element={<Navigate to={localePath('/playgrounds/auto-layout', locale)} replace />}
        />
        <Route path="documentation/:slug" element={<DocSectionPage section="documentation" />} />
        <Route path="*" element={<Navigate to={localePath('/', locale)} replace />} />
      </Routes>
    </LocaleProvider>
  );
}

/** Preserve old /tutorials/:slug links by redirecting into /documentation. */
function TutorialRedirect() {
  const { slug } = useParams<{ slug?: string }>();
  const { locale } = useLocale();
  return (
    <Navigate
      to={localePath(`/documentation/${slug ?? 'getting-started'}`, locale)}
      replace
    />
  );
}

/** Preserve old /wall and /wall/:backend links by redirecting to /gallery. */
function WallRedirect() {
  const { backend } = useParams<{ backend?: string }>();
  const { locale } = useLocale();
  return (
    <Navigate to={localePath(`/gallery${backend ? `/${backend}` : ''}`, locale)} replace />
  );
}
