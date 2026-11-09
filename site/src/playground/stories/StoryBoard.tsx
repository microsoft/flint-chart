import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import './story-board.css';

/** A chapter as the board shows it: its title, its story, and the ink of the stretch it follows. */
export interface BoardChapter {
  title: string;
  text: string;
  /** The colour of the stretch the chapter follows; unset for a chapter over the whole story. */
  ink?: string;
}

/**
 * A story told beside its map: a timeline of the chapters across the top — each a node in its
 * stretch's colour, the chapters over the whole story hollow — and under it the open chapter's card
 * beside the map, the card centred on the map so the two sides balance. ← and → turn the chapters.
 * A compact board leaves out the card: just the timeline over the map.
 */
export function StoryBoard({ chapters, index, onSelect, map, label, compact = false }: {
  chapters: readonly BoardChapter[];
  index: number;
  onSelect: (index: number) => void;
  map: ReactNode;
  label: string;
  compact?: boolean;
}) {
  const last = chapters.length - 1;
  const chapter = chapters[index];
  const go = (next: number) => onSelect(Math.min(last, Math.max(0, next)));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); go(index + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); go(index - 1); }
  };
  return (
    <div className="story-board" onKeyDown={onKeyDown}>
      <nav aria-label={`${label}: chapters`}>
        <ol className="story-timeline" style={{ gridTemplateColumns: `repeat(${chapters.length}, minmax(0, 1fr))` }}>
          {chapters.map((item, i) => (
            <li key={item.title} className={[
              'story-node',
              i === index ? 'story-node--active' : '',
              i < index ? 'story-node--past' : '',
              item.ink ? '' : 'story-node--whole',
            ].join(' ')}>
              <button
                type="button"
                aria-current={i === index ? 'step' : undefined}
                onClick={() => go(i)}
                style={{ '--story-ink': item.ink ?? '#5c6b77' } as CSSProperties}
              >
                <span className="story-node-dot" aria-hidden="true" />
                <span className="story-node-title">{item.title}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {compact ? <div className="story-map">{map}</div> : (
      <div className="story-body">
        <article className="story-card" aria-live="polite" style={{ '--story-ink': chapter.ink ?? '#5c6b77' } as CSSProperties}>
          <div className="story-card-step">Chapter {index + 1} of {chapters.length}</div>
          <h3 className="story-card-title">{chapter.title}</h3>
          <p className="story-card-text">{chapter.text}</p>
          <div className="story-card-steps">
            <button type="button" className="ic-pill" disabled={index === 0} onClick={() => go(index - 1)}>← Previous</button>
            <button type="button" className="ic-pill" disabled={index === last} onClick={() => go(index + 1)}>Next →</button>
          </div>
        </article>
        <div className="story-map">{map}</div>
      </div>
      )}
    </div>
  );
}
