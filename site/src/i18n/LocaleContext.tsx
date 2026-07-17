import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { DEFAULT_LOCALE, type Locale } from './locales';
import { localePath, pathForLocale, stripLocale } from './paths';

type LocaleContextValue = {
  locale: Locale;
  /** Prefix a path for the current locale. */
  lp: (path: string) => string;
  /** Navigate to the same logical path in another locale. */
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const { i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (i18n.language !== locale) {
      void i18n.changeLanguage(locale);
    }
    document.documentElement.lang = locale === 'zh-CN' ? 'zh-CN' : 'en';
    try {
      localStorage.setItem('flint-chart.locale', locale);
    } catch {
      // Privacy modes may block storage.
    }
  }, [i18n, locale]);

  const lp = useCallback((path: string) => localePath(path, locale), [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      const logical = stripLocale(location.pathname);
      const nextPath = pathForLocale(logical, next);
      navigate({ pathname: nextPath, search: location.search, hash: location.hash });
    },
    [location.hash, location.pathname, location.search, navigate],
  );

  const value = useMemo(
    () => ({ locale, lp, setLocale }),
    [locale, lp, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: DEFAULT_LOCALE,
      lp: (path: string) => localePath(path, DEFAULT_LOCALE),
      setLocale: () => undefined,
    };
  }
  return ctx;
}
