import type { CSSProperties, InputHTMLAttributes } from 'react';

type SiteRangeProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'min' | 'max' | 'value'
> & {
  min: number;
  max: number;
  value: number;
};

/**
 * Shared range input with a value-driven filled track.
 *
 * WebKit does not expose a native range-progress pseudo-element, so the site
 * track uses `--pct`. Keeping the calculation here prevents controls without
 * that custom property from displaying the old, misleading 50% fallback.
 */
export function SiteRange({ min, max, value, className, style, ...props }: SiteRangeProps) {
  const percent = max > min
    ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100))
    : 0;

  return (
    <input
      {...props}
      type="range"
      min={min}
      max={max}
      value={value}
      className={className ? `site-range ${className}` : 'site-range'}
      style={{ ...style, '--pct': `${percent}%` } as CSSProperties}
    />
  );
}
