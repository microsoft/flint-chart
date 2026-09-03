import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  hoverTrigger,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import './fisheye-excentric-stage.css';

type Penguin = {
  id: string;
  species: 'Adelie' | 'Chinstrap' | 'Gentoo';
  flipper: number;
  mass: number;
};

type PlotPoint = { x: number; y: number };
type PlotBounds = { left: number; right: number; top: number; bottom: number };
type RenderedPoint = PlotPoint;
type LensPoint = Penguin & {
  baseX: number;
  baseY: number;
  distance: number;
  label: string;
};
type LabelPlacement = LensPoint & {
  side: 1 | -1;
  elbowX: number;
  labelX: number;
  labelY: number;
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
  return {
    id: `${species.slice(0, 3).toUpperCase()}-${String(COUNTS[species]).padStart(2, '0')}`,
    species,
    flipper,
    mass,
  };
});

const CHART_ROWS = PENGUINS.map((penguin) => ({
  Specimen: penguin.id,
  Species: penguin.species,
  Flipper: penguin.flipper,
  Mass: penguin.mass,
}));

const COLORS: Record<Penguin['species'], string> = {
  Adelie: '#18a1cd',
  Chinstrap: '#e2a233',
  Gentoo: '#c04a4a',
};

const CHART_WIDTH = 900;
const CHART_HEIGHT = 520;
const HOVER_ID = 'fisheye-excentric-hover';
const LENS_RADIUS = 76;
const TOP_K = 6;
const LABEL_GAP = 19;
const LABEL_OFFSET = 64;
const ELBOW_OFFSET = 15;

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
    baseSize: { width: CHART_WIDTH, height: CHART_HEIGHT },
    canvasSize: { width: CHART_WIDTH, height: CHART_HEIGHT },
    chartProperties: { includeZero_x: false, includeZero_y: false },
  },
};

const HOVER_INTERACTION: CanvasInteractionDef = {
  id: HOVER_ID,
  eventSource: { ...hoverTrigger, defaultAssistDistance: 30, targetTolerance: 30 },
  affordances: [{ target: 'mark', hover: 'target' }],
  handle() {
    return null;
  },
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function scaleFromSamples(
  samples: Array<{ value: number; position: number }>,
): ((value: number) => number) | null {
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
  const x = scaleFromSamples(PENGUINS.flatMap((penguin) => {
    const position = rendered.get(penguin.id);
    return position ? [{ value: penguin.flipper, position: position.x }] : [];
  }));
  const y = scaleFromSamples(PENGUINS.flatMap((penguin) => {
    const position = rendered.get(penguin.id);
    return position ? [{ value: penguin.mass, position: position.y }] : [];
  }));
  if (!x || !y) return null;
  return {
    left: x(175),
    right: x(235),
    top: y(6100),
    bottom: y(3000),
  };
}

function lensCandidates(pointer: PlotPoint, rendered: ReadonlyMap<string, RenderedPoint>) {
  const points = PENGUINS.flatMap((penguin) => {
    const position = rendered.get(penguin.id);
    if (!position) return [];
    const dx = position.x - pointer.x;
    const dy = position.y - pointer.y;
    const distance = Math.hypot(dx, dy);
    if (distance > LENS_RADIUS) return [];
    return [{
      ...penguin,
      baseX: position.x,
      baseY: position.y,
      distance,
      label: `${penguin.id} · ${penguin.species} · ${penguin.flipper} mm / ${penguin.mass} g`,
    }];
  }).sort((a, b) => a.distance - b.distance);

  return {
    total: points.length,
    points: points.slice(0, TOP_K),
  };
}

function layoutLabels(
  points: readonly LensPoint[],
  pointer: PlotPoint,
  bounds: PlotBounds | null,
): LabelPlacement[] {
  if (points.length === 0) return [];
  const leftRoom = pointer.x - LENS_RADIUS;
  const rightRoom = CHART_WIDTH - pointer.x - LENS_RADIUS;
  const side: 1 | -1 = rightRoom >= leftRoom ? 1 : -1;
  const minY = bounds ? bounds.top + 12 : 18;
  const maxY = bounds ? bounds.bottom - 12 : CHART_HEIGHT - 18;
  const ordered = [...points].sort((a, b) => a.baseY - b.baseY);
  const placements = ordered.map((point, index) => {
    const previous = index === 0 ? minY - LABEL_GAP : ordered[index - 1].baseY;
    return {
      ...point,
      side,
      elbowX: pointer.x + side * (LENS_RADIUS + ELBOW_OFFSET),
      labelX: pointer.x + side * (LENS_RADIUS + LABEL_OFFSET),
      labelY: Math.max(clamp(point.baseY, minY, maxY), previous + LABEL_GAP),
    };
  });

  const overflow = placements.at(-1)
    ? Math.max(0, placements[placements.length - 1].labelY - maxY)
    : 0;
  if (overflow > 0) {
    for (const placement of placements) {
      placement.labelY -= overflow;
    }
  }
  for (let index = 1; index < placements.length; index += 1) {
    const placement = placements[index];
    const previous = placements[index - 1];
    if (placement.labelY - previous.labelY < LABEL_GAP) {
      placement.labelY = previous.labelY + LABEL_GAP;
    }
  }
  return placements;
}

function pointerWithinPlot(pointer: PlotPoint, bounds: PlotBounds | null) {
  return Boolean(
    bounds
      && pointer.x >= bounds.left
      && pointer.x <= bounds.right
      && pointer.y >= bounds.top
      && pointer.y <= bounds.bottom,
  );
}

export function FisheyeExcentricStage() {
  const [lensPosition, setLensPosition] = useState<PlotPoint>({ x: 450, y: 260 });
  const [bounds, setBounds] = useState<PlotBounds | null>(null);
  const [active, setActive] = useState(false);
  const [semanticFocus, setSemanticFocus] = useState<Penguin | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const renderedPointsRef = useRef<ReadonlyMap<string, RenderedPoint>>(new Map());
  const boundsRef = useRef<PlotBounds | null>(null);

  const lensState = useMemo(
    () => active ? lensCandidates(lensPosition, renderedPointsRef.current) : { total: 0, points: [] },
    [active, lensPosition],
  );
  const labels = useMemo(
    () => layoutLabels(lensState.points, lensPosition, bounds),
    [bounds, lensPosition, lensState.points],
  );

  useEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      if (detail.event.phase !== 'preview') return;
      setSemanticFocus(penguinFromInteraction(detail));
    };
    const followPointer = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      const scaleX = mount.offsetWidth / rect.width;
      const scaleY = mount.offsetHeight / rect.height;
      const pointer = {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY,
      };
      setLensPosition(pointer);
      setActive(pointerWithinPlot(pointer, boundsRef.current));
    };
    const clearFocus = () => {
      setActive(false);
      setSemanticFocus(null);
    };

    mount.addEventListener('flint-interaction', handleInteraction);
    mount.addEventListener('pointermove', followPointer);
    mount.addEventListener('pointerleave', clearFocus);
    const surface = buildInteractiveChart(mount, CHART_INPUT, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [HOVER_INTERACTION],
      ariaLabel: 'Palmer Penguins scatterplot with host-rendered lens and excentric labels',
      chartId: 'fisheye-excentric-scatter',
    });
    void surface.ready.then(() => {
      const rendered = renderedPointPositions(mount);
      renderedPointsRef.current = rendered;
      const nextBounds = renderedPlotBounds(rendered);
      boundsRef.current = nextBounds;
      setBounds(nextBounds);
    });

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      mount.removeEventListener('pointermove', followPointer);
      mount.removeEventListener('pointerleave', clearFocus);
      surface.destroy();
    };
  }, []);

  const hiddenCount = Math.max(0, lensState.total - labels.length);

  return (
    <div className="ic-flint-dimpvis-shell fisheye-excentric-shell">
      <div className="ic-stage-meta">
        <strong>Flint base scatter + host-rendered excentric labels</strong>
        <span>
          Flint draws axes and points, and resolves the nearest semantic mark on hover.
          The overlay renders a circular lens as the focus region, then routes leader lines and
          top-{TOP_K} excentric labels from the original points without any fisheye distortion.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill">Flint: scatter + semantic hover</span>
        <span className="ic-pill">Overlay: lens + labels + leaders</span>
        <span className="ic-pill">Top-{TOP_K} nearest points</span>
        <span className="ic-pill">0 Flint updates</span>
      </div>
      <div className="ic-flint-dimpvis-panel fisheye-excentric-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="fisheye-excentric-stack">
            <div className="ic-flint-dimpvis-mount fisheye-excentric-mount" ref={mountRef} />
            <svg
              className="fisheye-excentric-overlay"
              data-visible={active}
              viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
              aria-hidden="true"
            >
              <defs>
                <clipPath id="fisheye-excentric-lens-clip">
                  <circle cx={lensPosition.x} cy={lensPosition.y} r={LENS_RADIUS} />
                </clipPath>
              </defs>
              <circle
                cx={lensPosition.x}
                cy={lensPosition.y}
                r={LENS_RADIUS}
                className="fisheye-excentric-lens-backdrop"
              />
              <circle
                cx={lensPosition.x}
                cy={lensPosition.y}
                r={LENS_RADIUS}
                className="fisheye-excentric-lens-frame"
              />
              <g clipPath="url(#fisheye-excentric-lens-clip)">
                <circle
                  cx={lensPosition.x}
                  cy={lensPosition.y}
                  r={LENS_RADIUS - 10}
                  className="fisheye-excentric-lens-core"
                />
                {labels.map((point) => (
                  <circle
                    key={point.id}
                    cx={point.baseX}
                    cy={point.baseY}
                    r={5.2 + 4.8 * (1 - point.distance / LENS_RADIUS) ** 2}
                    fill={COLORS[point.species]}
                    className="fisheye-excentric-point"
                    data-primary={semanticFocus?.id === point.id}
                  />
                ))}
              </g>
              {labels.map((label) => (
                <g key={`${label.id}-label`} className="fisheye-excentric-label">
                  <path
                    d={`M${label.baseX},${label.baseY} L${label.elbowX},${label.labelY} L${label.labelX},${label.labelY}`}
                    data-primary={semanticFocus?.id === label.id}
                  />
                  <text
                    x={label.labelX + label.side * 6}
                    y={label.labelY + 4}
                    textAnchor={label.side === 1 ? 'start' : 'end'}
                    data-primary={semanticFocus?.id === label.id}
                  >
                    {label.label}
                  </text>
                </g>
              ))}
              {hiddenCount > 0 && labels.at(-1) && (
                <text
                  className="fisheye-excentric-overflow"
                  x={labels[labels.length - 1].labelX + labels[labels.length - 1].side * 6}
                  y={labels[labels.length - 1].labelY + 22}
                  textAnchor={labels[labels.length - 1].side === 1 ? 'start' : 'end'}
                >
                  +{hiddenCount} more inside lens
                </text>
              )}
            </svg>
          </div>
        </ScaleToFit>
      </div>
      <div className="fisheye-excentric-source">
        Flint owns base rendering and semantic acquisition; the host overlay owns the lens framing
        and excentric label layout.
      </div>
    </div>
  );
}
