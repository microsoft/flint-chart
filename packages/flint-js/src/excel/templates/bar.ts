// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

export const excelBarChartDef: ExcelTemplateDef = {
    chart: 'Bar Chart',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'ColumnClustered', horizontal: 'BarClustered' },
    validate: ({ typeOf }) => typeOf('x') !== 'quantitative' && typeOf('y') !== 'quantitative'
        ? 'requires one quantitative measure axis for a native Excel bar chart'
        : undefined,
};

export const excelGroupedBarChartDef: ExcelTemplateDef = {
    chart: 'Grouped Bar Chart',
    channels: ['x', 'y', 'group'],
    typeMapping: { vertical: 'ColumnClustered', horizontal: 'BarClustered' },
    validate: (context) => excelBarChartDef.validate?.(context)
        ?? (context.typeOf('group') === 'quantitative' || context.typeOf('group') === 'temporal'
            ? 'does not support continuous grouping in a native Excel grouped bar chart'
            : undefined),
};

export const excelStackedBarChartDef: ExcelTemplateDef = {
    chart: 'Stacked Bar Chart',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'ColumnStacked', horizontal: 'BarStacked' },
    validate: (context) => excelBarChartDef.validate?.(context)
        ?? (context.typeOf('color') === 'quantitative' || context.typeOf('color') === 'temporal'
            ? 'does not support continuous color in a native Excel stacked bar chart'
            : undefined),
};