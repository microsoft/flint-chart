import type { ChartInteractionResolver } from '../../core/interaction-semantics';
import type { ChartUpdatePresenter, InteractionContext } from '../../interactive/interactions';
import type { GeoLevelConfig } from './navigation-geo';

export interface HoverStyle {
    fill?: string;
    fillOpacity?: number;
    opacity?: 'contrast' | 'spotlight';
    stroke?: string;
    strokeWidth?: number;
}

export interface SelectionStyle {
    strokeWidthMultiplier?: number;
    boundary?: 'contiguous-region';
}

export interface SelectionBoundaryStyle {
    color: string;
    width: number;
    opacity: number;
    haloColor: string;
    haloWidth: number;
    haloOpacity: number;
}

export interface ContinuousColorFocusStyle {
    mutedFill: string;
    boundaryWidth: number;
    boundaryOpacity: number;
    haloWidth: number;
    haloOpacity: number;
}

export interface VegaNavigationAxis {
    scale: string;
    signal: string;
    /** `geo` axes share one projection-extent signal instead of a scale domain. */
    type: 'linear' | 'log' | 'time' | 'utc' | 'geo';
}

export interface VegaReorderAxis {
    axis: 'x' | 'y';
    field: string;
    includeConnectiveMarks?: boolean;
    markTypes?: readonly string[];
    scale: string;
    signal: string;
}

export interface VegaAxisTarget {
    axis: 'x' | 'y';
    field: string;
    type: string;
}

export interface VegaInteractionPlan {
    fields: readonly string[];
    sourceRecords: readonly Record<string, unknown>[];
    provenanceFields: readonly string[];
    temporalProvenanceFields: readonly string[];
    rangeProvenance: readonly { field: string; startField: string; endField: string }[];
    categoryField?: string;
    seriesField?: string;
    resolveGroupValue?: InteractionContext['resolveGroupValue'];
    legendFields?: Readonly<Record<string, string>>;
    axisFields?: Partial<Record<'x' | 'y', { field: string; type: string }>>;
    axisTargets?: Readonly<Record<string, VegaAxisTarget>>;
    rangeLegendChannels?: readonly string[];
    annotationMarkType?: string;
    /** The compiled spec carries the semantic selection stores. */
    semanticStores?: boolean;
    dimOpacity: number;
    renderHoverStyles?: Readonly<Record<string, HoverStyle>>;
    renderSelectionStyles?: Readonly<Record<string, SelectionStyle>>;
    selectionBoundary?: Readonly<SelectionBoundaryStyle>;
    continuousColorFocus?: Readonly<ContinuousColorFocusStyle>;
    navigationChannels?: readonly ('x' | 'y')[];
    /** Navigation moves a cartographic projection's extent rather than scale domains. */
    geoNavigation?: boolean;
    /** Runtime detail levels a projected chart swaps as the zoom crosses their thresholds. */
    geoLevels?: GeoLevelConfig;
    /** Polar templates realize the primary X brush as an angular sector. */
    angularXBrush?: boolean;
    navigationAxes?: Partial<Record<'x' | 'y', VegaNavigationAxis>>;
    /** Unambiguous existing Cartesian scales available to external overlays. */
    overlayScales?: Partial<Record<'x' | 'y' | 'color', string>>;
    /** Mutable compiled inline source used by `set-data`. */
    mutableDataSource?: string;
    initialDataRows?: readonly Record<string, unknown>[];
    reorderAxis?: VegaReorderAxis;
    reorderAxes?: readonly VegaReorderAxis[];
    resolve?: ChartInteractionResolver;
    presentUpdate?: ChartUpdatePresenter;
}