// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

export const excelPieChartDef: ExcelTemplateDef = {
    chart: 'Pie Chart',
    channels: ['color', 'size', 'theta'],
    typeMapping: { vertical: 'Pie', noAxes: true },
};

export const excelDonutChartDef: ExcelTemplateDef = {
    chart: 'Donut Chart',
    channels: ['color', 'size', 'theta'],
    typeMapping: { vertical: 'Doughnut', noAxes: true },
};