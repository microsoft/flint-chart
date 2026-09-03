import { useEffect, useRef } from 'react';
import {
  axisBottom,
  axisLeft,
  drag,
  line,
  pointer,
  scaleLinear,
  scaleOrdinal,
  select,
  schemeTableau10,
} from 'd3';

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

const MARGIN = { top: 16, right: 170, bottom: 66, left: 52 };
const PLOT_WIDTH = 520;
const PLOT_HEIGHT = 288;
const TOTAL_WIDTH = PLOT_WIDTH + MARGIN.left + MARGIN.right;
const TOTAL_HEIGHT = PLOT_HEIGHT + MARGIN.top + MARGIN.bottom + 62;
const SLIDER_Y = MARGIN.top + PLOT_HEIGHT + 36;

const regionOrder = Array.from(new Set(SERIES.map((series) => series.region)));
const maxPopulation = Math.max(...SERIES.flatMap((series) => series.frames.map((frame) => frame.population)));

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function lerp(start: number, end: number, t: number) {
  return start + ((end - start) * t);
}

function interpolateFrame(series: CountrySeries, leftIndex: number, rightIndex: number, t: number) {
  const left = series.frames[leftIndex];
  const right = series.frames[rightIndex];
  return {
    year: lerp(left.year, right.year, t),
    fertility: lerp(left.fertility, right.fertility, t),
    life: lerp(left.life, right.life, t),
    population: lerp(left.population, right.population, t),
  };
}

function projectToPolyline(
  point: [number, number],
  polyline: [number, number][],
) {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIndex = 0;
  let bestT = 0;

  for (let index = 0; index < polyline.length - 1; index += 1) {
    const start = polyline[index];
    const end = polyline[index + 1];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = (dx * dx) + (dy * dy);
    const rawT = lengthSquared === 0 ? 0 : (((point[0] - start[0]) * dx) + ((point[1] - start[1]) * dy)) / lengthSquared;
    const t = clamp(rawT, 0, 1);
    const projectedX = start[0] + (dx * t);
    const projectedY = start[1] + (dy * t);
    const distanceSquared = ((point[0] - projectedX) ** 2) + ((point[1] - projectedY) ** 2);
    if (distanceSquared < bestDistance) {
      bestDistance = distanceSquared;
      bestIndex = index;
      bestT = t;
    }
  }

  return {
    leftIndex: bestIndex,
    rightIndex: bestIndex + 1,
    t: bestT,
    progress: bestIndex + bestT,
  };
}

function progressToState(progress: number) {
  const clamped = clamp(progress, 0, YEARS.length - 1);
  const leftIndex = Math.min(Math.floor(clamped), YEARS.length - 2);
  const rightIndex = Math.min(leftIndex + 1, YEARS.length - 1);
  const t = leftIndex === rightIndex ? 0 : clamped - leftIndex;
  return { leftIndex, rightIndex, t };
}

export function PureD3DimpVisStage() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const xScale = scaleLinear().domain([1, 8.2]).range([0, PLOT_WIDTH]);
    const yScale = scaleLinear().domain([25, 84]).range([PLOT_HEIGHT, 0]);
    const sliderScale = scaleLinear().domain([0, YEARS.length - 1]).range([0, PLOT_WIDTH]);
    const radiusScale = scaleLinear().domain([0, Math.sqrt(maxPopulation)]).range([5, 17]);
    const colorScale = scaleOrdinal<string, string>()
      .domain(regionOrder)
      .range(schemeTableau10.slice(0, regionOrder.length));

    const svg = select(mount)
      .append('svg')
      .attr('class', 'ic-dimpvis-svg')
      .attr('viewBox', `0 0 ${TOTAL_WIDTH} ${TOTAL_HEIGHT}`)
      .attr('role', 'img')
      .attr('aria-label', 'Pure D3 DimpVis example with draggable trajectory and time slider');

    const frame = svg.append('g').attr('transform', `translate(${MARGIN.left},${MARGIN.top})`);

    frame
      .append('rect')
      .attr('class', 'ic-dimpvis-plot-bg')
      .attr('width', PLOT_WIDTH)
      .attr('height', PLOT_HEIGHT)
      .attr('rx', 10);

    frame
      .append('g')
      .attr('class', 'ic-dimpvis-grid')
      .attr('transform', `translate(0,${PLOT_HEIGHT})`)
      .call(axisBottom(xScale).ticks(6).tickSize(-PLOT_HEIGHT))
      .call((group) => {
        group.select('.domain').remove();
        group.selectAll('.tick line').attr('stroke', '#e5e7eb');
        group.selectAll('.tick text').attr('fill', '#66707a').attr('font-size', 11);
      });

    frame
      .append('g')
      .attr('class', 'ic-dimpvis-grid')
      .call(axisLeft(yScale).ticks(6).tickSize(-PLOT_WIDTH))
      .call((group) => {
        group.select('.domain').remove();
        group.selectAll('.tick line').attr('stroke', '#e5e7eb');
        group.selectAll('.tick text').attr('fill', '#66707a').attr('font-size', 11);
      });

    frame
      .append('text')
      .attr('class', 'ic-dimpvis-axis-label')
      .attr('x', PLOT_WIDTH / 2)
      .attr('y', PLOT_HEIGHT + 42)
      .attr('text-anchor', 'middle')
      .text('Fertility rate (children per woman)');

    frame
      .append('text')
      .attr('class', 'ic-dimpvis-axis-label')
      .attr('transform', `translate(-38, ${PLOT_HEIGHT / 2}) rotate(-90)`)
      .attr('text-anchor', 'middle')
      .text('Life expectancy (years)');

    const yearStamp = frame
      .append('text')
      .attr('class', 'ic-dimpvis-year')
      .attr('x', PLOT_WIDTH / 2)
      .attr('y', PLOT_HEIGHT / 2 + 16);

    const pathLayer = frame.append('g').attr('class', 'ic-dimpvis-path-layer');
    const pointsLayer = frame.append('g').attr('class', 'ic-dimpvis-points-layer');
    const focusLayer = frame.append('g').attr('class', 'ic-dimpvis-focus-layer');

    const legend = svg.append('g').attr('transform', `translate(${MARGIN.left + PLOT_WIDTH + 22},${MARGIN.top + 10})`);
    legend.append('text').attr('class', 'ic-dimpvis-legend-title').text('Region');
    regionOrder.forEach((region, index) => {
      const row = legend.append('g').attr('transform', `translate(0, ${22 + (index * 18)})`);
      row.append('circle').attr('r', 5).attr('fill', colorScale(region));
      row.append('text').attr('x', 12).attr('y', 4).attr('class', 'ic-dimpvis-legend-label').text(region);
    });

    const instruction = svg
      .append('text')
      .attr('class', 'ic-dimpvis-instruction')
      .attr('x', MARGIN.left + PLOT_WIDTH + 22)
      .attr('y', MARGIN.top + 128)
      .text('Drag a highlighted point or the slider');

    const status = svg
      .append('text')
      .attr('class', 'ic-dimpvis-status')
      .attr('x', MARGIN.left + PLOT_WIDTH + 22)
      .attr('y', MARGIN.top + 150);

    const slider = svg.append('g').attr('transform', `translate(${MARGIN.left},${SLIDER_Y})`);
    slider.append('line').attr('class', 'ic-dimpvis-slider-track').attr('x1', 0).attr('x2', PLOT_WIDTH).attr('y1', 0).attr('y2', 0);

    slider
      .selectAll('line.ic-dimpvis-slider-tick')
      .data(YEARS)
      .join('line')
      .attr('class', 'ic-dimpvis-slider-tick')
      .attr('x1', (_, index) => sliderScale(index))
      .attr('x2', (_, index) => sliderScale(index))
      .attr('y1', -7)
      .attr('y2', 7);

    slider
      .selectAll('text.ic-dimpvis-slider-label')
      .data(YEARS)
      .join('text')
      .attr('class', 'ic-dimpvis-slider-label')
      .attr('x', (_, index) => sliderScale(index))
      .attr('y', 24)
      .attr('text-anchor', 'middle')
      .text((year) => year);

    slider
      .append('rect')
      .attr('class', 'ic-dimpvis-slider-hit')
      .attr('x', -10)
      .attr('y', -16)
      .attr('width', PLOT_WIDTH + 20)
      .attr('height', 32)
      .attr('fill', 'transparent');

    const sliderHandle = slider.append('circle').attr('class', 'ic-dimpvis-slider-handle').attr('r', 8);

    const selected = { value: 'India' };
    const state = { leftIndex: 0, rightIndex: 1, t: 0 };

    function screenPath(series: CountrySeries) {
      return series.frames.map((frame) => [xScale(frame.fertility), yScale(frame.life)] as [number, number]);
    }

    function activeSeries() {
      return SERIES.find((series) => series.name === selected.value) ?? SERIES[0];
    }

    function setProgress(progress: number) {
      const nextState = progressToState(progress);
      state.leftIndex = nextState.leftIndex;
      state.rightIndex = nextState.rightIndex;
      state.t = nextState.t;
      draw();
    }

    function snapToNearestYear() {
      const left = state.leftIndex;
      const right = state.rightIndex;
      const targetIndex = state.t >= 0.5 ? right : left;
      state.leftIndex = Math.min(targetIndex, YEARS.length - 2);
      state.rightIndex = Math.min(state.leftIndex + 1, YEARS.length - 1);
      state.t = targetIndex === YEARS.length - 1 ? 1 : 0;
      draw();
    }

    function draw() {
      const currentSeries = activeSeries();
      const currentYear = lerp(YEARS[state.leftIndex], YEARS[state.rightIndex], state.t);
      const progress = state.leftIndex + state.t;
      const interpolated = SERIES.map((series) => ({
        ...series,
        frame: interpolateFrame(series, state.leftIndex, state.rightIndex, state.t),
      }));

      yearStamp.text(currentYear.toFixed(1));
      status.text(`${currentSeries.name} — ${currentYear.toFixed(1)}`);

      const selectedPath = screenPath(currentSeries);
      pathLayer
        .selectAll('path')
        .data([selectedPath])
        .join('path')
        .attr('class', 'ic-dimpvis-path')
        .attr('d', line<[number, number]>()(selectedPath));

      pathLayer
        .selectAll('text.ic-dimpvis-path-label')
        .data(currentSeries.frames.map((frame, index) => ({
          frame,
          point: selectedPath[index],
        })))
        .join('text')
        .attr('class', 'ic-dimpvis-path-label')
        .attr('x', (datum) => datum.point[0] + 6)
        .attr('y', (datum) => datum.point[1] - 7)
        .text((datum) => String(datum.frame.year));

      const circles = pointsLayer
        .selectAll<SVGCircleElement, (typeof interpolated)[number]>('circle')
        .data(interpolated, (datum) => datum.name)
        .join('circle')
        .attr('class', (datum) => datum.name === currentSeries.name ? 'ic-dimpvis-point is-active' : 'ic-dimpvis-point')
        .attr('cx', (datum) => xScale(datum.frame.fertility))
        .attr('cy', (datum) => yScale(datum.frame.life))
        .attr('r', (datum) => radiusScale(Math.sqrt(datum.frame.population)))
        .attr('fill', (datum) => colorScale(datum.region))
        .attr('stroke', (datum) => datum.name === currentSeries.name ? '#1f2328' : '#ffffff')
        .attr('stroke-width', (datum) => datum.name === currentSeries.name ? 2.2 : 1.2)
        .style('cursor', 'grab');

      circles.classed('is-muted', (datum) => datum.name !== currentSeries.name);

      focusLayer
        .selectAll('text')
        .data([{
          x: xScale(interpolateFrame(currentSeries, state.leftIndex, state.rightIndex, state.t).fertility),
          y: yScale(interpolateFrame(currentSeries, state.leftIndex, state.rightIndex, state.t).life),
          label: currentSeries.name,
        }])
        .join('text')
        .attr('class', 'ic-dimpvis-focus-label')
        .attr('x', (datum) => datum.x + 10)
        .attr('y', (datum) => datum.y - 12)
        .text((datum) => datum.label);

      sliderHandle.attr('cx', sliderScale(progress)).attr('cy', 0);

      circles.on('click', (_, datum) => {
        selected.value = datum.name;
        draw();
      });
    }

    const pointDrag = drag<SVGCircleElement, { name: string }>()
      .on('start', (_, datum) => {
        selected.value = datum.name;
        draw();
      })
      .on('drag', (event) => {
        const currentSeries = activeSeries();
        const projection = projectToPolyline([event.x, event.y], screenPath(currentSeries));
        setProgress(projection.progress);
      })
      .on('end', () => {
        snapToNearestYear();
      });

    const sliderDrag = drag<SVGCircleElement, unknown>()
      .on('drag', (event) => {
        setProgress(sliderScale.invert(event.x));
      })
      .on('end', () => {
        snapToNearestYear();
      });

    slider.select<SVGRectElement>('rect.ic-dimpvis-slider-hit')
      .on('click', (event) => {
        const [x] = pointer(event, slider.node());
        setProgress(sliderScale.invert(x));
        snapToNearestYear();
      });

    draw();
    pointsLayer.selectAll<SVGCircleElement, { name: string }>('circle').call(pointDrag as any);
    sliderHandle.call(sliderDrag as any).style('cursor', 'ew-resize');

    return () => {
      svg.remove();
    };
  }, []);

  return (
    <div className="ic-stage-stack">
      <div className="ic-stage-meta">
        <strong>Direct manipulation + interpolation</strong>
        <span>
          This one stays entirely in D3. Drag the highlighted country along its trajectory, or scrub the slider to
          interpolate the whole scatterplot state between yearly snapshots.
        </span>
      </div>
      <div className="ic-dimpvis-shell" ref={mountRef} />
    </div>
  );
}
