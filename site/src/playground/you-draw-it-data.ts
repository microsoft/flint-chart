/**
 * Share of U.S. utility-scale electricity generation from coal, in percent.
 *
 * Approximate annual values from EIA Electric Power Monthly, rounded to one
 * decimal. Good enough for the drawing prototype; swap in exact figures before
 * the story ships.
 */
export interface CoalShareRow {
  Year: number;
  Share: number;
}

export const COAL_SHARE_ROWS: readonly CoalShareRow[] = [
  { Year: 2000, Share: 51.7 },
  { Year: 2001, Share: 51.0 },
  { Year: 2002, Share: 50.1 },
  { Year: 2003, Share: 50.8 },
  { Year: 2004, Share: 49.8 },
  { Year: 2005, Share: 49.6 },
  { Year: 2006, Share: 49.0 },
  { Year: 2007, Share: 48.5 },
  { Year: 2008, Share: 48.2 },
  { Year: 2009, Share: 44.4 },
  { Year: 2010, Share: 44.8 },
  { Year: 2011, Share: 42.3 },
  { Year: 2012, Share: 37.4 },
  { Year: 2013, Share: 38.9 },
  { Year: 2014, Share: 38.6 },
  { Year: 2015, Share: 33.2 },
  { Year: 2016, Share: 30.4 },
  { Year: 2017, Share: 30.1 },
  { Year: 2018, Share: 27.4 },
  { Year: 2019, Share: 23.5 },
  { Year: 2020, Share: 19.3 },
  { Year: 2021, Share: 21.8 },
  { Year: 2022, Share: 19.5 },
  { Year: 2023, Share: 16.2 },
  { Year: 2024, Share: 15.0 },
];

/** The reader draws from this year to the end of the series. */
export const DRAW_START_YEAR = 2012;
export const YEAR_DOMAIN: readonly [number, number] = [2000, 2024];
export const SHARE_DOMAIN: readonly [number, number] = [0, 60];
