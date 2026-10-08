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
    isFilterControls,
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

/**
 * How the chart meets its box. `scale-down` scales it down to fit, never up. `crop` keeps
 * its size and clips. `relayout` lays it out again for the box, which becomes the
 * spec's `canvasSize` ceiling, and scales down whatever still overflows.
 */
export type FlintChartFit = 'scale-down' | 'crop' | 'relayout';

/** The spec's definitions; a malformed spec has none here, and the mount reports it. */
function specInteractions(spec: ChartAssemblyInput): readonly InteractionDef[] | null {
    try {
        return resolveInteractionSpec(spec.interaction_spec).interactions;
    } catch {
        return null;
    }
}

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
    /**
     * For hosts whose CSP forbids eval: a Vega expression interpreter such as `vega-interpreter`'s.
     * Read at mount; a new value applies at the next remount.
     */
    expressionInterpreter?: unknown;
    /** Changing it re-renders the chart. */
    background?: string;
    /** The box the chart sits in, in pixels or a CSS length. Omitted: the chart's natural size. */
    width?: number | string;
    height?: number | string;
    /**
     * Default `'scale-down'`. Under `relayout` each box resize remounts the chart once it settles,
     * so reader state such as a selection does not survive it.
     */
    fit?: FlintChartFit;
    onChange?: (change: ChartChange) => void;
    onInteraction?: (detail: FlintInteractionEventDetail) => void;
    /** After each mount and each applied host update. */
    onRender?: (chart: InteractiveChartSurface) => void;
    /** After each mount: that mount's warnings, possibly none. */
    onWarnings?: (warnings: readonly ChartWarning[]) => void;
    /**
     * The chart failed: a compile error, a malformed `interaction_spec`, or a code interaction
     * the chart cannot honour. Nothing renders; the box shows a muted error instead.
     */
    onError?: (error: Error) => void;
    /** Shown until the chart mounts, including in server rendering. */
    fallback?: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** Applied in place. Default: the chart title. */
    ariaLabel?: string;
    /** The chart's identity in interaction events; changing it remounts the chart. */
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
// A box resize re-lays out once it has settled, and only by more than scrollbar jitter.
const RELAYOUT_DELAY_MS = 150;
const RELAYOUT_TOLERANCE_PX = 4;
// A narrower reading is a transient layout pass, not room to lay out into.
const MIN_ROOM_PX = 40;

const ERROR_STYLE: CSSProperties = {
    boxSizing: 'border-box', width: '100%', height: '100%', overflow: 'auto', padding: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
    border: '1px dashed rgba(0, 0, 0, 0.15)', borderRadius: 4, background: 'rgba(0, 0, 0, 0.02)',
    color: 'rgba(0, 0, 0, 0.5)', font: '12px/1.5 system-ui, sans-serif', overflowWrap: 'anywhere',
};

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

/**
 * What the mounted chart depends on in the definitions: ids, presets, and preset options.
 * Function-valued options are left out, so they are read at mount.
 */
export function flintInteractionsKey(definitions: readonly InteractionDef[]): string {
    return JSON.stringify(definitions.map((definition) => {
        if (isFilterControls(definition)) return [definition.id, definition.preset, definition.filterControls.options];
        if (!isCanvasInteraction(definition)) return [definition.id, 'external'];
        return [definition.id, definition.preset ?? 'canvas', definition.presetOptions ?? null];
    }));
}

function cssLength(value: number | string | undefined): string | undefined {
    return typeof value === 'number' ? `${value}px` : value;
}

type Size = { width: number; height: number };
type Room = { width?: number; height?: number };

/** The scale that fits a chart of `natural` size into the sides of `box` the host sized; never above 1. */
export function fitScale(natural: Size, box: Room, fit: FlintChartFit): number {
    if (fit === 'crop') return 1;
    const ratios: number[] = [];
    if (box.width !== undefined) ratios.push(box.width / natural.width);
    if (box.height !== undefined) ratios.push(box.height / natural.height);
    return Math.min(1, ...ratios);
}

/** The room `relayout` lays out into next: unchanged under jitter or a reading too small to be real. */
export function settleRoom(current: Room | null, measured: Room): Room | null {
    const tooSmall = (side: number | undefined) => side !== undefined && side < MIN_ROOM_PX;
    if (tooSmall(measured.width) || tooSmall(measured.height)) return current;
    const near = (a: number | undefined, b: number | undefined) =>
        Math.abs((a ?? 0) - (b ?? 0)) < RELAYOUT_TOLERANCE_PX;
    return current && near(current.width, measured.width) && near(current.height, measured.height) ? current : measured;
}

// A replacement mounts out of flow and unseen, under the chart it replaces.
const STAGING_STYLE: Partial<CSSStyleDeclaration> = {
    position: 'absolute', top: '0', left: '0', visibility: 'hidden', pointerEvents: 'none',
};

export const FlintChart = forwardRef<FlintChartHandle, FlintChartProps>(function FlintChart(props, ref) {
    const {
        spec, backend = 'vegalite', interactions, updates, renderer, background,
        width, height, fit = 'scale-down', fallback, className, style, ariaLabel, chartId,
    } = props;
    const outerRef = useRef<HTMLDivElement>(null);
    const scalerRef = useRef<HTMLDivElement>(null);
    const hostRef = useRef<HTMLDivElement>(null);
    const surfaceRef = useRef<InteractiveChartSurface | null>(null);
    const propsRef = useRef(props);
    propsRef.current = props;
    const appliedRef = useRef(new Map<string, string>());
    const ownersRef = useRef(new Map<string, UpdateOwner>());
    // The chart on screen; a replacement takes its place once it is ready.
    const [shown, setShown] = useState<InteractiveChartSurface | null>(null);
    const ready = shown !== null;
    // Charts a remount replaced, kept on screen until the new one is ready.
    const retiringRef = useRef<{ surface: InteractiveChartSurface; stage: HTMLElement }[]>([]);
    const [failure, setFailure] = useState<string | null>(null);
    // Set when the chart becomes ready; `onRender` fires once the ready layout has committed.
    const renderedRef = useRef<InteractiveChartSurface | null>(null);
    const [scale, setScale] = useState(1);
    const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
    const relayout = fit === 'relayout' && (width !== undefined || height !== undefined);
    const [room, setRoom] = useState<{ width?: number; height?: number } | null>(null);
    // Under `relayout` the chart mounts once the box is measured, not before and again after.
    const waiting = relayout && room === null && typeof ResizeObserver !== 'undefined';
    const roomKey = relayout && room ? `${room.width ?? ''}x${room.height ?? ''}` : '';

    const specKey = useMemo(() => flintSpecKey(spec), [spec]);
    // Once per spec content, so an inline `interactions` function receives the same definitions each render.
    const fromSpec = useMemo(() => specInteractions(spec), [specKey]);

    // A function receives the spec's definitions, so it owns the whole list and the spec's entries are not composed again.
    const resolved = useMemo(() => {
        if (typeof interactions !== 'function') {
            return { input: spec, definitions: interactions ?? [] };
        }
        return {
            // A malformed spec stays as written, so the mount reports it.
            input: spec.interaction_spec && fromSpec
                ? { ...spec, interaction_spec: { ...spec.interaction_spec, interactions: [] } }
                : spec,
            definitions: interactions(fromSpec ?? []),
        };
    }, [specKey, fromSpec, interactions]);
    const latestDefinitions = useRef(new Map<string, InteractionDef>());
    latestDefinitions.current = new Map(resolved.definitions.map((definition) => [definition.id, definition]));
    const definitionsKey = flintInteractionsKey(resolved.definitions);
    // A chart with no interactions renders static unless the host passes `updates`, even `[]`.
    const updatable = updates !== undefined;
    // A malformed spec counts as interactive, so the mount reports it.
    const specCount = fromSpec === null ? 1 : typeof interactions === 'function' ? 0 : fromSpec.length;
    const runtime = updatable || resolved.definitions.length > 0 || specCount > 0;
    const runtimeRef = useRef(runtime);
    runtimeRef.current = runtime;

    useEffect(() => {
        const host = hostRef.current;
        if (!host || waiting) return undefined;
        let live = true;
        setFailure(null);
        // Custom handlers reach the latest definition by id, so a new closure needs no remount.
        // Presets keep the mounted instance: they may hold private state between gestures.
        const definitions = resolved.definitions.map((definition): InteractionDef => {
            if (!isCanvasInteraction(definition)) {
                // A preset's handler reads the state its controls and bound rows hold, so it stays the mounted one.
                if (isFilterControls(definition)) return definition;
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
        const stage = document.createElement('div');
        if (retiringRef.current.length > 0) Object.assign(stage.style, STAGING_STYLE);
        host.append(stage);
        const settle = (): void => {
            for (const old of retiringRef.current) {
                old.surface.destroy();
                old.stage.remove();
            }
            retiringRef.current = [];
            stage.removeAttribute('style');
        };
        const fail = (error: unknown): void => {
            const failed = error instanceof Error ? error : new Error(String(error));
            settle();
            setShown(null);
            setFailure(failed.message);
            propsRef.current.onError?.(failed);
        };
        try {
            surface = mountChart(stage, resolved.input, {
                backend, renderer, background, chartId,
                expressionInterpreter: propsRef.current.expressionInterpreter,
                ariaLabel: propsRef.current.ariaLabel,
                interactions: definitions,
                updates: initialUpdates,
                semanticUpdates: updatable,
                availableSize: relayout && room ? room : undefined,
            });
        } catch (error) {
            stage.remove();
            fail(error);
            return undefined;
        }
        surfaceRef.current = surface;
        const offChange = surface.onChange((change) => {
            if (change.source === 'reader' && change.interactionId) ownersRef.current.set(change.interactionId, 'reader');
            propsRef.current.onChange?.(change);
        });
        const offInteraction = surface.onInteraction((detail) => propsRef.current.onInteraction?.(detail));
        void surface.warnings.then((warnings) => {
            if (live) propsRef.current.onWarnings?.(warnings);
        });
        void surface.ready.then(() => {
            if (!live) return;
            settle();
            renderedRef.current = surface;
            setShown(surface);
        }, (error) => {
            if (live) fail(error);
        });
        return () => {
            live = false;
            renderedRef.current = null;
            offChange();
            offInteraction();
            if (surfaceRef.current === surface) surfaceRef.current = null;
            // Destroyed when the replacement is ready, or on unmount.
            stage.style.pointerEvents = 'none';
            retiringRef.current.push({ surface, stage });
        };
    }, [specKey, definitionsKey, updatable, backend, renderer, background, chartId, waiting, roomKey]);

    // Declared after the mount effect, so on unmount it runs after that effect retires the last chart.
    useEffect(() => () => {
        for (const old of retiringRef.current) {
            old.surface.destroy();
            old.stage.remove();
        }
        retiringRef.current = [];
    }, []);

    // The room `relayout` lays the chart out into: the sides of the box the host sized.
    useBrowserLayoutEffect(() => {
        const outer = outerRef.current;
        if (!relayout || !outer || typeof ResizeObserver === 'undefined') {
            setRoom(null);
            return undefined;
        }
        const commit = (): void => {
            setRoom((current) => settleRoom(current, {
                width: width !== undefined ? Math.floor(outer.clientWidth) : undefined,
                height: height !== undefined ? Math.floor(outer.clientHeight) : undefined,
            }));
        };
        commit();
        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new ResizeObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(commit, RELAYOUT_DELAY_MS);
        });
        observer.observe(outer);
        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, [relayout, width, height]);

    useEffect(() => {
        for (const root of hostRef.current?.querySelectorAll<HTMLElement>('[data-flint-chart-id]') ?? []) {
            root.setAttribute('aria-label', ariaLabel ?? resolved.input.chart_spec.title ?? 'Interactive chart');
        }
    }, [ariaLabel]);

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
            const next = fitScale({ width: naturalWidth, height: naturalHeight }, {
                width: width !== undefined ? outer.clientWidth : undefined,
                height: height !== undefined ? outer.clientHeight : undefined,
            }, fit);
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
    }, [shown, width, height, fit]);

    useEffect(() => {
        surfaceRef.current?.refresh();
    }, [scale]);

    // After the placeholder size is gone, so the host measures the laid-out chart.
    useBrowserLayoutEffect(() => {
        const surface = renderedRef.current;
        if (!surface || surface !== shown) return;
        renderedRef.current = null;
        propsRef.current.onRender?.(surface);
    }, [shown]);

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

    const base = spec.chart_spec.baseSize ?? DEFAULT_SIZE;
    const placeholder = {
        width: Math.min(base.width, room?.width ?? Infinity),
        height: Math.min(base.height, room?.height ?? Infinity),
    };
    const scaled = natural && scale !== 1 ? { width: natural.width * scale, height: natural.height * scale } : null;
    const outerStyle: CSSProperties = {
        position: 'relative',
        width: cssLength(width) ?? (scaled ? scaled.width : undefined),
        height: cssLength(height) ?? (scaled ? scaled.height : undefined),
        // Without a box nothing needs clipping, and floating panels may extend past the chart.
        overflow: width === undefined && height === undefined ? undefined : 'hidden',
        ...(width !== undefined || height !== undefined ? {
            display: 'flex',
            // A cropped chart that overflows starts at the box's edge rather than losing it.
            justifyContent: fit === 'crop' ? 'safe center' : 'center',
            alignItems: fit === 'crop' ? 'safe center' : 'center',
            // As a flex or grid item the box takes the host's size, not the chart's.
            minWidth: 0,
            minHeight: 0,
        } : {}),
        ...style,
    };
    const scalerStyle: CSSProperties = {
        width: 'max-content',
        flex: 'none',
        // The box centres the chart's layout size, which may spill evenly past it; scaling about
        // the centre then lands the drawn chart centred inside the box, as `object-fit` does.
        transformOrigin: 'center',
        ...(scale !== 1 ? { transform: `scale(${scale})` } : {}),
    };
    // Until the chart mounts, the box holds the spec's size so the page does not shift.
    const hostStyle: CSSProperties = ready
        ? { position: 'relative' }
        : { position: 'relative', width: placeholder.width, height: placeholder.height };
    const overlay = failure !== null
        ? createElement('div', { role: 'alert', 'data-flint-chart-error': '', style: ERROR_STYLE }, `Chart could not render: ${failure}`)
        : fallback !== undefined ? fallback : null;
    return createElement('div', { ref: outerRef, className, style: outerStyle },
        !ready && overlay !== null
            ? createElement('div', { style: { position: 'absolute', inset: 0 } }, overlay)
            : null,
        createElement('div', { ref: scalerRef, style: scalerStyle },
            createElement('div', { ref: hostRef, style: hostStyle })));
});
