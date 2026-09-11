/**
 * Two levels of one Chinese population map: province centroids and, within
 * four provinces, city points. Reused from the dimpvis candidates branch, with
 * the DataV `adcode` of each province so a focused province can be named from
 * the base map's feature under the plot centre.
 */

export type ChinaLevel = 'province' | 'city';

export interface ChinaPlaceRow {
  Place: string;
  Province: string;
  Level: ChinaLevel;
  Role: string;
  Lon: number;
  Lat: number;
  PopulationM: number;
}

interface ProvinceDatum {
  province: string;
  adcode: number;
  group: string;
  lon: number;
  lat: number;
  populationM: number;
}

interface CityDatum {
  city: string;
  province: string;
  tier: string;
  lon: number;
  lat: number;
  populationM: number;
}

const PROVINCES: readonly ProvinceDatum[] = [
  { province: 'Beijing', adcode: 110000, group: 'North China', lon: 116.4, lat: 39.9, populationM: 21.9 },
  { province: 'Shanghai', adcode: 310000, group: 'East China', lon: 121.5, lat: 31.2, populationM: 24.9 },
  { province: 'Guangdong', adcode: 440000, group: 'South China', lon: 113.3, lat: 23.1, populationM: 126.0 },
  { province: 'Sichuan', adcode: 510000, group: 'West China', lon: 104.1, lat: 30.7, populationM: 83.7 },
  { province: 'Hubei', adcode: 420000, group: 'Central China', lon: 114.3, lat: 30.6, populationM: 58.3 },
  { province: 'Shaanxi', adcode: 610000, group: 'West China', lon: 108.9, lat: 34.3, populationM: 39.5 },
  { province: 'Zhejiang', adcode: 330000, group: 'East China', lon: 120.2, lat: 30.3, populationM: 65.7 },
  { province: 'Liaoning', adcode: 210000, group: 'North China', lon: 123.4, lat: 41.8, populationM: 42.6 },
];

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
];

/** One table for both levels; the `Level` column gates which rows show. */
export const CHINA_PLACE_ROWS: readonly ChinaPlaceRow[] = [
  ...PROVINCES.map((row): ChinaPlaceRow => ({
    Place: row.province, Province: row.province, Level: 'province', Role: row.group,
    Lon: row.lon, Lat: row.lat, PopulationM: row.populationM,
  })),
  ...CITIES.map((row): ChinaPlaceRow => ({
    Place: row.city, Province: row.province, Level: 'city', Role: row.tier,
    Lon: row.lon, Lat: row.lat, PopulationM: row.populationM,
  })),
];

/** English province names by DataV `adcode`, for the provinces this table covers. */
export const PROVINCE_NAME_BY_ADCODE: ReadonlyMap<number, string> = new Map(
  PROVINCES.map((row) => [row.adcode, row.province]),
);

export const CHINA_LEVEL_COUNTS: Record<ChinaLevel, number> = {
  province: PROVINCES.length,
  city: CITIES.length,
};
