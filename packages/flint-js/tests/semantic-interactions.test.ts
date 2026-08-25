import { describe, expect, it } from 'vitest';
import { changeset, parse, View } from 'vega';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src/vegalite/assemble';
import { clickHighlight, select } from '../src/interactive/interactions';
import { MUTED_HOVER_FILL, MUTED_HOVER_STROKE } from '../src/core/interaction-semantics';
import { barChartDef, pyramidChartDef } from '../src/vegalite/templates/bar';
import { barTableDef } from '../src/vegalite/templates/bar-table';
import { rangedDotPlotDef, scatterPlotDef } from '../src/vegalite/templates/scatter';
import {
    addVegaLiteInteractions,
    arcIntersectsRect,
    boundsIntersectRect,
    clientRectToLayoutRect,
    clientToPlotPoint,
    clientToLayoutPoint,
    HOVER_STORE,
    injectVegaInteractionStore,
    INTERACTION_KEY,
    INTERACTION_STORE,
    LEGEND_HOVER_STORE,
    LEGEND_SELECTION_STORE,
    plotToClientPoint,
    sceneItems,
} from '../src/vegalite/semantic-interactions';

function instrument(spec: Record<string, any>, interactions = [clickHighlight()]) {
    const plan = addVegaLiteInteractions(spec, interactions);
    const compiled = compile(spec as any).spec as Record<string, any>;
    if (plan) injectVegaInteractionStore(compiled, plan);
    return { plan, compiled };
}

function allSceneItems(view: View): any[] {
    const items: any[] = [];
    const visit = (item: any): void => {
        if (!item) return;
        if (item.mark) items.push(item);
        if (Array.isArray(item.items)) item.items.forEach(visit);
    };
    visit((view.scenegraph() as any).root);
    return items;
}

describe('Vega-Lite semantic interactions', () => {
    it('keeps concatenated-chart hover paint geometry invariant', () => {
        const renderHoverStyles = (definition: typeof pyramidChartDef) =>
            definition.semanticInteractions?.({ resolvedEncodings: {} }).renderHoverStyles;
        expect(renderHoverStyles(pyramidChartDef)).toEqual({ rect: { opacity: 'contrast' } });
        expect(renderHoverStyles(barTableDef)).toEqual({ rect: { opacity: 'contrast' } });
    });

    it('updates arc opacity in a composed Rose chart', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Direction'],
                categoryField: 'Direction',
                selectableMarks: ['arc'],
            },
            data: {
                values: [
                    { Direction: 'N', Speed: 12 },
                    { Direction: 'E', Speed: 20 },
                    { Direction: 'S', Speed: 8 },
                    { Direction: 'W', Speed: 16 },
                ],
            },
            encoding: {
                theta: { field: 'Direction', type: 'nominal', stack: true },
            },
            layer: [
                {
                    mark: { type: 'arc', stroke: 'white' },
                    encoding: {
                        radius: { field: 'Speed', type: 'quantitative', scale: { type: 'sqrt' } },
                        color: { field: 'Direction', type: 'nominal' },
                    },
                },
                {
                    mark: { type: 'text', radiusOffset: 15 },
                    encoding: { text: { field: 'Direction', type: 'nominal' } },
                },
            ],
        };
        const { compiled } = instrument(spec);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const before = sceneItems(view).filter((item) => item.mark.marktype === 'arc');
        const selectedKey = before[0]?.datum[INTERACTION_KEY];
        expect(selectedKey).toBeTypeOf('string');

        view.change(INTERACTION_STORE, changeset().insert([{ key: selectedKey }]));
        await view.runAsync();
        const opacities = sceneItems(view)
            .filter((item) => item.mark.marktype === 'arc')
            .map((item) => ({ key: item.datum[INTERACTION_KEY], opacity: item.opacity }));

        expect(opacities.filter((item) => item.opacity === 1).map((item) => item.key)).toEqual([selectedKey]);
        expect(opacities.filter((item) => item.key !== selectedKey).every((item) => item.opacity === 0.25)).toBe(true);
    });

    it('maps a synthesized Rose color legend back to its category field', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Direction: 'N', Speed: 12 },
                    { Direction: 'E', Speed: 20 },
                ],
            },
            semantic_types: { Direction: 'Category', Speed: 'Quantity' },
            chart_spec: {
                chartType: 'Rose Chart',
                encodings: { x: { field: 'Direction' }, y: { field: 'Speed' } },
            },
        } as any) as any;

        expect(spec._interactionSemantics).toMatchObject({
            fields: ['Direction'],
            categoryField: 'Direction',
            legendFields: { color: 'Direction' },
        });
    });

    it('uses one local hover rule across color semantics', () => {
        const makeSpec = (colorSemanticType: 'Category' | 'Quantity') => assembleVegaLite({
            data: { values: [
                { Region: 'North', Sales: 10, Color: colorSemanticType === 'Category' ? 'Retail' : 0.2 },
                { Region: 'South', Sales: 14, Color: colorSemanticType === 'Category' ? 'Enterprise' : 0.8 },
            ] },
            semantic_types: { Region: 'Category', Sales: 'Quantity', Color: colorSemanticType },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: { field: 'Region' }, y: { field: 'Sales' }, color: { field: 'Color' } },
            },
        } as any) as any;

        expect(makeSpec('Category')._interactionSemantics.renderHoverStyles).toEqual({
            rect: { opacity: 'contrast' },
        });
        expect(makeSpec('Quantity')._interactionSemantics.renderHoverStyles).toEqual({
            rect: { opacity: 'contrast' },
        });
    });

    it('uses an outline when a bar opacity channel is data-encoded', () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Region: 'North', Sales: 10, Confidence: 0.4 },
                { Region: 'South', Sales: 14, Confidence: 0.8 },
            ] },
            semantic_types: { Region: 'Category', Sales: 'Quantity', Confidence: 'Quantity' },
            chart_spec: {
                chartType: 'Bar Chart',
                encodings: { x: 'Region', y: 'Sales', opacity: 'Confidence' },
            },
        } as any) as any;

        expect(spec._interactionSemantics.renderHoverStyles).toEqual({
            rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 },
        });
    });

    it('makes generated legend symbols and labels physical click targets', () => {
        const spec = {
            data: { values: [{ X: 1, Y: 2, Color: 'Blue' }] },
            mark: 'point',
            encoding: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
                color: { field: 'Color', type: 'nominal' },
            },
            _interactionSemantics: {
                fields: ['X', 'Y', 'Color'],
                seriesField: 'Color',
                legendFields: { color: 'Color' },
                selectableMarks: ['point'],
            },
        };
        const { compiled } = instrument(spec);
        expect(compiled.legends.length).toBeGreaterThan(0);
        for (const legend of compiled.legends) {
            expect(legend.encode.symbols.interactive).toBe(true);
            expect(legend.encode.symbols.update.cursor.value).toBe('pointer');
            expect(legend.encode.labels.interactive).toBe(true);
            expect(legend.encode.labels.update.cursor.value).toBe('pointer');
        }
    });

    it('uses pointer cursors only for marks with click interactions', () => {
        const spec = {
            data: { values: [{ X: 1, Y: 2 }] },
            mark: 'point',
            encoding: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['X', 'Y'],
                selectableMarks: ['point'],
            },
        };
        const clickable = instrument(structuredClone(spec)).compiled;
        const selectable = instrument(structuredClone(spec), [select()]).compiled;
        const symbolMark = (compiled: Record<string, any>) => compiled.marks
            .flatMap((mark: Record<string, any>) => mark.marks ?? [mark])
            .find((mark: Record<string, any>) => mark.type === 'symbol');

        expect(symbolMark(clickable).encode.update.cursor.value).toBe('pointer');
        expect(symbolMark(selectable).encode.update.cursor).toBeUndefined();
    });

    it('compiles template hover paint into native mark encodings', async () => {
        for (const [mark, renderMark, width] of [['rect', 'rect', 1.5], ['circle', 'symbol', 2]] as const) {
            const spec: Record<string, any> = {
                data: { values: [{ X: 'A', Y: 2 }] },
                mark,
                encoding: {
                    x: { field: 'X', type: 'nominal' },
                    y: { field: 'Y', type: 'quantitative' },
                },
                _interactionSemantics: {
                    fields: ['X', 'Y'],
                    selectableMarks: [mark],
                    renderHoverStyles: { [renderMark]: { stroke: '#59636d', strokeWidth: width } },
                },
            };

            const plan = addVegaLiteInteractions(spec, [clickHighlight()]);
            const compiled = compile(spec as any).spec as Record<string, any>;
            injectVegaInteractionStore(compiled, plan ?? undefined);
            const view = new View(parse(compiled), { renderer: 'none' });
            await view.runAsync();
            const item = sceneItems(view).find((candidate) => candidate.datum[INTERACTION_KEY]);
            const key = item?.datum[INTERACTION_KEY];
            view.change(HOVER_STORE, changeset().insert([{ key }]));
            await view.runAsync();
            const hovered = sceneItems(view).find((candidate) => candidate.datum[INTERACTION_KEY] === key);

            expect(hovered?.stroke).toBe('#59636d');
            expect(hovered?.strokeWidth).toBe(width);
        }
    });

    it('adds a light hover fill only to shape-only scatter points', () => {
        const hoverStyle = (resolvedEncodings: Record<string, any>) =>
            scatterPlotDef.semanticInteractions!({ resolvedEncodings }).renderHoverStyles?.symbol;

        expect(hoverStyle({ shape: { field: 'Shape', type: 'nominal' } })).toMatchObject({
            fill: MUTED_HOVER_FILL,
        });
        expect(hoverStyle({
            shape: { field: 'Shape', type: 'nominal' },
            color: { field: 'Color', type: 'nominal' },
        })).not.toHaveProperty('fill');
    });

    it('applies one lollipop hover key to both stem and point layers', async () => {
        const spec: Record<string, any> = {
            data: { values: [{ Category: 'A', Value: 2 }] },
            layer: [
                { mark: { type: 'rule', strokeWidth: 1.5 }, encoding: {} },
                { mark: { type: 'circle', size: 80 }, encoding: {} },
            ],
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['Category', 'Value'],
                selectableMarks: ['rule', 'circle'],
                renderHoverStyles: {
                    rule: { stroke: '#59636d' },
                    symbol: { stroke: '#59636d', strokeWidth: 2 },
                },
            },
        };

        const plan = addVegaLiteInteractions(spec, [clickHighlight()]);

        expect(spec.layer[0].encoding.detail.field).toBe(INTERACTION_KEY);
        expect(spec.layer[1].encoding.detail.field).toBe(INTERACTION_KEY);

        const compiled = compile(spec as any).spec as Record<string, any>;
        injectVegaInteractionStore(compiled, plan ?? undefined);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const key = sceneItems(view).find((item) => item.mark.marktype === 'symbol')?.datum[INTERACTION_KEY];
        view.change(HOVER_STORE, changeset().insert([{ key }]));
        await view.runAsync();
        const unit = sceneItems(view).filter((item) => item.datum[INTERACTION_KEY] === key);

        expect(unit.find((item) => item.mark.marktype === 'rule')?.stroke).toBe('#59636d');
        expect(unit.find((item) => item.mark.marktype === 'symbol')?.stroke).toBe('#59636d');
    });

    it('preserves base strokes for line and composite charts before hover', async () => {
        const cases: Record<string, any>[] = [
            {
                data: { values: [{ X: 1, Y: 2, Group: 'A' }] },
                mark: 'point',
                encoding: {
                    x: { field: 'X', type: 'quantitative' },
                    y: { field: 'Y', type: 'quantitative' },
                    color: { field: 'Group', type: 'nominal' },
                },
                _interactionSemantics: {
                    fields: ['X', 'Y', 'Group'], selectableMarks: ['point'],
                    renderHoverStyles: { symbol: { stroke: '#59636d', strokeWidth: 2 } },
                },
            },
            {
                data: { values: [{ X: 0, Y: 1 }, { X: 1, Y: 2 }] },
                mark: { type: 'line', strokeWidth: 2 },
                encoding: { x: { field: 'X', type: 'quantitative' }, y: { field: 'Y', type: 'quantitative' } },
                _interactionSemantics: {
                    fields: ['X', 'Y'], selectableMarks: ['line'],
                    renderHoverStyles: { line: { strokeWidth: 3 } },
                },
            },
            {
                data: { values: [{ X: 'A', Low: 1, High: 4, Open: 2, Close: 3 }] },
                encoding: { x: { field: 'X', type: 'nominal' } },
                layer: [
                    { mark: 'rule', encoding: { y: { field: 'Low', type: 'quantitative' }, y2: { field: 'High' } } },
                    { mark: 'bar', encoding: { y: { field: 'Open', type: 'quantitative' }, y2: { field: 'Close' } } },
                ],
                _interactionSemantics: {
                    fields: ['X'], selectableMarks: ['rule', 'bar'],
                    renderHoverStyles: { rule: { strokeWidth: 2.5 }, rect: { stroke: '#59636d', strokeWidth: 1.5 } },
                },
            },
            {
                data: { values: [
                    { Group: 'A', Value: 1 }, { Group: 'A', Value: 2 }, { Group: 'A', Value: 3 },
                ] },
                mark: 'boxplot',
                encoding: {
                    x: { field: 'Group', type: 'nominal' },
                    y: { field: 'Value', type: 'quantitative' },
                },
                _interactionSemantics: {
                    fields: ['Group'], selectableMarks: ['boxplot'],
                    renderHoverStyles: {
                        rect: { stroke: '#59636d', strokeWidth: 2 },
                        rule: { stroke: '#59636d', strokeWidth: 2 },
                        symbol: { stroke: '#59636d', strokeWidth: 2 },
                    },
                },
            },
        ];

        for (const spec of cases) {
            const plan = addVegaLiteInteractions(spec, [clickHighlight()]);
            const compiled = compile(spec as any).spec as Record<string, any>;
            injectVegaInteractionStore(compiled, plan ?? undefined);
            const view = new View(parse(compiled), { renderer: 'none' });
            await view.runAsync();
            const strokes = sceneItems(view).filter((item) =>
                item.datum[INTERACTION_KEY]
                && (item.mark.marktype === 'line' || item.mark.marktype === 'rule' || item.mark.marktype === 'symbol'));

            expect(strokes.length).toBeGreaterThan(0);
            expect(strokes.every((item) => item.stroke !== 'transparent' && item.strokeWidth > 0)).toBe(true);
        }
    });

    it('tests rectangle selection against an arc sector rather than its broad bounds', () => {
        const quarter = {
            mark: { marktype: 'arc' },
            x: 100,
            y: 100,
            innerRadius: 0,
            outerRadius: 80,
            endAngle: 0,
            startAngle: Math.PI / 2,
        };
        const donutQuarter = { ...quarter, innerRadius: 40 };
        const clockwiseQuarter = { ...quarter, startAngle: 0, endAngle: Math.PI / 2 };
        const roseWedge = { ...quarter, startAngle: 0, endAngle: Math.PI / 6 };

        expect(arcIntersectsRect(quarter, { x1: 130, y1: 40, x2: 160, y2: 70 })).toBe(true);
        expect(arcIntersectsRect(clockwiseQuarter, { x1: 130, y1: 40, x2: 160, y2: 70 })).toBe(true);
        expect(arcIntersectsRect(clockwiseQuarter, { x1: 40, y1: 130, x2: 70, y2: 160 })).toBe(false);
        expect(arcIntersectsRect(roseWedge, { x1: 110, y1: 20, x2: 140, y2: 50 })).toBe(true);
        expect(arcIntersectsRect(roseWedge, { x1: 40, y1: 130, x2: 70, y2: 160 })).toBe(false);
        expect(arcIntersectsRect(quarter, { x1: 40, y1: 130, x2: 70, y2: 160 })).toBe(false);
        expect(arcIntersectsRect(donutQuarter, { x1: 95, y1: 95, x2: 105, y2: 105 })).toBe(false);
        expect(arcIntersectsRect(quarter, { x1: 15, y1: 15, x2: 185, y2: 185 }, true)).toBe(true);
        expect(arcIntersectsRect(quarter, { x1: 90, y1: 90, x2: 180, y2: 180 }, true)).toBe(false);
    });

    it('does not select adjacent cells that only touch the selection boundary', () => {
        const selection = { x1: 10, y1: 10, x2: 30, y2: 30 };

        expect(boundsIntersectRect({ x1: 10, y1: 10, x2: 30, y2: 30 }, selection)).toBe(true);
        expect(boundsIntersectRect({ x1: 30, y1: 10, x2: 50, y2: 30 }, selection)).toBe(false);
        expect(boundsIntersectRect({ x1: 10, y1: 30, x2: 30, y2: 50 }, selection)).toBe(false);
        expect(boundsIntersectRect({ x1: 29.75, y1: 10, x2: 50, y2: 30 }, selection)).toBe(false);
        expect(boundsIntersectRect({ x1: 29, y1: 10, x2: 50, y2: 30 }, selection)).toBe(true);
    });

    it('round-trips coordinates through SVG scaling and Vega plot padding', () => {
        const space = {
            rect: { left: 100, top: 50, width: 250, height: 150 } as DOMRect,
            logicalWidth: 500,
            logicalHeight: 300,
            originX: 60,
            originY: 30,
            plotWidth: 400,
            plotHeight: 240,
        };

        const plot = clientToPlotPoint({ x: 180, y: 100 }, space);
        expect(plot).toEqual({ x: 100, y: 70 });
        expect(plotToClientPoint(plot, space)).toEqual({ x: 180, y: 100 });
        expect(clientToPlotPoint({ x: 0, y: 0 }, space)).toEqual({ x: 0, y: 0 });
        expect(clientToLayoutPoint(
            { x: 180, y: 100 },
            { left: 20, top: 20, width: 320, height: 160 },
            { width: 400, height: 200 },
        )).toEqual({ x: 200, y: 100 });
        expect(clientRectToLayoutRect(
            { left: 60, top: 40, right: 260, bottom: 140 },
            { left: 20, top: 20, width: 320, height: 160 },
            { width: 400, height: 200 },
        )).toEqual({ left: 50, top: 25, width: 250, height: 125 });
    });

    it('translates concat marks by ancestor group offsets', () => {
        const view = {
            scenegraph: () => ({
                root: {
                    items: [{
                        mark: { marktype: 'group' },
                        x: 240,
                        y: 12,
                        items: [{
                            mark: { marktype: 'bar' },
                            datum: { [INTERACTION_KEY]: '20-29|F' },
                            x: 10,
                            y: 20,
                            bounds: { x1: 10, x2: 80, y1: 20, y2: 50 },
                        }],
                    }],
                },
            }),
        };

        expect(sceneItems(view)[0]).toMatchObject({
            x: 250,
            y: 32,
            bounds: { x1: 250, x2: 320, y1: 32, y2: 62 },
        });
    });

    it('keys a basic bar by its category and emits a valid retained store', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Region'], categoryField: 'Region', selectableMarks: ['bar'],
            },
            data: { values: [{ Region: 'West', Sales: 10 }] },
            mark: 'bar',
            encoding: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Sales', type: 'quantitative' },
            },
        };

        const { plan, compiled } = instrument(spec);

        expect(plan).toMatchObject({ fields: ['Region'], categoryField: 'Region' });
        expect(spec.transform).toContainEqual(expect.objectContaining({ as: INTERACTION_KEY }));
        expect(spec.encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(compiled.data).toContainEqual({ name: INTERACTION_STORE, values: [] });
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('uses category plus series for grouped-bar element identity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Region', 'Segment'],
                categoryField: 'Region',
                seriesField: 'Segment',
                selectableMarks: ['bar'],
            },
            mark: 'bar',
            encoding: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Sales', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
                xOffset: { field: 'Segment', type: 'nominal' },
            },
        };

        const { plan } = instrument(spec, [clickHighlight(), select()]);

        expect(plan).toMatchObject({
            fields: ['Region', 'Segment'],
            categoryField: 'Region',
            seriesField: 'Segment',
        });
    });

    it('uses both discrete axes for a heatmap cell', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Month', 'Product'], categoryField: 'Month', selectableMarks: ['rect'],
            },
            mark: 'rect',
            encoding: {
                x: { field: 'Month', type: 'ordinal' },
                y: { field: 'Product', type: 'nominal' },
                color: { field: 'Revenue', type: 'quantitative' },
            },
        };

        expect(instrument(spec).plan?.fields).toEqual(['Month', 'Product']);
    });

    it('instruments concatenated pyramid bars with constant opacity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Age', 'Gender'],
                categoryField: 'Age',
                seriesField: 'Gender',
                selectableMarks: ['bar'],
            },
            data: { values: [{ Age: '20-29', Population: 10, Gender: 'F' }] },
            hconcat: [
                {
                    mark: 'bar',
                    transform: [{ filter: { field: 'Gender', equal: 'F' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative' },
                        y: { field: 'Age', type: 'ordinal' },
                        opacity: { value: 0.9 },
                    },
                },
                {
                    mark: 'bar',
                    transform: [{ filter: { field: 'Gender', equal: 'M' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative' },
                        y: { field: 'Age', type: 'ordinal' },
                        opacity: { value: 0.9 },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [select()]);

        expect(plan).toMatchObject({
            fields: ['Age', 'Gender'],
            categoryField: 'Age',
            seriesField: 'Gender',
        });
        expect(spec.hconcat[0].encoding.opacity.condition.value).toBe(0.9);
        expect(spec.hconcat[1].encoding.opacity.condition.value).toBe(0.9);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('hovers Pyramid bars without changing their geometry or center gap', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Age', 'Gender'], categoryField: 'Age', seriesField: 'Gender',
                selectableMarks: ['bar'],
                renderHoverStyles: { rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 } },
            },
            data: { values: [
                { Age: '20-29', Population: 10, Gender: 'F' },
                { Age: '20-29', Population: 12, Gender: 'M' },
            ] },
            spacing: 0,
            hconcat: [
                {
                    mark: 'bar', transform: [{ filter: { field: 'Gender', equal: 'F' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative', scale: { reverse: true } },
                        y: { field: 'Age', type: 'ordinal' }, opacity: { value: 0.9 },
                    },
                },
                {
                    mark: 'bar', transform: [{ filter: { field: 'Gender', equal: 'M' } }],
                    encoding: {
                        x: { field: 'Population', type: 'quantitative' },
                        y: { field: 'Age', type: 'ordinal', axis: null }, opacity: { value: 0.9 },
                    },
                },
            ],
        };
        const { compiled } = instrument(spec, [clickHighlight()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const target = sceneItems(view).find((item) => item.mark.marktype === 'rect');
        const geometry = {
            x: target.x, x2: target.x2, y: target.y, y2: target.y2,
            width: target.width, height: target.height,
        };
        const opacity = target.opacity;

        view.change(HOVER_STORE, changeset().insert([{ key: target.datum[INTERACTION_KEY] }]));
        await view.runAsync();
        const hovered = sceneItems(view).find((item) => item.datum[INTERACTION_KEY] === target.datum[INTERACTION_KEY]);

        expect(hovered?.opacity).toBe(opacity);
        expect({
            x: hovered?.x, x2: hovered?.x2, y: hovered?.y, y2: hovered?.y2,
            width: hovered?.width, height: hovered?.height,
        }).toEqual(geometry);
        expect(hovered?.stroke).toBe(MUTED_HOVER_STROKE);
        expect(hovered?.strokeWidth).toBe(1.5);
    });

    it.each([
        { authoredOpacity: 1, hoveredOpacity: 0.9 },
        { authoredOpacity: 0.6, hoveredOpacity: 1 },
    ])('contrasts target opacity from $authoredOpacity without changing peers', async ({ authoredOpacity, hoveredOpacity }) => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'], categoryField: 'Category', selectableMarks: ['bar'],
                renderHoverStyles: { rect: { opacity: 'contrast' } },
            },
            data: { values: [
                { Category: 'Alpha', Value: 10 },
                { Category: 'Beta', Value: 12 },
            ] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                opacity: { value: authoredOpacity },
            },
        };
        const { compiled } = instrument(spec, [clickHighlight()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const [target, peer] = bars;
        const targetKey = target.datum[INTERACTION_KEY];
        const peerKey = peer.datum[INTERACTION_KEY];

        view.change(HOVER_STORE, changeset().insert([{ key: targetKey }]));
        await view.runAsync();
        let renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const hoveredTarget = renderedBars.find((item) => item.datum[INTERACTION_KEY] === targetKey);
        const hoverPeer = renderedBars.find((item) => item.datum[INTERACTION_KEY] === peerKey);
        expect(hoveredTarget?.opacity).toBe(hoveredOpacity);
        expect(hoverPeer?.opacity).toBe(authoredOpacity);

        view.change(INTERACTION_STORE, changeset().insert([{ key: targetKey }]));
        await view.runAsync();
        renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === peerKey)?.opacity).toBe(0.25);
    });

    it('preserves a data-encoded opacity channel and uses an outline on hover', async () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'], categoryField: 'Category', selectableMarks: ['bar'],
                renderHoverStyles: { rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 } },
            },
            data: { values: [
                { Category: 'Alpha', Value: 10, Confidence: 0.4 },
                { Category: 'Beta', Value: 12, Confidence: 0.8 },
            ] },
            mark: 'bar',
            encoding: {
                x: { field: 'Category', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                opacity: { field: 'Confidence', type: 'quantitative', scale: null },
            },
        };
        const { compiled } = instrument(spec, [clickHighlight()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        const [target, peer] = bars;

        view.change(HOVER_STORE, changeset().insert([{ key: target.datum[INTERACTION_KEY] }]));
        await view.runAsync();
        let renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === target.datum[INTERACTION_KEY])?.opacity).toBe(0.4);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === target.datum[INTERACTION_KEY])?.stroke).toBe(MUTED_HOVER_STROKE);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === peer.datum[INTERACTION_KEY])?.opacity).toBe(0.8);

        view.change(INTERACTION_STORE, changeset().insert([{ key: target.datum[INTERACTION_KEY] }]));
        await view.runAsync();
        renderedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(renderedBars.find((item) => item.datum[INTERACTION_KEY] === peer.datum[INTERACTION_KEY])?.opacity).toBe(0.25);
    });

    it.each(['click', 'hover'] as const)(
        'resolves a ranged-dot endpoint %s to only the physical semantic unit',
        (gesture) => {
        const resolve = rangedDotPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Life expectancy', type: 'quantitative' },
                y: { field: 'Country', type: 'nominal' },
                color: { field: 'Sex', type: 'nominal' },
            },
        }).resolve;
        const male = {
            datum: { [INTERACTION_KEY]: 'Japan|81.5|Male', Country: 'Japan', Sex: 'Male' },
            source: 'mark' as const,
            markType: 'symbol',
        };
        const female = {
            datum: { [INTERACTION_KEY]: 'Japan|87.6|Female', Country: 'Japan', Sex: 'Female' },
            source: 'mark' as const,
        };
        const connector = {
            datum: { [INTERACTION_KEY]: 'Japan|connector', Country: 'Japan' },
            source: 'mark' as const,
        };
        const other = {
            datum: { [INTERACTION_KEY]: 'Brazil|76|Female', Country: 'Brazil', Sex: 'Female' },
            source: 'mark' as const,
        };

        const target = resolve(
            { gesture, role: 'mark', hits: [male] },
            {
                allHits: [male, female, connector, other],
                keyField: INTERACTION_KEY,
                categoryField: 'Country',
                seriesField: 'Sex',
            },
        );

        expect(target?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual([
            'Japan|81.5|Male',
        ]);
        expect(target?.visual).toEqual({ kind: 'mark', role: 'point' });
        },
    );

    it('highlights only the hovered legend item until it is clicked', async () => {
        const spec = assembleVegaLite({
            data: { values: [
                { Region: 'West', Segment: 'Consumer', Value: 10 },
                { Region: 'West', Segment: 'Corporate', Value: 12 },
                { Region: 'East', Segment: 'Consumer', Value: 8 },
                { Region: 'East', Segment: 'Corporate', Value: 9 },
            ] },
            semantic_types: { Region: 'Category', Segment: 'Category', Value: 'Quantity' },
            chart_spec: {
                chartType: 'Stacked Bar Chart',
                encodings: { x: 'Region', y: 'Value', color: 'Segment' },
            },
        } as never) as any;
        const { compiled } = instrument(spec, [clickHighlight()]);
        const view = new View(parse(compiled), { renderer: 'none' });
        await view.runAsync();
        view.change(LEGEND_HOVER_STORE, changeset().insert([{ channel: 'color', value: 'Consumer' }]));
        await view.runAsync();

        const bars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(bars.every((item) => item.opacity === 1)).toBe(true);
        let legendItems = allSceneItems(view).filter((item) =>
            item.mark.role === 'legend-label' || item.mark.role === 'legend-symbol');
        expect(legendItems.filter((item) => item.datum.value === 'Consumer').every((item) => item.opacity === 1)).toBe(true);
        expect(legendItems.filter((item) => item.datum.value === 'Corporate').every((item) => item.opacity === 1)).toBe(true);
        const legendLabels = legendItems.filter((item) => item.mark.role === 'legend-label');
        const consumerLabel = legendLabels.find((item) => item.datum.value === 'Consumer');
        const corporateLabel = legendLabels.find((item) => item.datum.value === 'Corporate');
        expect(consumerLabel?.fill).toBe(corporateLabel?.fill);

        view.change(LEGEND_HOVER_STORE, changeset().remove(() => true));
        view.change(LEGEND_SELECTION_STORE, changeset().insert([{ channel: 'color', value: 'Consumer' }]));
        const consumerKeys = bars
            .filter((item) => item.datum.Segment === 'Consumer')
            .map((item) => ({ key: item.datum[INTERACTION_KEY] }));
        view.change(INTERACTION_STORE, changeset().insert(consumerKeys));
        await view.runAsync();

        const selectedBars = sceneItems(view).filter((item) => item.mark.marktype === 'rect' && item.datum[INTERACTION_KEY]);
        expect(selectedBars.filter((item) => item.datum.Segment === 'Consumer').every((item) => item.opacity === 1)).toBe(true);
        expect(selectedBars.filter((item) => item.datum.Segment === 'Corporate').every((item) => item.opacity === 0.25)).toBe(true);
        legendItems = allSceneItems(view).filter((item) =>
            item.mark.role === 'legend-label' || item.mark.role === 'legend-symbol');
        expect(legendItems.filter((item) => item.datum.value === 'Consumer').every((item) => item.opacity === 1)).toBe(true);
        expect(legendItems.filter((item) => item.datum.value === 'Corporate').every((item) => item.opacity === 0.25)).toBe(true);
    });

    it('calculates keys inside a Bar Table panel with its own named data', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category'], categoryField: 'Category', selectableMarks: ['bar'],
            },
            datasets: { rows: [{ Category: 'Alpha', Value: 10 }] },
            hconcat: [
                {
                    data: { name: 'rows' },
                    mark: 'bar',
                    transform: [{ aggregate: [{ op: 'sum', field: 'Value', as: 'Value' }], groupby: ['Category'] }],
                    encoding: {
                        x: { field: 'Value', type: 'quantitative' },
                        y: { field: 'Category', type: 'nominal' },
                        color: { value: '#41a25f' },
                    },
                },
                {
                    data: { name: 'rows' },
                    mark: 'text',
                    encoding: {
                        y: { field: 'Category', type: 'nominal' },
                        text: { field: 'Value', type: 'quantitative' },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [select()]);

        expect(plan).toMatchObject({ fields: ['Category'], categoryField: 'Category' });
        expect(spec.hconcat[0].transform).toContainEqual(expect.objectContaining({ as: INTERACTION_KEY }));
        expect(spec.hconcat[1].transform).toBeUndefined();
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('uses template-owned quantitative fields for point identity', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Horsepower', 'Efficiency'],
                selectableMarks: ['circle'],
                markClick: 'element',
            },
            data: { values: [{ Horsepower: 120, Efficiency: 32 }] },
            mark: { type: 'circle', opacity: 0.7 },
            encoding: {
                x: { field: 'Horsepower', type: 'quantitative' },
                y: { field: 'Efficiency', type: 'quantitative' },
            },
        };

        const { plan, compiled } = instrument(spec, [clickHighlight(), select()]);

        expect(plan).toMatchObject({ fields: ['Horsepower', 'Efficiency'] });
        expect(spec).not.toHaveProperty('_interactionSemantics');
        expect(spec.encoding.opacity.condition.value).toBe(0.7);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('coalesces lollipop rule and circle layers under one semantic key', () => {
        const spec: Record<string, any> = {
            _interactionSemantics: {
                fields: ['Category', 'Value'],
                categoryField: 'Category',
                selectableMarks: ['rule', 'circle'],
                markClick: 'element',
            },
            data: { values: [{ Category: 'A', Value: 12 }] },
            layer: [
                {
                    mark: 'rule',
                    encoding: {
                        x: { field: 'Category', type: 'nominal' },
                        y: { field: 'Value', type: 'quantitative' },
                        y2: { datum: 0 },
                    },
                },
                {
                    mark: 'circle',
                    encoding: {
                        x: { field: 'Category', type: 'nominal' },
                        y: { field: 'Value', type: 'quantitative' },
                    },
                },
            ],
        };

        const { plan, compiled } = instrument(spec, [select()]);

        expect(plan).toMatchObject({ fields: ['Category', 'Value'], categoryField: 'Category' });
        expect(spec.layer[0].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(spec.layer[1].encoding.opacity.condition.test).toContain(INTERACTION_STORE);
        expect(() => parse(compiled, undefined, { ast: true } as any)).not.toThrow();
    });

    it('keeps a mark click local without a declared series', () => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
            },
        }).resolve;
        const westConsumer = { datum: { [INTERACTION_KEY]: 'West|Consumer', Region: 'West' }, source: 'mark' as const };
        const westCorporate = { datum: { [INTERACTION_KEY]: 'West|Corporate', Region: 'West' }, source: 'mark' as const };
        const eastConsumer = { datum: { [INTERACTION_KEY]: 'East|Consumer', Region: 'East' }, source: 'mark' as const };

        const target = resolve(
            { gesture: 'click', role: 'mark', hits: [westConsumer] },
            {
                allHits: [westConsumer, westCorporate, eastConsumer],
                keyField: INTERACTION_KEY,
                categoryField: 'Region',
            },
        );

        expect(target?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual(['West|Consumer']);
    });

    it('keeps a mark click local when a series field is declared', () => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve;
        const westConsumer = { datum: { [INTERACTION_KEY]: 'West|Consumer', Segment: 'Consumer' }, source: 'mark' as const };
        const westCorporate = { datum: { [INTERACTION_KEY]: 'West|Corporate', Segment: 'Corporate' }, source: 'mark' as const };
        const eastConsumer = { datum: { [INTERACTION_KEY]: 'East|Consumer', Segment: 'Consumer' }, source: 'mark' as const };

        const target = resolve(
            { gesture: 'click', role: 'mark', hits: [westConsumer] },
            {
                allHits: [westConsumer, westCorporate, eastConsumer],
                keyField: INTERACTION_KEY,
                seriesField: 'Segment',
            },
        );

        expect(target?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual(['West|Consumer']);
    });

    it.each(['click', 'hover'] as const)('lets the template resolver expand a legend %s to its series cohort', (gesture) => {
        const resolve = barChartDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'Region', type: 'nominal' },
                y: { field: 'Value', type: 'quantitative' },
                color: { field: 'Segment', type: 'nominal' },
            },
        }).resolve;
        const westConsumer = { datum: { [INTERACTION_KEY]: 'West|Consumer', Segment: 'Consumer' }, source: 'mark' as const };
        const westCorporate = { datum: { [INTERACTION_KEY]: 'West|Corporate', Segment: 'Corporate' }, source: 'mark' as const };
        const eastConsumer = { datum: { [INTERACTION_KEY]: 'East|Consumer', Segment: 'Consumer' }, source: 'mark' as const };

        const target = resolve(
            { gesture, role: 'legend-item', hits: [], legendValue: 'Consumer' },
            {
                allHits: [westConsumer, westCorporate, eastConsumer],
                keyField: INTERACTION_KEY,
                seriesField: 'Segment',
            },
        );

        expect(target?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual([
            'West|Consumer',
            'East|Consumer',
        ]);
    });

    it('resolves color and shape legends by their own fields', () => {
        const resolve = scatterPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
                color: { field: 'Color', type: 'nominal' },
                shape: { field: 'Shape', type: 'nominal' },
            },
        }).resolve;
        const hits = [
            { datum: { [INTERACTION_KEY]: 'a', Color: 'Blue', Shape: 'Circle' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'b', Color: 'Orange', Shape: 'Circle' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'c', Color: 'Blue', Shape: 'Square' }, source: 'mark' as const },
        ];
        const context = { allHits: hits, keyField: INTERACTION_KEY, seriesField: 'Color' };

        const color = resolve(
            { gesture: 'click', role: 'legend-item', hits: [], legendValue: 'Blue', legendField: 'Color' },
            context,
        );
        const shape = resolve(
            { gesture: 'click', role: 'legend-item', hits: [], legendValue: 'Circle', legendField: 'Shape' },
            context,
        );

        expect(color?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual(['a', 'c']);
        expect(shape?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual(['a', 'b']);
    });

    it('resolves a size legend independently from color', () => {
        const resolve = scatterPlotDef.semanticInteractions!({
            resolvedEncodings: {
                x: { field: 'X', type: 'quantitative' },
                y: { field: 'Y', type: 'quantitative' },
                color: { field: 'Color', type: 'nominal' },
                size: { field: 'Size', type: 'nominal' },
            },
        }).resolve;
        const hits = [
            { datum: { [INTERACTION_KEY]: 'a', Color: 'Blue', Size: 'Large' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'b', Color: 'Orange', Size: 'Large' }, source: 'mark' as const },
            { datum: { [INTERACTION_KEY]: 'c', Color: 'Blue', Size: 'Small' }, source: 'mark' as const },
        ];
        const target = resolve(
            { gesture: 'click', role: 'legend-item', hits: [], legendValue: 'Large', legendField: 'Size' },
            { allHits: hits, keyField: INTERACTION_KEY, seriesField: 'Color' },
        );

        expect(target?.elements.map((element) => element.key[INTERACTION_KEY])).toEqual(['a', 'b']);
    });

    it('compiles grouped-bar semantic fields from its template', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { Class: '1st', Sex: 'Female', Survival: 97 },
                    { Class: '1st', Sex: 'Male', Survival: 34 },
                ],
            },
            semantic_types: { Class: 'Category', Sex: 'Category', Survival: 'Quantity' },
            chart_spec: {
                chartType: 'Grouped Bar Chart',
                encodings: {
                    x: { field: 'Class' },
                    y: { field: 'Survival' },
                    group: { field: 'Sex' },
                },
            },
        } as any) as any;

        expect(spec._interactionSemantics).toMatchObject({
            fields: ['Class', 'Survival', 'Sex'],
            categoryField: 'Class',
            seriesField: 'Sex',
            selectableMarks: ['bar'],
        });
    });

    it('instruments path marks without splitting them by interaction detail', () => {
        const spec: Record<string, any> = {
            mark: 'line',
            encoding: {
                x: { field: 'Date', type: 'temporal' },
                y: { field: 'Value', type: 'quantitative' },
            },
            _interactionSemantics: {
                fields: ['Date', 'Value'],
                categoryField: 'Date',
                selectableMarks: ['line'],
            },
        };

        expect(addVegaLiteInteractions(spec, [clickHighlight()])).toMatchObject({
            fields: ['Date', 'Value'],
        });
        expect(spec.encoding).not.toHaveProperty('detail');
        expect(spec.encoding.opacity.condition.test).toContain("!length(data('__flint_interaction_store'))");
    });
});