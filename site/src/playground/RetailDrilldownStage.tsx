import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintChart } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import foodPrices from '../data/cpi-food-prices.json';
import './retail-drilldown-stage.css';

type DrillRow = Record<string, unknown> & {
  Month: string;
  Price: number;
  Key: string;
  MonthIndex: number;
  Food: string;
};

const BASKET_FOODS = new Set(['Bananas', 'Eggs', 'Ground beef', 'White bread', 'Whole milk']);
const MONTHS = [...new Set(foodPrices.values.map(({ month }) => month))].sort();
const MONTH_INDEX = new Map(MONTHS.map((month, index) => [month, index]));
const ALL_PRICES: DrillRow[] = foodPrices.values
  .filter(({ item }) => BASKET_FOODS.has(item))
  .map(({ month, item, price }) => ({
    Month: month.slice(0, 7),
    Price: price,
    Key: `${month}-${item}`,
    MonthIndex: MONTH_INDEX.get(month) ?? 0,
    Food: item,
  }));
const MONTH_COUNT = MONTHS.length;
const MIN_VISIBLE_MONTHS = 6;

interface MonthWindow {
  start: number;
  end: number;
}

const windowKey = ({ start, end }: MonthWindow) => `${start}-${end}`;

function chartInput(rows: DrillRow[]): ChartAssemblyInput {
  return {
    data: { values: rows },
    semantic_types: {
      Month: 'YearMonth',
      Price: { semanticType: 'Price', unit: 'USD' },
      Food: 'Category',
    },
    field_display_names: { Price: 'U.S. average price', Food: 'Food' },
    theme_spec: { extends: 'datawrapper', geometry: { band: { cornerRadius: 2 } } },
    options: { addTooltips: false, targetBandAR: 0 },
    chart_spec: {
      chartType: 'Stacked Bar Chart',
      title: 'What is driving the food basket?',
      subtitle: 'Monthly U.S. average prices for one unit of each item · BLS, Aug 2015–Aug 2025',
      encodings: { x: 'Month', y: 'Price', color: 'Food' },
      // Flint adds the title, subtitle, legend, and axes around this canvas; the
      // rendered SVG lands at about 900 x 520, the size the other stages use.
      baseSize: { width: 816, height: 416 },
      canvasSize: { width: 816, height: 416 },
    },
  };
}

function ZoomLayer({ range, pending, onReady }: {
  range: MonthWindow;
  pending: boolean;
  onReady: () => void;
}) {
  const spec = useMemo(() => chartInput(ALL_PRICES.filter((row) => (
    row.MonthIndex >= range.start && row.MonthIndex < range.end
  ))), [range]);
  return (
    <div
      className={pending ? 'retail-drilldown-layer retail-drilldown-layer-pending' : 'retail-drilldown-layer'}
      style={{ visibility: pending ? 'hidden' : 'visible' }}
    >
      <FlintChart
        spec={spec}
        renderer="svg"
        ariaLabel="Monthly U.S. food basket price composition with wheel zoom"
        chartId="food-price-zoom"
        onRender={onReady}
      />
    </div>
  );
}

/**
 * Semantic zoom by re-layout. Each wheel step picks a narrower month window,
 * and Flint compiles a fresh chart for those rows: the bar step, the y domain,
 * the tick density, and the label formats all follow the visible data. The new
 * chart renders in a hidden layer and swaps in once it is ready.
 */
export function RetailDrilldownStage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [windowRange, setWindowRange] = useState<MonthWindow>({ start: 0, end: MONTH_COUNT });
  const [shownRange, setShownRange] = useState(windowRange);
  const layers = windowKey(shownRange) === windowKey(windowRange) ? [shownRange] : [shownRange, windowRange];

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const rect = mount.getBoundingClientRect();
      const anchor = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      setWindowRange((current) => {
        const span = current.end - current.start;
        const nextSpan = Math.max(
          MIN_VISIBLE_MONTHS,
          Math.min(MONTH_COUNT, Math.round(span * Math.exp(event.deltaY * 0.0015))),
        );
        const anchorMonth = current.start + span * anchor;
        let start = Math.round(anchorMonth - nextSpan * anchor);
        start = Math.max(0, Math.min(MONTH_COUNT - nextSpan, start));
        return { start, end: start + nextSpan };
      });
    };
    mount.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      mount.removeEventListener('wheel', onWheel, { capture: true });
    };
  }, []);

  return (
    <div className="ic-flint-dimpvis-shell retail-drilldown-stage">
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={540} adaptiveHeight>
          <div ref={mountRef} className="ic-flint-dimpvis-mount retail-drilldown-mount">
            {/* A layer keeps its key when it is promoted, so the chart that just rendered is not mounted again. */}
            {layers.map((range) => (
              <ZoomLayer
                key={windowKey(range)}
                range={range}
                pending={range !== shownRange}
                onReady={() => setShownRange(range)}
              />
            ))}
          </div>
        </ScaleToFit>
      </div>
    </div>
  );
}
