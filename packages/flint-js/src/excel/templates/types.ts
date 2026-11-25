// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ChartAssemblyInput, SemanticResult } from '../../core/types';
import type { ExcelTypeMapping } from '../chart-types';
import type { ExcelNativeChartSpec } from '../types';

export interface ExcelTemplateContext {
    input: ChartAssemblyInput;
    table: any[];
    semantics: SemanticResult;
    fieldOf: (channel: string) => string | undefined;
    typeOf: (channel: string) => string | undefined;
}

export interface ExcelTemplateDef {
    chart: string;
    channels: string[];
    typeMapping: ExcelTypeMapping;
    validate?: (context: ExcelTemplateContext) => string | undefined;
    instantiate?: (context: ExcelTemplateContext) => ExcelNativeChartSpec;
}

export function requireQuantitativeAxes(context: ExcelTemplateContext): string | undefined {
    const x = context.typeOf('x');
    if ((x !== 'quantitative' && x !== 'temporal') || context.typeOf('y') !== 'quantitative') {
        return 'requires a quantitative or temporal x field and a quantitative y field for a native Excel XY chart';
    }
    if (context.fieldOf('shape')) {
        return 'does not support a shape encoding in native Excel charts';
    }
    return undefined;
}