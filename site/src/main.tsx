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
import { AutoLayoutPlayground } from './routes/AutoLayoutPlayground';
import { DocSectionPage } from './routes/DocSectionPage';
import { PlaygroundShell } from './playground/PlaygroundShell';
import { Illustrations } from './playground/Illustrations';
import { McpUi } from './playground/McpUi';
import { Labs } from './playground/Labs';
import { DemoWall } from './playground/DemoWall';
import { ThemeLab } from './playground/ThemeLab';
import { ThemeLabR2 } from './playground/ThemeLabR2';
import { ThemeLabReal } from './playground/ThemeLabReal';
import { BandStretchingLab } from './playground/BandStretchingLab';
import { StyleReferences } from './playground/StyleReferences';
import { FullTestCases } from './playground/FullTestCases';
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
        {/* Keep old /wall links working; /gallery is canonical. */}
        <Route path="wall" element={<WallRedirect />} />
        <Route path="wall/:backend" element={<WallRedirect />} />
        <Route path="editor" element={<Editor />} />
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
          <Route path="mcp-ui" element={<McpUi />} />
          <Route path="labs" element={<Labs />} />
          <Route path="demo-wall" element={<DemoWall />} />
          {/* The theme wall graduated to the public /themes page. */}
          <Route path="theme-wall" element={<Navigate to={localePath('/themes', locale)} replace />} />
          <Route path="theme-labs" element={<ThemeLab />} />
          <Route path="theme-lab-r2" element={<ThemeLabR2 />} />
          <Route path="theme-lab-real" element={<ThemeLabReal />} />
          <Route path="band-stretching" element={<BandStretchingLab />} />
          <Route path="style-references/:house?" element={<StyleReferences />} />
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
