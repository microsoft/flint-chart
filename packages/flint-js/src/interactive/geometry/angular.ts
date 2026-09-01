import type { PlotAngularSector, PlotPoint } from '../language/events';

export const TAU = 2 * Math.PI;

export function angularSegments(startAngle: number, endAngle: number): [number, number][] {
    const sweep = endAngle - startAngle;
    if (Math.abs(sweep) >= TAU - 1e-9) return [[0, TAU]];
    const leading = sweep >= 0 ? startAngle : endAngle;
    const extent = Math.abs(sweep);
    const start = ((leading % TAU) + TAU) % TAU;
    const end = start + extent;
    return end <= TAU ? [[start, end]] : [[start, TAU], [0, end - TAU]];
}

export function angularSectorPath(sector: PlotAngularSector): string {
    const rawSweep = sector.endAngle - sector.startAngle;
    const sweep = Math.min(TAU, Math.max(-TAU, rawSweep));
    if (Math.abs(sweep) < 1e-9 || sector.outerRadius <= 0) return '';
    const point = (radius: number, angle: number): PlotPoint => ({
        x: sector.center.x + radius * Math.sin(angle),
        y: sector.center.y - radius * Math.cos(angle),
    });
    const outerStart = point(sector.outerRadius, sector.startAngle);
    if (Math.abs(sweep) >= TAU - 1e-9) {
        const direction = sweep > 0 ? 1 : 0;
        const reverse = direction ? 0 : 1;
        const outerMid = point(sector.outerRadius, sector.startAngle + Math.sign(sweep) * Math.PI);
        const outerCircle = `M ${outerStart.x} ${outerStart.y} `
            + `A ${sector.outerRadius} ${sector.outerRadius} 0 1 ${direction} ${outerMid.x} ${outerMid.y} `
            + `A ${sector.outerRadius} ${sector.outerRadius} 0 1 ${direction} ${outerStart.x} ${outerStart.y}`;
        if (sector.innerRadius <= 0) return `${outerCircle} Z`;
        const innerStart = point(sector.innerRadius, sector.startAngle);
        const innerMid = point(sector.innerRadius, sector.startAngle + Math.sign(sweep) * Math.PI);
        return `${outerCircle} L ${innerStart.x} ${innerStart.y} `
            + `A ${sector.innerRadius} ${sector.innerRadius} 0 1 ${reverse} ${innerMid.x} ${innerMid.y} `
            + `A ${sector.innerRadius} ${sector.innerRadius} 0 1 ${reverse} ${innerStart.x} ${innerStart.y} Z`;
    }
    const outerEnd = point(sector.outerRadius, sector.startAngle + sweep);
    const largeArc = Math.abs(sweep) > Math.PI ? 1 : 0;
    const sweepFlag = sweep > 0 ? 1 : 0;
    const outerArc = `A ${sector.outerRadius} ${sector.outerRadius} 0 ${largeArc} ${sweepFlag} ${outerEnd.x} ${outerEnd.y}`;
    if (sector.innerRadius <= 0) {
        return `M ${sector.center.x} ${sector.center.y} L ${outerStart.x} ${outerStart.y} ${outerArc} Z`;
    }
    const innerEnd = point(sector.innerRadius, sector.startAngle + sweep);
    const innerStart = point(sector.innerRadius, sector.startAngle);
    return `M ${outerStart.x} ${outerStart.y} ${outerArc} L ${innerEnd.x} ${innerEnd.y} `
        + `A ${sector.innerRadius} ${sector.innerRadius} 0 ${largeArc} ${sweepFlag ? 0 : 1} ${innerStart.x} ${innerStart.y} Z`;
}