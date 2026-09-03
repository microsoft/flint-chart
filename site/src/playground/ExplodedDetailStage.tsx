import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { buildInteractiveChart } from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import { CLIMATE_CITIES, CLIMATE_MONTHS } from './climate-phase-data';
import './exploded-detail-stage.css';

const FOCUS_RADIUS = 48;
const DETAIL_RADIUS = 108;
const DETAIL_OFFSET = 220;
const DETAIL_SCALE = 1.7;

const ROWS = CLIMATE_CITIES.flatMap((city) => CLIMATE_MONTHS.map((month, monthIndex) => ({
  City: city.name,
  Month: month,
  MonthIndex: monthIndex + 1,
  Temperature: city.temperature[monthIndex],
})));

const CHART_INPUT: ChartAssemblyInput = {
  data: { values: ROWS },
  semantic_types: {
    City: 'City',
    Month: 'Category',
    MonthIndex: { semanticType: 'Quantity', intrinsicDomain: [1, 12] },
    Temperature: { semanticType: 'Quantity', intrinsicDomain: [-5, 30] },
  },
  field_display_names: {
    MonthIndex: 'Month',
    Temperature: 'Temperature (°C)',
  },
  theme_spec: { extends: 'datawrapper' },
  options: { addTooltips: false },
  chart_spec: {
    chartType: 'Line Chart',
    title: 'Seasonal temperature profiles',
    encodings: { x: 'MonthIndex', y: 'Temperature', color: 'City' },
    baseSize: { width: 900, height: 520 },
    canvasSize: { width: 900, height: 520 },
    chartProperties: { includeZero_y: false, showPoints: true },
  },
};

type PlotPoint = { x: number; y: number };
type ScenePoint = PlotPoint & {
  city: string;
  month: number;
  temperature: number;
  color: string;
  label: string;
};
type VectorScene = {
  content: string;
  viewBox: string;
  x: number;
  y: number;
  width: number;
  height: number;
  plot: { left: number; right: number; top: number; bottom: number };
  points: readonly ScenePoint[];
};

function prefixIds(svg: SVGSVGElement, prefix: string) {
  const ids = new Map<string, string>();
  for (const element of svg.querySelectorAll<SVGElement>('[id]')) {
    const next = `${prefix}${element.id}`;
    ids.set(element.id, next);
    element.id = next;
  }
  for (const element of svg.querySelectorAll<SVGElement>('*')) {
    for (const attribute of Array.from(element.attributes)) {
      let value = attribute.value;
      for (const [id, next] of ids) {
        value = value.split(`url(#${id})`).join(`url(#${next})`).split(`#${id}`).join(`#${next}`);
      }
      if (value !== attribute.value) element.setAttribute(attribute.name, value);
    }
  }
}

function dataFromAria(description: string) {
  const city = description.match(/City:\s*([^;]+)/)?.[1];
  const monthIndex = Number(description.match(/Month:\s*([^;]+)/)?.[1]);
  const month = Number.isInteger(monthIndex) ? CLIMATE_MONTHS[monthIndex - 1] : undefined;
  const temperatureText = description.match(/Temperature[^:]*:\s*([^;]+)/)?.[1]?.replace('−', '-');
  const temperature = Number(temperatureText);
  return city && month && Number.isFinite(temperature)
    ? { city, month: monthIndex, temperature, label: `${city} · ${month} ${temperatureText}°C` }
    : null;
}

function toLocal(source: SVGSVGElement, clientX: number, clientY: number): PlotPoint | null {
  const matrix = source.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  return { x: point.x, y: point.y };
}

function captureScene(mount: HTMLDivElement): VectorScene | null {
  const source = mount.querySelector<SVGSVGElement>('figure svg') ?? mount.querySelector<SVGSVGElement>('svg');
  if (!source) return null;
  const sourceRect = source.getBoundingClientRect();
  const mountRect = mount.getBoundingClientRect();
  const scaleX = mount.offsetWidth / mountRect.width;
  const scaleY = mount.offsetHeight / mountRect.height;
  const points = Array.from(source.querySelectorAll<SVGGraphicsElement>('[aria-label*="Month:"]')).flatMap((element) => {
    const data = dataFromAria(element.getAttribute('aria-label') ?? '');
    const rect = element.getBoundingClientRect();
    const point = data && rect.width <= 30 && rect.height <= 30
      ? toLocal(source, rect.left + rect.width / 2, rect.top + rect.height / 2)
      : null;
    const color = element.getAttribute('fill') ?? element.getAttribute('stroke') ?? '#46535c';
    return point && data ? [{ ...point, ...data, color }] : [];
  });
  if (points.length === 0) return null;
  const clone = source.cloneNode(true) as SVGSVGElement;
  prefixIds(clone, 'exploded-detail-clone-');
  clone.querySelectorAll('[role], [aria-label], [aria-roledescription]').forEach((element) => {
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
    element.removeAttribute('aria-roledescription');
  });
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xStep = (Math.max(...xs) - Math.min(...xs)) / 11;
  const yPad = 28;
  return {
    content: clone.innerHTML,
    viewBox: source.getAttribute('viewBox') ?? `0 0 ${sourceRect.width} ${sourceRect.height}`,
    x: (sourceRect.left - mountRect.left) * scaleX,
    y: (sourceRect.top - mountRect.top) * scaleY,
    width: sourceRect.width * scaleX,
    height: sourceRect.height * scaleY,
    plot: {
      left: Math.min(...xs) - xStep / 2,
      right: Math.max(...xs) + xStep / 2,
      top: Math.min(...ys) - yPad,
      bottom: Math.max(...ys) + yPad,
    },
    points,
  };
}

function eccentricLabels(
  points: readonly (ScenePoint & { detailX: number; detailY: number })[],
  center: PlotPoint,
  focus: PlotPoint,
) {
  const side = center.x > focus.x ? 1 : -1;
  return [...points].sort((a, b) => a.detailY - b.detailY).map((point, index) => {
    const labelY = center.y + (index - (points.length - 1) / 2) * 20;
    const elbowX = center.x + side * (DETAIL_RADIUS - 8);
    const labelX = center.x + side * (DETAIL_RADIUS + 16);
    return { ...point, side, labelX, labelY, elbowX };
  });
}

export function ExplodedDetailStage() {
  const [active, setActive] = useState(false);
  const [focus, setFocus] = useState<PlotPoint>({ x: 450, y: 260 });
  const [scene, setScene] = useState<VectorScene | null>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const sourceRef = useRef<SVGSVGElement | null>(null);
  const sceneRef = useRef<VectorScene | null>(null);

  const explosion = useMemo(() => {
    if (!scene) return null;
    const placeRight = focus.x + DETAIL_OFFSET + DETAIL_RADIUS <= scene.plot.right;
    const center = {
      x: focus.x + (placeRight ? DETAIL_OFFSET : -DETAIL_OFFSET),
      y: Math.min(scene.plot.bottom - DETAIL_RADIUS, Math.max(scene.plot.top + DETAIL_RADIUS, focus.y)),
    };
    const points = scene.points.flatMap((point) => {
      const dx = point.x - focus.x;
      const dy = point.y - focus.y;
      return Math.hypot(dx, dy) <= FOCUS_RADIUS
        ? [{ ...point, detailX: center.x + dx * DETAIL_SCALE, detailY: center.y + dy * DETAIL_SCALE }]
        : [];
    });
    return { center, points, labels: eccentricLabels(points, center, focus) };
  }, [focus, scene]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const followPointer = (event: PointerEvent) => {
      const source = sourceRef.current;
      if (!source) return;
      const point = toLocal(source, event.clientX, event.clientY);
      if (!point) return;
      setFocus(point);
      const plot = sceneRef.current?.plot;
      setActive(Boolean(plot && point.x >= plot.left && point.x <= plot.right
        && point.y >= plot.top && point.y <= plot.bottom));
    };
    const clear = () => setActive(false);
    mount.addEventListener('pointermove', followPointer);
    mount.addEventListener('pointerleave', clear);
    const surface = buildInteractiveChart(mount, CHART_INPUT, {
      backend: 'vegalite',
      renderer: 'svg',
      ariaLabel: 'Seasonal temperature profiles with exploded neighborhood detail',
      chartId: 'exploded-detail-lines',
    });
    void surface.ready.then(() => {
      sourceRef.current = mount.querySelector<SVGSVGElement>('figure svg') ?? mount.querySelector<SVGSVGElement>('svg');
      const captured = captureScene(mount);
      sceneRef.current = captured;
      setScene(captured);
    });
    return () => {
      mount.removeEventListener('pointermove', followPointer);
      mount.removeEventListener('pointerleave', clear);
      surface.destroy();
    };
  }, []);

  return (
    <div className="ic-flint-dimpvis-shell exploded-detail-shell">
      <div className="ic-stage-meta">
        <strong>Exploded neighborhood with eccentric labels</strong>
        <span>
          A small focus circle gathers nearby marks. A clipped SVG clone expands that exact local
          scene in a separate bubble while labels route around the outside.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill">No semantic event data</span>
        <span className="ic-pill">Cloned + clipped SVG</span>
        <span className="ic-pill">Eccentric labels</span>
        <span className="ic-pill">0 Flint updates</span>
      </div>
      <div className="ic-flint-dimpvis-panel exploded-detail-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="exploded-detail-stack">
            <div className="ic-flint-dimpvis-mount exploded-detail-mount" ref={mountRef} />
            {scene && (
              <svg
                className="exploded-detail-overlay"
                data-visible={active}
                viewBox={scene.viewBox}
                style={{
                  left: scene.x,
                  top: scene.y,
                  width: scene.width,
                  height: scene.height,
                }}
                aria-hidden="true"
              >
                <defs>
                  <g id="exploded-detail-scene" dangerouslySetInnerHTML={{ __html: scene.content }} />
                  <clipPath id="exploded-detail-plot-clip">
                    <rect
                      x={scene.plot.left}
                      y={scene.plot.top}
                      width={scene.plot.right - scene.plot.left}
                      height={scene.plot.bottom - scene.plot.top}
                    />
                  </clipPath>
                  {explosion && (
                    <clipPath id="exploded-detail-bubble-clip">
                      <circle cx={explosion.center.x} cy={explosion.center.y} r={DETAIL_RADIUS} />
                    </clipPath>
                  )}
                </defs>
                <g clipPath="url(#exploded-detail-plot-clip)">
                  <circle cx={focus.x} cy={focus.y} r={FOCUS_RADIUS} className="exploded-detail-focus" />
                  {explosion && (
                    <>
                      <line
                        x1={focus.x}
                        y1={focus.y}
                        x2={explosion.center.x}
                        y2={explosion.center.y}
                        className="exploded-detail-bridge"
                      />
                      <circle
                        cx={explosion.center.x}
                        cy={explosion.center.y}
                        r={DETAIL_RADIUS}
                        className="exploded-detail-background"
                      />
                      <g clipPath="url(#exploded-detail-bubble-clip)">
                        <use
                          href="#exploded-detail-scene"
                          transform={`translate(${explosion.center.x} ${explosion.center.y}) scale(${DETAIL_SCALE}) translate(${-focus.x} ${-focus.y})`}
                        />
                      </g>
                    </>
                  )}
                </g>
                {explosion?.labels.map((label) => (
                  <g key={label.label} className="exploded-detail-label">
                    <path d={`M${label.detailX},${label.detailY} L${label.elbowX},${label.labelY} L${label.labelX},${label.labelY}`} />
                    <text
                      x={label.labelX + label.side * 5}
                      y={label.labelY + 4}
                      textAnchor={label.side === 1 ? 'start' : 'end'}
                    >
                      {label.label}
                    </text>
                  </g>
                ))}
              </svg>
            )}
          </div>
        </ScaleToFit>
      </div>
      <div className="exploded-detail-source">NASA POWER · MERRA-2 · 1991–2020 monthly climatology</div>
    </div>
  );
}
