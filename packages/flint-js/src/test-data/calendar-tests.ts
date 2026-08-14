// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { Type } from './df-types';
import { seededRandom } from './generators';
import { makeEncodingItem, makeField, type TestCase } from './types';

export function genCalendarTests(): TestCase[] {
    const rand = seededRandom(711);
    const start = new Date('2024-01-01T00:00:00Z');
    const data = Array.from({ length: 121 }, (_, index) => {
        const date = new Date(start);
        date.setUTCDate(start.getUTCDate() + index);
        const weekend = date.getUTCDay() === 0 || date.getUTCDay() === 6;
        return {
            Date: date.toISOString().slice(0, 10),
            Activity: Math.max(0, Math.round((weekend ? 25 : 60) + rand() * 40)),
        };
    });

    return [{
        title: 'Daily Activity, January–April 2024',
        description: 'Four months of daily activity in a Monday-first calendar grid.',
        tags: ['calendar', 'heatmap', 'temporal'],
        chartType: 'Calendar Heatmap',
        data,
        fields: [makeField('Date'), makeField('Activity')],
        metadata: {
            Date: { type: Type.Date, semanticType: 'Date', levels: [] },
            Activity: { type: Type.Number, semanticType: 'Quantity', levels: [] },
        },
        encodingMap: {
            x: makeEncodingItem('Date'),
            color: makeEncodingItem('Activity'),
        },
    }];
}
