// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { tableBody, type ChartTableCell, type ChartTableColumn } from '../../core/chart-table';
import type { ChartEncoding, ChartTemplateDef } from '../../core/types';

/** The channel a Table gives each field: one per column, named for the field. */
export const tableColumnChannel = (field: string) => `column:${field}`;

/** The height of one line of the drawn grid, px. */
const LINE_HEIGHT = 22;
/** The air between a column's edge and its text, px. */
const CELL_INSET = 8;

/** The fields of the rows, in the order they first appear. */
function rowFields(rows: readonly Record<string, unknown>[]): string[] {
    const fields = new Set<string>();
    for (const row of rows) for (const field of Object.keys(row ?? {})) fields.add(field);
    return [...fields];
}

interface GridText {
    column: number;
    line: number;
    text: string;
    header: boolean;
    align: 'left' | 'right';
    dx: number;
}

/**
 * The table as lines of text, header first, as many rows as the height holds; when rows are left
 * out, the last line says how many.
 */
function gridTexts(columns: ChartTableColumn[], rows: ChartTableCell[][], width: number, height: number): GridText[] {
    const step = width / Math.max(1, columns.length);
    const place = (column: number): Pick<GridText, 'align' | 'dx'> => (columns[column].align === 'end'
        ? { align: 'right', dx: step / 2 - CELL_INSET }
        : { align: 'left', dx: -step / 2 + CELL_INSET });
    const lines = Math.max(2, Math.floor(height / LINE_HEIGHT));
    const shown = rows.length < lines ? rows.length : lines - 2;
    const texts: GridText[] = columns.map((column, i) => ({ column: i, line: 0, text: column.title, header: true, ...place(i) }));
    rows.slice(0, shown).forEach((row, r) => row.forEach((cell, i) =>
        texts.push({ column: i, line: r + 1, text: cell.text, header: false, ...place(i) })));
    if (shown < rows.length) {
        texts.push({ column: 0, line: shown + 1, text: `+${rows.length - shown} more rows`, header: false, ...place(0), align: 'left', dx: -step / 2 + CELL_INSET });
    }
    return texts;
}

/**
 * Table — the rows as given, one column per field in the order the rows hold them. The author
 * shapes the rows (selects, renames through `field_display_names`, aggregates); Flint titles,
 * formats and styles them. A host with a page draws it with `FlintTable`; the compiled spec is a
 * grid of text for static output.
 */
export const tableDef: ChartTemplateDef = {
    chart: 'Table',
    template: { mark: 'text' },
    channels: [],
    drawnAs: 'table',
    interactionSupport: {},
    tableColumns: 'as-given',
    markCognitiveChannel: 'position',
    normalizeEncodings: (_encodings, rows) => Object.fromEntries(
        rowFields(rows).map((field): [string, ChartEncoding] => [tableColumnChannel(field), { field }]),
    ),
    structure: () => ({ marks: ['rule', 'text'], stacking: 'none' }),
    semanticInteractions: ({ encodings, channelSemantics }) => {
        const fields = Object.values(encodings ?? {}).flatMap((encoding) => (encoding?.field ? [encoding.field] : []));
        const temporal = Object.values(channelSemantics ?? {}).flatMap((cs) => (cs.type === 'temporal' ? [cs.field] : []));
        return {
            fields,
            provenanceFields: fields,
            temporalProvenanceFields: temporal,
            selectableMarks: [],
            resolve: () => null,
            presentUpdate: (update) => update,
        };
    },
    instantiate: (spec, ctx) => {
        const { columns, rows } = tableBody({
            encodings: ctx.encodings,
            channelSemantics: ctx.channelSemantics,
            displayNames: ctx.fieldDisplayNames,
            columnOrder: 'as-given',
        }, ctx.table);
        const width = ctx.plot?.width ?? ctx.canvasSize.width;
        const texts = gridTexts(columns, rows, width, ctx.plot?.height ?? ctx.canvasSize.height);
        const lines = texts.reduce((most, text) => Math.max(most, text.line + 1), 1);
        const linear = (domain: [number, number], reverse = false) => ({ domain, nice: false, ...(reverse ? { reverse: true } : {}) });
        const x = { field: 'x', type: 'quantitative', axis: null, scale: linear([0, columns.length]) };
        const y = { type: 'quantitative', axis: null, scale: linear([0, lines], true) };
        const text = (role: 'header' | 'cell') => ({
            __tableRole: role,
            transform: [{ filter: role === 'header' ? 'datum.header' : '!datum.header' }, { calculate: 'datum.column + 0.5', as: 'x' }, { calculate: 'datum.line + 0.5', as: 'y' }],
            mark: { type: 'text', baseline: 'middle', align: { expr: 'datum.align' }, dx: { expr: 'datum.dx' } },
            encoding: { x, y: { ...y, field: 'y' }, text: { field: 'text' } },
        });
        const rule = (role: 'header-rule' | 'rule', stroke: string) => ({
            __tableRole: role,
            transform: [
                { filter: role === 'header-rule' ? 'datum.line === 0 && datum.column === 0' : 'datum.line > 0 && datum.column === 0' },
                { calculate: 'datum.line + 1', as: 'y' },
            ],
            mark: { type: 'rule', stroke, strokeWidth: 1 },
            encoding: { y: { ...y, field: 'y' }, x: { datum: 0, type: 'quantitative', scale: x.scale, axis: null }, x2: { datum: columns.length } },
        });
        Object.assign(spec, {
            data: { values: texts },
            layer: [rule('rule', '#e2e2e2'), rule('header-rule', '#8a8a8a'), text('header'), text('cell')],
        });
        delete spec.mark;
    },
};
