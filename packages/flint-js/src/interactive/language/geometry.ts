export interface PlotPoint {
    x: number;
    y: number;
}

export interface PlotRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface PlotPolygon {
    points: readonly PlotPoint[];
}

export interface PlotAngularSector {
    center: PlotPoint;
    innerRadius: number;
    outerRadius: number;
    startAngle: number;
    endAngle: number;
}