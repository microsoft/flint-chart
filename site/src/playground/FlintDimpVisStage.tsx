import { useEffect, useMemo, useRef, useState } from 'react';
import type { StyleSpec } from 'flint-chart/interactive';
import {
  buildInteractiveChart,
  clickTrigger,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';

interface Frame {
  year: number;
  fertility: number;
  life: number;
  population: number;
}

interface CountrySeries {
  name: string;
  region: string;
  frames: Frame[];
}

const YEARS = [1955, 1960, 1965, 1970, 1975, 1980, 1985, 1990, 1995, 2000, 2005] as const;

const SERIES: CountrySeries[] = [
  {
    name: 'Afghanistan',
    region: 'South Asia',
    frames: [
      { year: 1955, fertility: 7.7, life: 30.332, population: 8891209 },
      { year: 1960, fertility: 7.7, life: 31.997, population: 9829450 },
      { year: 1965, fertility: 7.7, life: 34.02, population: 10997885 },
      { year: 1970, fertility: 7.7, life: 36.088, population: 12430623 },
      { year: 1975, fertility: 7.7, life: 38.438, population: 14132019 },
      { year: 1980, fertility: 7.8, life: 39.854, population: 15112149 },
      { year: 1985, fertility: 7.9, life: 40.822, population: 13796928 },
      { year: 1990, fertility: 8, life: 41.674, population: 14669339 },
      { year: 1995, fertility: 8, life: 41.763, population: 20881480 },
      { year: 2000, fertility: 7.4792, life: 42.129, population: 23898198 },
      { year: 2005, fertility: 7.0685, life: 43.828, population: 29928987 },
    ],
  },
  {
    name: 'Brazil',
    region: 'America',
    frames: [
      { year: 1955, fertility: 6.1501, life: 53.285, population: 61773546 },
      { year: 1960, fertility: 6.1501, life: 55.665, population: 71694810 },
      { year: 1965, fertility: 5.38, life: 57.632, population: 83092908 },
      { year: 1970, fertility: 4.7175, life: 59.504, population: 95684297 },
      { year: 1975, fertility: 4.305, life: 61.489, population: 108823732 },
      { year: 1980, fertility: 3.8, life: 63.336, population: 122958132 },
      { year: 1985, fertility: 3.1, life: 65.205, population: 137302933 },
      { year: 1990, fertility: 2.6, life: 67.057, population: 151083809 },
      { year: 1995, fertility: 2.45, life: 69.388, population: 163542501 },
      { year: 2000, fertility: 2.345, life: 71.006, population: 175552771 },
      { year: 2005, fertility: 2.245, life: 72.39, population: 186112794 },
    ],
  },
  {
    name: 'China',
    region: 'East Asia & Pacific',
    frames: [
      { year: 1955, fertility: 5.59, life: 50.54896, population: 608655000 },
      { year: 1960, fertility: 5.72, life: 44.50136, population: 667070000 },
      { year: 1965, fertility: 6.06, life: 58.38112, population: 715185000 },
      { year: 1970, fertility: 4.86, life: 63.11888, population: 818315000 },
      { year: 1975, fertility: 3.32, life: 63.96736, population: 916395000 },
      { year: 1980, fertility: 2.55, life: 65.525, population: 981235000 },
      { year: 1985, fertility: 2.46, life: 67.274, population: 1051040000 },
      { year: 1990, fertility: 1.92, life: 68.69, population: 1135185000 },
      { year: 1995, fertility: 1.781, life: 70.426, population: 1204855000 },
      { year: 2000, fertility: 1.7, life: 72.028, population: 1262645000 },
      { year: 2005, fertility: 1.725, life: 72.961, population: 1303182268 },
    ],
  },
  {
    name: 'France',
    region: 'Europe & Central Asia',
    frames: [
      { year: 1955, fertility: 2.712, life: 68.93, population: 43427669 },
      { year: 1960, fertility: 2.85, life: 70.51, population: 45670000 },
      { year: 1965, fertility: 2.607, life: 71.55, population: 48763000 },
      { year: 1970, fertility: 2.31, life: 72.38, population: 50787000 },
      { year: 1975, fertility: 1.862, life: 73.83, population: 52758427 },
      { year: 1980, fertility: 1.866, life: 74.89, population: 53869743 },
      { year: 1985, fertility: 1.805, life: 76.34, population: 55171224 },
      { year: 1990, fertility: 1.713, life: 77.46, population: 56735161 },
      { year: 1995, fertility: 1.7624, life: 78.64, population: 58149727 },
      { year: 2000, fertility: 1.8833, life: 79.59, population: 59381628 },
      { year: 2005, fertility: 1.8916, life: 80.657, population: 60656178 },
    ],
  },
  {
    name: 'India',
    region: 'South Asia',
    frames: [
      { year: 1955, fertility: 5.8961, life: 40.249, population: 393000000 },
      { year: 1960, fertility: 5.8216, life: 43.605, population: 434000000 },
      { year: 1965, fertility: 5.6058, life: 47.193, population: 485000000 },
      { year: 1970, fertility: 5.264, life: 50.651, population: 541000000 },
      { year: 1975, fertility: 4.8888, life: 54.208, population: 607000000 },
      { year: 1980, fertility: 4.4975, life: 56.596, population: 679000000 },
      { year: 1985, fertility: 4.15, life: 58.553, population: 755000000 },
      { year: 1990, fertility: 3.8648, life: 60.223, population: 839000000 },
      { year: 1995, fertility: 3.4551, life: 61.765, population: 927000000 },
      { year: 2000, fertility: 3.1132, life: 62.879, population: 1007702000 },
      { year: 2005, fertility: 2.8073, life: 64.698, population: 1080264388 },
    ],
  },
  {
    name: 'Japan',
    region: 'East Asia & Pacific',
    frames: [
      { year: 1955, fertility: 2.08, life: 65.5, population: 89815060 },
      { year: 1960, fertility: 2.02, life: 68.73, population: 94091638 },
      { year: 1965, fertility: 2, life: 71.43, population: 98882534 },
      { year: 1970, fertility: 2.07, life: 73.42, population: 104344973 },
      { year: 1975, fertility: 1.81, life: 75.38, population: 111573116 },
      { year: 1980, fertility: 1.76, life: 77.11, population: 116807309 },
      { year: 1985, fertility: 1.66, life: 78.67, population: 120754335 },
      { year: 1990, fertility: 1.49, life: 79.36, population: 123537399 },
      { year: 1995, fertility: 1.39, life: 80.69, population: 125341354 },
      { year: 2000, fertility: 1.291, life: 82, population: 126699784 },
      { year: 2005, fertility: 1.27, life: 82.603, population: 127417244 },
    ],
  },
  {
    name: 'Nigeria',
    region: 'Sub-Saharan Africa',
    frames: [
      { year: 1955, fertility: 6.9, life: 37.802, population: 35458978 },
      { year: 1960, fertility: 6.9, life: 39.36, population: 39914593 },
      { year: 1965, fertility: 6.9, life: 41.04, population: 45020052 },
      { year: 1970, fertility: 6.9, life: 42.821, population: 51027516 },
      { year: 1975, fertility: 6.9, life: 44.514, population: 58522112 },
      { year: 1980, fertility: 6.9, life: 45.826, population: 68550274 },
      { year: 1985, fertility: 6.834, life: 46.886, population: 77573154 },
      { year: 1990, fertility: 6.635, life: 47.472, population: 88510354 },
      { year: 1995, fertility: 6.246, life: 47.464, population: 100960105 },
      { year: 2000, fertility: 5.845, life: 46.608, population: 114306700 },
      { year: 2005, fertility: 5.322, life: 46.859, population: 128765768 },
    ],
  },
  {
    name: 'United States',
    region: 'America',
    frames: [
      { year: 1955, fertility: 3.706, life: 69.49, population: 165931000 },
      { year: 1960, fertility: 3.314, life: 70.21, population: 180671000 },
      { year: 1965, fertility: 2.545, life: 70.76, population: 194303000 },
      { year: 1970, fertility: 2.016, life: 71.34, population: 205052000 },
      { year: 1975, fertility: 1.788, life: 73.38, population: 215973000 },
      { year: 1980, fertility: 1.825, life: 74.65, population: 227726463 },
      { year: 1985, fertility: 1.924, life: 75.02, population: 238466283 },
      { year: 1990, fertility: 2.025, life: 76.09, population: 250131894 },
      { year: 1995, fertility: 1.994, life: 76.81, population: 266557091 },
      { year: 2000, fertility: 2.038, life: 77.31, population: 282338631 },
      { year: 2005, fertility: 2.054, life: 78.242, population: 295734134 },
    ],
  },
];

const SEMANTIC_TYPES = {
  Country: 'Country',
  Region: 'Category',
  Year: 'Year',
  YearLabel: 'Category',
  Fertility: 'Quantity',
  Life: 'Quantity',
  Population: 'Quantity',
  Value: 'Quantity',
};

const ALL_ROWS = SERIES.flatMap((series) => series.frames.map((frame) => ({
  Country: series.name,
  Region: series.region,
  Year: frame.year,
  YearLabel: String(frame.year),
  Fertility: frame.fertility,
  Life: frame.life,
  Population: frame.population,
})));

const GLOBAL_DOMAIN = {
  minFertility: Math.min(...ALL_ROWS.map((row) => row.Fertility)),
  maxFertility: Math.max(...ALL_ROWS.map((row) => row.Fertility)),
  minLife: Math.min(...ALL_ROWS.map((row) => row.Life)),
  maxLife: Math.max(...ALL_ROWS.map((row) => row.Life)),
};

const MAIN_INTERACTION_ID = 'flint-dimpvis-country';
const MAIN_MARK_INTERACTION_ID = 'flint-dimpvis-country-mark';
const MAIN_LEGEND_INTERACTION_ID = 'flint-dimpvis-country-legend';
const COUNTRY_STYLE_ID = 'flint-dimpvis-country-style';
const YEAR_STYLE_ID = 'flint-dimpvis-year-style';
const ANCHOR_STYLE_ID = 'flint-dimpvis-domain-anchors';

const MAIN_MARK_CLICK_INTERACTION: CanvasInteractionDef = {
  id: MAIN_MARK_INTERACTION_ID,
  eventSource: clickTrigger,
  affordances: [
    { target: 'mark', cursor: 'activate', hover: 'target' },
  ],
  handle() {
    return null;
  },
};

const MAIN_LEGEND_CLICK_INTERACTION: CanvasInteractionDef = {
  id: MAIN_LEGEND_INTERACTION_ID,
  eventSource: clickTrigger,
  claimsLegendActivation: true,
  affordances: [
    { target: 'legend-item', cursor: 'activate', hover: 'cohort' },
  ],
  handle() {
    return null;
  },
};

function chartInput(
  data: Record<string, unknown>[],
  chartType: string,
  title: string,
  encodings: Record<string, unknown>,
  chartProperties?: Record<string, unknown>,
  baseSize?: { width: number; height: number },
) {
  return {
    data: { values: data },
    semantic_types: SEMANTIC_TYPES,
    chart_spec: {
      chartType,
      title,
      encodings,
      baseSize: baseSize ?? { width: 396, height: 220 },
      ...(chartProperties ? { chartProperties } : {}),
    },
  };
}

function focusedRows(selectedCountry: string, activeYear: number) {
  return [
    ...ALL_ROWS.filter((row) => row.Country === selectedCountry || row.Year === activeYear),
    {
      Country: '__domain-min__',
      Region: 'Anchor',
      Year: YEARS[0],
      YearLabel: String(YEARS[0]),
      Fertility: GLOBAL_DOMAIN.minFertility,
      Life: GLOBAL_DOMAIN.minLife,
      Population: 0,
    },
    {
      Country: '__domain-max__',
      Region: 'Anchor',
      Year: YEARS[YEARS.length - 1],
      YearLabel: String(YEARS[YEARS.length - 1]),
      Fertility: GLOBAL_DOMAIN.maxFertility,
      Life: GLOBAL_DOMAIN.maxLife,
      Population: 0,
    },
  ];
}

function interactionTarget(detail: FlintInteractionEventDetail): {
  country: string | null;
  year?: number;
} {
  const element = detail.event.target?.elements[0];
  if (!element) return { country: null };
  const role = detail.event.target?.visual.role;
  const pointValue = (element.records?.[0] ?? element.value) as Record<string, unknown> | undefined;
  const coerceYear = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
  };
  if (role === 'symbol') {
    const pointCountry = typeof pointValue?.Country === 'string' ? pointValue.Country : null;
    const pointYear = coerceYear(pointValue?.Year);
    return {
      country: pointCountry,
      year: pointYear,
    };
  }
  const semanticRows = [
    ...(element.records as Record<string, unknown>[] | undefined ?? []),
    ...(element.value ? [element.value as Record<string, unknown>] : []),
  ];
  const countryValues = [...new Set(semanticRows
    .map((row) => row?.Country)
    .filter((value): value is string => typeof value === 'string'))];
  const yearValues = [...new Set(semanticRows
    .map((row) => coerceYear(row?.Year))
    .filter((value): value is number => value !== undefined))];
  return {
    country: countryValues.length === 1 ? countryValues[0] : null,
    year: yearValues.length === 1 ? yearValues[0] : undefined,
  };
}

function legendCountry(detail: FlintInteractionEventDetail): string | null {
  if (detail.event.target?.visual.role !== 'legend-item') return null;
  const element = detail.event.target.elements[0];
  const value = element?.value as {
    field?: unknown;
    domain?: { kind?: unknown; value?: unknown };
  } | undefined;
  if (value?.field === 'Country' && value.domain?.kind === 'value' && typeof value.domain.value === 'string') {
    return value.domain.value;
  }
  return null;
}

async function applySelectorStyle(
  surface: InteractiveChartSurface | null,
  id: string,
  key: Record<string, unknown>,
  value: StyleSpec,
) {
  if (!surface) return;
  await surface.applyUpdate({
    id,
    ops: [{
      op: 'set-style',
      targets: [{ select: { key } }],
      value,
    }],
  });
}

async function hideDomainAnchors(surface: InteractiveChartSurface | null) {
  if (!surface) return;
  await surface.applyUpdate({
    id: ANCHOR_STYLE_ID,
    ops: [{
      op: 'set-style',
      targets: [
        { select: { key: { Country: '__domain-min__' } } },
        { select: { key: { Country: '__domain-max__' } } },
      ],
      value: { visible: false },
    }],
  });
}

export function FlintDimpVisStage() {
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [activeYear, setActiveYear] = useState(1980);
  const [debugInfo, setDebugInfo] = useState<{
    action: string;
    role: string;
    elementCount: number;
    recordCount: number;
    country: string | null;
    year?: number;
    selectedCountry: string;
    activeYear: number;
    valueKeys: string[];
    recordKeys: string[];
    valuePreview: string;
    recordPreview: string;
  } | null>(null);

  const mainMountRef = useRef<HTMLDivElement>(null);

  const mainSurfaceRef = useRef<InteractiveChartSurface | null>(null);

  const mainInput = useMemo(() => chartInput(
    focusedRows(selectedCountry, activeYear),
    'Connected Scatter Plot',
    `Global health trajectories — active frame ${activeYear}`,
    {
      x: 'Fertility',
      y: 'Life',
      order: 'Year',
      color: 'Country',
      detail: 'Country',
    },
    { includeZero_x: false, includeZero_y: false },
    { width: 396, height: 260 },
  ), [activeYear, selectedCountry]);

  useEffect(() => {
    const mount = mainMountRef.current;
    if (!mount) return undefined;

    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      if (detail.event.phase !== 'commit') return;
      const firstElement = detail.event.target?.elements[0];
      const firstValue = firstElement?.value as Record<string, unknown> | undefined;
      const firstRecord = firstElement?.records?.[0] as Record<string, unknown> | undefined;
      const { country, year } = interactionTarget(detail);
      const baseDebug = {
        role: detail.event.target?.visual.role ?? 'none',
        elementCount: detail.event.target?.elements.length ?? 0,
        recordCount: firstElement?.records?.length ?? 0,
        country,
        year,
        valueKeys: firstValue ? Object.keys(firstValue) : [],
        recordKeys: firstRecord ? Object.keys(firstRecord) : [],
        valuePreview: firstValue ? JSON.stringify(firstValue) : 'null',
        recordPreview: firstRecord ? JSON.stringify(firstRecord) : 'null',
      };
      const legendSelection = legendCountry(detail);
      if (legendSelection) {
        setDebugInfo({
          action: 'legend-select',
          ...baseDebug,
          country: legendSelection,
          selectedCountry: legendSelection,
          activeYear,
        });
        setSelectedCountry(legendSelection);
        return;
      }
      if (detail.event.target?.visual.role !== 'symbol') {
        setDebugInfo({
          action: 'ignored-non-symbol',
          ...baseDebug,
          selectedCountry,
          activeYear,
        });
        return;
      }
      if (!country || country !== selectedCountry || year === undefined) {
        setDebugInfo({
          action: 'ignored-symbol-mismatch',
          ...baseDebug,
          selectedCountry,
          activeYear,
        });
        return;
      }
      setDebugInfo({
        action: 'symbol-year-select',
        ...baseDebug,
        selectedCountry,
        activeYear: year,
      });
      setActiveYear(year);
    };

    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, mainInput as any, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [MAIN_MARK_CLICK_INTERACTION, MAIN_LEGEND_CLICK_INTERACTION],
      ariaLabel: `Discrete Flint DimpVis main chart for ${activeYear}`,
      chartId: `flint-dimpvis-main-${activeYear}`,
    });
    mainSurfaceRef.current = surface;

    void surface.ready.then(async () => {
      await hideDomainAnchors(surface);
      await applySelectorStyle(surface, COUNTRY_STYLE_ID, { Country: selectedCountry }, {
        state: 'emphasized',
        mutedOpacity: 0.22,
      });
      await applySelectorStyle(surface, YEAR_STYLE_ID, { Year: activeYear }, {
        opacity: 1,
        stroke: '#7c2d12',
        strokeWidth: 2,
      });
    });

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      mainSurfaceRef.current = null;
      surface.destroy();
    };
  }, [mainInput, activeYear, selectedCountry]);

  return (
    <div className="ic-flint-dimpvis-shell">
      <div className="ic-stage-meta">
        <strong>Discrete Flint approximation</strong>
        <span>
          Use the country legend to switch the active trajectory. Once a trajectory is visible, clicking one
          of its points updates the shared current year for every other country node.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">Country: {selectedCountry}</span>
        <span className="ic-pill" data-active="true">Year: {activeYear}</span>
      </div>
      <div className="ic-stage-meta">
        <strong>Debug</strong>
        <span style={{ whiteSpace: 'pre-wrap' }}>
          {debugInfo
            ? `action=${debugInfo.action} role=${debugInfo.role} elements=${debugInfo.elementCount} records=${debugInfo.recordCount} country=${debugInfo.country ?? 'null'} year=${debugInfo.year ?? 'null'} selected=${debugInfo.selectedCountry} active=${debugInfo.activeYear}
valueKeys=${debugInfo.valueKeys.join(',') || 'none'}
recordKeys=${debugInfo.recordKeys.join(',') || 'none'}
value=${debugInfo.valuePreview}
record0=${debugInfo.recordPreview}`
            : 'No interaction captured yet.'}
        </span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <div className="ic-flint-dimpvis-panel-header">
          <strong>Unified trajectory view</strong>
          <span>
            Legend selection changes the active country. Point clicks on that country step the background
            snapshot through discrete years without changing which trajectory stays expanded.
          </span>
        </div>
        <div className="ic-flint-dimpvis-mount" ref={mainMountRef} />
      </div>
    </div>
  );
}
