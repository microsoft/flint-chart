import { useEffect, useRef } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintAppInner } from '../../../packages/flint-mcp/ui/src/FlintApp';
import foodPrices from '../data/cpi-food-prices.json';
import './chart-redesign-figure.css';

const trendValues = foodPrices.values.map(({ month, item, price }) => ({
  month,
  item,
  price,
}));

// A correlation matrix is symmetric: swapping its axes produces the same
// picture and makes a working transpose control look broken. Use a rectangular
// food-by-month grid here so the two arrangements are visibly distinct.
const heatmapItemCount = new Set(foodPrices.values.map(({ item }) => item)).size;
const heatmapRowsByMonth = new Map<string, number>();
for (const { month, annualChange } of foodPrices.values) {
  if (annualChange === null) continue;
  heatmapRowsByMonth.set(month, (heatmapRowsByMonth.get(month) ?? 0) + 1);
}
let heatmapMonths: string[] = [];
let completeMonthRun: string[] = [];
for (const [month, rowCount] of heatmapRowsByMonth) {
  completeMonthRun = rowCount === heatmapItemCount ? [...completeMonthRun, month] : [];
  if (completeMonthRun.length >= 6) heatmapMonths = completeMonthRun.slice(-6);
}
const heatmapMonthSet = new Set(heatmapMonths);
const heatmapValues = foodPrices.values
  .filter(({ month, annualChange }) => heatmapMonthSet.has(month) && annualChange !== null)
  .map(({ month, item, annualChange }) => ({ month, item, annualChange }));

type RedesignVariant = 'sparkline' | 'heatmap' | 'theme';

/**
 * Gapminder, which is where a house has the most to say: the type scale, the
 * palette a continent scale is cut from, the grid, the axis furniture and the
 * shape of a point — fill, outline and how big a bubble is allowed to get —
 * all move together. A single-series chart would make the switch look like a
 * recolouring.
 */
const gapminderValues = ([
  ['Norway', 64800, 82.3, 5.3, 'Europe'],
  ['United States', 62600, 78.6, 327, 'Americas'],
  ['Japan', 39300, 84.2, 127, 'Asia'],
  ['China', 16800, 76.7, 1393, 'Asia'],
  ['India', 6900, 69.4, 1353, 'Asia'],
  ['Nigeria', 5300, 54.3, 196, 'Africa'],
  ['Brazil', 15600, 75.7, 209, 'Americas'],
  ['Germany', 50900, 81.0, 83, 'Europe'],
  ['Ethiopia', 2000, 66.2, 109, 'Africa'],
  ['Russia', 25800, 72.4, 145, 'Europe'],
  ['Mexico', 19800, 75.0, 126, 'Americas'],
  ['Indonesia', 12400, 71.5, 268, 'Asia'],
  ['Qatar', 116900, 80.1, 2.8, 'Asia'],
  ['South Africa', 13000, 63.9, 57, 'Africa'],
  ['Bangladesh', 4200, 72.3, 161, 'Asia'],
] as [string, number, number, number, string][]).map(
  ([country, income, life, population, continent]) => ({
    country, income, life, population, continent,
  }),
);

function chartInput(variant: RedesignVariant, transformed: boolean): ChartAssemblyInput {
  if (variant === 'theme') {
    return {
      data: { values: gapminderValues },
      semantic_types: {
        country: 'Country',
        income: 'Quantity',
        life: 'Quantity',
        population: 'Quantity',
        continent: 'Category',
      },
      chart_spec: {
        chartType: 'Scatter Plot',
        encodings: {
          x: { field: 'income' },
          y: { field: 'life' },
          size: { field: 'population' },
          color: { field: 'continent' },
        },
        title: 'Wealth and health of nations',
        subtitle: 'Life expectancy vs income per capita, 2018',
        chartProperties: { logScale_x: true },
        // Swiss stacks a colour key and a size key above the plot, which costs
        // about 140px. At this height the taller of the two states lands on
        // the frame exactly, so neither panel has to be scaled down to fit.
        baseSize: { width: 400, height: 260 },
        canvasSize: { width: 400, height: 260 },
      },
      field_display_names: {
        country: 'Country',
        income: 'GDP per capita',
        life: 'Life expectancy',
        population: 'Population (M)',
        continent: 'Continent',
      },
      ...(transformed ? { theme_spec: 'swiss' } : {}),
    };
  }

  if (variant === 'sparkline') {
    return {
      data: { values: trendValues },
      semantic_types: {
        month: 'YearMonth',
        item: 'Category',
        price: { semanticType: 'Price', unit: 'USD' },
      },
      chart_spec: {
        chartType: transformed ? 'Sparkline' : 'Line Chart',
        encodings: {
          x: { field: 'month' },
          y: { field: 'price' },
          color: { field: 'item' },
        },
        baseSize: { width: 400, height: 300 },
        canvasSize: { width: 400, height:400 },
      },
      field_display_names: { month: 'Month', item: 'Food', price: 'Average price' },
    };
  }

  return {
    data: { values: heatmapValues },
    semantic_types: {
      month: 'YearMonth',
      item: 'Category',
      annualChange: 'Percentage',
    },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: {
        x: { field: 'month' },
        y: { field: 'item' },
        color: { field: 'annualChange' },
      },
      chartProperties: { showValueLabels: transformed },
      baseSize: { width: 390, height: 300 },
      canvasSize: { width: 390, height: 300 },
    },
    field_display_names: {
      month: 'Month',
      item: 'Food',
      annualChange: 'Annual price change (%)',
    },
  };
}

const mockApp = {
  sendMessage: async () => undefined,
};

function McpView({
  variant,
  transformed,
  showInteraction = false,
}: {
  variant: RedesignVariant;
  transformed: boolean;
  showInteraction?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const menuOpenRequestedRef = useRef(false);

  useEffect(() => {
    if (!showInteraction || !rootRef.current) return;
    const root = rootRef.current;
    const markTarget = () => {
      if (variant === 'theme') {
        const options = root.querySelectorAll<HTMLElement>('.tc-opt');
        for (const option of options) {
          if (option.textContent?.trim() === 'Swiss') option.classList.add('redesign-pointer-target');
        }
      } else if (variant === 'sparkline') {
        const options = root.querySelectorAll<HTMLElement>('.tc-opt');
        for (const option of options) {
          if (option.textContent?.trim() === 'Sparkline') option.classList.add('redesign-pointer-target');
        }
      } else {
        const controls = root.querySelectorAll<HTMLElement>('.opt');
        for (const control of controls) {
          if (control.querySelector('.opt-label')?.textContent?.trim() === 'Values') {
            control.classList.add('redesign-pointer-target', 'redesign-property-target');
          }
        }
      }
    };
    const observer = new MutationObserver(markTarget);
    observer.observe(root, { childList: true, subtree: true });
    markTarget();

    // The theme switch and the chart-type switch share `.tc-type` for their
    // styling, and the theme one renders first — so an unqualified selector
    // opens the wrong menu.
    const trigger = variant === 'sparkline'
      ? root.querySelector<HTMLButtonElement>('.tc-type-chart')
      : variant === 'theme'
        ? root.querySelector<HTMLButtonElement>('.tc-type-theme')
        : null;
    if (trigger && !menuOpenRequestedRef.current && trigger.getAttribute('aria-expanded') !== 'true') {
      menuOpenRequestedRef.current = true;
      trigger.click();
    }
    return () => observer.disconnect();
  }, [showInteraction, variant]);

  return (
    <div className="redesign-real-mcp" ref={rootRef}>
      <FlintAppInner
        app={mockApp as never}
        input={chartInput(variant, transformed)}
      />
    </div>
  );
}

function RedesignExample({ variant }: { variant: RedesignVariant }) {
  return (
    <section className="chart-redesign-figure" aria-label={`${variant} chart redesign interaction`}>
      <McpView variant={variant} transformed={false} showInteraction />
      <div className="redesign-arrow" aria-hidden="true"><span /></div>
      <McpView variant={variant} transformed />
    </section>
  );
}

export function ChartRedesignFigure() {
  return (
    <div className="chart-redesign-showcase">
      <RedesignExample variant="sparkline" />
      <RedesignExample variant="heatmap" />
      <RedesignExample variant="theme" />
    </div>
  );
}