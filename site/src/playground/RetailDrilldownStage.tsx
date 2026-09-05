import { useEffect, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { buildInteractiveChart } from 'flint-chart/interactive';
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
      baseSize: { width: 560, height: 400 },
      canvasSize: { width: 560, height: 400 },
    },
  };
}

export function RetailDrilldownStage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const activeSurfaceRef = useRef<{
    layer: HTMLDivElement;
    surface: ReturnType<typeof buildInteractiveChart>;
  }>();
  const [windowRange, setWindowRange] = useState({ start: 0, end: MONTH_COUNT });

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const rows = ALL_PRICES.filter((row) => (
      row.MonthIndex >= windowRange.start && row.MonthIndex < windowRange.end
    ));
    const layer = document.createElement('div');
    layer.className = 'retail-drilldown-layer';
    layer.style.visibility = 'hidden';
    mount.append(layer);
    const surface = buildInteractiveChart(layer, chartInput(rows), {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [],
      ariaLabel: 'Monthly U.S. food basket price composition with wheel zoom',
      chartId: 'food-price-zoom',
    });
    let committed = false;
    let cancelled = false;
    void surface.ready
      .then(() => {
        if (cancelled || !mount.isConnected) {
          surface.destroy();
          layer.remove();
          return;
        }
        const previous = activeSurfaceRef.current;
        layer.style.visibility = 'visible';
        activeSurfaceRef.current = { layer, surface };
        committed = true;
        previous?.surface.destroy();
        previous?.layer.remove();
      })
      .catch(() => {
        surface.destroy();
        layer.remove();
      });
    return () => {
      cancelled = true;
      if (!committed) {
        surface.destroy();
        layer.remove();
      }
    };
  }, [windowRange]);

  useEffect(() => () => {
    activeSurfaceRef.current?.surface.destroy();
    activeSurfaceRef.current?.layer.remove();
    activeSurfaceRef.current = undefined;
  }, []);

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
    <div className="retail-drilldown-stage">
      <div className="retail-drilldown-chart">
        <div ref={mountRef} className="retail-drilldown-mount" />
      </div>
    </div>
  );
}