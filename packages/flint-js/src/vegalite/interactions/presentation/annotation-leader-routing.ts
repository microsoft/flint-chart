import type { PlotPoint } from '../../../interactive/interactions';

export type AnnotationPortEdge = 'top' | 'right' | 'bottom' | 'left';

export interface AnnotationRouteRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export interface AnnotationLeaderPort extends PlotPoint {
    edge: AnnotationPortEdge;
    fraction: number;
}

export interface AnnotationLeaderRoute {
    source: PlotPoint;
    port: AnnotationLeaderPort;
    points: readonly PlotPoint[];
}

const SIDE_PORT_FRACTIONS = [0.25, 0.5, 0.75] as const;
const HORIZONTAL_PORT_FRACTIONS = [0.25, 0.75] as const;
const EDGE_ORDER: readonly AnnotationPortEdge[] = ['top', 'right', 'bottom', 'left'];
const AXIS_DOMINANCE_RATIO = 1.5;
const EPSILON = 1e-6;

export function annotationLeaderPorts(card: AnnotationRouteRect): readonly AnnotationLeaderPort[] {
    return EDGE_ORDER.flatMap((edge) => {
        const fractions = edge === 'top' || edge === 'bottom'
            ? HORIZONTAL_PORT_FRACTIONS
            : SIDE_PORT_FRACTIONS;
        return fractions.map((fraction) => {
            if (edge === 'top' || edge === 'bottom') {
                return {
                    edge,
                    fraction,
                    x: card.left + card.width * fraction,
                    y: edge === 'top' ? card.top : card.top + card.height,
                };
            }
            return {
                edge,
                fraction,
                x: edge === 'left' ? card.left : card.left + card.width,
                y: card.top + card.height * fraction,
            };
        });
    });
}

export function annotationFacingEdges(
    source: PlotPoint,
    card: AnnotationRouteRect,
): readonly AnnotationPortEdge[] {
    const edges: AnnotationPortEdge[] = [];
    const horizontalGap = source.x < card.left
        ? card.left - source.x
        : Math.max(0, source.x - card.left - card.width);
    const verticalGap = source.y < card.top
        ? card.top - source.y
        : Math.max(0, source.y - card.top - card.height);
    const horizontalEdge = source.x < card.left ? 'left' : 'right';
    const verticalEdge = source.y < card.top ? 'top' : 'bottom';
    if (verticalGap > EPSILON && verticalGap >= horizontalGap * AXIS_DOMINANCE_RATIO) {
        return [verticalEdge];
    }
    if (horizontalGap > EPSILON && horizontalGap >= verticalGap * AXIS_DOMINANCE_RATIO) {
        return [horizontalEdge];
    }
    if (horizontalGap > EPSILON) edges.push(horizontalEdge);
    if (verticalGap > EPSILON) edges.push(verticalEdge);
    if (edges.length > 0) return edges;

    const distances: readonly [AnnotationPortEdge, number][] = [
        ['top', Math.abs(source.y - card.top)],
        ['right', Math.abs(source.x - card.left - card.width)],
        ['bottom', Math.abs(source.y - card.top - card.height)],
        ['left', Math.abs(source.x - card.left)],
    ];
    const nearest = Math.min(...distances.map(([, distance]) => distance));
    return distances.filter(([, distance]) => Math.abs(distance - nearest) < EPSILON).map(([edge]) => edge);
}

function pointEqual(a: PlotPoint, b: PlotPoint): boolean {
    return Math.abs(a.x - b.x) < EPSILON && Math.abs(a.y - b.y) < EPSILON;
}

function simplifyPoints(points: readonly PlotPoint[]): PlotPoint[] {
    const unique = points.filter((point, index) => index === 0 || !pointEqual(point, points[index - 1]));
    return unique.filter((point, index) => {
        if (index === 0 || index === unique.length - 1) return true;
        const before = unique[index - 1];
        const after = unique[index + 1];
        return Math.abs((point.x - before.x) * (after.y - point.y)
            - (point.y - before.y) * (after.x - point.x)) > EPSILON;
    });
}

function pointInsideRect(point: PlotPoint, card: AnnotationRouteRect): boolean {
    return point.x > card.left + EPSILON
        && point.x < card.left + card.width - EPSILON
        && point.y > card.top + EPSILON
        && point.y < card.top + card.height - EPSILON;
}

function segmentEntersRect(start: PlotPoint, end: PlotPoint, card: AnnotationRouteRect): boolean {
    if (pointInsideRect(start, card) || pointInsideRect(end, card)) return true;
    const left = card.left + EPSILON;
    const right = card.left + card.width - EPSILON;
    const top = card.top + EPSILON;
    const bottom = card.top + card.height - EPSILON;
    if (left >= right || top >= bottom) return false;
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    let entry = 0;
    let exit = 1;
    for (const [direction, offset] of [
        [-deltaX, start.x - left],
        [deltaX, right - start.x],
        [-deltaY, start.y - top],
        [deltaY, bottom - start.y],
    ] as const) {
        if (Math.abs(direction) < EPSILON) {
            if (offset < 0) return false;
            continue;
        }
        const ratio = offset / direction;
        if (direction < 0) entry = Math.max(entry, ratio);
        else exit = Math.min(exit, ratio);
        if (entry > exit) return false;
    }
    return exit > EPSILON && entry < 1 - EPSILON;
}

function routeIsValid(points: readonly PlotPoint[], card: AnnotationRouteRect): boolean {
    return points.slice(1).every((point, index) => !segmentEntersRect(points[index], point, card));
}

function routeCandidates(
    source: PlotPoint,
    port: AnnotationLeaderPort,
    card: AnnotationRouteRect,
): readonly AnnotationLeaderRoute[] {
    const middleX = (source.x + port.x) / 2;
    const middleY = (source.y + port.y) / 2;
    const pointSets: PlotPoint[][] = [
        [source, port],
        [source, { x: source.x, y: port.y }, port],
        [source, { x: port.x, y: source.y }, port],
        [source, { x: middleX, y: source.y }, { x: middleX, y: port.y }, port],
        [source, { x: source.x, y: middleY }, { x: port.x, y: middleY }, port],
    ];
    const seen = new Set<string>();
    return pointSets.flatMap((points) => {
        const simplified = simplifyPoints(points);
        const key = simplified.map((point) => `${point.x},${point.y}`).join(';');
        if (seen.has(key) || !routeIsValid(simplified, card)) return [];
        seen.add(key);
        return [{ source, port, points: simplified }];
    });
}

function orientation(a: PlotPoint, b: PlotPoint, c: PlotPoint): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a: PlotPoint, b: PlotPoint, c: PlotPoint, d: PlotPoint): boolean {
    if (pointEqual(a, c) || pointEqual(a, d) || pointEqual(b, c) || pointEqual(b, d)) return false;
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    return ((abC > EPSILON && abD < -EPSILON) || (abC < -EPSILON && abD > EPSILON))
        && ((cdA > EPSILON && cdB < -EPSILON) || (cdA < -EPSILON && cdB > EPSILON));
}

function routesCross(a: AnnotationLeaderRoute, b: AnnotationLeaderRoute): boolean {
    for (let ai = 1; ai < a.points.length; ai += 1) {
        for (let bi = 1; bi < b.points.length; bi += 1) {
            if (segmentsCross(a.points[ai - 1], a.points[ai], b.points[bi - 1], b.points[bi])) return true;
        }
    }
    return false;
}

function sameEdgeOrderIsValid(routes: readonly AnnotationLeaderRoute[]): boolean {
    for (let first = 0; first < routes.length; first += 1) {
        for (let second = first + 1; second < routes.length; second += 1) {
            const a = routes[first];
            const b = routes[second];
            if (a.port.edge !== b.port.edge) continue;
            const sourceOrder = a.port.edge === 'top' || a.port.edge === 'bottom'
                ? a.source.x - b.source.x
                : a.source.y - b.source.y;
            const portOrder = a.port.fraction - b.port.fraction;
            if (sourceOrder * portOrder < -EPSILON) return false;
        }
    }
    return true;
}

function routeLength(route: AnnotationLeaderRoute): number {
    return route.points.slice(1).reduce((sum, point, index) =>
        sum + Math.hypot(point.x - route.points[index].x, point.y - route.points[index].y), 0);
}

function sharedSegmentCount(routes: readonly AnnotationLeaderRoute[]): number {
    const keys = new Map<string, number>();
    for (const route of routes) {
        for (let index = 1; index < route.points.length; index += 1) {
            const a = route.points[index - 1];
            const b = route.points[index];
            const key = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('|');
            keys.set(key, (keys.get(key) ?? 0) + 1);
        }
    }
    return [...keys.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
}

function compareRank(a: readonly number[], b: readonly number[]): number {
    for (let index = 0; index < a.length; index += 1) {
        if (Math.abs(a[index] - b[index]) > EPSILON) return a[index] - b[index];
    }
    return 0;
}

function assignmentRank(routes: readonly AnnotationLeaderRoute[], ports: readonly AnnotationLeaderPort[]): number[] {
    let crossings = 0;
    for (let first = 0; first < routes.length; first += 1) {
        for (let second = first + 1; second < routes.length; second += 1) {
            if (routesCross(routes[first], routes[second])) crossings += 1;
        }
    }
    const bends = routes.reduce((sum, route) => sum + Math.max(0, route.points.length - 2), 0);
    const length = routes.reduce((sum, route) => sum + routeLength(route), 0);
    const deterministic = routes.reduce((sum, route, index) =>
        sum + ports.indexOf(route.port) * Math.pow(ports.length, routes.length - index - 1), 0);
    return [crossings, sharedSegmentCount(routes), bends, length, deterministic];
}

export function routeAnnotationLeaders({
    card,
    sources,
}: {
    card: AnnotationRouteRect;
    sources: readonly PlotPoint[];
}): readonly AnnotationLeaderRoute[] {
    if (sources.length === 0) return [];
    const ports = annotationLeaderPorts(card);
    const choices = sources.map((source) => ports
        .filter((port) => annotationFacingEdges(source, card).includes(port.edge))
        .flatMap((port) => routeCandidates(source, port, card)));
    let best: readonly AnnotationLeaderRoute[] | undefined;
    let bestRank: readonly number[] | undefined;

    const visit = (index: number, routes: AnnotationLeaderRoute[]): void => {
        if (index === choices.length) {
            if (!sameEdgeOrderIsValid(routes)) return;
            const rank = assignmentRank(routes, ports);
            if (!bestRank || compareRank(rank, bestRank) < 0) {
                best = [...routes];
                bestRank = rank;
            }
            return;
        }
        for (const route of choices[index]) {
            if (routes.some((existing) => pointEqual(existing.port, route.port))) continue;
            routes.push(route);
            visit(index + 1, routes);
            routes.pop();
        }
    };
    visit(0, []);
    return best ?? [];
}