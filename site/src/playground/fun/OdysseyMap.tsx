import { useMemo, useState } from 'react';
import { DEFAULT_LOOK, OdysseyStoryStage, odysseyOpeningUpdates, odysseySpec, type OdysseyLook } from '../OdysseyStoryStage';
import { specText } from '../stories/MapStoryStage';
import './odyssey-map.css';
import { SpecDetails } from './SpecDetails';

/**
 * The look the Greek stories are drawn in, and the controls to try others: grounds, palettes, houses
 * and how the routes are drawn. One look for every story on the page.
 */

type Ground = 'calm' | 'atlas' | 'light' | 'muted' | 'dark' | 'minimal' | 'auto' | 'custom';

const GROUNDS: { value: Ground; label: string }[] = [
  { value: 'atlas', label: 'Atlas (the demo’s own)' },
  { value: 'calm', label: 'Calm (soft sea, pale land)' },
  { value: 'light', label: 'Light' },
  { value: 'muted', label: 'Muted' },
  { value: 'dark', label: 'Dark' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'auto', label: 'From the theme' },
  { value: 'custom', label: 'Custom colours…' },
];

const PALETTES: Record<string, { label: string; inks?: readonly string[] }> = {
  story: { label: 'Each story’s own', inks: DEFAULT_LOOK.legInks },
  ember: { label: 'Embers (dark red → gold)', inks: ['#7a1f1f', '#b23a2a', '#d9622b', '#ec9a3a', '#f4c95d'] },
  sea: { label: 'Bronze to sea', inks: ['#8a3b12', '#b8641a', '#7d1f2b', '#4a3f7a', '#1d5c7a'] },
  viridis: { label: 'Viridis', inks: ['#440154', '#3b528b', '#21918c', '#5ec962', '#c2a91a'] },
  tableau: { label: 'Tableau', inks: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f'] },
  house: { label: 'The house’s own' },
};

const THEMES = ['', 'nyt', 'economist', 'swiss', 'datawrapper', 'apple', 'bbc', 'powerbi'];
/** The houses whose page is dark: a ground left to them has dark water. */
const DARK_THEMES = new Set(['powerbi']);

const CURVES: OdysseyLook['curve'][] = ['auto', 'arc', 'great-circle', 'straight'];
const BORDER_WIDTHS = ['', '0', '0.5', '1', '1.5', '2'];
const STOP_RADII = ['', '2', '3', '4', '5', '6', '8'];

/** The calm ground the demo first had: atlas with a softer sea and paler land. */
const CALM: Record<string, string> = { base: 'atlas', sea: '#d3e3ed', land: '#f7f6f2', coast: '#a9bdcb', border: '#dcd8cf' };
const CUSTOM_KEYS = ['sea', 'land', 'coast', 'border'] as const;
type Custom = Record<(typeof CUSTOM_KEYS)[number], string>;

function isDark(hex: string): boolean {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 110;
}

/** The sea names read on the water the ground paints, or on the page where it paints none. */
function seaLabelFor(ground: Ground, custom: Custom, theme: string): OdysseyLook['seaLabel'] {
  const onWater = (water: string) => (isDark(water) ? { fill: '#b9c8d4', halo: water } : { fill: '#5f7d92', halo: water });
  if (ground === 'calm') return onWater(CALM.sea);
  if (ground === 'atlas') return DEFAULT_LOOK.seaLabel;
  if (ground === 'dark') return onWater('#1d2227');
  if (ground === 'custom') return onWater(custom.sea);
  return DARK_THEMES.has(theme) ? onWater('#252423') : { fill: '#6f7f8c', halo: '#ffffff' };
}

/** The spec as JSON, a data row to a line, with the updates that open the story. */
function odysseySpecText(look: OdysseyLook): string {
  return specText({ ...odysseySpec(look), updates: odysseyOpeningUpdates(look) });
}

/** The look the page draws its stories in, and the controls that set it. `own` says the palette is each story's own. */
export function useStoryLook(): { look: OdysseyLook; own: boolean; controls: JSX.Element } {
  const [ground, setGround] = useState<Ground>('atlas');
  const [custom, setCustom] = useState<Custom>({ sea: CALM.sea, land: CALM.land, coast: CALM.coast, border: CALM.border });
  const [palette, setPalette] = useState('story');
  const [theme, setTheme] = useState(DEFAULT_LOOK.theme ?? '');
  const [curve, setCurve] = useState<OdysseyLook['curve']>('auto');
  const [arrows, setArrows] = useState(true);
  const [graticule, setGraticule] = useState(false);
  const [borderWidth, setBorderWidth] = useState(String(DEFAULT_LOOK.borderWidth ?? ''));
  const [stops, setStops] = useState(DEFAULT_LOOK.stops);
  const [stopRadius, setStopRadius] = useState('');

  const look = useMemo<OdysseyLook>(() => ({
    mapStyle: ground === 'calm' ? CALM : ground === 'custom' ? { base: 'atlas', ...custom } : ground,
    ...(PALETTES[palette].inks ? { legInks: PALETTES[palette].inks } : {}),
    ...(theme ? { theme } : {}),
    curve,
    arrows,
    graticule,
    ...(borderWidth !== '' ? { borderWidth: Number(borderWidth) } : {}),
    stops,
    ...(stopRadius !== '' ? { stopRadius: Number(stopRadius) } : {}),
    seaLabel: seaLabelFor(ground, custom, theme),
  }), [ground, custom, palette, theme, curve, arrows, graticule, borderWidth, stops, stopRadius]);

  const controls = (
      <details className="story-looks" open>
        <summary><span>Map look, for every story</span></summary>
        <div className="odyssey-lab-controls">
          <label className="odyssey-lab-field">
            <span>Ground (mapStyle)</span>
            <select value={ground} onChange={(event) => setGround(event.target.value as Ground)}>
              {GROUNDS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="odyssey-lab-field">
            <span>Legs (color.scheme)</span>
            <select value={palette} onChange={(event) => setPalette(event.target.value)}>
              {Object.entries(PALETTES).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}
            </select>
            <div className="odyssey-lab-palette">
              {(PALETTES[palette].inks ?? []).map((ink) => <i key={ink} style={{ background: ink }} />)}
            </div>
          </label>
          <label className="odyssey-lab-field">
            <span>Theme (theme_spec)</span>
            <select value={theme} onChange={(event) => setTheme(event.target.value)}>
              {THEMES.map((id) => <option key={id} value={id}>{id || 'None'}</option>)}
            </select>
          </label>
          <label className="odyssey-lab-field">
            <span>Route curve</span>
            <select value={curve} onChange={(event) => setCurve(event.target.value as OdysseyLook['curve'])}>
              {CURVES.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="odyssey-lab-field">
            <span>Border width</span>
            <select value={borderWidth} onChange={(event) => setBorderWidth(event.target.value)}>
              {BORDER_WIDTHS.map((value) => <option key={value} value={value}>{value || 'Style’s own'}</option>)}
            </select>
          </label>
          <label className="odyssey-lab-field">
            <span>Stop radius</span>
            <select value={stopRadius} disabled={stops === 'none'} onChange={(event) => setStopRadius(event.target.value)}>
              {STOP_RADII.map((value) => <option key={value} value={value}>{value || 'Auto (one size)'}</option>)}
            </select>
          </label>
          <label className="odyssey-lab-field">
            <span>Stops</span>
            <select value={stops} onChange={(event) => setStops(event.target.value as OdysseyLook['stops'])}>
              <option value="ends">ends: each chapter's start and end</option>
              <option value="all">all: every stop</option>
              <option value="none">none</option>
            </select>
          </label>
          <div className="odyssey-lab-toggles">
            <label><input type="checkbox" checked={arrows} onChange={(event) => setArrows(event.target.checked)} />Arrows</label>
            <label><input type="checkbox" checked={graticule} onChange={(event) => setGraticule(event.target.checked)} />Graticule</label>
          </div>
          {ground === 'custom' && (
            <div className="odyssey-lab-swatches">
              {CUSTOM_KEYS.map((key) => (
                <label key={key}>
                  <input type="color" value={custom[key]} onChange={(event) => setCustom((current) => ({ ...current, [key]: event.target.value }))} />
                  {key}
                </label>
              ))}
            </div>
          )}
        </div>
      </details>
  );
  return { look, own: palette === 'story', controls };
}

/** The Odyssey's story in a look, and its spec. */
export function OdysseyStory({ look }: { look: OdysseyLook }) {
  const text = useMemo(() => odysseySpecText(look), [look]);
  return (
    <>
      <OdysseyStoryStage look={look} />
      <SpecDetails text={text} />
    </>
  );
}
