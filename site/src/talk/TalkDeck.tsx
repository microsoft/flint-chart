import { isValidElement, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SLIDES, type SlideDef } from './slides';
import './talk.css';

const PANEL_WIDTH = 272;
const PANEL_KEY = 'flint-talk-panel';

/** The text of a slide's first h1 or h2, read from its element tree without mounting it. */
function headingText(node: ReactNode): string | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = headingText(child);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === 'h1' || node.type === 'h2') return plainText(node.props.children);
  return headingText(node.props.children);
}

function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(plainText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) return plainText(node.props.children);
  return '';
}

interface Group { name: string; slides: { slide: SlideDef; index: number; title: string }[] }

function groupSlides(): Group[] {
  const groups: Group[] = [];
  SLIDES.forEach((slide, index) => {
    if (slide.section || groups.length === 0) groups.push({ name: slide.section ?? '', slides: [] });
    groups[groups.length - 1].slides.push({ slide, index, title: headingText(slide.render()) ?? slide.id });
  });
  return groups;
}

function readPanel(): boolean {
  try { return localStorage.getItem(PANEL_KEY) !== 'closed'; } catch { return true; }
}

function writePanel(open: boolean) {
  try { localStorage.setItem(PANEL_KEY, open ? 'open' : 'closed'); } catch { /* storage unavailable */ }
}

/**
 * The talk deck, at #/talk. Arrow keys, the slide panel, or `?s=N` move between slides;
 * `?all` stacks every slide at full size, for review and the overflow check.
 */
export function TalkDeck() {
  const [params, setParams] = useSearchParams();
  const all = params.has('all');
  const outline = params.has('outline');
  const [index, setIndex] = useState(() => Math.max(0, Math.min(SLIDES.length - 1, Number(params.get('s') ?? 1) - 1)));
  const [panel, setPanel] = useState(readPanel);
  const [scale, setScale] = useState(1);
  const groups = useMemo(groupSlides, []);
  const current = useRef<HTMLButtonElement | null>(null);
  const showPanel = panel && !all;

  useEffect(() => {
    const fit = () => {
      const width = window.innerWidth - (showPanel ? PANEL_WIDTH : 0);
      setScale(Math.min(width / 1600, window.innerHeight / 900));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [showPanel]);

  useEffect(() => { current.current?.scrollIntoView({ block: 'nearest' }); }, [index, showPanel]);

  const go = useCallback((next: number) => {
    const i = Math.max(0, Math.min(SLIDES.length - 1, next));
    setIndex(i);
    setParams({ s: String(i + 1) }, { replace: true });
  }, [setParams]);

  const togglePanel = useCallback((open: boolean) => {
    setPanel(open);
    writePanel(open);
  }, []);

  useEffect(() => {
    if (all) return;
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', 'PageDown', ' '].includes(e.key)) { e.preventDefault(); go(index + 1); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); go(index - 1); }
      if (e.key === 'Home') go(0);
      if (e.key === 'End') go(SLIDES.length - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [all, go, index]);

  const shown = all ? SLIDES : [SLIDES[index]];
  return (
    <div className={`talk${all ? ' is-all' : ''}${outline ? ' is-outline' : ''}`} style={{ ['--talk-scale' as string]: scale }}>
      {showPanel && (
        <aside className="talk-panel" aria-label="Slides" style={{ width: PANEL_WIDTH }}>
          <div className="talk-panel-head">
            <span className="talk-panel-title">Slides <span className="talk-panel-count">{SLIDES.length}</span></span>
            <button type="button" className="talk-panel-btn" aria-label="Hide slides" onClick={() => togglePanel(false)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
            </button>
          </div>
          <nav className="talk-panel-list">
            {groups.map((group) => (
              <div key={group.slides[0].slide.id}>
                {group.name && <div className="talk-panel-group">{group.name}</div>}
                {group.slides.map(({ slide, index: i, title }) => (
                  <button
                    key={slide.id}
                    ref={i === index ? current : undefined}
                    type="button"
                    className={`talk-thumb${i === index ? ' is-current' : ''}`}
                    aria-current={i === index ? 'true' : undefined}
                    aria-label={`Slide ${i + 1}: ${title}`}
                    onClick={() => go(i)}
                  >
                    <span className="talk-thumb-n">{i + 1}</span>
                    <span className={`talk-thumb-card${slide.kind || slide.section ? ' is-heading' : ''}`}>
                      <span className="talk-thumb-title">{title}</span>
                      {!(slide.kind || slide.section) && <span className="talk-thumb-body"><span /><span /></span>}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="talk-panel-foot">Arrow keys also move between slides</div>
        </aside>
      )}
      <div className="talk-stage">
        {shown.map((slide) => (
          <section key={slide.id} className={`talk-slide${slide.kind ? ` is-${slide.kind}` : ''}`} data-slide={slide.id}>
            {slide.render()}
          </section>
        ))}
        {!all && <div className="talk-position">{index + 1} / {SLIDES.length}</div>}
      </div>
      {!all && !panel && (
        <button type="button" className="talk-panel-tab" aria-label="Show slides" onClick={() => togglePanel(true)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
        </button>
      )}
    </div>
  );
}
