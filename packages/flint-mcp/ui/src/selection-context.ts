import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartSelection } from 'flint-chart/interactive';

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).replace(/\|/g, '\\|').replace(/\s+/g, ' ');
}

function bound(value: unknown): string {
  return typeof value === 'number' ? String(Number(value.toPrecision(6))) : cell(value);
}

function rangeText(selection: ChartSelection): string {
  return Object.entries(selection.range ?? {})
    .map(([channel, range]) => `${range.field ?? channel} from ${bound(range.start)} to ${bound(range.end)}`)
    .join(', ');
}

/** The selection as text for the model: what was selected, on which chart, and the rows. */
export function selectionContextText(selection: ChartSelection, input: ChartAssemblyInput): string {
  const chart = `chart "${input.chart_spec.title ?? input.chart_spec.chartType}"`;
  if (selection.rows.length === 0) return `The user cleared the selection on ${chart}.`;
  const range = rangeText(selection);
  const head = `The user selected ${selection.rows.length} row${selection.rows.length === 1 ? '' : 's'} on ${chart}`
    + ` with ${selection.action}${range ? ` (${range})` : ''}:`;
  const columns = [...new Set(selection.rows.flatMap((row) => Object.keys(row)))];
  const table = [
    `| ${columns.join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...selection.rows.map((row) => `| ${columns.map((column) => cell(row[column])).join(' | ')} |`),
  ];
  return [head, '', ...table].join('\n');
}
