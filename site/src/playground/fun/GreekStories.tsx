import { useMemo, type ReactNode } from 'react';
import { MapStoryStage, storySpecText, type MapStory, type StoryLook } from '../stories/MapStoryStage';
import { ARGONAUTS } from '../stories/argonauts';
import { OdysseyStory, useStoryLook } from './OdysseyMap';
import { SpecDetails } from './SpecDetails';
import './odyssey-map.css';

/** A story told on its own map, in the page's look: its stage, and its spec folded away under it. */
function MapStorySection({ story, look }: { story: MapStory; look: StoryLook }) {
  const text = useMemo(() => storySpecText(story, look), [story, look]);
  return (
    <>
      <MapStoryStage story={story} look={look} />
      <SpecDetails text={text} />
    </>
  );
}

const STORIES: { id: string; title: string; blurb: string; body: (look: StoryLook, own: boolean) => ReactNode }[] = [
  {
    id: 'odyssey', title: 'The wanderings of Odysseus',
    blurb: 'Ten years from Troy to Ithaca, the legs as wide as the crew that sailed them.',
    body: (look) => <OdysseyStory look={look} />,
  },
  {
    id: 'argonauts', title: ARGONAUTS.title,
    blurb: 'Jason and the Argo, out to Colchis for the Golden Fleece and home the long way round.',
    body: (look, own) => <MapStorySection story={ARGONAUTS} look={own ? { ...look, legInks: ARGONAUTS.legInks } : look} />,
  },
];

/**
 * The Greek stories, each told chapter by chapter on a map of its own: one page, in the order the
 * poems tell them. Their maps share Natural Earth's finest coasts, cut to the Mediterranean.
 */
export function GreekStories() {
  const { look, own, controls } = useStoryLook();
  const goTo = (id: string) => document.getElementById(`greek-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="dev-page" style={{ gap: 12 }}>
      <header className="dev-page-heading" style={{ width: 'min(100%, 1000px)' }}>
        <h1>Greek myths on maps</h1>
      </header>
      <div className="greek-stories">
        <nav className="greek-contents" aria-label="Stories">
          {STORIES.map((story) => (
            <button key={story.id} type="button" className="ic-pill" onClick={() => goTo(story.id)}>{story.title}</button>
          ))}
        </nav>
        {controls}
        {STORIES.map((story) => (
          <section key={story.id} id={`greek-${story.id}`} className="greek-story" aria-labelledby={`greek-${story.id}-title`}>
            <header>
              <h2 id={`greek-${story.id}-title`}>{story.title}</h2>
              <p>{story.blurb}</p>
            </header>
            {story.body(look, own)}
          </section>
        ))}
      </div>
    </div>
  );
}
