import {
    createElement,
    forwardRef,
    useEffect,
    useImperativeHandle,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type CSSProperties,
    type ReactNode,
} from 'react';
import type { ChartAssemblyInput, ChartWarning } from '../core/types';
import {
    isCanvasInteraction,
    mountChart,
    resolveInteractionSpec,
    type CanvasInteractionDef,
    type ChartChange,
    type ChartUpdate,
    type ChartUpdateApplyOptions,
    type ChartUpdateResult,
    type ChartState,
    type ExternalInteractionDef,
    type FlintInteractionEventDetail,
    type InteractionDef,
    type InteractiveBackend,
    type InteractiveChartSurface,
} from '../interactive';

export type FlintChartInteractions =
    | readonly InteractionDef[]
    | ((fromSpec: readonly InteractionDef[]) => readonly InteractionDef[]);

export type FlintChartFit = 'shrink' | 'contain' | 'none';

export interface FlintChartProps {
    /** The Flint spec, `interaction_spec` included. */
    spec: ChartAssemblyInput;
    /** Default `'vegalite'`. */
    backend?: InteractiveBackend;
    /** An array adds to the spec's interactions; a function receives them and returns the full list. */
    interactions?: FlintChartInteractions;
    /**
     * Host updates, applied by id: new or changed ids are applied, dropped ids are cleared.
     * Passing it, even `[]`, keeps the update runtime on a chart with no interactions;
     * without it such a chart renders static.
     */
    updates?: readonly ChartUpdate[];
    renderer?: 'svg' | 'canvas';
    /** For hosts whose CSP forbids eval: a Vega expression interpreter such as `vega-interpreter`'s. */
    expressionInterpreter?: unknown;
    background?: string;
    /** The box the chart is fitted into, in pixels or a CSS length. Omitted: the chart's natural size. */
    width?: number | string;
    height?: number | string;
    /** Default `'shrink'`: scale down to fit the box, never up. */
    fit?: FlintChartFit;
    onChange?: (change: ChartChange) => void;
    onInteraction?: (detail: FlintInteractionEventDetail) => void;
    /** After each mount and each applied host update. */
    onRender?: (chart: InteractiveChartSurface) => void;
    onWarnings?: (warnings: readonly ChartWarning[]) => void;
    onError?: (error: Error) => void;
    /** Shown until the chart mounts, including in server rendering. */
    fallback?: ReactNode;
    className?: string;
    style?: CSSProperties;
    ariaLabel?: string;
    chartId?: string;
}

/** The mounted chart, reached through the component's ref; it follows remounts. */
export interface FlintChartHandle {
    readonly surface: InteractiveChartSurface | null;
    applyUpdate(update: ChartUpdate, options?: ChartUpdateApplyOptions): Promise<ChartUpdateResult | null>;
    clearUpdate(id: string): Promise<void>;
    dispatch(interactionId: string, payload: unknown): Promise<ChartUpdateResult | null>;
    getState(): ChartState | undefined;
    refresh(): void;
}

const DEFAULT_SIZE = { width: 400, height: 320 };

// Server rendering has no layout; React warns on useLayoutEffect there.
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const referenceIds = new WeakMap<object, number>();
let nextReferenceId = 0;

function referenceId(value: object | undefined): string {
    if (!value) return 'none';
    let id = referenceIds.get(value);
    if (id === undefined) {
        id = ++nextReferenceId;
        referenceIds.set(value, id);
    }
    return `#${id}`;
}

/** Spec content without its rows, plus the rows by reference: new rows remount, an equal spec does not. */
export function flintSpecKey(spec: ChartAssemblyInput): string {
    const { data, ...rest } = spec;
    const { values, ...dataRest } = (data ?? {}) as { values?: unknown[] } & Record<string, unknown>;
    return `${JSON.stringify(rest)}|${JSON.stringify(dataRest)}|${referenceId(values)}`;
}

/** An update's content, with `set-data` rows and DOM nodes by reference. */
export function flintUpdateKey(update: ChartUpdate): string {
    return JSON.stringify(update, (key, value) => {
        if (key === 'rows' && Array.isArray(value)) return referenceId(value);
        if (typeof Node !== 'undefined' && value instanceof Node) return referenceId(value);
        return value;
    });
}

export type UpdateOwner = 'host' | 'reader';

export interface UpdatePlan {
    apply: ChartUpdate[];
    clear: string[];
}

/**
 * What to do to move the chart from the updates last applied to the next ones.
 * A dropped id is cleared only if the host wrote it last, so a reader's newer
 * selection under that id survives the host's stale prop.
 */
export function planUpdates(
    applied: ReadonlyMap<string, string>,
    owners: ReadonlyMap<string, UpdateOwner>,
    next: readonly ChartUpdate[],
): UpdatePlan {
    const nextIds = new Set(next.map((update) => update.id));
    return {
        apply: next.filter((update) => applied.get(update.id) !== flintUpdateKey(update)),
        clear: [...applied.keys()].filter((id) => !nextIds.has(id) && owners.get(id) !== 'reader'),
    };
}

function interactionsKey(definitions: readonly InteractionDef[]): string {
    return definitions.map((definition) =>
        `${definition.id}:${isCanvasInteraction(definition) ? definition.preset ?? 'canvas' : 'external'}`).join(',');
}

function cssLength(value: number | string | undefined): string | undefined {
    return typeof value === 'number' ? `${value}px` : value;
}

export const FlintChart = forwardRef<FlintChartHandle, FlintChartProps>(function FlintChart(props, ref) {
    const {
        spec, backend = 'vegalite', interactions, updates, renderer, expressionInterpreter, background,
        width, height, fit = 'shrink', fallback, className, style, ariaLabel, chartId,
    } = props;
    const outerRef = useRef<HTMLDivElement>(null);
    const scalerRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<InteractiveChartSurface | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;
    const appliedRef = useRef(new Map<string, string>());
    const ownersRef = useRef(new Map<string, UpdateOwner>());
    const [ready, setReady] = useState(false);
    // Set when the chart becomes ready; `onRender` fires once the ready layout has committed.
    const renderedRef = useRef<InteractiveChartSurface | null>(null);
    const [scale, setScale] = useState(1);
    const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);

    const specKey = useMemo(() => flintSpecKey(spec), [spec]);

    // A function receives the spec's definitions, so it owns the whole list and the spec's entries are not composed again.
    const resolved = useMemo(() => {
        if (typeof interactions !== 'function') {
            return { input: spec, definitions: interactions ?? [] };
        }
        const fromSpec = resolveInteractionSpec(spec.interaction_spec).interactions;
        return {
            input: spec.interaction_spec ? { ...spec, interaction_spec: { ...spec.interaction_spec, interactions: [] } } : spec,
            definitions: interactions(fromSpec),
        };
    }, [specKey, interactions]);
    const latestDefinitions = useRef(new Map<string, InteractionDef>());
    latestDefinitions.current = new Map(resolved.definitions.map((definition) => [definition.id, definition]));
    const definitionsKey = interactionsKey(resolved.definitions);
    // A chart with no interactions renders static unless the host passes `updates`, even `[]`.
    const updatable = updates !== undefined;
    const runtime = updatable || resolved.definitions.length > 0
        || resolveInteractionSpec(resolved.input.interaction_spec).interactions.length > 0;
    const runtimeRef = useRef(runtime);
    runtimeRef.current = runtime;

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return undefined;
        let live = true;
        setReady(false);
        // Custom handlers reach the latest definition by id, so a new closure needs no remount.
        // Presets keep the mounted instance: they may hold private state between gestures.
        const definitions = resolved.definitions.map((definition): InteractionDef => {
            if (!isCanvasInteraction(definition)) {
                const external: ExternalInteractionDef<unknown> = { ...definition, handle: (payload, context) => {
                    const latest = latestDefinitions.current.get(definition.id) ?? definition;
                    return isCanvasInteraction(latest) ? null : latest.handle(payload, context);
                } };
                return external;
            }
            if (!definition.handle || definition.origin === 'spec' || definition.preset) return definition;
            const canvas: CanvasInteractionDef = { ...definition, handle: (event, context) => {
                const latest = latestDefinitions.current.get(definition.id);
                return (latest && isCanvasInteraction(latest) ? latest : definition).handle?.(event, context) ?? null;
            } };
            return canvas;
        });
        const initialUpdates = propsRef.current.updates ?? [];
        appliedRef.current = new Map(initialUpdates.map((update) => [update.id, flintUpdateKey(update)]));
        ownersRef.current = new Map(initialUpdates.map((update) => [update.id, 'host' as const]));
        let surface: InteractiveChartSurface;
        try {
            surface = mountChart(host, resolved.input, {
                backend, renderer, expressionInterpreter, background, ariaLabel, chartId,
                interactions: definitions,
                updates: initialUpdates,
                semanticUpdates: updatable,
            });
        } catch (error) {
            propsRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
            return undefined;
        }
        surfaceRef.current = surface;
        const offChange = surface.onChange((change) => {
            if (change.source === 'reader' && change.interactionId) ownersRef.current.set(change.interactionId, 'reader');
            propsRef.current.onChange?.(change);
        });
        const offInteraction = surface.onInteraction((detail) => propsRef.current.onInteraction?.(detail));
        void surface.warnings.then((warnings) => {
            if (live && warnings.length > 0) propsRef.current.onWarnings?.(warnings);
        });
        void surface.ready.then(() => {
            if (!live) return;
            renderedRef.current = surface;
            setReady(true);
        }, (error) => {
            if (live) propsRef.current.onError?.(error instanceof Error ? error : new Error(String(error)));
        });
        return () => {
            live = false;
            renderedRef.current = null;
            offChange();
            offInteraction();
            surfaceRef.current = null;
            surface.destroy();
        };
    }, [specKey, definitionsKey, updatable, backend, renderer, expressionInterpreter, background, ariaLabel, chartId]);

    useEffect(() => {
        const surface = surfaceRef.current;
        if (!surface) return;
        const plan = planUpdates(appliedRef.current, ownersRef.current, updates ?? []);
        if (plan.apply.length === 0 && plan.clear.length === 0) return;
        for (const update of plan.apply) {
            appliedRef.current.set(update.id, flintUpdateKey(update));
            ownersRef.current.set(update.id, 'host');
        }
        for (const id of [...appliedRef.current.keys()]) {
            if (!(updates ?? []).some((update) => update.id === id)) appliedRef.current.delete(id);
        }
        void (async () => {
            for (const update of plan.apply) await surface.applyUpdate(update);
            for (const id of plan.clear) await surface.clearUpdate(id);
            if (surfaceRef.current === surface) propsRef.current.onRender?.(surface);
        })();
    }, [updates]);

    // The chart keeps its compiled size; the box only scales it.
    useBrowserLayoutEffect(() => {
        const outer = outerRef.current;
        const scaler = scalerRef.current;
        if (!outer || !scaler || !ready || typeof ResizeObserver === 'undefined') return undefined;
        const measure = (): void => {
            const naturalWidth = scaler.offsetWidth;
            const naturalHeight = scaler.offsetHeight;
            if (naturalWidth === 0 || naturalHeight === 0) return;
            const ratios: number[] = [];
            if (width !== undefined) ratios.push(outer.clientWidth / naturalWidth);
            if (height !== undefined) ratios.push(outer.clientHeight / naturalHeight);
            const fitted = ratios.length === 0 || fit === 'none' ? 1 : Math.min(...ratios);
            const next = fit === 'shrink' ? Math.min(1, fitted) : fitted;
            setNatural((current) => current?.width === naturalWidth && current.height === naturalHeight
                ? current
                : { width: naturalWidth, height: naturalHeight });
            setScale((current) => Math.abs(current - next) < 1e-3 ? current : next);
        };
        const observer = new ResizeObserver(measure);
        observer.observe(outer);
        observer.observe(scaler);
        measure();
        return () => observer.disconnect();
    }, [ready, width, height, fit]);

    useEffect(() => {
        surfaceRef.current?.refresh();
    }, [scale]);

    // After the placeholder size is gone, so the host measures the laid-out chart.
    useBrowserLayoutEffect(() => {
        const surface = renderedRef.current;
        if (!ready || !surface) return;
        renderedRef.current = null;
        propsRef.current.onRender?.(surface);
    }, [ready]);

    useImperativeHandle(ref, () => ({
        get surface() { return surfaceRef.current; },
        applyUpdate: async (update, options) => {
            const surface = surfaceRef.current;
            if (!surface) return null;
            if (!runtimeRef.current) {
                console.warn('FlintChart: this chart has no interactions, so it renders static. Pass `updates` (even `[]`) to update it.');
                return null;
            }
            ownersRef.current.set(update.id, 'host');
            return surface.applyUpdate(update, options);
        },
        clearUpdate: async (id) => {
            await surfaceRef.current?.clearUpdate(id);
        },
        dispatch: async (interactionId, payload) => surfaceRef.current?.dispatch(interactionId, payload) ?? null,
        getState: () => surfaceRef.current?.getState(),
        refresh: () => surfaceRef.current?.refresh(),
    }), []);

    const placeholder = spec.chart_spec.baseSize ?? DEFAULT_SIZE;
    const scaled = natural && scale !== 1 ? { width: natural.width * scale, height: natural.height * scale } : null;
    const outerStyle: CSSProperties = {
        position: 'relative',
        width: cssLength(width) ?? (scaled ? scaled.width : undefined),
        height: cssLength(height) ?? (scaled ? scaled.height : undefined),
        // Without a box nothing needs clipping, and floating panels may extend past the chart.
        overflow: width === undefined && height === undefined ? undefined : fit === 'none' ? 'auto' : 'hidden',
        ...style,
    };
    const scalerStyle: CSSProperties = {
        width: 'max-content',
        transformOrigin: '0 0',
        ...(scale !== 1 ? { transform: `scale(${scale})` } : {}),
    };
    // Until the chart mounts, the box holds the spec's size so the page does not shift.
    const hostStyle: CSSProperties | undefined = ready ? undefined : { width: placeholder.width, height: placeholder.height };
    return createElement('div', { ref: outerRef, className, style: outerStyle },
        !ready && fallback !== undefined
            ? createElement('div', { style: { position: 'absolute', inset: 0 } }, fallback)
            : null,
        createElement('div', { ref: scalerRef, style: scalerStyle },
            createElement('div', { ref: hostRef, style: hostStyle })));
});
