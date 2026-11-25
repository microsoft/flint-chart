import { createElement, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { chartTableRowTest, type ChartTable, type ChartTableFurniture, type ChartTableText } from '../core/chart-table';
import type { ClosingRule } from '../core/rule-plan';
import type { SourceLine, SourcePlan } from '../core/source-plan';
import { canvasFurnitureMarkup, headerFurnitureItems } from '../vegalite/canvas-furniture';
import type { ChartUpdate, UpdateTarget } from '../core/interaction-contracts';

/** The most rows a table draws; the rest are counted below it. */
export const MAX_TABLE_ROWS = 500;

/** The table's inset from its edges, as its cells pad their text. */
const INSET = 10;

/** The opacity of rows outside an emphasis, as charts mute their marks. */
const MUTED_ROW_OPACITY = 0.35;

const TABLE_CSS = `
.flint-table { position: relative; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; background: var(--flint-table-bg); }
.flint-table-heading, .flint-table-note, .flint-table-rule, .flint-table-source, .flint-table-room { flex: none; }
.flint-table-furniture { position: absolute; top: 0; left: 0; pointer-events: none; overflow: visible; }
.flint-table-rule { margin: 0 10px; }
.flint-table-source { padding: 6px 10px 2px; }
.flint-table-source-line { display: flex; justify-content: space-between; gap: 12px; margin: 0; }
.flint-table-source-line a { color: inherit; }
.flint-table-scroll { flex: 1 1 auto; min-height: 0; overflow: auto; }
.flint-table table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.flint-table th { position: sticky; top: 0; z-index: 1; padding: 0; text-align: left; font-weight: inherit;
  white-space: nowrap; background: var(--flint-table-bg); box-shadow: inset 0 -1px 0 var(--flint-table-header-rule); }
.flint-table th button { display: inline-flex; align-items: baseline; gap: 4px; width: 100%; padding: 6px 10px;
  border: 0; background: none; font: inherit; color: inherit; text-align: inherit; cursor: pointer; }
.flint-table th.flint-table-end button { flex-direction: row-reverse; }
.flint-table-sort { font-size: 0.7em; min-width: 0.8em; }
.flint-table td { padding: 5px 10px; border-bottom: 1px solid var(--flint-table-rule); vertical-align: top; }
.flint-table .flint-table-end { text-align: right; }
.flint-table-note { margin: 0; padding: 6px 10px; font-style: italic; }
.flint-table-heading { padding: 2px 10px 8px; }
.flint-table-title, .flint-table-subtitle { margin: 0; line-height: 1.3; }
`;

export interface TableSort {
    column: number;
    descending: boolean;
}

/** A test for the rows the update layers emphasize, or null when none of them emphasizes a set the table can read. */
export function emphasizedRows(table: ChartTable, updates: readonly ChartUpdate[]): ((row: number) => boolean) | null {
    const tests = updates.flatMap((update) => update.ops.flatMap((op) => {
        if (op.op !== 'set-style' || (op.value.state !== 'emphasized' && op.value.state !== 'focused')) return [];
        return (op.targets as readonly UpdateTarget[]).flatMap((target) => {
            if (!('select' in target)) return [];
            const test = chartTableRowTest(table, target);
            return test ? [test] : [];
        });
    }));
    return tests.length > 0 ? (row) => tests.some((test) => test(row)) : null;
}

function compare(a: number | string, b: number | string): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** The table's row indices in the order a sort puts them; the drawn order without one. */
export function sortedRows(table: ChartTable, sort: TableSort | null): number[] {
    const rows = table.rows.map((_row, i) => i);
    if (!sort) return rows;
    const sign = sort.descending ? -1 : 1;
    return rows.sort((a, b) => sign * compare(table.rows[a][sort.column].order, table.rows[b][sort.column].order));
}

/** The sort a click on a column heading turns to: measures first descending, then the other way, then none. */
export function nextSort(table: ChartTable, now: TableSort | null, column: number): TableSort | null {
    const measureFirst = table.columns[column].align === 'end';
    if (now?.column !== column) return { column, descending: measureFirst };
    return now.descending === measureFirst ? { column, descending: !now.descending } : null;
}

/** The lines under the table: rows it leaves out, rows the chart cut, and what the chart computes itself. */
export function tableNotes(table: ChartTable, shown: number): string[] {
    return [
        shown < table.rows.length ? `${shown} of ${table.rows.length} rows shown` : '',
        table.total > table.rows.length ? `the chart draws ${table.rows.length} of ${table.total} rows` : '',
        table.computes.length > 0 ? `the chart computes its ${table.computes.join(', ')} from these rows` : '',
    ].filter(Boolean);
}

/** A theme's closing rule across the table's width. */
function ruleElement(rule: ClosingRule, key: number) {
    return createElement('div', {
        key,
        className: 'flint-table-rule',
        style: { height: rule.height, background: rule.color ?? 'currentColor', ...(rule.stated ? { width: rule.width } : {}) },
    });
}

/** The words of one source line, its runs in their weights. */
function sourceRuns(line: SourceLine) {
    const runs = line.runs.map((run, i) => createElement('span', {
        key: i,
        style: { fontWeight: run.fontWeight, fontStyle: run.fontStyle },
    }, (i > 0 ? ' ' : '') + run.text));
    return line.href ? createElement('a', { href: line.href, target: '_blank', rel: 'noopener' }, runs) : runs;
}

/** The source line at the table's foot, as the chart sets it: the lines from the top, a credit at the other end. */
function sourceElement(source: SourcePlan) {
    const rows = [...new Set(source.lines.map((line) => line.bottom))].sort((a, b) => b - a);
    const image = source.creditImage;
    return createElement('div', {
        className: 'flint-table-source',
        style: { fontFamily: source.font, fontSize: source.fontSize, color: source.color, lineHeight: `${source.lineHeight}px` },
    },
        source.rule
            ? createElement('div', { style: { borderTop: `${source.rule.width}px ${source.rule.dash ? 'dashed' : 'solid'} ${source.rule.color}`, marginBottom: 6 } })
            : null,
        rows.map((bottom, row) => {
            const at = source.lines.filter((line) => line.bottom === bottom);
            const start = at.filter((line) => line.align === 'start');
            const end = at.filter((line) => line.align === 'end');
            const credit = row === 0 && image
                ? createElement('img', { src: image.src, alt: image.alt, width: image.width, height: image.height, style: { verticalAlign: 'middle' } })
                : null;
            return createElement('p', { key: bottom, className: 'flint-table-source-line' },
                createElement('span', null, start.map((line, i) => createElement('span', { key: i }, sourceRuns(line))), image?.align === 'start' ? credit : null),
                createElement('span', { style: { textAlign: 'right' } }, end.map((line, i) => createElement('span', { key: i }, sourceRuns(line))), image?.align === 'end' ? credit : null));
        }));
}

/** The width of an element as laid out, followed as it changes; 0 until measured. */
function useWidth(watch: boolean): [RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const element = ref.current;
        if (!watch || !element || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
        observer.observe(element);
        return () => observer.disconnect();
    }, [watch]);
    return [ref, width];
}

function textStyle(text: ChartTableText): CSSProperties {
    return { fontFamily: text.font, fontSize: text.fontSize, fontWeight: text.fontWeight, fontStyle: text.fontStyle, color: text.color };
}

export interface FlintTableProps {
    /** The table to draw: `vegaLiteTable(input)` for a chart's drawn rows. */
    table: ChartTable;
    /** Update layers whose emphasis marks rows, as the chart they come from marks its marks. */
    updates?: readonly ChartUpdate[];
    className?: string;
    style?: CSSProperties;
}

const NO_UPDATES: readonly ChartUpdate[] = [];

/**
 * A chart's table in the chart's theme: headings sort, rows an emphasis names stay in full ink. Only
 * the rows scroll: the title, subtitle and notes stay in place, and the column headings stick.
 */
export function FlintTable({ table, updates = NO_UPDATES, className, style }: FlintTableProps) {
    const [sort, setSort] = useState<TableSort | null>(null);
    const order = useMemo(() => sortedRows(table, sort), [table, sort]);
    const emphasized = useMemo(() => emphasizedRows(table, updates), [table, updates]);
    const shown = order.slice(0, MAX_TABLE_ROWS);
    const scroller = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const box = scroller.current;
        const row = box?.querySelector<HTMLElement>('tbody tr[data-emphasized]');
        if (!box || !row) return;
        const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
        const view = box.getBoundingClientRect();
        const at = row.getBoundingClientRect();
        if (at.top < view.top + head || at.bottom > view.bottom) box.scrollTop += at.top - view.top - head;
    }, [emphasized, order]);
    const { style: look } = table;
    const notes = tableNotes(table, shown.length);
    const furniture: ChartTableFurniture | undefined = table.furniture;
    const headerPlan = furniture?.header;
    const [root, width] = useWidth(!!headerPlan);
    const headerItems = headerPlan && width > 0 ? headerFurnitureItems(headerPlan, { left: INSET, right: INSET, top: 0 }) : [];
    const headerRoom = headerPlan ? headerPlan.edge + headerPlan.line : 0;
    const topRules = furniture?.rules.filter((rule) => rule.edge === 'top') ?? [];
    const footRules = furniture?.rules.filter((rule) => rule.edge === 'bottom') ?? [];
    const header = table.columns.map((column, i) => createElement('th', {
        key: column.field,
        scope: 'col',
        className: column.align === 'end' ? 'flint-table-end' : undefined,
        style: textStyle(look.header),
        'aria-sort': sort?.column === i ? (sort.descending ? 'descending' : 'ascending') : 'none',
    }, createElement('button', { type: 'button', title: `Sort by ${column.title}`, onClick: () => setSort((now) => nextSort(table, now, i)) },
        column.title,
        createElement('span', { className: 'flint-table-sort', 'aria-hidden': true }, sort?.column === i ? (sort.descending ? '▼' : '▲') : ''))));
    const body = shown.map((row) => createElement('tr', {
        key: row,
        'data-emphasized': emphasized?.(row) || undefined,
        style: emphasized && !emphasized(row) ? { opacity: MUTED_ROW_OPACITY } : undefined,
    }, table.rows[row].map((cell, i) => createElement('td', {
        key: table.columns[i].field,
        className: table.columns[i].align === 'end' ? 'flint-table-end' : undefined,
    }, cell.text))));
    return createElement('div', {
        ref: root,
        className: className ? `flint-table ${className}` : 'flint-table',
        style: {
            '--flint-table-bg': look.background,
            '--flint-table-rule': look.rule,
            '--flint-table-header-rule': look.headerRule,
            ...style,
        } as CSSProperties,
    },
        createElement('style', null, TABLE_CSS),
        headerItems.length > 0
            ? createElement('svg', {
                className: 'flint-table-furniture',
                width,
                height: Math.max(...headerItems.map((item) => (item.y ?? 0) + item.height)),
                'aria-hidden': true,
                dangerouslySetInnerHTML: { __html: canvasFurnitureMarkup(headerItems, width) },
            })
            : null,
        headerPlan && !table.heading ? createElement('div', { className: 'flint-table-room', style: { height: headerRoom } }) : null,
        table.heading
            ? createElement('div', {
                className: 'flint-table-heading',
                style: headerPlan ? { paddingTop: headerRoom + 2, paddingLeft: INSET + headerPlan.beside.start, paddingRight: INSET + headerPlan.beside.end } : undefined,
            },
                table.heading.title ? createElement('p', { className: 'flint-table-title', style: textStyle(table.heading.style.title) }, table.heading.title) : null,
                table.heading.subtitle ? createElement('p', { className: 'flint-table-subtitle', style: textStyle(table.heading.style.subtitle) }, table.heading.subtitle) : null)
            : null,
        ...topRules.map((rule, i) => ruleElement(rule, i)),
        createElement('div', { ref: scroller, className: 'flint-table-scroll' },
            createElement('table', null,
                createElement('thead', null, createElement('tr', null, header)),
                createElement('tbody', { style: textStyle(look.body) }, body))),
        notes.length > 0
            ? createElement('p', { className: 'flint-table-note', style: { ...textStyle(look.header), fontSize: Math.max(10, look.header.fontSize - 1) } }, notes.join(' · '))
            : null,
        ...footRules.map((rule, i) => ruleElement(rule, i)),
        furniture?.source ? sourceElement(furniture.source) : null);
}
