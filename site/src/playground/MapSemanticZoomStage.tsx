import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInteractiveChart,
  clickTrigger,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import {
  DEFAULT_FOCUS_PROVINCE,
  createSemanticZoomMapInput,
  resolveSemanticZoomLevel,
  semanticZoomLevelLabel,
  buildSemanticZoomDataUpdate,
  type SemanticZoomLevel,
} from './map-semantic-zoom-model';
import './interaction-candidates.css';
import './map-semantic-zoom-stage.css';

const MAP_POINT_CLICK_ID = 'map-semantic-zoom-point';
const MIN_VIEWPORT_ZOOM = 1;
const MAX_VIEWPORT_ZOOM = 3.8;

const MAP_POINT_CLICK: CanvasInteractionDef = {
  id: MAP_POINT_CLICK_ID,
  eventSource: { ...clickTrigger, defaultAssistDistance: 14 },
  affordances: [{ target: 'mark', cursor: 'activate', hover: 'target' }],
  handle() {
    return null;
  },
};

function clampZoom(nextZoom: number) {
  return Math.max(MIN_VIEWPORT_ZOOM, Math.min(MAX_VIEWPORT_ZOOM, nextZoom));
}

function focusProvinceFromDetail(detail: FlintInteractionEventDetail): string | null {
  if (detail.event.phase !== 'commit') return null;
  if (detail.event.target?.visual.role !== 'point') return null;
  const element = detail.event.target.elements[0];
  const row = (element?.records?.[0] ?? element?.value) as Record<string, unknown> | undefined;
  return typeof row?.Province === 'string'
    ? row.Province
    : typeof row?.Place === 'string'
      ? row.Place
      : null;
}

export function MapSemanticZoomStage() {
  const [focusProvince, setFocusProvince] = useState(DEFAULT_FOCUS_PROVINCE);
  const [viewportZoom, setViewportZoom] = useState(1);
  const [semanticLevel, setSemanticLevel] = useState<SemanticZoomLevel>('province');
  const viewportRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const semanticLevelRef = useRef<SemanticZoomLevel>(semanticLevel);
  const focusProvinceRef = useRef(focusProvince);
  semanticLevelRef.current = semanticLevel;
  focusProvinceRef.current = focusProvince;

  const chartInput = useMemo(
    () => createSemanticZoomMapInput('province', DEFAULT_FOCUS_PROVINCE),
    [],
  );

  useEffect(() => {
    const nextLevel = resolveSemanticZoomLevel({
      zoom: viewportZoom,
      currentLevel: semanticLevelRef.current,
      focusProvince: focusProvinceRef.current,
    });
    if (nextLevel !== semanticLevelRef.current) {
      setSemanticLevel(nextLevel);
    }
  }, [viewportZoom]);

  useEffect(() => {
    const nextLevel = resolveSemanticZoomLevel({
      zoom: viewportZoom,
      currentLevel: semanticLevelRef.current,
      focusProvince,
    });
    if (nextLevel !== semanticLevelRef.current) {
      setSemanticLevel(nextLevel);
    }
  }, [focusProvince, viewportZoom]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      const province = focusProvinceFromDetail(detail);
      if (!province) return;
      setFocusProvince(province);
    };

    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, chartInput, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [MAP_POINT_CLICK],
      ariaLabel: 'Map semantic zoom prototype',
      chartId: 'map-semantic-zoom',
    });
    surfaceRef.current = surface;

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [chartInput]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    void surface.ready.then(() =>
      surface.applyUpdate(buildSemanticZoomDataUpdate(semanticLevel, focusProvince)));
  }, [focusProvince, semanticLevel]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const handleWheel = (event: WheelEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || !viewport.contains(target)) return;
      event.preventDefault();
      setViewportZoom((zoom) => clampZoom(zoom + (event.deltaY < 0 ? 0.14 : -0.14)));
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener('wheel', handleWheel);
    };
  }, []);

  const zoomIn = () => setViewportZoom((zoom) => clampZoom(zoom + 0.35));
  const zoomOut = () => setViewportZoom((zoom) => clampZoom(zoom - 0.35));
  const reset = () => {
    setViewportZoom(1);
    setSemanticLevel('province');
  };

  return (
    <div className="ic-flint-dimpvis-shell semantic-zoom-shell">
      <div className="ic-stage-meta">
        <strong>Semantic zoom via `set-data` on an existing Map template</strong>
        <span>
          Wheel or button zoom keeps the current viewport scale; crossing the threshold swaps the
          underlying rows from province centroids to city points for the focused province.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">{semanticZoomLevelLabel(semanticLevel)}</span>
        <span className="ic-pill" data-active="true">Focus: {focusProvince}</span>
        <span className="ic-pill" data-active="true">Viewport zoom: {viewportZoom.toFixed(2)}×</span>
      </div>
      <div className="ic-toolbar">
        <button type="button" className="ic-pill" onClick={zoomOut}>− Zoom out</button>
        <button type="button" className="ic-pill" onClick={zoomIn}>＋ Zoom in</button>
        <button type="button" className="ic-pill" onClick={reset}>Reset</button>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={580} minHeight={430} adaptiveHeight padding={8}>
          <div className="semantic-zoom-viewport" ref={viewportRef}>
            <div className="semantic-zoom-canvas" style={{ transform: `scale(${viewportZoom})` }}>
              <div className="ic-flint-dimpvis-mount semantic-zoom-mount" ref={mountRef} />
            </div>
            <div className="semantic-zoom-overlay">
              <div className="semantic-zoom-overlay-card">
                <strong>Host overlay</strong>
                <span>Breadcrumbs, level badge, and focus hint stay outside Flint’s retained marks.</span>
              </div>
              <div className="semantic-zoom-breadcrumbs" aria-label="Semantic zoom breadcrumbs">
                <button
                  type="button"
                  className="semantic-zoom-crumb"
                  data-active={semanticLevel === 'province'}
                  onClick={() => {
                    setViewportZoom(1);
                    setSemanticLevel('province');
                  }}
                >
                  China overview
                </button>
                <span>/</span>
                <button
                  type="button"
                  className="semantic-zoom-crumb"
                  data-active={semanticLevel === 'city'}
                  onClick={() => {
                    setViewportZoom((zoom) => clampZoom(Math.max(zoom, 2.2)));
                    setSemanticLevel('city');
                  }}
                >
                  {focusProvince} detail
                </button>
              </div>
            </div>
          </div>
        </ScaleToFit>
      </div>
      <div className="semantic-zoom-ownership">
        <div>
          <strong>Flint draws</strong>
          <span>The basemap, semantic points, and the layer swap driven by `set-data`.</span>
        </div>
        <div>
          <strong>Overlay draws</strong>
          <span>Breadcrumbs, level messaging, and focus scaffolding around the chart.</span>
        </div>
      </div>
    </div>
  );
}
