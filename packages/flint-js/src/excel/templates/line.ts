// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

export const excelLineChartDef: ExcelTemplateDef = {
    chart: 'Line Chart',
    channels: ['x', 'y', 'color', 'strokeDash'],
    typeMapping: { vertical: 'Line' },
    validate: ({ typeOf }) => {
        if (typeOf('y') !== 'quantitative') {
            return 'requires a quantitative y field for a native Excel line chart';
        }
        if (typeOf('color') === 'quantitative' || typeOf('color') === 'temporal') {
            return 'does not support continuous color on a native Excel line chart';
        }
        return undefined;
    },
};