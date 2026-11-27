// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress interactive renderer.
 *
 * Mirrors echarts/interactive.ts: a factory returning an
 * `InteractiveRendererAdapter` whose `mount` draws the assembled spec into a
 * container and returns a surface the mount runtime can resize/destroy.
 *
 * CanvasXpress draws onto a <canvas> this adapter creates inside the container
 * and settles asynchronously, so — unlike the SVG backends — the
 * adapter owns an engine instance it must `destroy()` and re-create rather than
 * a spec it re-applies. This first pass does not wire category viewports
 * (CanvasXpress has its own zoom/scroll), so `viewports` is empty and
 * `setViewports` is a no-op; revisit alongside the assembler's overflow pass.
 */

import type { ChartAssemblyInput } from '../core/types';
import type { InteractiveRendererAdapter } from '../interactive/types';
import { assembleCanvasXpress } from './assemble';
import { resolveBaseSize } from '../core/compute-layout';

/** The CanvasXpress engine constructor (the package's default export). */
type CanvasXpressConstructor = typeof import('canvasxpress').default;

/**
 * Load the CanvasXpress engine on demand.
 *
 * `canvasxpress` is an OPTIONAL peer dependency: assembling a spec needs nothing
 * installed, and only mounting a chart needs the engine. It is therefore imported
 * lazily here, never at module load, so a missing engine surfaces as one clear,
 * actionable error instead of an unresolved-module failure at import time.
 *
 * @returns The CanvasXpress constructor.
 * @throws If the `canvasxpress` package is not installed.
 * @private
 */
async function loadCanvasXpress(): Promise<CanvasXpressConstructor> {
    try {
        const engine = await import('canvasxpress');
        return engine.default;
    } catch (cause) {
        const error: Error & { cause?: unknown } = new Error(
            'The CanvasXpress backend needs the "canvasxpress" package, which is an optional peer '
            + 'dependency of flint-chart and is not installed. Install it with: npm install canvasxpress',
        );
        error.cause = cause;
        throw error;
    }
}

/**
 * Resolve the pixel size to render a CanvasXpress chart at.
 *
 * The assembler deliberately leaves width/height off the spec's config (the
 * engine self-sizes), so the renderer supplies them. We prefer the spec's
 * designed base size, then the live container box, then a sensible default —
 * CanvasXpress needs concrete numbers on the <canvas> element and in config or
 * it draws nothing.
 *
 * @param input The chart assembly input (carries chart_spec.baseSize/canvasSize).
 * @param container The element the chart mounts into.
 * @returns A concrete { width, height } in CSS pixels.
 * @private
 */
function resolveRenderSize(
    input: ChartAssemblyInput,
    container: HTMLElement,
): { width: number; height: number } {
    const designed = resolveBaseSize(input.chart_spec.baseSize, input.chart_spec.canvasSize);
    const width = designed.width || container.clientWidth || 400;
    const height = designed.height || container.clientHeight || 300;
    return { width, height };
}

export interface CanvasXpressInteractiveRendererOptions {
    /** Reserved for parity with the other backends; unused today. */
    renderer?: 'canvas' | 'svg';
}

/**
 * Create a CanvasXpress interactive renderer adapter.
 *
 * @param _options Reserved for parity with the other backends.
 * @returns An InteractiveRendererAdapter whose mount draws a CanvasXpress chart.
 * @public
 */
export function createCanvasXpressInteractiveRenderer(
    _options: CanvasXpressInteractiveRendererOptions = {},
): InteractiveRendererAdapter {
    return {
        async mount(container: HTMLElement, input: ChartAssemblyInput) {
            const spec = assembleCanvasXpress(input);
            // Resolve the engine before touching the DOM, so a missing optional
            // peer dependency fails cleanly and leaves the container untouched.
            const CanvasXpress = await loadCanvasXpress();
            const size = resolveRenderSize(input, container);

            // CanvasXpress renders into a <canvas> that must (a) carry explicit
            // width/height ATTRIBUTES and (b) be attached to the document before
            // the engine initialises — otherwise init reads a null parentNode and
            // the chart stays blank. We create it, size it, and attach it first.
            const canvas = document.createElement('canvas');
            canvas.id = `cx-${Math.random().toString(36).slice(2)}`;
            canvas.width = size.width;
            canvas.height = size.height;
            container.replaceChildren(canvas);

            // The engine constructor is `new CanvasXpress(target, data, config, …)`.
            // `graphType`, `renderTo`, and the pixel size all live in `config` (the
            // engine reads graphType there, not as a separate arg); the spec keeps
            // graphType at the top level, so fold it back in here. The engine's
            // types are stricter than Flint's structural y-matrix, so the data/config
            // args are cast at this boundary.
            type CXArgs = ConstructorParameters<CanvasXpressConstructor>;
            const config = {
                ...spec.config,
                graphType: spec.graphType,
                renderTo: canvas.id,
                width: size.width,
                height: size.height,
            };
            let chart: InstanceType<CanvasXpressConstructor> | undefined =
                new CanvasXpress(
                    canvas.id,
                    spec.data as unknown as CXArgs[1],
                    config as unknown as CXArgs[2],
                );

            let destroyed = false;

            return {
                viewports: [],
                getViewportGeometry() {
                    // No Flint-managed viewports for CanvasXpress yet (see header note).
                    return undefined;
                },
                setViewports() {
                    // No-op: CanvasXpress provides its own zoom/scroll.
                },
                resize(size: { width: number; height: number }) {
                    // setDimensions is on the engine's CJS instance type; guard for the
                    // ESM instance type, whose index signature types it as unknown.
                    const sizable = chart as { setDimensions?: (w: number, h: number) => void } | undefined;
                    sizable?.setDimensions?.(size.width, size.height);
                },
                destroy() {
                    if (destroyed) return;
                    destroyed = true;
                    const canvasId = canvas.id;
                    // CanvasXpress binds a ResizeObserver that re-renders on container
                    // resize; stop it so a torn-down instance can't keep painting.
                    try {
                        const observing = chart as { resizeObserver?: { disconnect(): void } } | undefined;
                        if (observing?.resizeObserver) {
                            observing.resizeObserver.disconnect();
                            observing.resizeObserver = undefined;
                        }
                    } catch {
                        // ignore — best-effort teardown
                    }
                    chart?.destroy?.();
                    chart = undefined;
                    container.replaceChildren();
                    // CanvasXpress REPARENTS its whole DOM to a body-level
                    // `CanvasXpress-ParentNode-<id>` node that neither destroy() nor
                    // clearing the container removes. Left behind, these accumulate —
                    // and under React StrictMode's mount→destroy→mount the discarded
                    // first instance's (often partial) render lingers and overlaps the
                    // live one, which is what left gallery thumbnails half-drawn.
                    try {
                        document.getElementById('CanvasXpress-ParentNode-' + canvasId)?.remove();
                    } catch {
                        // ignore — best-effort teardown
                    }
                },
            };
        },
    };
}
