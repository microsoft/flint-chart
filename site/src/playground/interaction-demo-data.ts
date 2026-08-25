import type { ChartAssemblyInput } from 'flint-chart';

export interface InteractionDemoFixture {
  id: string;
  title: string;
  source: string;
  input: ChartAssemblyInput;
}

const size = { width: 430, height: 270 };

function fixture(
  id: string,
  title: string,
  source: string,
  chartType: string,
  values: Record<string, unknown>[],
  semanticTypes: Record<string, string>,
  encodings: Record<string, unknown>,
  chartProperties?: Record<string, unknown>,
): InteractionDemoFixture {
  return {
    id,
    title,
    source,
    input: {
      data: { values },
      semantic_types: semanticTypes,
      chart_spec: {
        chartType,
        title,
        encodings,
        baseSize: size,
        chartProperties,
      },
    } as ChartAssemblyInput,
  };
}

const salesRows = [
  ['West', 'Technology', 186, 31], ['West', 'Office Supplies', 142, 18], ['West', 'Furniture', 119, 9],
  ['East', 'Technology', 171, 26], ['East', 'Office Supplies', 151, 20], ['East', 'Furniture', 128, 7],
  ['Central', 'Technology', 132, 17], ['Central', 'Office Supplies', 124, 13], ['Central', 'Furniture', 111, -2],
  ['South', 'Technology', 121, 14], ['South', 'Office Supplies', 109, 11], ['South', 'Furniture', 96, 3],
].map(([Region, Segment, Sales, Profit]) => ({ Region, Segment, 'Sales ($K)': Sales, 'Profit ($K)': Profit }));

export const salesFixture = fixture(
  'sales', 'Regional sales by segment', 'Sample Superstore-style snapshot',
  'Grouped Bar Chart', salesRows,
  { Region: 'Category', Segment: 'Category', 'Sales ($K)': 'Quantity', 'Profit ($K)': 'Quantity' },
  { x: 'Region', y: 'Sales ($K)', color: 'Segment' },
);

const countryRows = [
  ['Norway', 'Europe', 64800, 82.3, 5.4], ['Germany', 'Europe', 50900, 81.0, 83.2],
  ['United States', 'Americas', 62600, 78.6, 331.9], ['Brazil', 'Americas', 15600, 75.7, 214.3],
  ['Chile', 'Americas', 25200, 80.0, 19.5], ['China', 'Asia', 16800, 76.7, 1412],
  ['Japan', 'Asia', 39300, 84.2, 125.7], ['India', 'Asia', 7400, 67.2, 1408],
  ['Nigeria', 'Africa', 5300, 54.3, 218.5], ['Ethiopia', 'Africa', 2000, 66.2, 123.4],
  ['South Africa', 'Africa', 13000, 63.9, 59.9], ['Australia', 'Oceania', 58900, 83.2, 26.0],
].map(([Country, Continent, GDP, Life, Population]) => ({
  Country, Continent, 'GDP per capita ($)': GDP, 'Life expectancy': Life, 'Population (M)': Population,
}));

export const countriesFixture = fixture(
  'countries', 'Income and life expectancy', 'Gapminder / World Bank-style 2021 snapshot',
  'Scatter Plot', countryRows,
  { Country: 'Country', Continent: 'Category', 'GDP per capita ($)': 'Quantity', 'Life expectancy': 'Quantity', 'Population (M)': 'Quantity' },
  { x: 'GDP per capita ($)', y: 'Life expectancy', color: 'Continent', size: 'Population (M)', detail: 'Country' },
  { logScale_x: true },
);

const stockRows = [
  ['2024-01-02', 187, 188, 183, 185, 82], ['2024-01-03', 184, 185, 182, 184, 58],
  ['2024-01-04', 182, 183, 180, 182, 72], ['2024-01-05', 182, 182, 179, 181, 63],
  ['2024-01-08', 182, 186, 182, 185, 59], ['2024-01-09', 184, 185, 183, 185, 43],
  ['2024-01-10', 184, 186, 183, 186, 47], ['2024-01-11', 186, 187, 183, 186, 49],
  ['2024-01-12', 186, 188, 185, 185, 40], ['2024-01-16', 183, 184, 180, 183, 66],
].map(([Date, Open, High, Low, Close, Volume]) => ({ Date, Open, High, Low, Close, 'Volume (M)': Volume }));

export const stocksFixture = fixture(
  'stocks', 'AAPL daily OHLC', 'Historical-style two-week market snapshot',
  'Candlestick Chart', stockRows,
  { Date: 'Date', Open: 'Quantity', High: 'Quantity', Low: 'Quantity', Close: 'Quantity', 'Volume (M)': 'Quantity' },
  { x: 'Date', open: 'Open', high: 'High', low: 'Low', close: 'Close' },
);

const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const cityTemperatures: Record<string, number[]> = {
  Seattle: [5, 6, 8, 10, 13, 16, 19, 19, 16, 11, 7, 4],
  Cairo: [14, 15, 18, 22, 26, 28, 29, 29, 27, 24, 20, 16],
  Moscow: [-9, -7, -1, 7, 13, 17, 19, 17, 11, 5, -1, -6],
  Singapore: [26, 27, 28, 28, 28, 28, 27, 27, 27, 27, 26, 26],
};
const weatherRows = Object.entries(cityTemperatures).flatMap(([City, temperatures]) =>
  temperatures.map((temperature, index) => ({ City, Month: months[index], 'Temperature (C)': temperature })));

export const weatherFixture = fixture(
  'weather', 'Monthly temperature by city', 'NOAA-style climate normals',
  'Heatmap', weatherRows,
  { City: 'Category', Month: 'Category', 'Temperature (C)': 'Quantity' },
  { x: 'Month', y: 'City', color: 'Temperature (C)' },
);

const taskRows = [
  ['Planning', 'Platform', 'A. Chen', '2024-01-01', '2024-01-14', 'Complete'],
  ['Design', 'Experience', 'M. Rivera', '2024-01-15', '2024-02-04', 'Complete'],
  ['Implementation', 'Platform', 'J. Okafor', '2024-02-05', '2024-03-17', 'In progress'],
  ['Testing', 'Quality', 'S. Patel', '2024-03-11', '2024-04-07', 'In progress'],
  ['Launch', 'Release', 'L. Kim', '2024-04-08', '2024-04-15', 'Planned'],
].map(([Task, Team, Owner, Start, End, Status]) => ({ Task, Team, Owner, Start, End, Status }));

export const ganttFixture = fixture(
  'release', 'Software release schedule', 'Realistic product delivery plan',
  'Gantt Chart', taskRows,
  { Task: 'Category', Team: 'Category', Owner: 'Category', Start: 'Date', End: 'Date', Status: 'Category' },
  { y: 'Task', x: 'Start', x2: 'End', color: 'Team', detail: 'Owner' },
);

const lifeRows = Object.entries({
  Japan: [81.5, 87.6], Germany: [78.5, 83.4], Brazil: [69.0, 76.0],
  India: [66.0, 69.0], Nigeria: [51.0, 54.0], 'United States': [73.5, 79.3],
}).flatMap(([Country, [male, female]]) => [
  { Country, Sex: 'Male', 'Life expectancy': male },
  { Country, Sex: 'Female', 'Life expectancy': female },
]);

export const lifeFixture = fixture(
  'life-gap', 'Life expectancy gap', 'World Bank-style 2021 snapshot',
  'Ranged Dot Plot', lifeRows,
  { Country: 'Country', Sex: 'Category', 'Life expectancy': 'Quantity' },
  { x: 'Life expectancy', y: 'Country', color: 'Sex' },
);

const populationRows = [
  ['1950 baseline', 2536, 'Total'], ['Asia growth', 3237, 'Increase'],
  ['Africa growth', 1134, 'Increase'], ['Americas growth', 684, 'Increase'],
  ['Europe growth', 199, 'Increase'], ['Oceania growth', 32, 'Increase'],
].map(([Step, Population, Kind]) => ({ Step, 'Population (M)': Population, Kind }));

export const populationFixture = fixture(
  'population', 'World population growth, 1950-2020', 'UN World Population Prospects-style bridge',
  'Waterfall Chart', populationRows,
  { Step: 'Category', 'Population (M)': 'Quantity', Kind: 'Category' },
  { x: 'Step', y: 'Population (M)' },
  { totals: 'last' },
);

const incidentRows = [
  ['May 06', 'Critical', 2], ['May 06', 'High', 7], ['May 06', 'Medium', 13],
  ['May 13', 'Critical', 1], ['May 13', 'High', 5], ['May 13', 'Medium', 16],
  ['May 20', 'Critical', 3], ['May 20', 'High', 8], ['May 20', 'Medium', 11],
  ['May 27', 'Critical', 1], ['May 27', 'High', 4], ['May 27', 'Medium', 9],
  ['Jun 03', 'Critical', 0], ['Jun 03', 'High', 3], ['Jun 03', 'Medium', 8],
].map(([Week, Severity, Incidents]) => ({ Week, Severity, Incidents }));

export const incidentsFixture = fixture(
  'incidents', 'Weekly service incidents', 'Realistic reliability operations snapshot',
  'Stacked Bar Chart', incidentRows,
  { Week: 'Category', Severity: 'Category', Incidents: 'Quantity' },
  { x: 'Week', y: 'Incidents', color: 'Severity' },
);

const penguinRows = [
  ['Adelie', 'Biscoe', 39.1, 181, 3750], ['Adelie', 'Dream', 40.3, 195, 3250],
  ['Adelie', 'Torgersen', 38.9, 190, 3650], ['Chinstrap', 'Dream', 46.5, 192, 3500],
  ['Chinstrap', 'Dream', 50.0, 196, 3900], ['Chinstrap', 'Dream', 45.4, 188, 3525],
  ['Gentoo', 'Biscoe', 46.1, 211, 4500], ['Gentoo', 'Biscoe', 50.0, 230, 5700],
  ['Gentoo', 'Biscoe', 48.7, 210, 4450], ['Gentoo', 'Biscoe', 49.2, 218, 5700],
].map(([Species, Island, Bill, Flipper, Mass]) => ({
  Species, Island, 'Bill length (mm)': Bill, 'Flipper length (mm)': Flipper, 'Body mass (g)': Mass,
}));

export const penguinsFixture = fixture(
  'penguins', 'Penguin morphology', 'Palmer Penguins sample',
  'Scatter Plot', penguinRows,
  { Species: 'Category', Island: 'Category', 'Bill length (mm)': 'Quantity', 'Flipper length (mm)': 'Quantity', 'Body mass (g)': 'Quantity' },
  { x: 'Bill length (mm)', y: 'Flipper length (mm)', color: 'Species', size: 'Body mass (g)', detail: 'Island' },
);

export const externalFixtures = [
  salesFixture, countriesFixture, stocksFixture, weatherFixture,
  ganttFixture, lifeFixture, populationFixture, incidentsFixture,
];

export const outboundFixtures = [
  salesFixture, countriesFixture, penguinsFixture, weatherFixture,
  stocksFixture, ganttFixture, populationFixture, lifeFixture,
];
