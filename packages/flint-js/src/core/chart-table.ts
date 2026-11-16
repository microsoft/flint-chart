// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A chart's data as a table: the rows the chart draws (aggregated, after overflow), one column per
 * field it encodes, titled and printed as the chart names and prints them, in the theme's type and
 * inks. Backend-free; a backend supplies the analysis and plan it compiled the chart from.
 */
import { format as formatNumber } from 'd3-format';
import { utcFormat } from 'd3-time-format';
import type { ChartAnalysis } from './analyze';
import { fullValueFormat } from './field-semantics';
import type { HeaderPlan } from './header-plan';
import type { LayoutPlan } from './plan';
import type { ClosingRule } from './rule-plan';
import type { SourcePlan } from './source-plan';
import { chartDisplayNames, encodingTitle, titleText, type ChartStructure } from './structure';
import { applyTextCase } from './text-case';
import { selectorRowTest, type RowComparison } from './target-selector';
import type { DesignDecisions, ResolvedText } from './theme/types';
import type { FormatSpec } from './field-semantics';
import type { SemanticTargetSelector } from './interaction-contracts';
import type { ChannelSemantics, ChartAssemblyInput, ChartEncoding, ChartTemplateDef } from './types';

export interface ChartTableColumn {
    /** The field the column holds, as the drawn rows name it (`revenue_sum`, `_count`). */
    field: string;
    /** The column heading: the title the chart gives the field. */
    title: string;
    /** The channels that draw the field. */
    channels: string[];
    type: ChannelSemantics['type'];
    align: 'start' | 'end';
}

export interface ChartTableCell {
    /** The value as the data writes it. */
    value: unknown;
    /** The value as the chart prints it. */
    text: string;
    /** What the cell sorts by: a number for measures and dates, else the text or its place in a canonical order. */
    order: number | string;
}

export interface ChartTableText {
    font?: string;
    fontSize: number;
    fontWeight?: ResolvedText['fontWeight'];
    fontStyle?: ResolvedText['fontStyle'];
    color: string;
}

export interface ChartTableStyle {
    background: string;
    header: ChartTableText;
    body: ChartTableText;
    /** The line under the header. */
    headerRule: string;
    /** The lines between rows. */
    rule: string;
}

/** The chart's title and subtitle, set above the table in the theme's headline and deck. */
export interface ChartTableHeading {
    title?: string;
    subtitle?: string;
    style: { title: ChartTableText; subtitle: ChartTableText };
}

export interface ChartTable {
    /** The chart's title and subtitle; absent when the chart has neither. */
    heading?: ChartTableHeading;
    columns: ChartTableColumn[];
    /** One row per drawn mark row, cells in column order. */
    rows: ChartTableCell[][];
    /** Rows the data holds after aggregation; more than `rows` when the chart cut some to fit. */
    total: number;
    /** What the chart computes from these rows itself (`count`, `density`, `fit`, `summary`); empty when it draws them as they are. */
    computes: string[];
    /** How the chart compares the cells' values, so a selection on the chart names the same rows. */
    comparison: RowComparison;
    style: ChartTableStyle;
    /** The theme's furniture as the chart draws it; absent when the theme draws none. */
    furniture?: ChartTableFurniture;
}

/** What the chart's theme draws around its title and at its foot, planned at the chart's width. */
export interface ChartTableFurniture {
    /** The pieces on the top edge, above and beside the title. */
    header?: HeaderPlan;
    /** The rules below the heading (`edge: 'top'`) and at the foot (`edge: 'bottom'`). */
    rules: ClosingRule[];
    /** The source line at the foot. */
    source?: SourcePlan;
}

/** The smallest text a table sets, whatever size the theme fitted its axis labels to. */
const MIN_TABLE_FONT = 11;

/** Marks that draw a summary of their rows rather than the rows. */
const SUMMARY_MARKS = new Set(['boxplot', 'errorbar', 'errorband']);

function computedMeasures(structure: ChartStructure): string[] {
    const axes = [structure.x, structure.y, structure.angle, structure.radius];
    return [...new Set([
        ...axes.flatMap((axis) => (axis?.derived ? [axis.derived] : [])),
        ...(axes.some((axis) => axis?.fitted) ? ['fit'] : []),
        ...(structure.marks.some((mark) => SUMMARY_MARKS.has(mark)) ? ['summary'] : []),
    ])];
}

function tableText(text: ResolvedText, font: string | undefined, color: string): ChartTableText {
    return {
        ...(text.font ?? font ? { font: text.font ?? font } : {}),
        fontSize: Math.max(MIN_TABLE_FONT, text.fontSize ?? MIN_TABLE_FONT),
        ...(text.fontWeight !== undefined ? { fontWeight: text.fontWeight } : {}),
        ...(text.fontStyle ? { fontStyle: text.fontStyle } : {}),
        color: text.color ?? color,
    };
}

/** The table in the chart's surface, in the table roles its theme grounded. */
export function chartTableStyle(design: DesignDecisions): ChartTableStyle {
    return {
        background: design.surface.plot ?? design.surface.canvas,
        header: tableText(design.table.header, design.font, design.text.secondary),
        body: tableText(design.table.cell, design.font, design.text.primary),
        headerRule: design.table.headerRule,
        rule: design.table.rule,
    };
}

function printNumber(value: number, spec: FormatSpec | undefined): string {
    const shown = spec?.pattern ? formatNumber(spec.pattern)(value) : String(value);
    return `${spec?.prefix ?? ''}${shown}${spec?.suffix ?? ''}`;
}

function numberOf(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
}

/** How a column prints and orders its values. */
function columnCells(cs: ChannelSemantics, values: readonly unknown[], drawn: readonly unknown[]): ChartTableCell[] {
    if (cs.type === 'quantitative') {
        const numbers = values.map(numberOf);
        const spec = fullValueFormat(cs, numbers.filter(Number.isFinite));
        return values.map((value, i) => {
            const number = numbers[i];
            return Number.isFinite(number)
                ? { value, text: printNumber(number, spec), order: number }
                : { value, text: value == null ? '' : String(value), order: Number.NEGATIVE_INFINITY };
        });
    }
    if (cs.type === 'temporal') {
        const print = utcFormat(cs.temporalFormat ?? '%Y-%m-%d');
        return values.map((value, i) => {
            const time = Date.parse(String(drawn[i]));
            const order = Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
            if (value == null) return { value, text: '', order };
            const written = typeof value === 'string' || Number.isNaN(time);
            return { value, text: written ? String(value) : print(new Date(time)), order };
        });
    }
    const canonical = cs.ordinalSortOrder;
    return values.map((value) => {
        const text = value == null ? '' : String(value);
        const place = canonical?.indexOf(text) ?? -1;
        return { value, text, order: place >= 0 ? place : text };
    });
}

/** What a table is read from: the chart's encodings and their semantics, the names it prints, and its column order. */
export interface TableSource {
    encodings: Record<string, ChartEncoding | ChartEncoding[]>;
    channelSemantics: Record<string, ChannelSemantics>;
    displayNames?: Record<string, string>;
    columnOrder?: ChartTemplateDef['tableColumns'];
}

/** The fields the chart encodes, one column each, in the source's column order. */
function tableColumns(source: TableSource): Array<ChartTableColumn & { semantics: ChannelSemantics }> {
    const { displayNames } = source;
    const byField = new Map<string, ChartTableColumn & { semantics: ChannelSemantics }>();
    for (const [channel, encoding] of Object.entries(source.encodings)) {
        const cs = source.channelSemantics[channel];
        if (!cs?.field || !encoding || Array.isArray(encoding)) continue;
        const known = byField.get(cs.field);
        if (known) {
            known.channels.push(channel);
            continue;
        }
        const named = encodingTitle(channel, encoding as ChartEncoding, cs, displayNames, (name) => name);
        const title = titleText(named.title, cs.field) ?? displayNames?.[cs.field] ?? cs.field;
        byField.set(cs.field, {
            field: cs.field,
            title,
            channels: [channel],
            type: cs.type,
            align: cs.type === 'quantitative' ? 'end' : 'start',
            semantics: cs,
        });
    }
    const columns = [...byField.values()];
    if (source.columnOrder === 'as-given') return columns;
    return [...columns.filter((column) => column.align === 'start'), ...columns.filter((column) => column.align === 'end')];
}

/**
 * The columns and printed cells of the drawn rows. `written` holds the same rows as the author
 * wrote them, where the chart converted dates; cells keep those values and print them.
 */
export function tableBody(
    source: TableSource,
    drawn: readonly Record<string, unknown>[],
    written: readonly Record<string, unknown>[] = drawn,
): { columns: ChartTableColumn[]; rows: ChartTableCell[][] } {
    const columns = tableColumns(source);
    const cells = columns.map((column) => columnCells(
        column.semantics,
        written.map((row) => row[column.field]),
        drawn.map((row) => row[column.field]),
    ));
    return {
        columns: columns.map(({ semantics: _semantics, ...column }) => column),
        rows: drawn.map((_row, r) => cells.map((column) => column[r])),
    };
}

/** The rows a chart draws as a table, from the analysis and plan it was compiled from. */
export function chartTable(input: ChartAssemblyInput, analysis: ChartAnalysis, plan: LayoutPlan): ChartTable {
    const style = chartTableStyle(plan.design);
    const headerCase = plan.design.table.header.textCase;
    const authored = new Map<unknown, Record<string, unknown>>();
    analysis.convertedData.forEach((row, i) => authored.set(row, analysis.data[i]));
    const drawn: Record<string, unknown>[] = plan.rows;
    const { columns, rows } = tableBody({
        encodings: analysis.encodings,
        channelSemantics: analysis.channelSemantics,
        displayNames: chartDisplayNames(input.field_display_names, analysis.staticSeries ?? undefined),
        columnOrder: analysis.template.tableColumns,
    }, drawn, drawn.map((row) => authored.get(row) ?? row));
    const { title, subtitle } = input.chart_spec;
    const heading = typeof title === 'string' || typeof subtitle === 'string' ? {
        ...(typeof title === 'string' ? { title: applyTextCase(title, plan.design.title.headline.textCase) } : {}),
        ...(typeof subtitle === 'string' ? { subtitle: applyTextCase(subtitle, plan.design.title.deck.textCase) } : {}),
        style: {
            title: { fontWeight: 700, ...tableText(plan.design.title.headline, plan.design.font, plan.design.text.primary) },
            subtitle: tableText(plan.design.title.deck, plan.design.font, plan.design.text.secondary),
        },
    } : undefined;
    const rules = plan.rules?.rules ?? [];
    const furniture = plan.header || rules.length > 0 || plan.source
        ? { ...(plan.header ? { header: plan.header } : {}), rules, ...(plan.source ? { source: plan.source } : {}) }
        : undefined;
    return {
        ...(heading ? { heading } : {}),
        ...(furniture ? { furniture } : {}),
        columns: columns.map((column) => ({ ...column, title: applyTextCase(column.title, headerCase) })),
        rows,
        total: analysis.data.length,
        computes: computedMeasures(plan.structure),
        comparison: {
            temporalFields: columns.filter((column) => column.type === 'temporal').map((column) => column.field),
            semanticTypes: input.semantic_types ?? {},
        },
        style,
    };
}

/** A test for the rows a selector names, compared as the chart compares its marks; null when it names a field the table does not show. */
export function chartTableRowTest(table: ChartTable, selector: SemanticTargetSelector): ((row: number) => boolean) | null {
    const fields = table.columns.map((column) => column.field);
    const test = selectorRowTest(selector, fields, table.comparison);
    if (!test) return null;
    const records = table.rows.map((row) => Object.fromEntries(row.map((cell, i) => [fields[i], cell.value])));
    return (row) => test(records[row]);
}
