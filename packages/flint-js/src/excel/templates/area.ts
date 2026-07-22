// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

export const excelAreaChartDef: ExcelTemplateDef = {
    chart: 'Area Chart',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'Area' },
    validate: ({ typeOf }) => typeOf('y') !== 'quantitative'
        ? 'requires a quantitative y field for a native Excel area chart'
        : undefined,
};