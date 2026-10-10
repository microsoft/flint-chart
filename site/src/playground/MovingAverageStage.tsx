import { useCallback, useMemo, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  axisBrushTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
  type FlintInteractionEventDetail,
  type InteractionDef,
} from 'flint-chart/interactive';
import { FlintChart } from 'flint-chart/react';
import { withHouseId } from '../shared/test-case-utils';
import { expressionInterpreter } from 'vega-interpreter';
import prices from '../data/cpi-food-prices.json';
import './moving-average-stage.css';

/*
 * A dynamic average. One bar per month; a stateful brush across months keeps
 * those bars emphasized and moves a reference line to their mean. One bespoke
 * definition returns both layers on every frame of the drag, so the line
 * follows the brush as it is drawn, moved, or resized, and returns to the
 * mean of every month when the brush is cleared.
 */

const CHART_ID = 'moving-average';
const AVERAGE_ID = 'average';
const MONTH = 'Month';
const PRICE = 'Price ($ per dozen)';
const ITEM = 'Eggs';

type Row = { [MONTH]: string; [PRICE]: number };
const ROWS: readonly Row[] = prices.values
  .filter((row) => row.item === ITEM)
  .map((row) => ({ [MONTH]: row.month.slice(0, 7), [PRICE]: row.price }));
const FIRST = ROWS[0][MONTH];
const LAST = ROWS[ROWS.length - 1][MONTH];
const PEAK = ROWS.reduce((best, row) => (row[PRICE] > best[PRICE] ? row : best));

const meanOf = (values: readonly number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
const monthMs = (month: string) => Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1);
const monthLabel = (month: string) => new Date(monthMs(month)).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });

const ALL_MEAN = meanOf(ROWS.map((row) => row[PRICE]));

/** The reference line across every month, with its value named at the right end. */
function averageOps(mean: number, label: string): ChartUpdate['ops'] {
  const first = monthMs(FIRST);
  const last = monthMs(LAST);
  return [
    {
      op: 'set-overlay',
      name: 'mean',
      value: {
        mark: 'rule',
        role: 'reference',
        data: { values: [{ x: first, y: mean, x2: last, y2: mean }] },
        encodings: { x: { field: 'x' }, y: { field: 'y' }, x2: { field: 'x2' }, y2: { field: 'y2' } },
        style: { stroke: '#1f2328', strokeWidth: 1.5 },
      },
    },
    {
      op: 'set-overlay',
      name: 'mean-label',
      value: {
        mark: 'text',
        role: 'reference-label',
        data: { values: [{ x: last, y: mean, text: label }] },
        encodings: { x: { field: 'x' }, y: { field: 'y' }, text: { field: 'text' } },
        style: { fontSize: 11, fontWeight: 'bold', textAlign: 'end', dy: -6 },
      },
    },
  ];
}

const MOUNT_AVERAGE: readonly ChartUpdate[] = [{ id: AVERAGE_ID, ops: averageOps(ALL_MEAN, `All months $${ALL_MEAN.toFixed(2)}`) }];

export const SPEC = {
  data: { values: [...ROWS] },
  semantic_types: {
    [MONTH]: 'YearMonth',
    [PRICE]: { semanticType: 'Quantity', intrinsicDomain: [0, Math.ceil(PEAK[PRICE] * 2) / 2] },
  },
  chart_spec: {
    chartType: 'Bar Chart',
    title: `A dozen eggs, ${FIRST.slice(0, 4)}–${LAST.slice(0, 4)}`,
    subtitle: 'US city average retail price, by month',
    encodings: { x: MONTH, y: PRICE },
    baseSize: { width: 800, height: 720 },
    canvasSize: { width: 800, height: 720 },
  },
  options: { addTooltips: false },
} as ChartAssemblyInput;

type Selection = { months: string[]; mean: number };

/** The month of an element's value, which a temporal axis holds as a Date or epoch milliseconds. */
function monthOf(value: unknown): string | null {
  if (typeof value === 'string') return /^\d{4}-\d{2}/.test(value) ? value.slice(0, 7) : null;
  const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : NaN;
  return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 7) : null;
}

function selectionOf(event: FlintInteractionEventDetail['event']): Selection | null {
  const rows = (event.target?.elements ?? []).flatMap((element) => {
    const value = element.value as Partial<Record<string, unknown>>;
    const month = monthOf(value[MONTH]);
    const price = Number(value[PRICE]);
    return month && Number.isFinite(price) ? [{ [MONTH]: month, [PRICE]: price } as Row] : [];
  });
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => a[MONTH].localeCompare(b[MONTH]));
  return { months: sorted.map((row) => row[MONTH]), mean: meanOf(sorted.map((row) => row[PRICE])) };
}

export function MovingAverageStage({ themeId }: { themeId?: string | null } = {}) {
  const spec = useMemo(() => withHouseId(SPEC, themeId), [themeId]);
  const [selection, setSelection] = useState<Selection | null>(null);

  const interactions = useMemo<readonly InteractionDef[]>(() => {
    const average: CanvasInteractionDef = {
      id: AVERAGE_ID,
      eventSource: axisBrushTrigger('x', 'intersect', 'stateful'),
      affordances: { plot: { cursor: 'region' } },
      handle(event) {
        if (event.action !== 'brush-x' || event.phase === 'start' || event.phase === 'cancel') return null;
        const target = event.target;
        const picked = target?.elements.map((element) => Number((element.value as Partial<Row>)[PRICE])).filter(Number.isFinite) ?? [];
        if (!target || picked.length === 0) {
          return { id: AVERAGE_ID, ops: averageOps(ALL_MEAN, `All months $${ALL_MEAN.toFixed(2)}`) };
        }
        const mean = meanOf(picked);
        return {
          id: AVERAGE_ID,
          ops: [
            { op: 'set-style', targets: [{ visual: target.visual, elements: target.elements }], value: { state: 'emphasized', mutedOpacity: 0.3 } },
            ...averageOps(mean, `${picked.length} month${picked.length === 1 ? '' : 's'} $${mean.toFixed(2)}`),
          ],
        };
      },
    };
    return [average];
  }, []);

  const onInteraction = useCallback((detail: FlintInteractionEventDetail) => {
    const { event } = detail;
    if (detail.interactionId !== AVERAGE_ID || event.action !== 'brush-x') return;
    if (event.phase === 'preview' || event.phase === 'commit') setSelection(selectionOf(event));
  }, []);

  const status = useMemo(() => {
    if (!selection) {
      return { lead: `Every month: $${ALL_MEAN.toFixed(2)} per dozen`, note: 'Drag across months to average them.' };
    }
    const first = selection.months[0];
    const last = selection.months[selection.months.length - 1];
    const span = first === last ? monthLabel(first) : `${monthLabel(first)} – ${monthLabel(last)}`;
    const delta = selection.mean - ALL_MEAN;
    const count = selection.months.length;
    return {
      lead: `${span}: $${selection.mean.toFixed(2)} per dozen`,
      note: `${count} month${count === 1 ? '' : 's'}, ${delta < 0 ? '−' : '+'}$${Math.abs(delta).toFixed(2)} against every month. Drag the brush to move it; click outside to clear.`,
    };
  }, [selection]);

  return (
    <div className="ic-flint-dimpvis-shell moving-average-shell">
      <div className="ic-flint-dimpvis-panel">
        <div className="ic-flint-dimpvis-mount moving-average-mount">
          <FlintChart
            spec={spec}
            interactions={interactions}
            updates={MOUNT_AVERAGE}
            chartId={CHART_ID}
            ariaLabel="Average price of a dozen eggs by month"
            renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
            onInteraction={onInteraction}
          />
        </div>
      </div>
      <div className="moving-average-footer" aria-live="polite">
        <strong>{status.lead}</strong>
        <span>{status.note}</span>
      </div>
    </div>
  );
}
