import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  hoverTrigger,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import './fisheye-zoom-stage.css';

type Penguin = {
  id: string;
  species: 'Adelie' | 'Chinstrap' | 'Gentoo';
  flipper: number;
  mass: number;
};

const RAW: Array<[Penguin['species'], number, number]> = [
  ['Adelie', 181, 3750], ['Adelie', 186, 3800], ['Adelie', 195, 3250], ['Adelie', 193, 3450],
  ['Adelie', 190, 3650], ['Adelie', 181, 3625], ['Adelie', 195, 4675], ['Adelie', 182, 3200],
  ['Adelie', 191, 3800], ['Adelie', 198, 4400], ['Adelie', 185, 3700],
  ['Chinstrap', 192, 3500], ['Chinstrap', 196, 3900], ['Chinstrap', 193, 3650],
  ['Chinstrap', 188, 3525], ['Chinstrap', 197, 3950], ['Chinstrap', 198, 3800],
  ['Chinstrap', 178, 3300], ['Chinstrap', 207, 4800], ['Chinstrap', 201, 4050],
  ['Chinstrap', 191, 3550],
  ['Gentoo', 211, 4500], ['Gentoo', 230, 5700], ['Gentoo', 210, 4450], ['Gentoo', 218, 5700],
  ['Gentoo', 215, 5400], ['Gentoo', 219, 5550], ['Gentoo', 209, 4800], ['Gentoo', 215, 5000],
  ['Gentoo', 214, 4650], ['Gentoo', 216, 5550], ['Gentoo', 221, 5950], ['Gentoo', 217, 5250],
];

const COUNTS: Record<Penguin['species'], number> = { Adelie: 0, Chinstrap: 0, Gentoo: 0 };
const PENGUINS: Penguin[] = RAW.map(([species, flipper, mass]) => {
  COUNTS[species] += 1;
  return { id: `${species.slice(0, 3).toUpperCase()}-${String(COUNTS[species]).padStart(2, '0')}`, species, flipper, mass };
});

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

const HOVER_INTERACTION: CanvasInteractionDef = {
  id: HOVER_ID,
  eventSource: { ...hoverTrigger, defaultAssistDistance: 28, targetTolerance: 28 },
  affordances: [{ target: 'mark', hover: 'target' }],
  handle() {
    // Acquisition only: the host renders the result without a Flint ChartUpdate.
    return null;
  },
};

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
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const renderedPointsRef = useRef<ReadonlyMap<string, RenderedPoint>>(new Map());
  const points = useMemo(
    () => focus ? loupePoints(lensPosition, renderedPointsRef.current) : [],
    [focus, lensPosition],
  );
  const gridPaths = useMemo(
    () => focus ? fisheyeGridPaths(lensPosition, renderedPointsRef.current) : [],
    [focus, lensPosition],
  );

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      if (detail.event.phase !== 'preview') return;
      const penguin = penguinFromInteraction(detail);
      if (penguin) setFocus(penguin);
    };
    const followPointer = (event: globalThis.PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const scaleX = mount.offsetWidth / rect.width;
      const scaleY = mount.offsetHeight / rect.height;
      const x = (event.clientX - rect.left) * scaleX;
      const y = (event.clientY - rect.top) * scaleY;
      setLensPosition({ x, y });
    };
    const clearFocus = () => setFocus(null);
    mount.addEventListener('flint-interaction', handleInteraction);
    mount.addEventListener('pointermove', followPointer);
    mount.addEventListener('pointerleave', clearFocus);
    const surface = buildInteractiveChart(mount, CHART_INPUT, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [HOVER_INTERACTION],
      ariaLabel: 'Palmer Penguins scatterplot with semantic fisheye detail',
      chartId: 'fisheye-semantic-scatter',
    });
    surfaceRef.current = surface;
    void surface.ready.then(() => {
      const rendered = renderedPointPositions(mount);
      renderedPointsRef.current = rendered;
      setBounds(renderedPlotBounds(rendered));
    });

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      mount.removeEventListener('pointermove', followPointer);
      mount.removeEventListener('pointerleave', clearFocus);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, []);

  const lensClip = bounds ? {
    top: Math.max(0, LOUPE_CENTER + bounds.top - lensPosition.y),
    right: Math.max(0, LOUPE_CENTER + lensPosition.x - bounds.right),
    bottom: Math.max(0, LOUPE_CENTER + lensPosition.y - bounds.bottom),
    left: Math.max(0, LOUPE_CENTER + bounds.left - lensPosition.x),
  } : null;

  return (
    <div className="ic-flint-dimpvis-shell fisheye-shell">
      <div className="ic-stage-meta">
        <strong>Flint acquisition → custom presentation</strong>
        <span>
          The loupe follows the pointer while Flint resolves the nearest mark and its source record
          within 28 px. React renders that neighborhood without a Flint chart update.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill">Uses Flint semantic records</span>
        <span className="ic-pill">28 px semantic acquisition</span>
        <span className="ic-pill">0 Flint updates</span>
      </div>
      <div className="ic-flint-dimpvis-panel fisheye-frame">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="fisheye-chart-stack">
            <div className="ic-flint-dimpvis-mount fisheye-flint-mount" ref={mountRef} />
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
      <div className="fisheye-source">
        Flint owns the chart and hover semantics; the loupe is host-rendered. · Horst, Hill &amp; Gorman (2020)
      </div>
    </div>
  );
}
