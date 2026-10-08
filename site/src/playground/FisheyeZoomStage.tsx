import { useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  hoverTrigger,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
} from 'flint-chart/interactive';
import { FlintChart } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import { PENGUINS, type Penguin } from './bespoke-interaction-data';
import './fisheye-zoom-stage.css';

const HOVER_ID = 'fisheye-semantic-hover';
const LOUPE_SIZE = 238;
const LOUPE_CENTER = LOUPE_SIZE / 2;
const LENS_RADIUS = 92;
const MAGNIFICATION = 3.2;
const COLORS: Record<Penguin['species'], string> = {
  Adelie: '#18a1cd',
  Chinstrap: '#e2a233',
  Gentoo: '#c04a4a',
};
const CHART_ROWS = PENGUINS.map((penguin) => ({
  Specimen: penguin.id,
  Species: penguin.species,
  Flipper: penguin.flipper,
  Mass: penguin.mass,
}));

const CHART_INPUT: ChartAssemblyInput = {
  data: { values: CHART_ROWS },
  semantic_types: {
    Specimen: 'Category',
    Species: 'Category',
    Flipper: { semanticType: 'Quantity', intrinsicDomain: [175, 235] },
    Mass: { semanticType: 'Quantity', intrinsicDomain: [3000, 6100] },
  },
  field_display_names: {
    Flipper: 'Flipper length (mm)',
    Mass: 'Body mass (g)',
  },
  theme_spec: {
    extends: 'datawrapper',
    geometry: { point: { size: 130 } },
  },
  options: { addTooltips: false },
  chart_spec: {
    chartType: 'Scatter Plot',
    title: 'Palmer Penguins morphology',
    encodings: { x: 'Flipper', y: 'Mass', color: 'Species', detail: 'Specimen' },
    baseSize: { width: 900, height: 520 },
    canvasSize: { width: 900, height: 520 },
    chartProperties: { includeZero_x: false, includeZero_y: false },
  },
};

const INTERACTIONS: CanvasInteractionDef[] = [{
  id: HOVER_ID,
  eventSource: { ...hoverTrigger, defaultAssistDistance: 28, targetTolerance: 28 },
  affordances: { mark: { hover: 'target' } },
  handle() {
    // Acquisition only: the host renders the result without a Flint ChartUpdate.
    return null;
  },
}];

type LoupePoint = Penguin & {
  x: number;
  y: number;
  distance: number;
};

type RenderedPoint = { x: number; y: number };
type PlotBounds = { left: number; right: number; top: number; bottom: number };

function distortOffset(dx: number, dy: number): RenderedPoint {
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { x: 0, y: 0 };
  const expanded = LENS_RADIUS * (MAGNIFICATION + 1) * distance
    / (MAGNIFICATION * distance + LENS_RADIUS);
  return { x: dx / distance * expanded, y: dy / distance * expanded };
}

function penguinFromInteraction(detail: FlintInteractionEventDetail): Penguin | null {
  if (detail.interactionId !== HOVER_ID || detail.event.action !== 'hover-element') return null;
  if (detail.event.target?.visual.role !== 'point') return null;
  const element = detail.event.target.elements[0];
  const row = (element?.records?.[0] ?? element?.value) as Record<string, unknown> | undefined;
  if (typeof row?.Specimen !== 'string') return null;
  return PENGUINS.find((candidate) => candidate.id === row.Specimen) ?? null;
}

function renderedPointPositions(mount: HTMLDivElement): Map<string, RenderedPoint> {
  const mountRect = mount.getBoundingClientRect();
  const scaleX = mount.offsetWidth / mountRect.width;
  const scaleY = mount.offsetHeight / mountRect.height;
  const positions = new Map<string, RenderedPoint>();
  for (const element of mount.querySelectorAll<SVGGraphicsElement>('[aria-label*="Specimen:"]')) {
    const match = element.getAttribute('aria-label')?.match(/Specimen:\s*([^;]+)/);
    if (!match) continue;
    const rect = element.getBoundingClientRect();
    positions.set(match[1].trim(), {
      x: (rect.left + rect.width / 2 - mountRect.left) * scaleX,
      y: (rect.top + rect.height / 2 - mountRect.top) * scaleY,
    });
  }
  return positions;
}

function loupePoints(pointer: RenderedPoint, rendered: ReadonlyMap<string, RenderedPoint>): LoupePoint[] {
  return PENGUINS.map((penguin) => {
    const position = rendered.get(penguin.id);
    if (!position) return null;
    const dx = position.x - pointer.x;
    const dy = position.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) return { ...penguin, x: LOUPE_CENTER, y: LOUPE_CENTER, distance };
    const distorted = distortOffset(dx, dy);
    return {
      ...penguin,
      x: LOUPE_CENTER + distorted.x,
      y: LOUPE_CENTER + distorted.y,
      distance,
    };
  })
    .filter((point): point is LoupePoint => point !== null && point.distance <= LENS_RADIUS)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 7);
}

function massScale(rendered: ReadonlyMap<string, RenderedPoint>) {
  const samples = PENGUINS.flatMap((penguin) => {
    const position = rendered.get(penguin.id);
    return position ? [{ value: penguin.mass, position: position.y }] : [];
  });
  if (samples.length < 2) return null;
  const meanValue = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const meanPosition = samples.reduce((sum, sample) => sum + sample.position, 0) / samples.length;
  const numerator = samples.reduce(
    (sum, sample) => sum + (sample.value - meanValue) * (sample.position - meanPosition),
    0,
  );
  const denominator = samples.reduce((sum, sample) => sum + (sample.value - meanValue) ** 2, 0);
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return (value: number) => meanPosition + (value - meanValue) * slope;
}

function flipperScale(rendered: ReadonlyMap<string, RenderedPoint>) {
  const samples = PENGUINS.flatMap((penguin) => {
    const position = rendered.get(penguin.id);
    return position ? [{ value: penguin.flipper, position: position.x }] : [];
  });
  if (samples.length < 2) return null;
  const meanValue = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const meanPosition = samples.reduce((sum, sample) => sum + sample.position, 0) / samples.length;
  const numerator = samples.reduce(
    (sum, sample) => sum + (sample.value - meanValue) * (sample.position - meanPosition),
    0,
  );
  const denominator = samples.reduce((sum, sample) => sum + (sample.value - meanValue) ** 2, 0);
  if (denominator === 0) return null;
  const slope = numerator / denominator;
  return (value: number) => meanPosition + (value - meanValue) * slope;
}

function renderedPlotBounds(rendered: ReadonlyMap<string, RenderedPoint>): PlotBounds | null {
  const x = flipperScale(rendered);
  const y = massScale(rendered);
  if (!x || !y) return null;
  return { left: x(175), right: x(235), top: y(6100), bottom: y(3000) };
}

function fisheyeGridPaths(pointer: RenderedPoint, rendered: ReadonlyMap<string, RenderedPoint>) {
  const scale = massScale(rendered);
  if (!scale) return [];
  return [3000, 3200, 3400, 3600, 3800, 4000, 4200, 4400, 4600, 4800, 5000, 5200, 5400, 5600, 5800, 6000]
    .flatMap((tick) => {
      const dy = scale(tick) - pointer.y;
      if (Math.abs(dy) >= LENS_RADIUS) return [];
      const halfChord = Math.sqrt(LENS_RADIUS ** 2 - dy ** 2);
      const commands = Array.from({ length: 25 }, (_, index) => {
        const dx = -halfChord + (halfChord * 2 * index) / 24;
        const distorted = distortOffset(dx, dy);
        return `${index === 0 ? 'M' : 'L'} ${LOUPE_CENTER + distorted.x} ${LOUPE_CENTER + distorted.y}`;
      });
      return [commands.join(' ')];
    });
}

export function FisheyeZoomStage() {
  const [focus, setFocus] = useState<Penguin | null>(null);
  const [lensPosition, setLensPosition] = useState({ x: 450, y: 260 });
  const [bounds, setBounds] = useState<PlotBounds | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const renderedPointsRef = useRef<ReadonlyMap<string, RenderedPoint>>(new Map());
  const points = useMemo(
    () => focus ? loupePoints(lensPosition, renderedPointsRef.current) : [],
    [focus, lensPosition],
  );
  const gridPaths = useMemo(
    () => focus ? fisheyeGridPaths(lensPosition, renderedPointsRef.current) : [],
    [focus, lensPosition],
  );

  const handleInteraction = useCallback((detail: FlintInteractionEventDetail) => {
    if (detail.event.phase !== 'preview') return;
    const penguin = penguinFromInteraction(detail);
    if (penguin) setFocus(penguin);
  }, []);

  // Point positions are read from the rendered marks once the chart is ready.
  const handleRender = useCallback(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const rendered = renderedPointPositions(mount);
    renderedPointsRef.current = rendered;
    setBounds(renderedPlotBounds(rendered));
  }, []);

  const followPointer = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const mount = event.currentTarget;
    const rect = mount.getBoundingClientRect();
    const scaleX = mount.offsetWidth / rect.width;
    const scaleY = mount.offsetHeight / rect.height;
    setLensPosition({
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    });
  }, []);

  const lensClip = bounds ? {
    top: Math.max(0, LOUPE_CENTER + bounds.top - lensPosition.y),
    right: Math.max(0, LOUPE_CENTER + lensPosition.x - bounds.right),
    bottom: Math.max(0, LOUPE_CENTER + lensPosition.y - bounds.bottom),
    left: Math.max(0, LOUPE_CENTER + bounds.left - lensPosition.x),
  } : null;

  return (
    <div className="ic-flint-dimpvis-shell fisheye-shell">
      <div className="ic-flint-dimpvis-panel fisheye-frame">
        <ScaleToFit height={540} adaptiveHeight padding={8}>
          <div className="fisheye-chart-stack">
            <div
              className="ic-flint-dimpvis-mount fisheye-flint-mount"
              ref={mountRef}
              onPointerMove={followPointer}
              onPointerLeave={() => setFocus(null)}
            >
              <FlintChart
                spec={CHART_INPUT}
                interactions={INTERACTIONS}
                renderer="svg"
                ariaLabel="Palmer Penguins scatterplot with semantic fisheye detail"
                chartId="fisheye-semantic-scatter"
                onInteraction={handleInteraction}
                onRender={handleRender}
              />
            </div>
            <div
              className="fisheye-custom-layer"
              data-visible={focus !== null}
              aria-live="polite"
              style={{
                left: lensPosition.x,
                top: lensPosition.y,
                clipPath: lensClip
                  ? `inset(${lensClip.top}px ${lensClip.right}px ${lensClip.bottom}px ${lensClip.left}px)`
                  : undefined,
              }}
            >
              {focus && (
                <svg viewBox={`0 0 ${LOUPE_SIZE} ${LOUPE_SIZE}`} aria-label={`Magnified neighborhood around ${focus.id}`}>
                  <defs>
                    <clipPath id="fisheye-lens-clip">
                      <circle cx={LOUPE_CENTER} cy={LOUPE_CENTER} r={LENS_RADIUS} />
                    </clipPath>
                  </defs>
                  <circle cx={LOUPE_CENTER} cy={LOUPE_CENTER} r={LENS_RADIUS} className="fisheye-lens" />
                  <g clipPath="url(#fisheye-lens-clip)" className="fisheye-lens-grid">
                    {gridPaths.map((path, index) => (
                      <path key={index} d={path} />
                    ))}
                  </g>
                  {points.map((point) => (
                    <g key={point.id} className="fisheye-label">
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={6.5 + 6 * (1 - point.distance / LENS_RADIUS) ** 2}
                        fill={COLORS[point.species]}
                        className="fisheye-point"
                      />
                      <text x={point.x + 7} y={point.y - 7} textAnchor="start">
                        <tspan className="fisheye-label-id">{point.id}</tspan>
                      </text>
                    </g>
                  ))}
                </svg>
              )}
            </div>
          </div>
        </ScaleToFit>
      </div>
    </div>
  );
}
