export const CLIMATE_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export type ClimateCity = {
  name: string;
  coordinates: readonly [longitude: number, latitude: number];
  temperature: readonly number[];
  precipitation: readonly number[];
};

/**
 * NASA POWER 1991–2020 monthly climatology at each city coordinate.
 * T2M is 2 m air temperature (°C); PRECTOTCORR is corrected precipitation (mm/day).
 * Source: MERRA-2 through the NASA POWER Climatology API.
 * https://power.larc.nasa.gov/docs/services/api/temporal/climatology/
 */
export const CLIMATE_CITIES: readonly ClimateCity[] = [
  {
    name: 'Seattle',
    coordinates: [-122.3321, 47.6062],
    temperature: [4.18, 4.8, 6.77, 9.14, 12.78, 15.14, 18.06, 18.16, 15.49, 10.71, 6.59, 3.85],
    precipitation: [5.68, 4.21, 4.3, 3.31, 2.27, 1.78, 0.81, 0.97, 1.8, 3.93, 6.37, 5.81],
  },
  {
    name: 'New York',
    coordinates: [-74.006, 40.7128],
    temperature: [1.13, 1.33, 4.06, 8.84, 14.12, 19.72, 23.51, 23.35, 20.25, 14.58, 8.95, 4.27],
    precipitation: [3.29, 3.11, 3.72, 3.38, 3.15, 3.45, 3.55, 3.58, 3.39, 3.5, 3.22, 3.9],
  },
  {
    name: 'Los Angeles',
    coordinates: [-118.2437, 34.0522],
    temperature: [11.83, 12.11, 13.51, 15.12, 17.45, 20.2, 23.14, 24.06, 22.89, 19.35, 15.15, 11.7],
    precipitation: [2.78, 3.28, 1.81, 0.63, 0.3, 0.08, 0.07, 0.04, 0.11, 0.5, 0.78, 1.97],
  },
  {
    name: 'Houston',
    coordinates: [-95.3698, 29.7604],
    temperature: [10.39, 12.67, 16.26, 20.09, 24.49, 27.69, 28.49, 28.85, 26.16, 21.28, 15.52, 11.56],
    precipitation: [3.3, 2.77, 2.8, 3.19, 4.03, 4.31, 3.09, 3.73, 3.92, 4.18, 3.46, 3.35],
  },
  {
    name: 'Chicago',
    coordinates: [-87.6298, 41.8781],
    temperature: [-2.76, -1.89, 2.03, 6.6, 11.63, 17.69, 22.02, 22.18, 18.67, 12.13, 5.51, 0.18],
    precipitation: [1.68, 1.79, 1.96, 3.29, 3.6, 3.56, 3.06, 3.28, 2.86, 3.01, 2.24, 1.77],
  },
];
