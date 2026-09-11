// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assembleVegaLite } from '../src';

describe('KPI Card captions', () => {
    it('wraps long captions and constrains them to the card width', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Metric: 'Renewable electricity (%)', Value: 30.3, Goal: 45 },
                    { Metric: 'EV share of car sales (%)', Value: 18, Goal: 40 },
                    { Metric: 'World online (%)', Value: 67, Goal: 90 },
                    { Metric: 'Electricity access (%)', Value: 91, Goal: 100 },
                ],
            },
            semantic_types: { Metric: 'Category', Value: 'Quantity', Goal: 'Quantity' },
            chart_spec: {
                chartType: 'KPI Card',
                encodings: { metric: 'Metric', value: 'Value', goal: 'Goal' },
                chartProperties: { layout: 'horizontal' },
                baseSize: { width: 560, height: 240 },
            },
        } as any) as any;

        const captionMarks = spec.hconcat.map((tile: any) =>
            tile.layer.find((layer: any) =>
                layer.mark?.type === 'text' && String(layer.mark.text).includes('%')),
        );

        expect(captionMarks).toHaveLength(4);
        expect(captionMarks.every((layer: any) => layer.mark.limit > 0)).toBe(true);
        expect(captionMarks.some((layer: any) => layer.mark.text.includes('\n'))).toBe(true);
        expect(captionMarks.every((layer: any) => layer.mark.text.split('\n').length <= 2)).toBe(true);
    });
});