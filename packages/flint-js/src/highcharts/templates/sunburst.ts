// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Sunburst Chart template.
 *
 * Highcharts mapping:
 *   HC: series.type = 'sunburst' renders hierarchical data as concentric
 *       rings. Requires the host to load `highcharts/modules/sunburst.js`.
 *
 * Data model (long format):
 *   color (nominal): level-1 branch (e.g. Region)
 *   group/detail (nominal): level-2 leaf (e.g. Country)
 *   size (quantitative): leaf value; leaves without a size use row count.
 *
 * Points form a tree: { id, parent, name, value }. The root is implicit.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories } from './utils';

export const hcSunburstChartDef: ChartTemplateDef = {
    chart: 'Sunburst Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['color', 'group', 'detail', 'size', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const colorField = channelSemantics.color?.field;
        const groupField = channelSemantics.group?.field ?? channelSemantics.detail?.field;
        const sizeField = channelSemantics.size?.field;

        if (!colorField) return;

        const branches = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);

        const data: any[] = [];
        if (!groupField) {
            const branchValues = new Map<string, number>();
            for (const row of table) {
                const branch = String(row[colorField] ?? '');
                if (!branch) continue;
                const v = sizeField ? Number(row[sizeField]) : 1;
                branchValues.set(branch, (branchValues.get(branch) ?? 0) + (Number.isFinite(v) ? v : 1));
            }
            for (const branch of branches) {
                data.push({
                    id: branch,
                    name: branch,
                    value: branchValues.get(branch) ?? 0,
                });
            }
        } else {
            // Aggregate leaf values per (branch, leaf).
            const leafValues = new Map<string, number>();
            const leafNames = new Map<string, string>();
            for (const row of table) {
                const branch = String(row[colorField] ?? '');
                const leaf = String(row[groupField] ?? '');
                if (!branch || !leaf) continue;
                const key = `${branch}·${leaf}`;
                const v = sizeField ? Number(row[sizeField]) : 1;
                leafValues.set(key, (leafValues.get(key) ?? 0) + (Number.isFinite(v) ? v : 1));
                if (!leafNames.has(key)) leafNames.set(key, leaf);
            }

            for (const branch of branches) {
                const branchTotal = [...leafValues.entries()]
                    .filter(([key]) => key.startsWith(`${branch}·`))
                    .reduce((sum, [, v]) => sum + v, 0);
                data.push({
                    id: branch,
                    name: branch,
                    value: branchTotal > 0 ? branchTotal : undefined,
                });
                for (const [key, value] of leafValues) {
                    if (!key.startsWith(`${branch}·`)) continue;
                    data.push({
                        id: key,
                        parent: branch,
                        name: leafNames.get(key) ?? key.slice(branch.length + 1),
                        value,
                    });
                }
            }
        }

        const option: any = {
            chart: { type: 'sunburst' },
            tooltip: {
                pointFormat: '<b>{point.name}</b>: <b>{point.value}</b>',
            },
            series: [{
                type: 'sunburst',
                data,
                allowDrillToNode: true,
                cursor: 'pointer',
                dataLabels: {
                    format: '{point.name}',
                },
                levels: [
                    {
                        level: 1,
                        colorByPoint: true,
                        dataLabels: {
                            style: { fontWeight: 'bold' },
                        },
                    },
                    {
                        level: 2,
                        colorVariation: {
                            key: 'brightness',
                            to: 0.5,
                        },
                    },
                ],
            }],
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
