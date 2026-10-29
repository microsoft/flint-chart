import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { validateLinks } from 'flint-chart';
import { ChartView } from '../../../packages/flint-mcp/ui/src/ChartView';
import { BoardView, type Board } from '../../../packages/flint-mcp/ui/src/BoardView';
import { useHostPage, useMcpStyles, useMockApp, useMockBoardApp } from '../components/mcp-embed';
import { siteTheme } from '../shared/theme';
import { BOARD_SLIDES, CHART_SLIDES, LINK_FIELDS, SIMPLE_BOARD as SIMPLE_BOARD_INPUT, SIMPLE_CHART } from './mcp-experience-data';
import { describeRange } from './mcp-experience-range';

const SCOPE = 'mcp-exp-card';

const linkedBoard = (board: Board): Board => ({
  ...board,
  link_spec: { fields: LINK_FIELDS },
  linked: validateLinks(Object.fromEntries(board.charts.map((chart) => [chart.id, chart.input])), { fields: LINK_FIELDS }),
});
const BOARDS: Board[] = BOARD_SLIDES.map(({ board }) => linkedBoard(board));
const SIMPLE_BOARD = linkedBoard(SIMPLE_BOARD_INPUT);

interface Chapter {
  key: string;
  label: string;
  title: string;
  body: string;
  turn: ReactNode;
}

/** The MCP page's introduction: one ask for a themed, interactive chart and one for a themed board, each with what the agent produces. */
export function McpExperience() {
  const { t } = useTranslation();
  useMcpStyles(SCOPE);
  useHostPage();
  return (
    <>
      <style>{experienceStyles}</style>
      <SimpleStory heading={t('mcp.exp.simple.chartHeading')}>
        <ChatTurn ask={t('mcp.exp.simple.chartAsk')} reply={t('mcp.exp.simple.chartReply')} placeholder={430}
          card={(onContext) => <ChartCard card={SIMPLE_CHART} onContext={onContext} />}
        />
      </SimpleStory>
      <SimpleStory heading={t('mcp.exp.simple.boardHeading')}>
        <ChatTurn ask={t('mcp.exp.simple.boardAsk')} reply={t('mcp.exp.simple.boardReply')} placeholder={560}
          card={(onContext) => <BoardCard board={SIMPLE_BOARD} onContext={onContext} />}
        />
      </SimpleStory>
    </>
  );
}

/** One of the introduction's two chat turns, without its heading: the talk deck shows them one to a slide. */
export function McpChatTurn({ kind, height }: { kind: 'chart' | 'board'; height?: number }) {
  const { t } = useTranslation();
  useMcpStyles(SCOPE);
  useHostPage();
  return (
    <>
      <style>{experienceStyles}</style>
      <SimpleStory height={height}>
        {kind === 'chart' ? (
          <ChatTurn ask={t('mcp.exp.simple.chartAsk')} reply={t('mcp.exp.simple.chartReply')} placeholder={430}
            card={(onContext) => <ChartCard card={SIMPLE_CHART} onContext={onContext} />}
          />
        ) : (
          <ChatTurn ask={t('mcp.exp.simple.boardAsk')} reply={t('mcp.exp.simple.boardReply')} placeholder={560}
            card={(onContext) => <BoardCard board={SIMPLE_BOARD} onContext={onContext} />}
          />
        )}
      </SimpleStory>
    </>
  );
}

/** The step-by-step stories, one chart and then a board, each a chat drawn with the real MCP cards. */
export function McpExperienceStories() {
  useMcpStyles(SCOPE);
  useHostPage();
  return (
    <>
      <style>{experienceStyles}</style>
      <ChartStory />
      <BoardStory />
    </>
  );
}

/** One ask and what the agent produces, in a chat window that grows to hold it, or scrolls at a fixed `height`. */
function SimpleStory({ heading, height, children }: { heading?: string; height?: number; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section className="mcp-exp mcp-exp-simple" aria-label={heading ?? t('mcp.exp.chatTitle')}>
      {heading && <h3 className="mcp-exp-heading">{heading}</h3>}
      <div className={height ? 'mcp-exp-chat mcp-exp-chat-fixed' : 'mcp-exp-chat mcp-exp-chat-auto'} style={height ? { height } : undefined}>
        <div className="mcp-exp-chat-bar">
          <span className="mcp-exp-dot" style={{ background: '#ec6a5e' }} />
          <span className="mcp-exp-dot" style={{ background: '#f4bf4f' }} />
          <span className="mcp-exp-dot" style={{ background: '#61c554' }} />
          <span className="mcp-exp-chat-title">{t('mcp.exp.chatTitle')}</span>
        </div>
        <div className="mcp-exp-scroll">{children}</div>
      </div>
    </section>
  );
}

function ChartStory() {
  const { t } = useTranslation();
  const chapters = CHART_SLIDES.map((slide): Chapter => {
    const base = `mcp.exp.chart.${slide.key}`;
    const follow = (sent: string) => {
      if (!slide.follow) return undefined;
      const brushed = /brush-x[^\n]*?\b(\d{4})\b[^\n]*?\b(\d{4})\b/.exec(sent);
      const facts = brushed && describeRange(brushed[1], brushed[2]);
      return facts ? { ask: t(`${base}.followAsk`), reply: t(`${base}.followReply`, facts) } : undefined;
    };
    return {
      key: slide.key,
      label: t(`${base}.label`),
      title: t(`${base}.title`),
      body: t(`${base}.body`),
      turn: (
        <ChatTurn ask={t(`${base}.ask`)} reply={t(`${base}.reply`)} follow={follow} placeholder={430}
          card={(onContext) => <ChartCard card={slide.card} onContext={onContext} />}
        />
      ),
    };
  });
  return <ChatStory part={t('mcp.exp.chartPart')} heading={t('mcp.exp.chartHeading')} chapters={chapters} />;
}

function BoardStory() {
  const { t } = useTranslation();
  const chapters = BOARD_SLIDES.map((slide, at): Chapter => {
    const base = `mcp.exp.board.${slide.key}`;
    return {
      key: slide.key,
      label: t(`${base}.label`),
      title: t(`${base}.title`),
      body: t(`${base}.body`),
      turn: (
        <ChatTurn ask={t(`${base}.ask`)} reply={t(`${base}.reply`)} placeholder={560}
          card={(onContext) => <BoardCard board={BOARDS[at]} editing={slide.editing} onContext={onContext} />}
        />
      ),
    };
  });
  return <ChatStory part={t('mcp.exp.boardPart')} heading={t('mcp.exp.boardHeading')} chapters={chapters} />;
}

function ChartCard({ card, onContext }: { card: Board; onContext: (text: string) => void }) {
  const app = useMockApp(onContext);
  return <ChartView app={app as never} shown={card} />;
}

/** The width a board is laid out at: wide enough for two columns of charts. */
const BOARD_WIDTH = 760;

/** A board laid out at `BOARD_WIDTH` and zoomed to the chat's width, so it keeps its two columns. */
function BoardCard({ board, editing, onContext }: { board: Board; editing?: boolean; onContext: (text: string) => void }) {
  const app = useMockBoardApp(onContext);
  const ref = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  // The card has no prop for layout mode, so the story opens it with the card's own button.
  useEffect(() => {
    if (!editing) return;
    let frame = 0;
    const open = () => {
      const button = [...(ref.current?.querySelectorAll('button') ?? [])].find((b) => b.getAttribute('aria-label') === 'Edit layout' || b.textContent === 'Edit layout');
      if (button && !button.hasAttribute('disabled')) button.click();
      else frame = requestAnimationFrame(open);
    };
    frame = requestAnimationFrame(open);
    return () => cancelAnimationFrame(frame);
  }, [editing]);
  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    const fit = () => setZoom(Math.min(1, host.clientWidth / BOARD_WIDTH));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: BOARD_WIDTH, zoom }}>
      <BoardView app={app as never} initial={board} />
    </div>
  );
}

/** One story: a chapter list beside a scrollable chat; a chapter scrolls the chat to its turn, and the chat's scroll marks the chapter. */
function ChatStory({ part, heading, chapters }: { part: string; heading: string; chapters: Chapter[] }) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [active, setActive] = useState(0);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);

  useEffect(() => setScroller(scrollerRef.current), []);
  useEffect(() => {
    const box = scrollerRef.current;
    if (!box) return;
    const onScroll = () => {
      const top = box.scrollTop + 48;
      const atEnd = box.scrollTop + box.clientHeight >= box.scrollHeight - 4;
      let current = 0;
      turnRefs.current.forEach((turn, at) => {
        if (turn && turn.offsetTop <= top) current = at;
      });
      setActive(atEnd ? chapters.length - 1 : current);
    };
    box.addEventListener('scroll', onScroll, { passive: true });
    return () => box.removeEventListener('scroll', onScroll);
  }, [chapters.length]);

  const go = (at: number) => {
    const box = scrollerRef.current;
    const turn = turnRefs.current[at];
    if (box && turn) box.scrollTo({ top: turn.offsetTop - 12, behavior: 'smooth' });
    setActive(at);
  };

  return (
    <section className="mcp-exp" aria-label={heading}>
      <nav className="mcp-exp-side" aria-label={heading}>
        <p className="mcp-exp-part">{part}</p>
        <h3 className="mcp-exp-heading">{heading}</h3>
        <ol className="mcp-exp-chapters">
          {chapters.map((chapter, at) => (
            <li key={chapter.key}>
              <button
                type="button"
                className={at === active ? 'mcp-exp-chapter mcp-exp-chapter-on' : 'mcp-exp-chapter'}
                aria-current={at === active ? 'step' : undefined}
                onClick={() => go(at)}
              >
                <span className="mcp-exp-chapter-num">{at + 1}</span>
                <span className="mcp-exp-chapter-text">
                  <span className="mcp-exp-chapter-title">{chapter.title}</span>
                  <span className="mcp-exp-chapter-body">{chapter.body}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <div className="mcp-exp-chat">
        <div className="mcp-exp-chat-bar">
          <span className="mcp-exp-dot" style={{ background: '#ec6a5e' }} />
          <span className="mcp-exp-dot" style={{ background: '#f4bf4f' }} />
          <span className="mcp-exp-dot" style={{ background: '#61c554' }} />
          <span className="mcp-exp-chat-title">{t('mcp.exp.chatTitle')}</span>
        </div>
        <div className="mcp-exp-scroll" ref={scrollerRef}>
          {chapters.map((chapter, at) => (
            <div key={chapter.key} className="mcp-exp-turn" ref={(el) => { turnRefs.current[at] = el; }}>
              <div className="mcp-exp-divider" aria-hidden="true">
                <span>{at + 1} · {chapter.label}</span>
              </div>
              <LazyMount root={scroller}>{chapter.turn}</LazyMount>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/** Mounts its children once they come near the chat's view, and keeps them mounted. */
function LazyMount({ root, children }: { root: HTMLElement | null; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (shown || !el || !root) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShown(true);
    }, { root, rootMargin: '600px 0px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [root, shown]);
  return <div ref={ref}>{shown ? children : null}</div>;
}

function ChatTurn(props: {
  ask: string;
  reply: string;
  follow?: (sent: string) => { ask: string; reply: string } | undefined;
  placeholder: number;
  card: (onContext: (text: string) => void) => ReactNode;
}) {
  const { ask, reply, follow, placeholder, card } = props;
  const [sent, setSent] = useState('');
  const onContext = useCallback((text: string) => setSent(text), []);
  const next = follow?.(sent);
  return (
    <div className="mcp-exp-turns">
      <div className="mcp-exp-user">{ask}</div>
      <div className="mcp-exp-agent">
        <span className="mcp-exp-avatar" aria-hidden="true">AI</span>
        <p className="mcp-exp-reply">{reply}</p>
      </div>
      <div className={`${SCOPE} mcp-exp-card`} style={{ minHeight: placeholder }}>{card(onContext)}</div>
      {next ? (
        <>
          <div className="mcp-exp-user">{next.ask}</div>
          <div className="mcp-exp-agent">
            <span className="mcp-exp-avatar" aria-hidden="true">AI</span>
            <p className="mcp-exp-reply">{next.reply}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

const HAIRLINE = 'rgba(0, 0, 0, 0.10)';

const experienceStyles = `
  .mcp-exp {
    margin: 0 0 32px;
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr);
    gap: 20px;
  }
  .mcp-exp-side {
    min-width: 0;
    padding: 4px 0 0;
  }
  .mcp-exp-part {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${siteTheme.accent};
  }
  .mcp-exp-heading {
    margin: 0 0 12px;
    font-size: 15.5px;
    line-height: 1.35;
    font-weight: 700;
    color: ${siteTheme.text};
  }
  .mcp-exp-chapters {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mcp-exp-chapter {
    width: 100%;
    display: flex;
    gap: 8px;
    padding: 7px 8px;
    border: 1px solid transparent;
    border-radius: ${siteTheme.radius}px;
    background: none;
    text-align: left;
    font: inherit;
    color: ${siteTheme.text};
    cursor: pointer;
  }
  .mcp-exp-chapter:hover { background: ${siteTheme.hover}; }
  .mcp-exp-chapter-on, .mcp-exp-chapter-on:hover {
    background: ${siteTheme.accentBg};
    border-color: rgba(0, 120, 212, 0.25);
  }
  .mcp-exp-chapter-num {
    flex: none;
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 50%;
    border: 1px solid ${HAIRLINE};
    background: #ffffff;
    font-size: 11px;
    font-weight: 600;
    line-height: 18px;
    text-align: center;
    color: ${siteTheme.textMuted};
  }
  .mcp-exp-chapter-on .mcp-exp-chapter-num {
    border-color: ${siteTheme.accent};
    background: ${siteTheme.accent};
    color: #ffffff;
  }
  .mcp-exp-chapter-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .mcp-exp-chapter-title {
    font-size: 13.5px;
    font-weight: 600;
    line-height: 1.4;
  }
  .mcp-exp-chapter-body {
    font-size: 12.5px;
    line-height: 1.5;
    color: ${siteTheme.textMuted};
  }
  .mcp-exp-chat {
    min-width: 0;
    display: flex;
    flex-direction: column;
    height: min(700px, 80vh);
    border: 1px solid ${HAIRLINE};
    border-radius: 8px;
    background: ${siteTheme.bg};
    overflow: hidden;
  }
  .mcp-exp-chat-bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 14px;
    border-bottom: 1px solid ${HAIRLINE};
    background: #ffffff;
  }
  .mcp-exp-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
  }
  .mcp-exp-chat-title {
    margin-left: 6px;
    font-size: 12.5px;
    color: ${siteTheme.textMuted};
  }
  .mcp-exp-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 0 12px 20px;
  }
  .mcp-exp-divider {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 18px 0 12px;
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: ${siteTheme.navInactive};
  }
  .mcp-exp-divider::before, .mcp-exp-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${HAIRLINE};
  }
  .mcp-exp-turns {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .mcp-exp-user {
    align-self: flex-end;
    max-width: 80%;
    padding: 8px 13px;
    border-radius: 12px 12px 4px 12px;
    background: ${siteTheme.accentBg};
    font-size: 14px;
    line-height: 1.5;
  }
  .mcp-exp-agent {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .mcp-exp-avatar {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: ${siteTheme.text};
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 700;
    display: grid;
    place-items: center;
  }
  .mcp-exp-reply {
    margin: 3px 0 0;
    font-size: 14px;
    line-height: 1.55;
  }
  .mcp-exp-card {
    width: 100%;
    background: #ffffff;
    border: 1px solid ${HAIRLINE};
    border-radius: 8px;
    overflow: hidden;
  }
  .mcp-exp-simple { grid-template-columns: minmax(0, 1fr); gap: 10px; }
  .mcp-exp-simple .mcp-exp-heading { margin: 0; }
  .mcp-exp-chat-auto { height: auto; }
  .mcp-exp-chat-auto .mcp-exp-scroll { overflow: visible; padding-top: 16px; }
  @media (max-width: 760px) {
    .mcp-exp { grid-template-columns: minmax(0, 1fr); }
    .mcp-exp-chapters { flex-direction: row; overflow-x: auto; gap: 6px; }
    .mcp-exp-chapters li { flex: none; }
    .mcp-exp-chapter { padding: 6px 10px; }
    .mcp-exp-chapter-body { display: none; }
  }
  @media (max-width: 640px) {
    .mcp-exp-scroll { padding: 0 10px 16px; }
    .mcp-exp-avatar { display: none; }
  }
`;
