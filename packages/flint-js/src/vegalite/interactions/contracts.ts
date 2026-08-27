import type { ChartInteractionResolver } from '../../core/interaction-semantics';
import type { ChartUpdatePresenter } from '../../interactive/interactions';

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

export interface VegaNavigationAxis {
    scale: string;
    signal: string;
    type: 'linear' | 'log' | 'time' | 'utc';
}

export interface VegaReorderAxis {
    axis: 'x' | 'y';
    field: string;
    includeConnectiveMarks?: boolean;
    scale: string;
    signal: string;
}

export interface VegaInteractionPlan {
    fields: readonly string[];
    categoryField?: string;
    seriesField?: string;
    legendFields?: Readonly<Record<string, string>>;
    dimOpacity: number;
    renderHoverStyles?: Readonly<Record<string, HoverStyle>>;
    renderSelectionStyles?: Readonly<Record<string, SelectionStyle>>;
    selectionBoundary?: Readonly<SelectionBoundaryStyle>;
    navigationChannels?: readonly ('x' | 'y')[];
    navigationAxes?: Partial<Record<'x' | 'y', VegaNavigationAxis>>;
    reorderAxis?: VegaReorderAxis;
    reorderAxes?: readonly VegaReorderAxis[];
    resolve?: ChartInteractionResolver;
    presentUpdate?: ChartUpdatePresenter;
}