// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';
import { requireQuantitativeAxes } from './types';

export const excelScatterPlotDef: ExcelTemplateDef = {
    chart: 'Scatter Plot',
    channels: ['x', 'y', 'color', 'size'],
    typeMapping: { vertical: 'XYScatter', xy: true },
    validate: (context) => requireQuantitativeAxes(context)
        ?? (context.typeOf('color') === 'quantitative' || context.typeOf('color') === 'temporal'
            ? 'does not support continuous color in a native Excel Scatter or Bubble chart'
            : undefined),
};

export const excelConnectedScatterPlotDef: ExcelTemplateDef = {
    chart: 'Connected Scatter Plot',
    channels: ['x', 'y', 'order', 'color', 'detail'],
    typeMapping: { vertical: 'XYScatterLines', xy: true },
    validate: (context) => requireQuantitativeAxes(context)
        ?? (!context.fieldOf('order')
            ? 'requires an explicit order field for a native Excel connected scatter chart'
            : context.fieldOf('detail')
                ? 'does not support an unlegended detail series in a native Excel connected scatter chart'
                : context.typeOf('color') === 'quantitative' || context.typeOf('color') === 'temporal'
                    ? 'does not support continuous color in a native Excel connected scatter chart'
                    : undefined),
};