import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Shrink-to-fit wrapper for the photo-wall.
 *
 * Charts render at their *designed* pixel size (which varies widely — wide
 * legends, tall calendars, etc.). This wrapper measures the child's natural
 * layout size (via `offsetWidth/Height`, which ignore CSS transforms) and
 * applies a uniform `scale()` so the chart always fits inside a bounding box
 * without overflowing or distorting its aspect ratio. Charts never scale *up*
 * past their designed size (capped at 1).
 *
 * By default the bounding box is a fixed `height` (uniform tiles). With
 * `adaptiveHeight`, the box instead fills the container *width* and lets its
 * height follow the scaled chart — clamped to `[minHeight, height]` — so a
 * wide, short chart (e.g. faceted small-multiples) uses the full panel width
 * with no wasted vertical space, while a tall/square chart stays capped.
 */
export function ScaleToFit({
  height,
  padding = 0,
  adaptiveHeight = false,
  minHeight = 0,
  fill = false,
  /**
   * Fill the box and crop what hangs off, instead of fitting the whole chart
   * inside it. A mosaic is showing a style rather than a chart, and there the
   * tile is the unit: a chart that stops short of its edges leaves a hole in
   * the wall. Cropping is anchored top-left, where the title, the deck and the
   * value axis are — what gets cut is the tail of a legend or an axis.
   */
  cover = false,
  /** How far the chart may be scaled up. */
  maxScale = 1,
  /**
   * How far it may be scaled *down*. On a wall this is the tighter constraint:
   * type that shrinks by a fifth on one tile and not on its neighbour reads as
   * sloppiness, not as a house.
   */
  minScale = 0,
  children,
}: {
  /** Bounding-box height in px. With `adaptiveHeight` this is the *max* height. */
  height: number;
  /** Inner padding kept clear around the scaled chart. */
  padding?: number;
  /** Fit to width and let the box height follow the chart (capped at `height`). */
  adaptiveHeight?: boolean;
  /** Floor for the box height when `adaptiveHeight` is set. */
  minHeight?: number;
  /**
   * Fill the parent (which must be `position: relative`) and shrink-to-fit its
   * *measured* width AND height, instead of the fixed `height` prop. Use this
   * when the available box is driven by a flex/grid container (e.g. a modal
   * pane) so an oversized chart never overflows a container shorter than
   * `height`.
   */
  fill?: boolean;
  /** Fill and crop rather than fit inside; anchored top-left. */
  cover?: boolean;
  /** Cap on scaling *up*; 1 means a chart is never drawn larger than designed. */
  maxScale?: number;
  /** Floor on scaling *down*; overflow beyond it is cropped when `cover`. */
  minScale?: number;
  children: ReactNode;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [boxHeight, setBoxHeight] = useState(height);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    const measure = () => {
      const natW = inner.offsetWidth;
      const natH = inner.offsetHeight;
      if (!natW || !natH) return;
      const boxW = outer.clientWidth - padding * 2;
      const boxH = (fill ? outer.clientHeight : height) - padding * 2;
      const next = cover
        ? Math.min(Math.max(Math.max(boxW / natW, boxH / natH), minScale), maxScale)
        : Math.min(boxW / natW, boxH / natH, maxScale);
      if (Number.isFinite(next) && next > 0) {
        setScale((prev) => (Math.abs(prev - next) > 0.005 ? next : prev));
        if (adaptiveHeight) {
          const fitted = Math.min(Math.max(natH * next + padding * 2, minHeight), height);
          setBoxHeight((prev) => (Math.abs(prev - fitted) > 0.5 ? fitted : prev));
        }
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(inner);
    ro.observe(outer);
    return () => ro.disconnect();
  }, [height, padding, adaptiveHeight, minHeight, fill, cover, maxScale, minScale]);

  return (
    <div
      ref={outerRef}
      style={{
        position: fill ? 'absolute' : 'relative',
        ...(fill ? { inset: 0 } : { width: '100%', height: adaptiveHeight ? boxHeight : height }),
        overflow: 'hidden',
        display: 'flex',
        alignItems: cover ? 'flex-start' : 'center',
        justifyContent: cover ? 'flex-start' : 'center',
      }}
    >
      <div
        ref={innerRef}
        style={{
          position: 'absolute',
          ...(cover ? { left: 0, top: 0 } : {}),
          transform: `scale(${scale})`,
          transformOrigin: cover ? 'top left' : 'center center',
        }}
      >
        {children}
      </div>
    </div>
  );
}
