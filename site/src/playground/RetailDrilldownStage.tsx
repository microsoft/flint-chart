import type { ChartAssemblyInput } from 'flint-chart';
import { navigate } from 'flint-chart/interactive';
import { FlintChart } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import foodPrices from '../data/cpi-food-prices.json';
import './retail-drilldown-stage.css';

const BASKET_FOODS = new Set(['Bananas', 'Eggs', 'Ground beef', 'White bread', 'Whole milk']);
const MONTH_COUNT = new Set(foodPrices.values.map(({ month }) => month)).size;
const MIN_VISIBLE_MONTHS = 6;

const SPEC: ChartAssemblyInput = {
  data: {
    values: foodPrices.values
      .filter(({ item }) => BASKET_FOODS.has(item))
      .map(({ month, item, price }) => ({ Month: month.slice(0, 7), Price: price, Food: item })),
  },
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

const INTERACTIONS = [navigate({
  axes: 'x',
  domainGuard: { minVisibleFraction: MIN_VISIBLE_MONTHS / MONTH_COUNT, maxVisibleFraction: 1, overscrollFraction: 0 },
})];

/**
 * Semantic zoom on one mounted chart. The wheel moves the x viewport, and Flint
 * plans the layout again for the months in view: the bar width, the y domain,
 * the tick density, and the label sizes follow the visible data.
 */
export function RetailDrilldownStage() {
  return (
    <div className="ic-flint-dimpvis-shell retail-drilldown-stage">
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={540} adaptiveHeight>
          <div className="ic-flint-dimpvis-mount retail-drilldown-mount">
            <FlintChart
              spec={SPEC}
              interactions={INTERACTIONS}
              renderer="svg"
              ariaLabel="Monthly U.S. food basket price composition with wheel zoom"
              chartId="food-price-zoom"
            />
          </div>
        </ScaleToFit>
      </div>
    </div>
  );
}
