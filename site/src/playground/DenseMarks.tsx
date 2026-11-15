import { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import uis from '../data/uis-completion.json';
import './dense-marks.css';

/**
 * Many lines and many dots, drawn twice: by hand in D3 and by Flint from a plain spec, to see where
 * Flint's layout and themes fall short of a hand-tuned chart. Data: UNESCO UIS upper secondary
 * completion, 164 countries, 2000–2025.
 */

interface Series { country: string; region: string; values: [number, number][] }
interface Latest { country: string; region: string; completion: number; girls: number; boys: number }
const SERIES = uis.series as Series[];
const LATEST = uis.latest as Latest[];
const REGIONS = [...new Set(LATEST.map((d) => d.region))].sort();
const COLORS = d3.scaleOrdinal<string, string>().domain(REGIONS).range(d3.schemeTableau10);

const W = 560;
const H = 360;

function D3Lines() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = d3.select(ref.current!);
    svg.selectAll('*').remove();
    const m = { top: 12, right: 200, bottom: 28, left: 34 };
    const x = d3.scaleLinear().domain([2000, 2025]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([H - m.bottom, m.top]);
    svg.append('g').attr('class', 'dm-grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.left).attr('x2', W - m.right).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${H - m.bottom})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.format('d')).tickSizeOuter(0)).attr('class', 'dm-axis');
    svg.append('g').attr('transform', `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickFormat((v) => `${v}%`).tickSize(0)).attr('class', 'dm-axis dm-axis-y');
    const line = d3.line<[number, number]>().x((d) => x(d[0])).y((d) => y(d[1]));
    // Every country thin and faint: the cloud shows spread; no one line claims attention.
    const multi = SERIES.filter((s) => s.values.length > 1);
    svg.append('g').selectAll('path').data(multi).join('path')
      .attr('d', (s) => line(s.values)).attr('fill', 'none')
      .attr('stroke', (s) => COLORS(s.region)).attr('stroke-width', 0.8).attr('stroke-opacity', 0.35);
    // A country with one year has no line; it is a dot.
    svg.append('g').selectAll('circle').data(SERIES.filter((s) => s.values.length === 1)).join('circle')
      .attr('cx', (s) => x(s.values[0][0])).attr('cy', (s) => y(s.values[0][1])).attr('r', 1.8)
      .attr('fill', (s) => COLORS(s.region)).attr('fill-opacity', 0.6);
    // Each region's median on top, thick, labelled at its end instead of a legend.
    const medians = REGIONS.map((region) => {
      const members = multi.filter((s) => s.region === region);
      const years = d3.range(2000, 2026);
      return { region, values: years.map((yr) => [yr, d3.median(members, (s) => s.values.find((v) => v[0] === yr)?.[1]) ?? NaN] as [number, number]).filter((v) => !Number.isNaN(v[1])) };
    });
    svg.append('g').selectAll('path').data(medians).join('path')
      .attr('d', (s) => line(s.values)).attr('fill', 'none').attr('stroke', (s) => COLORS(s.region)).attr('stroke-width', 2.4);
    // Labels at the line ends, nudged apart so none overlap.
    const ends = medians.map((s) => ({ region: s.region, y: y(s.values[s.values.length - 1][1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + 11);
    svg.append('g').selectAll('text').data(ends).join('text')
      .attr('x', W - m.right + 6).attr('y', (d) => d.y).attr('dy', '0.32em').attr('class', 'dm-end-label')
      .attr('fill', (d) => COLORS(d.region)).text((d) => d.region);
  }, []);
  return <svg ref={ref} width={W} height={H} role="img" aria-label="Completion over time, one line per country, D3" />;
}

function D3Dots() {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = d3.select(ref.current!);
    svg.selectAll('*').remove();
    const m = { top: 72, right: 16, bottom: 40, left: 44 };
    const x = d3.scaleLinear().domain([0, 100]).range([m.left, W - m.right]);
    const y = d3.scaleLinear().domain([0, 100]).range([H - m.bottom, m.top]);
    svg.append('g').attr('class', 'dm-grid').selectAll('line').data(y.ticks(5)).join('line')
      .attr('x1', m.left).attr('x2', W - m.right).attr('y1', y).attr('y2', y);
    svg.append('g').attr('transform', `translate(0,${H - m.bottom})`).call(d3.axisBottom(x).ticks(5).tickSizeOuter(0)).attr('class', 'dm-axis');
    svg.append('g').attr('transform', `translate(${m.left},0)`).call(d3.axisLeft(y).ticks(5).tickSize(0)).attr('class', 'dm-axis dm-axis-y');
    svg.append('text').attr('x', W - m.right).attr('y', H - 6).attr('text-anchor', 'end').attr('class', 'dm-axis-title').text("Girls' completion, %");
    svg.append('text').attr('x', m.left - 30).attr('y', m.top - 12).attr('class', 'dm-axis-title').text("Boys' completion, %");
    // The question is "who is ahead": the parity line and its two sides, named on the plot.
    svg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(100)).attr('y2', y(100)).attr('class', 'dm-parity');
    svg.append('text').attr('x', x(20)).attr('y', y(62)).attr('class', 'dm-note').text('boys ahead');
    svg.append('text').attr('x', x(62)).attr('y', y(18)).attr('class', 'dm-note').text('girls ahead');
    // Small dots with a white ring: overlaps still read as separate points in the crowded corner.
    svg.append('g').selectAll('circle').data(LATEST).join('circle')
      .attr('cx', (d) => x(d.girls)).attr('cy', (d) => y(d.boys)).attr('r', 3.2)
      .attr('fill', (d) => COLORS(d.region)).attr('fill-opacity', 0.85).attr('stroke', '#fff').attr('stroke-width', 0.7);
    // A one-line key above the plot.
    const key = svg.append('g').attr('transform', `translate(${m.left},10)`);
    let kx = 0;
    let ky = 0;
    for (const region of REGIONS) {
      const width = region.length * 5.2 + 18;
      if (kx + width > W - m.left - m.right) { kx = 0; ky += 13; }
      key.append('circle').attr('cx', kx + 4).attr('cy', ky).attr('r', 3.2).attr('fill', COLORS(region));
      key.append('text').attr('x', kx + 11).attr('y', ky).attr('dy', '0.32em').attr('class', 'dm-key').text(region);
      kx += width;
    }
  }, []);
  return <svg ref={ref} width={W} height={H} role="img" aria-label="Girls' vs boys' completion, 2025, D3" />;
}

const LINE_ROWS = SERIES.flatMap((s) => s.values.map(([year, completion]) => ({ country: s.country, region: s.region, year, completion })));

type ThemeChoice = ChartAssemblyInput['theme_spec'] | undefined;

function lineInput(theme: ThemeChoice): ChartAssemblyInput {
  return {
    data: { values: LINE_ROWS },
    semantic_types: { year: 'Year', completion: 'Percentage', region: 'Category', country: 'Country' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'year', y: 'completion', color: 'region', detail: 'country' }, canvasSize: { width: W, height: H } },
    ...(theme ? { theme_spec: theme } : {}),
  } as ChartAssemblyInput;
}

function dotInput(theme: ThemeChoice): ChartAssemblyInput {
  return {
    data: { values: LATEST },
    semantic_types: { girls: 'Percentage', boys: 'Percentage', region: 'Category', country: 'Country' },
    chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'girls', y: 'boys', color: 'region', detail: 'country' }, canvasSize: { width: W, height: H } },
    ...(theme ? { theme_spec: theme } : {}),
  } as ChartAssemblyInput;
}

const ECONOMIST_HALO = { extends: 'economist', geometry: { point: { halo: { presence: 'full', width: 1 } } } };

const THEMES: { key: string; label: string; spec: ThemeChoice }[] = [
  { key: 'none', label: 'No theme', spec: undefined },
  { key: 'economist', label: 'Economist', spec: 'economist' },
  { key: 'economist-halo', label: 'Economist + halo', spec: ECONOMIST_HALO as ThemeChoice },
  { key: 'nyt', label: 'NYT', spec: 'nyt' },
  { key: 'datawrapper', label: 'Datawrapper', spec: 'datawrapper' },
];

export function DenseMarks() {
  const [themeKey, setThemeKey] = useState('none');
  const choice = THEMES.find((t) => t.key === themeKey) ?? THEMES[0];
  const lines = useMemo(() => lineInput(choice.spec), [choice]);
  const dots = useMemo(() => dotInput(choice.spec), [choice]);
  return (
    <div className="dev-page dm-page">
      <header className="dev-page-heading dm-heading">
        <h1>Dense marks: D3 vs Flint</h1>
        <p>164 countries, UNESCO UIS completion rates. Left: D3 by hand. Right: Flint from a plain spec.</p>
      </header>

      <nav className="dm-tabs" aria-label="Flint theme">
        {THEMES.map((t) => (
          <button key={t.key} type="button" className={t.key === themeKey ? 'is-on' : ''} onClick={() => setThemeKey(t.key)}>Flint: {t.label}</button>
        ))}
      </nav>

      <section className="dm-row">
        <figure><figcaption>D3, by hand</figcaption><D3Lines /></figure>
        <figure><figcaption>Flint · {choice.label}</figcaption><FlintView key={`l-${themeKey}`} spec={lines} renderer="svg" /></figure>
      </section>
      <section className="dm-row">
        <figure><figcaption>D3, by hand</figcaption><D3Dots /></figure>
        <figure><figcaption>Flint · {choice.label}</figcaption><FlintView key={`d-${themeKey}`} spec={dots} renderer="svg" /></figure>
      </section>
    </div>
  );
}
