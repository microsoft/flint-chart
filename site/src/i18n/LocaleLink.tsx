import { Link, type LinkProps } from 'react-router-dom';
import { useLocale } from '../i18n/LocaleContext';

/** react-router Link that automatically prefixes the current locale. */
export function LocaleLink({ to, ...rest }: LinkProps) {
  const { lp } = useLocale();
  const localized =
    typeof to === 'string'
      ? lp(to)
      : { ...to, pathname: to.pathname != null ? lp(to.pathname) : to.pathname };
  return <Link to={localized} {...rest} />;
}
