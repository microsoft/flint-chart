import type { Locale } from '../i18n/locales';

const ZH_CHART_LABELS: Record<string, string> = {
  'Scatter Plot': '散点图',
  'Connected Scatter Plot': '连线散点图',
  Regression: '回归图',
  'Bar Chart': '柱状图',
  'Stacked Bar Chart': '堆叠柱状图',
  'Grouped Bar Chart': '分组柱状图',
  Histogram: '直方图',
  Heatmap: '热力图',
  'Line Chart': '折线图',
  Sparkline: '迷你趋势图',
  'Bump Chart': '排名变化图',
  'Slope Chart': '坡度图',
  Boxplot: '箱线图',
  'Pie Chart': '饼图',
  'Ranged Dot Plot': '区间点图',
  'Area Chart': '面积图',
  Streamgraph: '流图',
  'Range Area Chart': '区间面积图',
  'Lollipop Chart': '棒棒糖图',
  'Density Plot': '密度图',
  'ECDF Plot': 'ECDF 图',
  'Violin Plot': '小提琴图',
  'Candlestick Chart': 'K 线图',
  'Waterfall Chart': '瀑布图',
  'Gantt Chart': '甘特图',
  'Bullet Chart': '子弹图',
  'Strip Plot': '条带图',
  'Radar Chart': '雷达图',
  'Pyramid Chart': '金字塔图',
  'Rose Chart': '玫瑰图',
  'Bar Table': '条形表格',
  'KPI Card': 'KPI 卡片',
  Map: '地图',
  Choropleth: '分级设色地图',
  'Calendar Heatmap': '日历热力图',
  'Parallel Coordinates': '平行坐标图',
  Gauge: '仪表盘',
  Funnel: '漏斗图',
  Treemap: '矩形树图',
  Sunburst: '旭日图',
  Tree: '树图',
  Sankey: '桑基图',
  'Network Graph': '网络图',
  'Bubble Chart': '气泡图',
  'Combo Chart': '组合图',
  'Doughnut Chart': '环形图',
};

const ZH_FAMILY_LABELS: Record<string, string> = {
  bar: '柱状图',
  line: '折线与面积',
  scatter: '散点图',
  distribution: '分布图',
  radial: '圆形与径向',
  matrix: '表格与多维图表',
  flow: '层级与流向',
  maps: '地图',
};

export function localizeChartLabel(label: string, locale: Locale): string {
  if (locale !== 'zh-CN') return label;
  const starred = /\s*\*$/.test(label);
  const base = label.replace(/\s*\*$/, '');
  const translated = ZH_CHART_LABELS[base] ?? base;
  return starred ? `${translated} *` : translated;
}

export function localizeFamilyLabel(id: string, label: string, locale: Locale): string {
  return locale === 'zh-CN' ? (ZH_FAMILY_LABELS[id] ?? label) : label;
}

const ZH_TITLE_PHRASES: Array<[string, string]> = [
  ['Colored by Value', '（按数值着色）'],
  ['with Negative Values', '（含负值）'],
  ['by Category', '（按类别分组）'],
  ['over Time', '（时间序列）'],
  ['Multi-Series', '多系列'],
  ['Horizontal', '横向'],
  ['Faceted', '分面'],
  ['Colored', '彩色'],
  ['Simple', '基础'],
  ['Bubble Plot', '气泡图'],
];

const ZH_COUNT_UNITS: Record<string, string> = {
  categories: '个类别',
  category: '个类别',
  series: '个系列',
  groups: '个分组',
  group: '个分组',
  slices: '个扇区',
  slice: '个扇区',
  points: '个数据点',
  point: '个数据点',
  nodes: '个节点',
  node: '个节点',
  stages: '个阶段',
  stage: '个阶段',
  days: '天',
  day: '天',
  cells: '个单元格',
  cell: '个单元格',
  levels: '个层级',
  level: '个层级',
  values: '个数据值',
  value: '个数据值',
};

export function localizeVariantTitle(title: string, locale: Locale): string {
  if (locale !== 'zh-CN') return title;

  let localized = title.split(' — ')[0];
  for (const [english, chinese] of Object.entries(ZH_CHART_LABELS).sort(
    ([a], [b]) => b.length - a.length,
  )) {
    localized = localized.split(english).join(chinese);
  }
  for (const [english, chinese] of ZH_TITLE_PHRASES) {
    localized = localized.split(english).join(chinese);
  }

  localized = localized
    .replace(/(\d+)\s+(categories|category|series|groups|group|slices|slice|points|point|nodes|node|stages|stage|days|day|cells|cell|levels|level|values|value)\b/g,
      (_, count: string, unit: string) => `${count} ${ZH_COUNT_UNITS[unit]}`)
    .replace(/\bsparse\b/gi, '稀疏')
    .replace(/\(([^()]*)\)/g, '（$1）')
    .replace(/([\u3400-\u9fff）])\s+(?=[\u3400-\u9fff（])/g, '$1')
    .replace(/\s+（/g, '（')
    .replace(/\s+/g, ' ')
    .trim();

  return localized;
}