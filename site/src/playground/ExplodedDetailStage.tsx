import { useEffect, useRef } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  inspectTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import { CLIMATE_CITIES, CLIMATE_MONTHS } from './climate-phase-data';
import './exploded-detail-stage.css';

const FOCUS_RADIUS = 48;
const DETAIL_RADIUS = 108;
const DETAIL_OFFSET = 220;
const DETAIL_SCALE = DETAIL_RADIUS / FOCUS_RADIUS;
const DETAIL_MIN_SCALE = 1;
const DETAIL_MAX_SCALE = 3.4;

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
  origin: PlotPoint;
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
  const source = mount.querySelector<SVGSVGElement>('svg.marks');
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
  const rootFrame = source.querySelector<SVGGraphicsElement>('.mark-group.role-frame.root');
  const rootMatrix = rootFrame?.getCTM();
  return {
    content: clone.innerHTML,
    viewBox: source.getAttribute('viewBox') ?? `0 0 ${sourceRect.width} ${sourceRect.height}`,
    origin: { x: rootMatrix?.e ?? 0, y: rootMatrix?.f ?? 0 },
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

function explodedGeometry(scene: VectorScene, focus: PlotPoint, scale = DETAIL_SCALE) {
  const focusRadius = DETAIL_RADIUS / scale;
  const placeRight = focus.x + DETAIL_OFFSET + DETAIL_RADIUS <= scene.plot.right;
  const center = {
    x: focus.x + (placeRight ? DETAIL_OFFSET : -DETAIL_OFFSET),
    y: Math.min(scene.plot.bottom - DETAIL_RADIUS, Math.max(scene.plot.top + DETAIL_RADIUS, focus.y)),
  };
  const points = scene.points.flatMap((point) => {
    const dx = point.x - focus.x;
    const dy = point.y - focus.y;
    return Math.hypot(dx, dy) <= focusRadius
      ? [{ ...point, detailX: center.x + dx * scale, detailY: center.y + dy * scale }]
      : [];
  });
  return { center, focusRadius, points, labels: eccentricLabels(points, center, focus) };
}

function escapeXml(value: string): string {
  return value.split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;')
    .split('"').join('&quot;').split("'").join('&apos;');
}

function freeformExplodedSvg(scene: VectorScene, focus: PlotPoint, scale: number): string {
  const explosion = explodedGeometry(scene, focus, scale);
  const plotWidth = scene.plot.right - scene.plot.left;
  const plotHeight = scene.plot.bottom - scene.plot.top;
  const labels = explosion.labels.map((label) => `
    <g class="exploded-detail-label">
      <path d="M${label.detailX},${label.detailY} L${label.elbowX},${label.labelY} L${label.labelX},${label.labelY}"/>
      <text x="${label.labelX + label.side * 5}" y="${label.labelY + 4}" text-anchor="${label.side === 1 ? 'start' : 'end'}">${escapeXml(label.label)}</text>
    </g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeXml(scene.viewBox)}" width="100%" height="100%">
    <defs>
      <g id="freeform-exploded-scene">${scene.content}</g>
      <clipPath id="freeform-exploded-plot-clip"><rect x="${scene.plot.left}" y="${scene.plot.top}" width="${plotWidth}" height="${plotHeight}"/></clipPath>
      <clipPath id="freeform-exploded-bubble-clip"><circle cx="${explosion.center.x}" cy="${explosion.center.y}" r="${DETAIL_RADIUS}"/></clipPath>
    </defs>
    <g clip-path="url(#freeform-exploded-plot-clip)">
      <circle cx="${focus.x}" cy="${focus.y}" r="${explosion.focusRadius}" class="exploded-detail-focus"/>
      <line x1="${focus.x}" y1="${focus.y}" x2="${explosion.center.x}" y2="${explosion.center.y}" class="exploded-detail-bridge"/>
      <circle cx="${explosion.center.x}" cy="${explosion.center.y}" r="${DETAIL_RADIUS}" class="exploded-detail-background"/>
      <g clip-path="url(#freeform-exploded-bubble-clip)">
        <use href="#freeform-exploded-scene" transform="translate(${explosion.center.x} ${explosion.center.y}) scale(${scale}) translate(${-focus.x} ${-focus.y})"/>
      </g>
    </g>${labels}
  </svg>`;
}

function freeformUpdate(scene: VectorScene, focus: PlotPoint, scale: number): ChartUpdate {
  return {
    id: 'freeform-exploded-detail',
    ops: [{
      op: 'set-freeform-overlay',
      name: 'exploded-detail',
      value: {
        coordinateSpace: 'renderer',
        body: [{ type: 'svg', content: freeformExplodedSvg(scene, focus, scale) }],
      },
    }],
  };
}

export function FreeformExplodedDetailStage() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let scene: VectorScene | null = null;
    let focus: PlotPoint | null = null;
    let detailScale = DETAIL_SCALE;
    const interaction: CanvasInteractionDef = {
      id: 'freeform-exploded-detail',
      eventSource: {
        ...inspectTrigger('xy', undefined, undefined, false),
        zoom: true,
        wheelSensitivity: 0.004,
      },
      affordances: [{ target: 'plot', cursor: 'inspect' }],
      handle(event) {
        if (event.phase === 'cancel') return null;
        if (event.action === 'zoom-viewport') {
          const viewport = event.geometry.plot;
          if (viewport?.kind !== 'viewport' || viewport.factor === undefined || !scene || !focus) return null;
          detailScale = Math.min(
            DETAIL_MAX_SCALE,
            Math.max(DETAIL_MIN_SCALE, detailScale * viewport.factor),
          );
          return freeformUpdate(scene, focus, detailScale);
        }
        if (event.action !== 'inspect-xy') return null;
        const geometry = event.geometry.plot;
        if (geometry?.kind !== 'point') return null;
        scene ??= captureScene(mount);
        if (!scene) return null;
        focus = {
          x: geometry.point.x + scene.origin.x,
          y: geometry.point.y + scene.origin.y,
        };
        return freeformUpdate(scene, focus, detailScale);
      },
    };
    const surface = buildInteractiveChart(mount, CHART_INPUT, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [interaction],
      ariaLabel: 'Seasonal temperature profiles with freeform exploded neighborhood detail',
      chartId: 'freeform-exploded-detail-lines',
    });
    void surface.ready.then(() => {
      scene = captureScene(mount);
    });
    return () => {
      surface.destroy();
    };
  }, []);

  return (
    <div className="ic-flint-dimpvis-shell exploded-detail-shell">
      <div className="ic-stage-meta">
        <strong>The same treatment through set-freeform-overlay</strong>
        <span>
          A standard Flint inspect event produces the identical focus, clone, bubble, bridge, and
          eccentric labels as one renderer-space freeform SVG update. Scroll changes the local
          magnification without zooming the chart.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill">Flint inspect event</span>
        <span className="ic-pill">InteractionDef → set-freeform-overlay</span>
        <span className="ic-pill">Scroll to zoom detail</span>
      </div>
      <div className="ic-flint-dimpvis-panel exploded-detail-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="exploded-detail-stack">
            <div className="ic-flint-dimpvis-mount exploded-detail-mount" ref={mountRef} />
          </div>
        </ScaleToFit>
      </div>
      <div className="exploded-detail-source">NASA POWER · MERRA-2 · 1991–2020 monthly climatology</div>
    </div>
  );
}
