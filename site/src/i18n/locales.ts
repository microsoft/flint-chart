export const LOCALES = ['en', 'zh-CN'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** URL path segment for a locale. English has no prefix. */
export const LOCALE_URL_SEGMENT: Record<Locale, string | null> = {
  en: null,
  'zh-CN': 'zh',
};

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Map a URL segment (`zh`) to a locale. */
export function localeFromUrlSegment(segment: string | undefined): Locale | null {
  if (!segment) return null;
  if (segment === 'zh') return 'zh-CN';
  return null;
}
