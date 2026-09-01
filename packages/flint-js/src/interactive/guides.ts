/** Shared lifecycle for transient visuals owned by an active gesture. */
export interface GestureGuideController {
    clear(): void;
    destroy(): void;
}

/** Renderer-neutral styling for a line-based gesture guide. */
export interface LineGestureGuideStyle {
    color: string;
    opacity: number;
    width: number;
}

export interface InspectGestureGuideStyle extends LineGestureGuideStyle {
    fillOpacity: number;
}

export interface AreaGestureGuideStyle {
    fill: string;
    fillOpacity: number;
    stroke: string;
    strokeOpacity: number;
    strokeWidth: number;
}

export interface GestureGuideOptions<TStyle> {
    visible?: boolean;
    style?: Partial<TStyle>;
}

export type InspectGuideOptions = GestureGuideOptions<InspectGestureGuideStyle>;
export type RegionGuideOptions = GestureGuideOptions<AreaGestureGuideStyle>;

export const DEFAULT_INSPECT_GUIDE_STYLE: Readonly<InspectGestureGuideStyle> = Object.freeze({
    color: '#47525c',
    opacity: 0.46,
    width: 1,
    fillOpacity: 0.07,
});

export const DEFAULT_REGION_GUIDE_STYLE: Readonly<AreaGestureGuideStyle> = Object.freeze({
    fill: '#2563eb',
    fillOpacity: 0.12,
    stroke: '#2563eb',
    strokeOpacity: 0.85,
    strokeWidth: 1,
});

export function normalizeInspectGuideOptions(
    options: InspectGuideOptions | false | undefined,
): { visible: boolean; style: InspectGestureGuideStyle } {
    const style = options === false ? undefined : options?.style;
    return {
        visible: options !== false && options?.visible !== false,
        style: {
            color: style?.color ?? DEFAULT_INSPECT_GUIDE_STYLE.color,
            opacity: Number.isFinite(style?.opacity)
                ? Math.min(1, Math.max(0, style!.opacity!))
                : DEFAULT_INSPECT_GUIDE_STYLE.opacity,
            width: Number.isFinite(style?.width) && style!.width! > 0
                ? style!.width!
                : DEFAULT_INSPECT_GUIDE_STYLE.width,
            fillOpacity: Number.isFinite(style?.fillOpacity)
                ? Math.min(1, Math.max(0, style!.fillOpacity!))
                : DEFAULT_INSPECT_GUIDE_STYLE.fillOpacity,
        },
    };
}

export function normalizeRegionGuideOptions(
    options: RegionGuideOptions | false | undefined,
): { visible: boolean; style: AreaGestureGuideStyle } {
    const style = options === false ? undefined : options?.style;
    const unit = (value: number | undefined, fallback: number): number => Number.isFinite(value)
        ? Math.min(1, Math.max(0, value!))
        : fallback;
    return {
        visible: options !== false && options?.visible !== false,
        style: {
            fill: style?.fill ?? DEFAULT_REGION_GUIDE_STYLE.fill,
            fillOpacity: unit(style?.fillOpacity, DEFAULT_REGION_GUIDE_STYLE.fillOpacity),
            stroke: style?.stroke ?? DEFAULT_REGION_GUIDE_STYLE.stroke,
            strokeOpacity: unit(style?.strokeOpacity, DEFAULT_REGION_GUIDE_STYLE.strokeOpacity),
            strokeWidth: Number.isFinite(style?.strokeWidth) && style!.strokeWidth! > 0
                ? style!.strokeWidth!
                : DEFAULT_REGION_GUIDE_STYLE.strokeWidth,
        },
    };
}