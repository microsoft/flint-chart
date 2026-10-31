/** The design of update animation, as the playground's opening: why, what moves, how, and what does not. */
export function AnimationOverview() {
  return (
    <section className="ua-overview" aria-labelledby="ua-overview-title">
      <h2 id="ua-overview-title">How Flint animates a change</h2>
      <p className="ua-lede">
        A change animates so the reader can follow what changed: each thing in the old chart is seen to become the
        same thing in the new one. Motion is interaction state, never style: it lives in the runtime, not in{' '}
        <code>theme_spec</code>, and a static render has none.
      </p>

      <div className="ua-rules">
        <article>
          <span className="ua-rule-n">Rule 1</span>
          <h3>Every frame reads true</h3>
          <p>
            What animates is the mapping. Each scale moves from the domain drawn to the new one, and axes, ticks,
            gridlines and marks all read that one moving scale, so a bar sits on its gridline mid-way.
          </p>
        </article>
        <article>
          <span className="ua-rule-n">Rule 2</span>
          <h3>Only what exists on both sides moves</h3>
          <p>
            Things are matched by meaning: an element by its identity, a scale by its name, an axis label or a legend
            entry by its value, a note by its target. What has no counterpart arrives or leaves.
          </p>
        </article>
      </div>

      <h3 className="ua-sub">An element is its identity plus its values</h3>
      <p className="ua-note">
        Identity is what an element is about; values are what it says, and they change. The chart type declares
        identity: the fields it keys on less those a channel draws as a quantity, unless its roles differ. Held
        selections, hidden series, notes and the animation all follow the same identity. Where the identity names
        several drawn rows in one mark (points that share only a colour), it names none, and each row is its own
        element. An emphasized element the new rows lack recedes the rest until it returns.
      </p>
      <div className="ua-table-wrap">
        <table className="ua-table">
          <thead>
            <tr><th>Chart</th><th>Identity: what it is about</th><th>Values: what it says</th><th>So a change…</th></tr>
          </thead>
          <tbody>
            <tr><td>Bar, lollipop</td><td>category, series</td><td>value</td><td>grows or shrinks the same bar</td></tr>
            <tr><td>Line, area</td><td>x (the time point), series</td><td>y</td><td>bends the same line</td></tr>
            <tr><td>Radar</td><td>axis, series</td><td>value along the spoke</td><td>slides each vertex along its spoke</td></tr>
            <tr><td>Gantt</td><td>task, series</td><td>start, end</td><td>slides and stretches the same task</td></tr>
            <tr><td>Heatmap</td><td>row, column</td><td>colour</td><td>recolours the same cell</td></tr>
            <tr><td>Scatter of countries</td><td>country</td><td>x, y, size</td><td>moves the same point</td></tr>
            <tr><td>Points that share a colour</td><td>the row</td><td>everything</td><td>fades the old points out and the new ones in</td></tr>
          </tbody>
        </table>
      </div>

      <h3 className="ua-sub">What moves, and how</h3>
      <div className="ua-table-wrap">
        <table className="ua-table">
          <thead><tr><th>Part</th><th>How it moves</th></tr></thead>
          <tbody>
            <tr><td>Number and date scales</td><td>Domain from old to new, geometric on a log scale; axes, ticks and gridlines ride it</td></tr>
            <tr><td>Marks: positions</td><td>In data units through the moving scale; a new order or a re-formed stack in screen units</td></tr>
            <tr><td>Marks: colour, opacity, size, angles</td><td>Mixed from the captured frame to the new one</td></tr>
            <tr><td>Category axis labels</td><td>Glide with their bands</td></tr>
            <tr><td>Chart size, when it follows the data</td><td>Moves to the new size with the marks</td></tr>
            <tr><td>A line's ends</td><td>Slide out and in through the plot's edge; the line clips to its plot while it moves</td></tr>
            <tr><td>Legend entries</td><td>Fade between shown, dimmed and hidden</td></tr>
            <tr><td>Notes and overlays an update adds</td><td>Wait until their marks land, then fade in</td></tr>
            <tr><td>Title, frame furniture</td><td>Do not move in an update; through a new spec they move and resize, matched by their text</td></tr>
          </tbody>
        </table>
      </div>

      <h3 className="ua-sub">Stages share one duration</h3>
      <div className="ua-steps" role="img" aria-label="Leave takes the first quarter, move the middle half, arrive the last quarter; notes follow">
        <div className="ua-step ua-step-leave"><strong>Leave</strong><span>rows that go fade out where they stood</span></div>
        <div className="ua-step ua-step-move"><strong>Move</strong><span>scales and staying marks move together</span></div>
        <div className="ua-step ua-step-arrive"><strong>Arrive</strong><span>new rows fade in</span></div>
        <div className="ua-step ua-step-reveal"><strong>Reveal</strong><span>notes and overlays</span></div>
      </div>
      <p className="ua-note">
        A stage that has nothing to do gives its share to the move. A <code>linear</code> transition runs the three
        together at one speed, for data that streams in at a steady interval. The default duration is 300 ms; a call's{' '}
        <code>transition</code> wins, then the interaction's, then the chart's. <code>{'{ duration: 0 }'}</code> and{' '}
        <code>prefers-reduced-motion</code> turn it off. A change mid-flight starts from the frame on screen; an update
        the chart already holds changes nothing.
      </p>

      <div className="ua-rules ua-rules-3">
        <article>
          <h3>Commit eases, preview follows</h3>
          <p>
            A click, a legend toggle, a brush release, a reset and a host's <code>applyUpdate</code> commit and move. A
            hover, a pan, a brush in progress and a host's <code>{"{ phase: 'preview' }"}</code> follow the hand.
          </p>
        </article>
        <article>
          <h3>A new spec lands too</h3>
          <p>
            A chart type is <code>chart_spec</code>, not state, so it arrives through <code>setInput</code>. Shared parts
            (axis labels, ticks, titles) move and resize; marks morph along a chart transition Flint lists, else the
            charts cross-fade. The host's updates and filters carry over; the reader's own selections start afresh.
          </p>
        </article>
        <article>
          <h3>Out of scope</h3>
          <p>
            Previews, a resize (room, not meaning) and a theme (style, not meaning, so it cross-fades at most). Past
            2,000 drawn items a change jumps; past 1,000 a change of chart cross-fades.
          </p>
        </article>
      </div>
    </section>
  );
}
