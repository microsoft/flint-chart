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

const foodNames = [...new Set(foodPrices.values.map(({ item }) => item))];
const changesByFood = new Map<string, Map<string, number>>();
for (const { month, item, annualChange } of foodPrices.values) {
  if (annualChange === null) continue;
  const series = changesByFood.get(item) ?? new Map<string, number>();
  series.set(month, annualChange);
  changesByFood.set(item, series);
}

function pearsonCorrelation(left: Map<string, number>, right: Map<string, number>): number {
  const pairs = [...left].flatMap(([month, leftValue]) => {
    const rightValue = right.get(month);
    return rightValue === undefined ? [] : [[leftValue, rightValue] as const];
  });
  const leftMean = pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length;
  const rightMean = pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (const [leftValue, rightValue] of pairs) {
    const leftDelta = leftValue - leftMean;
    const rightDelta = rightValue - rightMean;
    covariance += leftDelta * rightDelta;
    leftVariance += leftDelta ** 2;
    rightVariance += rightDelta ** 2;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator === 0 ? 0 : covariance / denominator;
}

const correlationValues = foodNames.flatMap((rowFood) =>
  foodNames.map((columnFood) => ({
    rowFood,
    columnFood,
    correlation: pearsonCorrelation(
      changesByFood.get(rowFood) ?? new Map(),
      changesByFood.get(columnFood) ?? new Map(),
    ),
  })),
);

type RedesignVariant = 'sparkline' | 'heatmap';

function chartInput(variant: RedesignVariant, transformed: boolean): ChartAssemblyInput {
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
    data: { values: correlationValues },
    semantic_types: {
      rowFood: 'Category',
      columnFood: 'Category',
      correlation: 'Correlation',
    },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: {
        x: { field: 'columnFood' },
        y: { field: 'rowFood' },
        color: { field: 'correlation' },
      },
      chartProperties: { showTextLabels: transformed },
      baseSize: { width: 390, height: 300 },
      canvasSize: { width: 390, height: 300 },
    },
    field_display_names: {
      rowFood: 'Food',
      columnFood: 'Food',
      correlation: 'Price correlation',
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
      if (variant === 'sparkline') {
        const options = root.querySelectorAll<HTMLElement>('.tc-opt');
        for (const option of options) {
          if (option.textContent?.trim() === 'Sparkline') option.classList.add('redesign-pointer-target');
        }
      } else {
        const controls = root.querySelectorAll<HTMLElement>('.opt');
        for (const control of controls) {
          if (control.querySelector('.opt-label')?.textContent?.trim() === 'Labels') {
            control.classList.add('redesign-pointer-target', 'redesign-property-target');
          }
        }
      }
    };
    const observer = new MutationObserver(markTarget);
    observer.observe(root, { childList: true, subtree: true });
    markTarget();

    const trigger = variant === 'sparkline'
      ? root.querySelector<HTMLButtonElement>('.tc-type')
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
    </div>
  );
}