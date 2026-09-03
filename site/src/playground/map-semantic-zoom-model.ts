import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartUpdate } from 'flint-chart/interactive';

export type SemanticZoomLevel = 'province' | 'city';

export type SemanticZoomRow = {
  Place: string;
  Province: string;
  SemanticLevel: SemanticZoomLevel;
  SemanticGroup: string;
  Lon: number;
  Lat: number;
  DisplaySize: number;
  PopulationM: number;
};

type ProvinceDatum = {
  province: string;
  group: string;
  lon: number;
  lat: number;
  populationM: number;
};

type CityDatum = {
  city: string;
  province: string;
  tier: string;
  lon: number;
  lat: number;
  populationM: number;
};

export const SEMANTIC_ZOOM_THRESHOLDS = {
  detailEnter: 2.15,
  detailExit: 1.7,
} as const;

export const DEFAULT_FOCUS_PROVINCE = 'Zhejiang';

const PROVINCES: readonly ProvinceDatum[] = [
  { province: 'Beijing', group: 'North China', lon: 116.4, lat: 39.9, populationM: 21.9 },
  { province: 'Shanghai', group: 'East China', lon: 121.5, lat: 31.2, populationM: 24.9 },
  { province: 'Guangdong', group: 'South China', lon: 113.3, lat: 23.1, populationM: 126.0 },
  { province: 'Sichuan', group: 'West China', lon: 104.1, lat: 30.7, populationM: 83.7 },
  { province: 'Hubei', group: 'Central China', lon: 114.3, lat: 30.6, populationM: 58.3 },
  { province: 'Shaanxi', group: 'West China', lon: 108.9, lat: 34.3, populationM: 39.5 },
  { province: 'Zhejiang', group: 'East China', lon: 120.2, lat: 30.3, populationM: 65.7 },
  { province: 'Liaoning', group: 'North China', lon: 123.4, lat: 41.8, populationM: 42.6 },
] as const;

const CITIES: readonly CityDatum[] = [
  { city: 'Hangzhou', province: 'Zhejiang', tier: 'Core city', lon: 120.2, lat: 30.3, populationM: 12.5 },
  { city: 'Ningbo', province: 'Zhejiang', tier: 'Port city', lon: 121.6, lat: 29.9, populationM: 9.6 },
  { city: 'Wenzhou', province: 'Zhejiang', tier: 'Manufacturing city', lon: 120.7, lat: 28.0, populationM: 9.8 },
  { city: 'Guangzhou', province: 'Guangdong', tier: 'Core city', lon: 113.3, lat: 23.1, populationM: 18.7 },
  { city: 'Shenzhen', province: 'Guangdong', tier: 'Innovation city', lon: 114.1, lat: 22.5, populationM: 17.7 },
  { city: 'Foshan', province: 'Guangdong', tier: 'Manufacturing city', lon: 113.1, lat: 23.0, populationM: 9.6 },
  { city: 'Chengdu', province: 'Sichuan', tier: 'Core city', lon: 104.1, lat: 30.7, populationM: 21.4 },
  { city: 'Mianyang', province: 'Sichuan', tier: 'Science city', lon: 104.7, lat: 31.5, populationM: 4.9 },
  { city: 'Yibin', province: 'Sichuan', tier: 'River city', lon: 104.6, lat: 28.8, populationM: 4.6 },
  { city: 'Wuhan', province: 'Hubei', tier: 'Core city', lon: 114.3, lat: 30.6, populationM: 13.7 },
  { city: 'Yichang', province: 'Hubei', tier: 'River city', lon: 111.3, lat: 30.7, populationM: 4.0 },
  { city: 'Xiangyang', province: 'Hubei', tier: 'Manufacturing city', lon: 112.1, lat: 32.0, populationM: 5.3 },
] as const;

function provinceBoost(province: string, focusProvince: string) {
  return province === focusProvince ? 1.22 : 1;
}

export function provinceOverviewRows(focusProvince: string): SemanticZoomRow[] {
  return PROVINCES.map((row) => ({
    Place: row.province,
    Province: row.province,
    SemanticLevel: 'province',
    SemanticGroup: row.group,
    Lon: row.lon,
    Lat: row.lat,
    PopulationM: row.populationM,
    DisplaySize: row.populationM * provinceBoost(row.province, focusProvince),
  }));
}

export function cityDetailRows(focusProvince: string): SemanticZoomRow[] {
  const rows = CITIES.filter((row) => row.province === focusProvince);
  return rows.map((row, index) => ({
    Place: row.city,
    Province: row.province,
    SemanticLevel: 'city',
    SemanticGroup: row.tier,
    Lon: row.lon,
    Lat: row.lat,
    PopulationM: row.populationM,
    DisplaySize: row.populationM * (index === 0 ? 1.12 : 1),
  }));
}

export function rowsForSemanticLevel(level: SemanticZoomLevel, focusProvince: string): SemanticZoomRow[] {
  return level === 'city'
    ? cityDetailRows(focusProvince)
    : provinceOverviewRows(focusProvince);
}

export function resolveSemanticZoomLevel(args: {
  zoom: number;
  currentLevel: SemanticZoomLevel;
  focusProvince: string;
}): SemanticZoomLevel {
  const { zoom, currentLevel, focusProvince } = args;
  const hasDetailData = cityDetailRows(focusProvince).length > 0;
  if (!hasDetailData) return 'province';
  if (currentLevel === 'city') {
    return zoom <= SEMANTIC_ZOOM_THRESHOLDS.detailExit ? 'province' : 'city';
  }
  return zoom >= SEMANTIC_ZOOM_THRESHOLDS.detailEnter ? 'city' : 'province';
}

export function semanticZoomLevelLabel(level: SemanticZoomLevel) {
  return level === 'city' ? 'Detail · city points' : 'Overview · province centroids';
}

export function buildSemanticZoomDataUpdate(level: SemanticZoomLevel, focusProvince: string): ChartUpdate {
  return {
    id: 'map-semantic-zoom-data',
    ops: [
      {
        op: 'set-data',
        source: 'main',
        value: {
          rows: rowsForSemanticLevel(level, focusProvince),
        },
      },
    ],
  };
}

export function createSemanticZoomMapInput(
  level: SemanticZoomLevel,
  focusProvince: string,
): ChartAssemblyInput {
  return {
    data: { values: rowsForSemanticLevel(level, focusProvince) },
    semantic_types: {
      Place: 'Category',
      Province: 'State',
      SemanticLevel: 'Category',
      SemanticGroup: 'Category',
      Lon: 'Longitude',
      Lat: 'Latitude',
      DisplaySize: { semanticType: 'Quantity', intrinsicDomain: [0, 155] },
      PopulationM: { semanticType: 'Quantity', intrinsicDomain: [0, 155] },
    },
    field_display_names: {
      Place: 'Place',
      Province: 'Province',
      SemanticGroup: 'Group',
      DisplaySize: 'Population (M)',
      PopulationM: 'Population (M)',
    },
    theme_spec: {
      extends: 'swiss',
      geometry: { point: { size: 120 } },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Map',
      title: 'China semantic zoom prototype',
      subtitle: 'Viewport zoom is geometric; threshold crossings swap semantic layers with set-data.',
      encodings: {
        longitude: 'Lon',
        latitude: 'Lat',
        size: 'DisplaySize',
        color: 'SemanticGroup',
      },
      baseSize: { width: 920, height: 560 },
      canvasSize: { width: 920, height: 560 },
      chartProperties: {
        region: 'world',
        projection: 'mercator',
        projectionCenter: [105, 35],
      },
    },
  };
}
