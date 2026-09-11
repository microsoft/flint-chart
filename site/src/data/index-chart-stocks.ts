export interface IndexChartStockRow {
  Symbol: 'AAPL' | 'AMZN' | 'GOOG' | 'IBM' | 'MSFT';
  Date: string;
  Close: number;
}

// Sampled from the D3/Vega index chart reference dataset.
// A few rows are intentionally omitted so the prototype exercises
// nearest-date fallback when a symbol lacks the active reference date.
export const INDEX_CHART_STOCKS: IndexChartStockRow[] = [
  { Symbol: 'AAPL', Date: '2013-05-13', Close: 64.9629 },
  { Symbol: 'AAPL', Date: '2013-11-08', Close: 74.3657 },
  { Symbol: 'AAPL', Date: '2014-05-13', Close: 84.8229 },
  { Symbol: 'AAPL', Date: '2014-11-10', Close: 108.83 },
  { Symbol: 'AAPL', Date: '2015-05-13', Close: 126.01 },
  { Symbol: 'AAPL', Date: '2015-11-10', Close: 116.77 },
  { Symbol: 'AAPL', Date: '2016-05-12', Close: 90.34 },
  { Symbol: 'AAPL', Date: '2016-11-09', Close: 110.88 },
  { Symbol: 'AAPL', Date: '2017-05-12', Close: 156.1 },
  { Symbol: 'AAPL', Date: '2017-11-09', Close: 175.88 },

  { Symbol: 'AMZN', Date: '2013-05-13', Close: 264.51 },
  { Symbol: 'AMZN', Date: '2013-11-08', Close: 350.31 },
  { Symbol: 'AMZN', Date: '2014-05-13', Close: 304.64 },
  { Symbol: 'AMZN', Date: '2014-11-10', Close: 305.11 },
  { Symbol: 'AMZN', Date: '2015-05-13', Close: 426.87 },
  { Symbol: 'AMZN', Date: '2015-11-10', Close: 659.68 },
  { Symbol: 'AMZN', Date: '2016-05-12', Close: 717.93 },
  { Symbol: 'AMZN', Date: '2016-11-09', Close: 771.88 },
  { Symbol: 'AMZN', Date: '2017-05-12', Close: 961.35 },
  { Symbol: 'AMZN', Date: '2017-11-09', Close: 1129.13 },

  { Symbol: 'GOOG', Date: '2013-05-13', Close: 435.9297 },
  { Symbol: 'GOOG', Date: '2013-11-08', Close: 504.7322 },
  { Symbol: 'GOOG', Date: '2014-05-13', Close: 530.1748 },
  { Symbol: 'GOOG', Date: '2014-11-10', Close: 544.4961 },
  { Symbol: 'GOOG', Date: '2015-11-10', Close: 728.32 },
  { Symbol: 'GOOG', Date: '2016-05-12', Close: 713.31 },
  { Symbol: 'GOOG', Date: '2016-11-09', Close: 785.31 },
  { Symbol: 'GOOG', Date: '2017-05-12', Close: 932.22 },
  { Symbol: 'GOOG', Date: '2017-11-09', Close: 1031.26 },

  { Symbol: 'IBM', Date: '2013-05-13', Close: 202.47 },
  { Symbol: 'IBM', Date: '2013-11-08', Close: 179.99 },
  { Symbol: 'IBM', Date: '2014-05-13', Close: 192.19 },
  { Symbol: 'IBM', Date: '2014-11-10', Close: 163.49 },
  { Symbol: 'IBM', Date: '2015-05-13', Close: 172.28 },
  { Symbol: 'IBM', Date: '2015-11-10', Close: 135.47 },
  { Symbol: 'IBM', Date: '2016-05-12', Close: 148.84 },
  { Symbol: 'IBM', Date: '2017-05-12', Close: 150.37 },
  { Symbol: 'IBM', Date: '2017-11-09', Close: 150.3 },

  { Symbol: 'MSFT', Date: '2013-05-13', Close: 33.03 },
  { Symbol: 'MSFT', Date: '2013-11-08', Close: 37.78 },
  { Symbol: 'MSFT', Date: '2014-05-13', Close: 40.42 },
  { Symbol: 'MSFT', Date: '2014-11-10', Close: 48.89 },
  { Symbol: 'MSFT', Date: '2015-05-13', Close: 47.63 },
  { Symbol: 'MSFT', Date: '2015-11-10', Close: 53.51 },
  { Symbol: 'MSFT', Date: '2016-05-12', Close: 51.51 },
  { Symbol: 'MSFT', Date: '2016-11-09', Close: 60.17 },
  { Symbol: 'MSFT', Date: '2017-05-12', Close: 68.38 },
  { Symbol: 'MSFT', Date: '2017-11-09', Close: 84.09 },
];
