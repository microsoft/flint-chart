import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
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
  const [started, setStarted] = useState(false);
  const [index, setIndex] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [activeKey, setActiveKey] = useState('');
  const [pressSerial, setPressSerial] = useState(0);
  const [transitioning, setTransitioning] = useState<false | 'intro' | 'example'>(false);
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
    setTransitioning('example');
    setStatus('loading');
    setIndex(-1);
    setActiveKey('');
    setSelected(next);
  };

  useEffect(() => {
    if (!transitioning) return;
    if (status === 'error') { setTransitioning(false); return; }
    if (status !== 'ready') return;
    if (transitioning === 'intro' && !playing) return;
    const timer = window.setTimeout(() => setTransitioning(false), transitioning === 'intro' ? 2000 : 1400);
    return () => window.clearTimeout(timer);
  }, [transitioning, selected, status, playing]);

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
  const advance = () => {
    if (status !== 'ready' || transitioning) return;
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
    if (!playing || status !== 'ready' || transitioning) return;
    const timer = window.setTimeout(advance, (index < 0 ? 1000 : 1500) / speed);
    return () => window.clearTimeout(timer);
  }, [playing, index, speed, status, demo, selected, transitioning]);

  useEffect(() => {
    const pause = () => { if (document.hidden) setPlaying(false); };
    document.addEventListener('visibilitychange', pause);
    return () => document.removeEventListener('visibilitychange', pause);
  }, []);

  const togglePlayback = () => {
    if (!playing && (!started || (selected === demos.length - 1 && index + 1 >= demo.steps.length))) {
      setStarted(true);
      reset();
      setTransitioning('intro');
    }
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
          {playing ? <Pause size={18} /> : <Play size={18} />}<span>{playing ? 'Pause' : 'Play'}</span>
        </button>
        <button type="button" onClick={() => { setPlaying(false); setStarted(false); if (selected === 0) { setTransitioning(false); reset(); } else selectExample(0); }} disabled={status !== 'ready'} title="Restart all examples" aria-label="Restart walkthrough"><RotateCcw size={18} /></button>
        <button type="button" onClick={() => { setPlaying(false); advance(); }} disabled={status !== 'ready' || !!transitioning || (selected === demos.length - 1 && index + 1 >= demo.steps.length)} title="Next key" aria-label="Next key"><SkipForward size={18} /></button>
        <label>Speed <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Playback speed">
          {[0.5, 1, 1.5, 2].map(value => <option key={value} value={value}>{value}x</option>)}
        </select></label>
      </div>
      <div className="accessibility-tabs" role="group" aria-label="Chart examples">
        {demos.map((example, exampleIndex) => <button key={example.id} type="button" aria-pressed={selected === exampleIndex} onClick={() => { setPlaying(false); setStarted(false); selectExample(exampleIndex); }}>{example.label}</button>)}
      </div>
    </div>
    <progress className="accessibility-progress" aria-label="Walkthrough progress" value={index + 1} max={demo.steps.length} />
    <div className="accessibility-player">
      {transitioning && <div key={`${demo.id}-${transitioning}`} className="accessibility-transition" role="status">
        {transitioning === 'intro' ? <>
          <h3>Flint Accessibility Demo</h3>
          <p>Example {selected + 1}: {demo.title}</p>
        </> : <>
          <span>Next chart</span>
          <h3>{demo.label}</h3>
          <p>{demo.title}</p>
        </>}
      </div>}
      <div className={`accessibility-scene${transitioning ? ' is-transitioning' : ''}`} aria-hidden={transitioning ? true : undefined}>
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