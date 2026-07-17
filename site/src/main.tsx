import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource-variable/inter/index.css';
import './global.css';
import './i18n';
import { HashRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { Landing } from './routes/Landing';
import { ChartWall } from './routes/ChartWall';
import { Editor } from './routes/Editor';
import { McpServer } from './routes/McpServer';
import { DocSectionPage } from './routes/DocSectionPage';
import { DevPlayground } from './routes/DevPlayground';
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
        <Route path="gallery/:backend?" element={<ChartWall />} />
        {/* Keep old /wall links working; /gallery is canonical. */}
        <Route path="wall" element={<WallRedirect />} />
        <Route path="wall/:backend" element={<WallRedirect />} />
        <Route path="editor" element={<Editor />} />
        <Route path="mcp" element={<McpServer />} />
        <Route path="dev-playground" element={<DevPlayground />} />
        {/* Tutorials merged into Documentation as the "Quick start" group. */}
        <Route
          path="tutorials"
          element={<Navigate to={localePath('/documentation/getting-started', locale)} replace />}
        />
        <Route path="tutorials/:slug" element={<TutorialRedirect />} />
        <Route path="documentation" element={<DocSectionPage section="documentation" />} />
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
