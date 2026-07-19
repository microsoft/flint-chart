import { DEFAULT_LOCALE, LOCALE_URL_SEGMENT, localeFromUrlSegment, type Locale } from './locales';

/**
 * Prefix an absolute app path with the locale segment when needed.
 * Examples: localePath('/gallery', 'zh-CN') → '/zh/gallery'
 *           localePath('/', 'zh-CN') → '/zh'
 *           localePath('/gallery', 'en') → '/gallery'
 */
export function localePath(path: string, locale: Locale = DEFAULT_LOCALE): string {
  const [pathname, hash = ''] = path.split('#');
  const [base, query = ''] = pathname.split('?');
  let normalized = base || '/';
  if (!normalized.startsWith('/')) normalized = `/${normalized}`;

  // Strip an existing locale prefix so callers can re-prefix safely.
  const stripped = stripLocale(normalized);
  const segment = LOCALE_URL_SEGMENT[locale];
  let withLocale: string;
  if (!segment) {
    withLocale = stripped;
  } else if (stripped === '/') {
    withLocale = `/${segment}`;
  } else {
    withLocale = `/${segment}${stripped}`;
  }

  const withQuery = query ? `${withLocale}?${query}` : withLocale;
  return hash ? `${withQuery}#${hash}` : withQuery;
}

/** Remove a leading `/zh` locale segment from a pathname. */
export function stripLocale(pathname: string): string {
  if (pathname === '/zh') return '/';
  if (pathname.startsWith('/zh/')) {
    const rest = pathname.slice(3);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname || '/';
}

/** Detect locale from a react-router pathname (`/zh/gallery` → zh-CN). */
export function localeFromPathname(pathname: string): Locale {
  const first = pathname.split('/').filter(Boolean)[0];
  return localeFromUrlSegment(first) ?? DEFAULT_LOCALE;
}

/**
 * Swap the locale prefix on the current path, preserving query/hash handled by the caller.
 * `pathWithoutLocale` should already be stripLocale'd (e.g. `/gallery/vegalite`).
 */
export function pathForLocale(pathWithoutLocale: string, locale: Locale): string {
  return localePath(pathWithoutLocale || '/', locale);
}
