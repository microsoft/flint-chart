import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, Pause, Play, RotateCcw } from 'lucide-react';
import type { ChartAssemblyInput } from 'flint-chart';
import { accessibleNavigation, buildInteractiveChart } from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { interactionCases } from './ClickFocusLab';

type Demo = { id: string; label: string; title: string; input: ChartAssemblyInput; steps: [key: string, action: string][] };
const stageDocumentHtml = '<!doctype html><html lang="en"><head><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#fff}body{font-family:Segoe UI,sans-serif}svg{display:block}</style></head><body></body></html>';

function interactionDemo(chartType: string, title: string, subtitle: string, id?: string): ChartAssemblyInput {
  const source = interactionCases.find(example => id ? example.id === id : example.chartType === chartType);
  if (!source) throw new Error(`Missing interaction example: ${id ?? chartType}`);
  return {
    ...source.input,
    theme_spec: 'powerbi-light',
    chart_spec: {
      ...source.input.chart_spec,
      title,
      subtitle,
      baseSize: chartType === 'Radar Chart' ? { width: 410, height: 320 } : { width: 520, height: 300 },
    },
  };
}

const demos: Demo[] = [
  {
    id: 'scatter', label: 'Scatter plot', title: 'Countries: continent and population',
    input: interactionDemo('Scatter Plot', 'Countries: continent and population', 'GDP per capita and life expectancy; size indicates population band', 'scatter-color-size'),
    steps: [
      ['Tab', 'focus chart'], ['Enter', 'enter chart'],
      ['ArrowRight', 'next section'], ['ArrowRight', 'next section'],
      ['ArrowRight', 'next section'], ['ArrowRight', 'next section'], ['Enter', 'enter points'],
      ['ArrowRight', 'next point'], ['ArrowRight', 'next point'], ['ArrowRight', 'next point'],
      ['ArrowLeft', 'previous point'], ['ArrowLeft', 'previous point'], ['ArrowRight', 'next point'],
      ['Escape', 'back to data'],
    ],
  },
  {
    id: 'pyramid', label: 'Pyramid', title: 'U.S. population, 2020',
    input: interactionDemo('Pyramid Chart', 'U.S. population, 2020', 'Population in millions by age and sex; U.S. Census'),
    steps: [
      ['Tab', 'focus chart'], ['Enter', 'enter chart'],
      ['ArrowDown', 'next section'], ['ArrowDown', 'next section'],
      ['ArrowDown', 'next section'],
      ['Enter', 'enter panels'], ['Enter', 'enter bars'],
      ['ArrowDown', 'next bar'], ['ArrowDown', 'next bar'], ['ArrowDown', 'next bar'],
      ['ArrowUp', 'previous bar'], ['ArrowUp', 'previous bar'], ['Escape', 'back to panel'],
    ],
  },
  {
    id: 'line', label: 'Multi-series line', title: 'U.S. food prices',
    input: interactionDemo('Line Chart', 'U.S. food prices', 'Monthly average prices in USD; Bureau of Labor Statistics', 'inspect-index-line-multi'),
    steps: [
      ['Tab', 'focus chart'], ['Enter', 'enter chart'],
      ['ArrowRight', 'next section'], ['ArrowRight', 'next section'],
      ['ArrowRight', 'next section'],
      ['Enter', 'enter series'], ['Enter', 'enter points'], ['ArrowRight', 'next point'],
      ['Escape', 'back to series'], ['ArrowRight', 'next series'],
      ['Enter', 'enter points'], ['ArrowRight', 'next point'], ['Escape', 'back to series'],
      ['Escape', 'back to data'], ['Escape', 'back to chart'],
    ],
  },
  {
    id: 'radar', label: 'Radar chart', title: 'Food nutrient profiles',
    input: interactionDemo('Radar Chart', 'Food nutrient profiles', 'Almonds, oats, and Greek yogurt; grams per 100 g (USDA)'),
    steps: [
      ['Tab', 'focus chart'], ['Enter', 'enter chart'], ['ArrowRight', 'next section'],
      ['ArrowRight', 'next section'],
      ['ArrowRight', 'next section'], ['Enter', 'enter foods'], ['Enter', 'enter nutrients'],
      ['End', 'last nutrient'], ['Home', 'first nutrient'], ['End', 'last nutrient'],
      ['Escape', 'back to food'], ['End', 'last food'], ['Enter', 'enter nutrients'],
      ['End', 'last nutrient'], ['Home', 'first nutrient'], ['Escape', 'back to food'],
    ],
  },
];

const chartStarts = demos.map((_, index) => demos.slice(0, index)
  .reduce((total, chart) => total + chart.steps.length + 1, 0));
const lastStep = chartStarts[demos.length - 1] + demos[demos.length - 1].steps.length;
const playbackInterval = 1500;

function KeyDisplay({ value, active }: { value: string; active: boolean }) {
  const Icon = { ArrowLeft, ArrowRight, ArrowUp, ArrowDown, Enter: CornerDownLeft }[value];
  return <kbd data-key={value} className={active ? 'is-pressed' : undefined} aria-label={value} aria-current={active ? 'true' : undefined}>{Icon ? <Icon size={20} aria-hidden="true" /> : value === 'Escape' ? 'Esc' : value}</kbd>;
}

export function AccessibilityShowcase() {
  const [selected, setSelected] = useState(0);
  const demo = demos[selected];
  const hostRef = useRef<HTMLDivElement>(null);
  const [stageDocument, setStageDocument] = useState<Document | null>(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [playing, setPlaying] = useState(false);
  const [index, setIndex] = useState(-1);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [activeKey, setActiveKey] = useState('');
  const [pressSerial, setPressSerial] = useState(0);
  const position = seekTarget ?? chartStarts[selected] + index + 1;
  const demoKeys = new Set([
    'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
    ...demo.steps.map(([key]) => key),
  ]);
  const visibleKeys = ['Escape', 'Tab', 'Enter', 'Home', 'ArrowUp', 'End', 'ArrowLeft', 'ArrowDown', 'ArrowRight']
    .filter(key => demoKeys.has(key));

  useEffect(() => {
    if (!stageDocument) return;
    const host = hostRef.current!;
    setStatus('loading');
    setError('');
    setIndex(-1);
    setActiveKey('');
    let disposed = false;
    let surface: ReturnType<typeof buildInteractiveChart> | undefined;
    try {
      surface = buildInteractiveChart(host, demo.input, {
        backend: 'vegalite', renderer: 'svg', expressionInterpreter,
        interactions: [accessibleNavigation()], ariaLabel: demo.title,
      });
      void surface.ready.then(() => {
        if (disposed) return;
        if (!host.querySelector('[data-flint-accessible-focus]')) throw new Error('Accessible navigation is unavailable.');
        setStatus('ready');
      }).catch((reason: unknown) => {
        if (!disposed) { setStatus('error'); setError(String(reason)); }
      });
    } catch (reason) {
      setStatus('error');
      setError(String(reason));
    }
    return () => { disposed = true; surface?.destroy(); };
  }, [demo, stageDocument]);

  const selectExample = (next: number) => {
    if (next === selected) return;
    hostRef.current?.querySelector<HTMLElement>('[data-flint-accessible-focus]')?.blur();
    setStatus('loading');
    setIndex(-1);
    setActiveKey('');
    setSelected(next);
  };

  const sendKey = (key: string) => {
    const proxy = hostRef.current?.querySelector<HTMLElement>('[data-flint-accessible-focus]');
    proxy?.focus({ preventScroll: true });
    if (key !== 'Tab') proxy?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };
  const reset = () => {
    for (let depth = 0; depth < 12; depth += 1) {
      if (hostRef.current?.querySelector<HTMLElement>('[data-flint-accessible-focus]')?.dataset.flintAccessibleFocus === 'chart') break;
      sendKey('Backspace');
    }
    setIndex(-1);
    setActiveKey('');
  };
  const seek = (target: number) => {
    setPlaying(false);
    setSeekTarget(target);
    const chartIndex = chartStarts.reduce((current, start, exampleIndex) => start <= target ? exampleIndex : current, 0);
    selectExample(chartIndex);
  };

  useEffect(() => {
    if (seekTarget === null || status !== 'ready') return;
    const targetIndex = seekTarget - chartStarts[selected] - 1;
    reset();
    for (let step = 0; step <= targetIndex; step += 1) sendKey(demo.steps[step][0]);
    setIndex(targetIndex);
    setActiveKey(targetIndex >= 0 ? demo.steps[targetIndex][0] : '');
    setPressSerial(previous => previous + 1);
    setSeekTarget(null);
  }, [seekTarget, status, demo, selected]);

  const advance = () => {
    if (status !== 'ready' || seekTarget !== null) return;
    if (index < 0) reset();
    const next = index + 1;
    if (next >= demo.steps.length) {
      if (selected + 1 < demos.length) selectExample(selected + 1);
      else setPlaying(false);
      return;
    }
    sendKey(demo.steps[next][0]);
    setActiveKey(demo.steps[next][0]);
    setPressSerial(previous => previous + 1);
    setIndex(next);
  };

  useEffect(() => {
    if (!playing || status !== 'ready' || seekTarget !== null) return;
    const timer = window.setTimeout(advance, index < 0 ? 3000 : playbackInterval);
    return () => window.clearTimeout(timer);
  }, [playing, index, status, demo, selected, seekTarget]);

  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const togglePlayback = () => {
    if (!playing && position === lastStep) seek(0);
    setPlaying(!playing);
  };

  return <section className="accessibility-showcase" id="accessible-navigation" aria-labelledby="accessibility-heading" tabIndex={-1}
    onBlur={(event) => {
      const target = event.relatedTarget as Node | null;
      if (target && !event.currentTarget.contains(target) && !stageDocument?.contains(target)) setPlaying(false);
    }}>
    <header className="release-demo-heading">
      <h2 id="accessibility-heading">Accessibility</h2>
      <p>Keyboard navigation across chart structure, data points, and series.</p>
    </header>
    <div className="accessibility-actions">
      <div className="accessibility-controls">
        <button type="button" className="accessibility-play" onClick={togglePlayback} disabled={status !== 'ready' && !playing} title={playing ? 'Pause' : 'Play'} aria-label={playing ? 'Pause walkthrough' : 'Play walkthrough'}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button type="button" onClick={() => seek(0)} disabled={!stageDocument} title="Reset walkthrough" aria-label="Reset walkthrough"><RotateCcw size={15} /></button>
      </div>
      <div className="accessibility-timeline">
        <input type="range" min={0} max={lastStep} step={1} value={position}
          aria-label="Walkthrough step" aria-valuetext={`${demo.label}, ${Math.max(0, position - chartStarts[selected])} of ${demo.steps.length} steps`}
          disabled={!stageDocument} onChange={event => seek(Number(event.target.value))}
          style={{ '--progress': `${position / lastStep * 100}%` } as React.CSSProperties} />
        <div className="accessibility-timeline-markers" aria-hidden="true">
          {demos.map((example, exampleIndex) => <span key={example.id} title={example.label}
            className={selected === exampleIndex ? 'is-current' : undefined}
            style={{ left: `${chartStarts[exampleIndex] / lastStep * 100}%` }}>
            {['Scatter', 'Pyramid', 'Line', 'Radar'][exampleIndex]}
          </span>)}
        </div>
      </div>
    </div>
    <div className="accessibility-player">
      {index < 0 && <div className="accessibility-intro" role="status">
        <span>Flint Interactive Accessibility Demonstration</span>
        <h3>({demo.label}) {demo.title}</h3>
      </div>}
      <div className={`accessibility-scene${index < 0 ? ' is-intro' : ''}`} aria-hidden={index < 0 ? true : undefined}>
        <div className="accessibility-key-display">
          <div className="accessibility-keyboard" role="group" aria-label="Walkthrough keys">
            {visibleKeys.map(key => <KeyDisplay key={`${key}-${key === activeKey ? pressSerial : 'idle'}`} value={key} active={key === activeKey} />)}
          </div>
          <span className="accessibility-key-action">{index >= 0 && demo.steps[index] ? `(${demo.steps[index][1]})` : ''}</span>
        </div>
        <div className="accessibility-stage" aria-busy={status === 'loading'}>
          {status === 'loading' && <div className="accessibility-loading" role="status" aria-label="Loading chart"><span /></div>}
          {error && <p role="alert">{error}</p>}
          <iframe className="accessibility-stage-frame" title={`${demo.title}: interactive chart`} srcDoc={stageDocumentHtml}
            onLoad={event => setStageDocument(event.currentTarget.contentDocument)} />
          {stageDocument && createPortal(<ScaleToFit height={560} padding={32}>
            <div ref={hostRef} className="accessibility-chart" style={{ width: 'max-content', position: 'relative' }} onPointerDown={() => setPlaying(false)}
              onKeyDown={(event) => {
                if (event.nativeEvent.isTrusted && !['Meta', 'Control', 'Alt', 'Shift'].includes(event.key)) {
                  setPlaying(false); setIndex(-1); setActiveKey(event.key); setPressSerial(previous => previous + 1);
                }
              }} />
          </ScaleToFit>, stageDocument.body)}
        </div>
      </div>
    </div>
  </section>;
}