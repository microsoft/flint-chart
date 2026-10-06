export type ChinaLevel = 'province' | 'prefecture' | 'county';

export interface ChinaPlaceRow extends Record<string, unknown> {
  Id: string;
  Place: string;
  Province: string;
  Prefecture: string;
  Level: ChinaLevel;
  Lon: number;
  Lat: number;
  PopulationM: number;
  Age65Pct: number | null;
  AgeCoveragePct: number;
  CountyCount: number;
}

export interface ChinaCensusData {
  metadata: {
    year: number;
    counts: Record<ChinaLevel, number>;
    missingAgeCounties: number;
  };
  rows: ChinaPlaceRow[];
}

let censusData: Promise<ChinaCensusData> | undefined;

export function loadChinaCensusData(): Promise<ChinaCensusData> {
  censusData ??= fetch(`${import.meta.env.BASE_URL}map-data/china-census-2020.json`)
    .then(async response => {
      if (!response.ok) throw new Error(`Census data request failed (${response.status})`);
      return await response.json() as ChinaCensusData;
    })
    .catch(error => {
      censusData = undefined;
      throw error;
    });
  return censusData;
}
