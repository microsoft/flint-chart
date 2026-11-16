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
import { NewThemeTest } from './playground/new-theme-test/NewThemeTest';
import { ThemeImprovement } from './playground/theme-improvement/ThemeImprovement';
import { CanvasSqueeze } from './playground/canvas-squeeze/CanvasSqueeze';
import { MapsLab } from './playground/MapsLab';
import { HeatmapLab } from './playground/HeatmapLab';
import { ColorLab } from './playground/ColorLab';
import { ColorRangeLab } from './playground/ColorRangeLab';
import { TalkDeckRoute, TalkIndex } from './talk/TalkDeck';
import { DevDesign } from './routes/DevDesign';
import { BandStretchingLab } from './playground/BandStretchingLab';
import { TitleBalanceLab } from './playground/TitleBalanceLab';
import { AxisLabelLab } from './playground/AxisLabelLab';
import { TitleWrapLab } from './playground/TitleWrapLab';
import { CalendarAxisLab } from './playground/CalendarAxisLab';
import { CategoricalTemporalLab } from './playground/CategoricalTemporalLab';
import { ReleaseExamples100 } from './playground/release-examples/1.0.0';
import { ReleaseExamples11 } from './playground/release-examples/1.1';
import { GreekStories } from './playground/fun/GreekStories';
import { OverflowViewportLab } from './playground/OverflowViewportLab';
import { ZoomClippingLab } from './playground/ZoomClippingLab';
import { OverlayContainmentLab } from './playground/OverlayContainmentLab';
import { LayoutInspector } from './playground/LayoutInspector';
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
import { FullTestCases } from './playground/FullTestCases';
import { DebugGym } from './playground/DebugGym';
import { DenseMarks } from './playground/DenseMarks';
import { DensityLab } from './playground/DensityLab';
import { LegendLab } from './playground/LegendLab';
import { BinningLab } from './playground/binning/BinningLab';
import { AnnotationCaptionLab } from './playground/AnnotationCaptionLab';
import { MutedAnnotations } from './playground/MutedAnnotations';
import { BaselineLab } from './playground/BaselineLab';
import { TooltipCompare } from './playground/TooltipCompare';
import { BaselineSweep } from './playground/BaselineSweep';
import { BackendLayoutLab } from './playground/backend-layout/BackendLayoutLab';
import { EvalPage } from './routes/eval/Eval';
import { TabbedLab } from './playground/TabbedLab';
import { InteractionResults } from './routes/eval/InteractionResults';
import { McpResults } from './routes/eval/McpResults';
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
        <Route path="talk" element={<TalkIndex />} />
        <Route path="talk/:deck" element={<TalkDeckRoute />} />
        <Route path="mcp" element={<McpServer />} />
        <Route path="themes" element={<Themes />} />
        <Route path="theme-lab" element={<PublicThemeLab />} />
        <Route path="playgrounds/auto-layout" element={<AutoLayoutPlayground />} />
        <Route path="themes/lab" element={<Navigate to={localePath('/theme-lab', locale)} replace />} />
        {/* Playground is public — poke around and play with the widgets. */}
        <Route path="dev-playground" element={<Navigate to={localePath('/playground/illustrations', locale)} replace />} />
        <Route path="dev/design" element={<DevDesign />} />
        <Route path="dev/interaction-eval" element={<Navigate to={localePath('/playground/eval/interactions', locale)} replace />} />
        <Route path="dev/eval/*" element={<Navigate to={localePath('/playground/eval', locale)} replace />} />
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
          <Route path="theme-lab-r2" element={<Navigate to="../theme-labs?data=generated" replace />} />
          <Route path="theme-lab-real" element={<Navigate to="../theme-labs" replace />} />
          <Route path="new-theme-test" element={<NewThemeTest />} />
          <Route path="theme-improvement" element={<ThemeImprovement />} />
          <Route path="canvas-fit" element={<TabbedLab tabs={[
            { id: 'squeeze', label: 'Canvas squeeze', element: <CanvasSqueeze /> },
            { id: 'bands', label: 'Band stretching', element: <BandStretchingLab /> },
          ]} />} />
          <Route path="canvas-squeeze" element={<Navigate to="../canvas-fit" replace />} />
          <Route path="maps" element={<MapsLab />} />
          <Route path="heatmaps" element={<HeatmapLab />} />
          <Route path="colour" element={<TabbedLab tabs={[
            { id: 'options', label: 'Colour options', element: <ColorLab /> },
            { id: 'range', label: 'Colour range', element: <ColorRangeLab /> },
            { id: 'binned', label: 'Binned colour', element: <BinningLab /> },
          ]} />} />
          <Route path="color" element={<Navigate to="../colour" replace />} />
          <Route path="color-range" element={<Navigate to="../colour?tab=range" replace />} />
          <Route path="band-stretching" element={<Navigate to="../canvas-fit?tab=bands" replace />} />
          <Route path="axis-label" element={<AxisLabelLab />} />
          <Route path="titles" element={<TabbedLab tabs={[
            { id: 'wrap', label: 'Title wrap', element: <TitleWrapLab /> },
            { id: 'balance', label: 'Title balance', element: <TitleBalanceLab /> },
          ]} />} />
          <Route path="title-wrap" element={<Navigate to="../titles" replace />} />
          <Route path="title-balance" element={<Navigate to="../titles?tab=balance" replace />} />
          <Route path="time-axes" element={<TabbedLab tabs={[
            { id: 'calendar', label: 'Calendar axes', element: <CalendarAxisLab /> },
            { id: 'categorical', label: 'Categorical temporal', element: <CategoricalTemporalLab /> },
          ]} />} />
          <Route path="calendar-axis" element={<Navigate to="../time-axes" replace />} />
          <Route path="categorical-temporal" element={<Navigate to="../time-axes?tab=categorical" replace />} />
          <Route path="release-examples">
            <Route index element={<Navigate to="1.1" replace />} />
            <Route path="1.1" element={<ReleaseExamples11 />} />
            <Route path="1.0.0" element={<ReleaseExamples100 />} />
            <Route path="application-demos" element={<Navigate to={localePath('/interactions/advanced', locale)} replace />} />
          </Route>
          <Route path="wrapping-examples" element={<Navigate to="../release-examples/1.0.0" replace />} />
          <Route path="fun">
            <Route path="greek" element={<GreekStories />} />
            {['odyssey', 'argonauts', 'heracles', 'iliad'].map((story) => (
              <Route key={story} path={story} element={<Navigate to="../greek" replace />} />
            ))}
          </Route>
          <Route path="viewport" element={<TabbedLab tabs={[
            { id: 'overflow', label: 'Overflow viewport', element: <OverflowViewportLab /> },
            { id: 'zoom', label: 'Zoom clipping', element: <ZoomClippingLab /> },
            { id: 'overlay', label: 'Overlay containment', element: <OverlayContainmentLab /> },
          ]} />} />
          <Route path="overflow-viewport" element={<Navigate to="../viewport" replace />} />
          <Route path="zoom-clipping" element={<Navigate to="../viewport?tab=zoom" replace />} />
          <Route path="overlay-containment" element={<Navigate to="../viewport?tab=overlay" replace />} />
          <Route path="layout-inspector" element={<LayoutInspector />} />
          <Route path="layout-plan" element={<LayoutPlanLab />} />
          <Route path="interaction-test-cases" element={<ClickFocusLab />} />
          <Route path="click-focus" element={<Navigate to="../interaction-test-cases" replace />} />
          <Route path="annotation-lab" element={<AnnotationLab />} />
          <Route path="interaction-coverage" element={<InteractionCoverageLab />} />
          <Route path="interaction-conflicts" element={<InteractionConflictsLab />} />
          <Route path="chart-api-design" element={<ChartApiDesign />} />
          <Route path="pan-zoom" element={<Navigate to={localePath('/interactions/navigate', locale)} replace />} />
          <Route path="interaction-dashboard" element={<InteractionDashboardLab />} />
          <Route path="external-to-chart" element={<ExternalToChartLab />} />
          <Route path="chart-to-external" element={<ChartToExternalLab />} />
          <Route path="bespoke-interaction" element={<Navigate to={localePath('/interactions/advanced', locale)} replace />} />
          <Route path="interactive-data-report" element={<InteractiveDataReportLab />} />
          <Route path="debug-gym" element={<DebugGym />} />
          <Route path="dense-marks" element={<Navigate to="../density?tab=d3" replace />} />
          <Route path="density" element={<TabbedLab tabs={[
            { id: 'rules', label: 'Density rules', element: <DensityLab /> },
            { id: 'd3', label: 'D3 vs Flint', element: <DenseMarks /> },
          ]} />} />
          <Route path="legend" element={<LegendLab />} />
          <Route path="binning" element={<Navigate to="../colour?tab=binned" replace />} />
          <Route path="annotation-captions" element={<AnnotationCaptionLab />} />
          <Route path="muted-annotations" element={<MutedAnnotations />} />
          <Route path="baseline" element={<BaselineLab />} />
          <Route path="tooltip-compare" element={<TooltipCompare />} />
          <Route path="baseline-sweep" element={<BaselineSweep />} />
          <Route path="mcp-eval" element={<Navigate to="../eval/mcp" replace />} />
          {import.meta.env.DEV && (
            <Route path="eval" element={<EvalPage />}>
              <Route index element={<Navigate to="interactions" replace />} />
              <Route path="interactions" element={<InteractionResults />} />
              <Route path="mcp" element={<McpResults />} />
            </Route>
          )}
          <Route path="backend-layout" element={<Navigate to="echarts" replace />} />
          <Route path="backend-layout/:backend" element={<BackendLayoutLab />} />
          <Route path="year-legend" element={<Navigate to="../debug-gym" replace />} />
          {/* The Swiss and cartoon labs were the same page twice; keep the
              links they were reached by working. */}
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
