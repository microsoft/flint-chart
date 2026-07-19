import type { DocEntry, DocSection } from './docs-catalog';
import { getDocsForSection, getDocEntry } from './docs-catalog';
import type { Locale } from '../i18n/locales';
import { localePath } from '../i18n/paths';

/** Eager raw imports of markdown files from the repo root and docs/. */
const RAW_MODULES = import.meta.glob<string>(
  [
    '../../../README.md',
    '../../../docs/*.md',
    '../../../docs/tutorials/*.md',
    '../../../docs/zh-CN/*.md',
    '../../../docs/zh-CN/tutorials/*.md',
  ],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);
// Tutorials: getting-started, data-story, setup-flint-mcp, agent-workflows, exploring-data, chart-sizing.

/** Doc figures under docs/figs/ — resolved to bundled asset URLs. Images only;
 * non-image assets (e.g. the paper PDF) are linked externally, not bundled. */
const FIGURE_MODULES = import.meta.glob<string>(
  ['../../../docs/figs/**/*.{png,jpg,jpeg,gif,svg,webp,avif}'],
  {
    query: '?url',
    import: 'default',
    eager: true,
  },
);

/** Chart icons under site/src/assets/chart-icons/ — used by the reference docs. */
const ICON_MODULES = import.meta.glob<string>(['../assets/chart-icons/*.svg'], {
  query: '?url',
  import: 'default',
  eager: true,
});

const ALL_ENTRIES = getDocsForSection('documentation');

/** English catalog `file` path → zh-CN mirror path under docs/zh-CN/. */
function zhFileFor(englishFile: string): string {
  // e.g. ../../../docs/tutorials/getting-started.md → ../../../docs/zh-CN/tutorials/getting-started.md
  // e.g. ../../../docs/overview.md → ../../../docs/zh-CN/overview.md
  return englishFile.replace('/docs/', '/docs/zh-CN/');
}

export function getDocMarkdown(
  entry: DocEntry,
  locale: Locale = 'en',
): { markdown: string; usedFallback: boolean } | null {
  if (locale === 'zh-CN') {
    const zhPath = zhFileFor(entry.file);
    const zh = RAW_MODULES[zhPath];
    if (zh) return { markdown: zh, usedFallback: false };
    const en = RAW_MODULES[entry.file];
    if (en) return { markdown: en, usedFallback: true };
    return null;
  }
  const en = RAW_MODULES[entry.file];
  if (!en) return null;
  return { markdown: en, usedFallback: false };
}

export function getDocMarkdownBySlug(
  section: DocSection,
  slug: string,
  locale: Locale = 'en',
): { markdown: string; usedFallback: boolean } | null {
  const entry = getDocEntry(section, slug);
  if (!entry) return null;
  return getDocMarkdown(entry, locale);
}

/** Resolve relative image paths in docs markdown (e.g. figs/overview.png). */
export function resolveMarkdownImageSrc(src: string): string | null {
  const normalized = src.replace(/^\.\//, '');
  for (const [path, url] of Object.entries(FIGURE_MODULES)) {
    if (path.endsWith(`/${normalized}`) || path.endsWith(normalized)) {
      return url;
    }
  }
  for (const [path, url] of Object.entries(ICON_MODULES)) {
    if (path.endsWith(`/${normalized}`) || path.endsWith(normalized)) {
      return url;
    }
  }
  return null;
}

/** Map in-doc `.md` links to on-site routes (locale-aware). */
export function resolveMarkdownHref(href: string, locale: Locale = 'en'): string | null {
  if (!href || href.startsWith('http://') || href.startsWith('https://')) return null;

  const [pathPart, hash = ''] = href.split('#');
  const filename = pathPart.split('/').pop() ?? pathPart;
  if (!filename.endsWith('.md')) return null;

  for (const entry of ALL_ENTRIES) {
    if (entry.file.endsWith(filename) || entry.file === pathPart) {
      return localePath(`/documentation/${entry.slug}${hash ? `#${hash}` : ''}`, locale);
    }
  }
  return null;
}
