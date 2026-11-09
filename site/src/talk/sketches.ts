// The deck's sketch illustrations. Each draws into (ctx, w, h) and keeps every label inside the box:
// text() shrinks and wraps to the width it is given.
import { C, arrow, card, dot, ellipse, line, rect, rng, stroke, text, washRect } from './sketch';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
type Draw = (ctx: Ctx, w: number, h: number) => void;

const CONCERN = [C.meaning, C.look, C.behavior];

/** A small hand-drawn heatmap: rows × cols cells from a diverging palette, or plain greys. */
function miniHeatmap(ctx: Ctx, x: number, y: number, w: number, h: number, o: { rows?: number; cols?: number; seed?: number; palette?: string[]; gap?: number; alpha?: number; frame?: boolean } = {}) {
  const rows = o.rows ?? 5, cols = o.cols ?? 8, seed = o.seed ?? 1;
  const palette = o.palette ?? ['#a1655a', '#c8967a', '#e9e5dc', '#7ba7b8', '#006ba2'];
  const gap = o.gap ?? 3;
  const cw = (w - gap * (cols - 1)) / cols, ch = (h - gap * (rows - 1)) / rows;
  const r = rng(seed / 97 + 0.13);
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const v = Math.floor(r() * palette.length);
    washRect(ctx, x + j * (cw + gap), y + i * (ch + gap), cw, ch, palette[v], { alpha: o.alpha ?? 0.85, seed: seed + i * 31 + j, amp: 0.8 });
  }
  if (o.frame !== false) rect(ctx, x - 6, y - 6, w + 12, h + 12, { w: 2, color: C.soft, seed: seed + 3, overshoot: 3 });
}

/** A small line chart sketch. */
function miniLines(ctx: Ctx, x: number, y: number, w: number, h: number, o: { seed?: number; series?: number; colors?: string[] } = {}) {
  const seed = o.seed ?? 2, n = o.series ?? 3;
  const colors = o.colors ?? [C.blue, C.amber, C.teal, C.red];
  line(ctx, x, y + h, x + w, y + h, { w: 2, color: C.soft, seed: seed + 1 });
  for (let s = 0; s < n; s++) {
    const r = rng(seed / 53 + s * 0.17);
    const pts: Pt[] = []; let v = 0.3 + r() * 0.4;
    for (let i = 0; i <= 10; i++) { v = Math.max(0.05, Math.min(0.95, v + (r() - 0.45) * 0.25)); pts.push([x + (w * i) / 10, y + h * (1 - v)]); }
    stroke(ctx, pts, { w: 3, color: colors[s % colors.length], seed: seed + s * 11, taper: false });
  }
}

/** A small bar chart sketch. */
function miniBars(ctx: Ctx, x: number, y: number, w: number, h: number, o: { seed?: number; bars?: number; color?: string | string[] } = {}) {
  const seed = o.seed ?? 3, n = o.bars ?? 6, color = o.color ?? C.blue;
  const r = rng(seed / 71 + 0.29);
  const gap = w / n * 0.28, bw = w / n - gap;
  line(ctx, x, y + h, x + w, y + h, { w: 2, color: C.soft, seed: seed + 1 });
  for (let i = 0; i < n; i++) {
    const v = 0.25 + r() * 0.7;
    washRect(ctx, x + i * (bw + gap) + gap / 2, y + h * (1 - v), bw, h * v, Array.isArray(color) ? color[i % color.length] : color, { alpha: 0.8, seed: seed + i * 7, amp: 1 });
  }
}

/** A hand-drawn label inside a rounded card, fitted to the card. */
function labelCard(ctx: Ctx, x: number, y: number, w: number, h: number, label: string, o: { seed?: number; color?: string; fill?: string; stroke?: number; size?: number; kind?: 'hand' | 'handBold'; textColor?: string } = {}) {
  card(ctx, x, y, w, h, { seed: o.seed ?? 0, color: o.color ?? C.ink, fill: o.fill ?? C.card, w: o.stroke ?? 3 });
  text(ctx, label, x + w / 2, y + h / 2 + (o.size ?? 26) * 0.35, { size: o.size ?? 26, kind: o.kind ?? 'handBold', color: o.textColor ?? C.ink, align: 'center', maxWidth: w - 24, maxLines: 2 });
}

/** A list of short hand-written lines, each fitted to `w`, stacked from `y`. */
function handList(ctx: Ctx, items: [string, string][], x: number, y: number, w: number, o: { size?: number; gap?: number } = {}) {
  let cy = y;
  for (const [i, [s, color]] of items.entries()) {
    dot(ctx, x + 6, cy - (o.size ?? 22) * 0.32, 4, color, { seed: i + 9 });
    const box = text(ctx, s, x + 22, cy, { size: o.size ?? 22, color, maxWidth: w - 22, maxLines: 2 });
    cy += box.height + (o.gap ?? 8);
  }
  return cy;
}

/** A knot of tangled strokes in the three concern colours, with low-level fragments. */
function knot(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, o: { strands?: number; fragments?: string[]; fragSize?: number } = {}) {
  const r = rng(0.4141);
  for (let k = 0; k < (o.strands ?? 18); k++) {
    const color = CONCERN[k % 3];
    const pts: Pt[] = [];
    let a = r() * Math.PI * 2;
    for (let i = 0; i < 9; i++) {
      a += (r() - 0.3) * 1.8;
      const rr = 0.25 + r() * 0.75;
      pts.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]);
    }
    stroke(ctx, pts, { w: 3.2, color, alpha: 0.85, seed: k * 5 + 1, wobble: 1.6 });
  }
  const frags = o.fragments ?? [];
  frags.forEach((f, i) => {
    const a = (i / frags.length) * Math.PI * 2 + 0.4;
    const fx = cx + Math.cos(a) * rx * 0.62, fy = cy + Math.sin(a) * ry * 0.62;
    text(ctx, f, fx, fy, { size: o.fragSize ?? 20, color: C.ink, align: 'center', maxWidth: rx * 0.9, maxLines: 1, min: 12 });
  });
}

// ---------------------------------------------------------------- the sketches
export const SKETCHES: Record<string, Draw> = {
  /** 1.7 / 2.2: everything tangled in one spec. */
  entangle(ctx: Ctx, w: number, h: number) {
    knot(ctx, w / 2, h / 2, w * 0.42, h * 0.42, {
      strands: 24, fragSize: Math.max(16, Math.min(24, w / 30)),
      fragments: ['timeUnit', 'domainMid: 0', 'x: −118', 'pick_store', 'labelLimit', 'addSignalListener', '#db444b', 'concat_1', 'format: %b', 'strokeWidth'],
    });
  },

  /** Act 3 opener: tangle → lift → three specs → compiler → chart, with people at the top. */
  lifting(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1440, h / 640);
    const X = (v: number) => v * s + (w - 1440 * s) / 2;
    const Y = (v: number) => v * s + (h - 640 * s) / 2;
    const S = (v: number) => v * s;
    // left: the knot
    knot(ctx, X(200), Y(330), S(170), S(170), { strands: 18, fragSize: S(20), fragments: ['timeUnit', 'x: −118', 'pick_store', '#db444b', 'labelLimit', 'concat_1'] });
    text(ctx, 'today: one tangled spec', X(200), Y(560), { size: S(26), color: C.ink2, align: 'center', maxWidth: S(340) });
    // lift arrow
    arrow(ctx, X(400), Y(330), X(560), Y(250), { w: S(4), color: C.ink, seed: 3, bend: S(-20), head: S(18) });
    text(ctx, 'lift', X(478), Y(250), { size: S(28), kind: 'handBold', color: C.ink, align: 'center', maxWidth: S(120) });
    // three cards
    const cards: [string, string, string][] = [['chart spec', 'what it means', C.meaning], ['theme spec', 'how it looks', C.look], ['interaction spec', 'how it behaves', C.behavior]];
    cards.forEach(([t, sub, col], i) => {
      const cx = X(600 + i * 200), cy = Y(150), cw = S(180), ch = S(120);
      card(ctx, cx, cy, cw, ch, { seed: 20 + i, color: col, w: 3.5 });
      text(ctx, t, cx + cw / 2, cy + S(50), { size: S(26), kind: 'handBold', color: col, align: 'center', maxWidth: cw - S(16), maxLines: 1 });
      text(ctx, sub, cx + cw / 2, cy + S(88), { size: S(20), color: C.ink2, align: 'center', maxWidth: cw - S(16) });
    });
    // people
    text(ctx, 'you and your agent work here', X(890), Y(110), { size: S(26), color: C.ink2, align: 'center', maxWidth: S(560) });
    // compiler
    const kx = X(640), ky = Y(370), kw = S(500), kh = S(110);
    card(ctx, kx, ky, kw, kh, { seed: 41, color: C.ink, fill: C.panel, w: 3.5 });
    text(ctx, 'compiler', kx + kw / 2, ky + S(46), { size: S(32), kind: 'handBold', align: 'center', maxWidth: kw - S(20) });
    text(ctx, 'parsing · layout · events · design tokens', kx + kw / 2, ky + S(86), { size: S(21), color: C.ink2, align: 'center', maxWidth: kw - S(24) });
    for (let i = 0; i < 3; i++) arrow(ctx, X(690 + i * 200), Y(282), X(760 + i * 120), Y(362), { w: S(3), color: CONCERN[i], seed: 50 + i, head: S(12) });
    // chart
    arrow(ctx, X(1150), Y(425), X(1250), Y(425), { w: S(4), color: C.ink, seed: 61, head: S(16) });
    miniHeatmap(ctx, X(1270), Y(350), S(150), S(150), { rows: 5, cols: 5, seed: 7 });
    text(ctx, 'scales, pixels, signals', X(890), Y(540), { size: S(22), color: C.ink2, align: 'center', maxWidth: S(520) });
  },

  /** A.1 what it does: a data table with type tags → chart. */
  typesWhat(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1400, h / 560);
    const X = (v: number) => v * s + (w - 1400 * s) / 2, Y = (v: number) => v * s + (h - 560 * s) / 2, S = (v: number) => v * s;
    const cols: [string, string][] = [['period', 'YearMonth'], ['game', 'Category'], ['newUsers', 'Profit']];
    const tx = X(60), ty = Y(120), colW = S(190), rowH = S(56);
    cols.forEach(([name, type], i) => {
      const x = tx + i * colW;
      labelCard(ctx, x + S(10), ty - S(90), colW - S(20), S(56), type, { seed: 70 + i, color: C.meaning, textColor: C.meaning, size: S(24) });
      text(ctx, name, x + colW / 2, ty + S(36), { size: S(24), kind: 'handBold', align: 'center', maxWidth: colW - S(12) });
    });
    rect(ctx, tx, ty, colW * 3, rowH * 6, { w: 2.5, color: C.ink2, seed: 77 });
    line(ctx, tx, ty + rowH, tx + colW * 3, ty + rowH, { w: 2, color: C.soft, seed: 78 });
    const rows = [['202501', 'Azure Legends', '+5,997'], ['202501', 'Neon Drift', '−1,204'], ['202502', 'Azure Legends', '+3,410'], ['202502', 'Neon Drift', '−2,088'], ['…', '…', '…']];
    rows.forEach((r, i) => r.forEach((v, j) => text(ctx, v, tx + j * colW + colW / 2, ty + rowH * (i + 1) + S(38), { size: S(22), color: C.ink2, align: 'center', maxWidth: colW - S(16) })));
    arrow(ctx, X(660), Y(300), X(820), Y(300), { w: S(4), color: C.ink, seed: 80, head: S(18) });
    miniHeatmap(ctx, X(860), Y(140), S(480), S(320), { rows: 6, cols: 10, seed: 11 });
  },

  /** A: the tiers of semantic types, coarse to specific. */
  typeTiers(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 760, h / 560);
    const X = (v: number) => v * s + (w - 760 * s) / 2, Y = (v: number) => v * s + (h - 560 * s) / 2, S = (v: number) => v * s;
    const heads: [string, number][] = [['family', 20], ['category', 270], ['type', 520]];
    heads.forEach(([t, x]) => text(ctx, t, X(x + 110), Y(40), { size: S(28), kind: 'handBold', color: C.ink2, align: 'center', maxWidth: S(220) }));
    const chains: [string, string, string, string][] = [
      ['Temporal', 'Date granule', 'YearMonth', C.meaning],
      ['Measure', 'Signed measure', 'Profit', C.meaning],
      ['Measure', 'Physical', 'Temperature', C.meaning],
      ['Discrete', 'Rank', 'Rank', C.meaning],
      ['Geographic', 'Place', 'Country', C.meaning],
    ];
    chains.forEach((chain, i) => {
      const y = 80 + i * 94;
      chain.slice(0, 3).forEach((label, j) => {
        const x = 20 + j * 250;
        labelCard(ctx, X(x), Y(y), S(220), S(66), label, { seed: 300 + i * 7 + j, color: j === 2 ? C.meaning : C.soft, textColor: j === 2 ? C.meaning : C.ink, size: S(25), stroke: j === 2 ? 3 : 2 });
        if (j < 2) arrow(ctx, X(x + 226), Y(y + 33), X(x + 246), Y(y + 33), { w: S(2.5), color: C.ink2, seed: 320 + i * 5 + j, head: S(9) });
      });
    });
  },

  /** A: the layout engine as springs. Data pushes the axis out; the canvas pushes back. */
  springModel(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1440, h / 640);
    const X = (v: number) => v * s + (w - 1440 * s) / 2, Y = (v: number) => v * s + (h - 640 * s) / 2, S = (v: number) => v * s;
    const x0 = 540, base = 1020, most = 1260;
    // the two limits, shared by every row
    for (const [x, label] of [[base, 'base size'], [most, 'the most it may stretch']] as [number, string][]) {
      for (let y = 70; y < 620; y += 26) line(ctx, X(x), Y(y), X(x), Y(y + 12), { w: S(2), color: C.soft, seed: x + y, taper: false });
      text(ctx, label, X(x), Y(52), { size: S(21), kind: 'sans', color: C.ink2, align: 'center', maxWidth: S(220) });
    }
    const rows: { y: number; n: number; wall: number; say: string; extra?: string }[] = [
      { y: 110, n: 4, wall: base, say: 'A few items: bands widen, and the plot keeps its size.' },
      { y: 300, n: 12, wall: 1170, say: 'More items: bands compress, and the plot stretches.' },
      { y: 490, n: 18, wall: most, say: 'Too many: bands at their thinnest, the plot at its limit.', extra: 'the rest scroll into view' },
    ];
    rows.forEach(({ y, n, wall, say, extra }, r) => {
      text(ctx, say, X(20), Y(y + 40), { size: S(25), kind: 'sans', color: C.ink, maxWidth: S(470), maxLines: 2, lineHeight: 1.3 });
      // the axis box
      rect(ctx, X(x0), Y(y), S(wall - x0), S(100), { w: 3, color: C.ink, seed: 400 + r });
      // bands and the springs between them
      const gap = 14, bw = (wall - x0 - gap * (n + 1)) / n;
      for (let i = 0; i < n; i++) {
        const bx = x0 + gap + i * (bw + gap);
        washRect(ctx, X(bx), Y(y + 18), S(bw), S(64), C.blue, { alpha: 0.75, seed: 410 + r * 31 + i, amp: 0.8 });
      }
      for (let i = 0; i <= n; i++) {
        const sx = x0 + i * (bw + gap), pts: Pt[] = [];
        for (let k = 0; k <= 6; k++) pts.push([X(sx + (gap * k) / 6), Y(y + 50 + (k % 2 ? -7 : 7) * (k === 0 || k === 6 ? 0 : 1))]);
        stroke(ctx, pts, { w: S(1.6), color: C.ink2, seed: 430 + r * 41 + i, taper: false, wobble: 0.4 });
      }
      if (r === 1) {
        arrow(ctx, X(wall + 6), Y(y + 30), X(wall + 76), Y(y + 30), { w: S(3.5), color: C.meaning, seed: 470, head: S(13) });
        text(ctx, 'the data pushes out', X(wall + 84), Y(y + 38), { size: S(21), kind: 'sans', color: C.meaning, maxWidth: S(1430 - wall - 84) });
        arrow(ctx, X(most + 70), Y(y + 78), X(wall + 10), Y(y + 78), { w: S(3.5), color: C.look, seed: 471, head: S(13) });
        text(ctx, 'the canvas pushes back', X(most - 150), Y(y + 128), { size: S(21), kind: 'sans', color: C.look, maxWidth: S(330) });
      }
      if (extra) text(ctx, extra, X(most + 16), Y(y + 58), { size: S(20), kind: 'sans', color: C.ink2, maxWidth: S(1430 - most - 16), maxLines: 3 });
    });
  },

  /** A.2 / B.2 / C.2: spec → compiler → the low-level things it controls. */
  mechanismA(ctx: Ctx, w: number, h: number) { mechanism(ctx, w, h, MECH.A); },
  mechanismB(ctx: Ctx, w: number, h: number) { mechanism(ctx, w, h, MECH.B); },
  mechanismC(ctx: Ctx, w: number, h: number) { mechanism(ctx, w, h, MECH.C); },

  /** B.1: one theme name, many charts in the same look. */
  themeWhat(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1400, h / 560);
    const X = (v: number) => v * s + (w - 1400 * s) / 2, Y = (v: number) => v * s + (h - 560 * s) / 2, S = (v: number) => v * s;
    labelCard(ctx, X(560), Y(30), S(280), S(80), '"economist"', { seed: 90, color: C.look, textColor: C.look, size: S(32) });
    const econ = ['#006ba2', '#3ebcd2', '#ebb434', '#379a8b'];
    const boxes: Pt[] = [[60, 240], [400, 240], [740, 240], [1080, 240]];
    boxes.forEach(([bx, by], i) => {
      arrow(ctx, X(700), Y(120), X(bx + 130), Y(by - 20), { w: S(3), color: C.look, seed: 91 + i, head: S(12), bend: S((i - 1.5) * 8) });
      card(ctx, X(bx), Y(by), S(260), S(260), { seed: 95 + i, color: C.soft, w: 2.5 });
      washRect(ctx, X(bx + 20), Y(by + 18), S(36), S(10), '#e3120b', { alpha: 0.9, seed: 99 + i, amp: 0.6 });
      if (i === 0) miniBars(ctx, X(bx + 24), Y(by + 60), S(212), S(170), { color: econ[0], seed: 4 });
      if (i === 1) miniLines(ctx, X(bx + 24), Y(by + 60), S(212), S(170), { colors: econ, seed: 5 });
      if (i === 2) miniHeatmap(ctx, X(bx + 30), Y(by + 66), S(200), S(160), { rows: 5, cols: 6, seed: 6, frame: false });
      if (i === 3) for (let k = 0; k < 14; k++) { const r = rng(k / 31 + 0.2); dot(ctx, X(bx + 40 + r() * 180), Y(by + 80 + r() * 150), S(6 + r() * 8), econ[k % 4], { seed: k }); }
    });
  },

  /** C.1: a cursor on a mark, and the event that names the data. */
  interactionWhat(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1400, h / 560);
    const X = (v: number) => v * s + (w - 1400 * s) / 2, Y = (v: number) => v * s + (h - 560 * s) / 2, S = (v: number) => v * s;
    const pts: Pt[] = [[120, 380], [220, 300], [300, 340], [380, 200], [470, 260], [560, 160]];
    rect(ctx, X(80), Y(100), S(540), S(360), { w: 2.5, color: C.soft, seed: 120 });
    pts.forEach(([x, y], i) => dot(ctx, X(x), Y(y), S(i === 3 ? 18 : 12), i === 3 ? C.behavior : C.soft, { seed: 121 + i }));
    // cursor
    stroke(ctx, [[X(392), Y(212)], [X(392), Y(262)], [X(404), Y(250)], [X(416), Y(274)], [X(424), Y(270)], [X(412), Y(246)], [X(430), Y(246)], [X(392), Y(212)]], { w: S(3), color: C.ink, seed: 130, taper: false });
    text(ctx, 'click', X(450), Y(220), { size: S(26), color: C.ink2, maxWidth: S(120) });
    arrow(ctx, X(660), Y(280), X(820), Y(280), { w: S(4), color: C.ink, seed: 131, head: S(18) });
    card(ctx, X(860), Y(170), S(460), S(220), { seed: 132, color: C.behavior, w: 3.5 });
    text(ctx, 'a semantic event', X(1090), Y(225), { size: S(28), kind: 'handBold', color: C.behavior, align: 'center', maxWidth: S(420) });
    text(ctx, 'Country = "Japan"', X(1090), Y(290), { size: S(34), kind: 'handBold', color: C.ink, align: 'center', maxWidth: S(420) });
    text(ctx, 'not an SVG path at (412, 287)', X(1090), Y(345), { size: S(22), color: C.ink2, align: 'center', maxWidth: S(420) });
  },

  /** Act 2: five problems, each a small sketch. */
  agentProblems(ctx: Ctx, w: number, h: number) {
    const items: [string, (x: number, y: number, r: number) => void][] = [
      ['needs a strong model', (x, y, r) => { ellipse(ctx, x, y, r, r * 0.9, { w: 3, color: C.ink, seed: 140 }); text(ctx, 'AI', x, y + r * 0.3, { size: r * 0.8, kind: 'handBold', align: 'center', maxWidth: r * 1.6 }); }],
      ['slow', (x, y, r) => { ellipse(ctx, x, y, r, r, { w: 3, color: C.ink, seed: 141 }); line(ctx, x, y, x, y - r * 0.7, { w: 3, seed: 142 }); line(ctx, x, y, x + r * 0.5, y + r * 0.2, { w: 3, seed: 143 }); }],
      ['costly', (x, y, r) => { for (let i = 0; i < 3; i++) ellipse(ctx, x - r * 0.4 + i * r * 0.4, y + r * 0.3 - i * r * 0.32, r * 0.6, r * 0.22, { w: 3, color: C.amber, seed: 144 + i }); }],
      ['unreliable and fragile', (x, y, r) => { rect(ctx, x - r, y - r * 0.7, r * 2, r * 1.4, { w: 3, color: C.ink, seed: 147 }); stroke(ctx, [[x - r * 0.3, y - r * 0.7], [x, y - r * 0.1], [x - r * 0.2, y + r * 0.2], [x + r * 0.2, y + r * 0.7]], { w: 3, color: C.red, seed: 148 }); }],
      ['hard to edit', (x, y, r) => { for (let i = 0; i < 6; i++) line(ctx, x - r, y - r * 0.8 + i * r * 0.32, x - r + r * (1 + (i % 3) * 0.4), y - r * 0.8 + i * r * 0.32, { w: 3, color: i % 2 ? C.green : C.soft, seed: 150 + i }); }],
    ];
    const n = items.length, cell = w / n, r = Math.min(cell * 0.24, h * 0.22);
    items.forEach(([label, draw], i) => {
      const cx = cell * (i + 0.5), cy = h * 0.4;
      draw(cx, cy, r);
      text(ctx, label, cx, h * 0.4 + r + 52, { size: Math.min(30, cell / 7), kind: 'handBold', align: 'center', maxWidth: cell - 20, maxLines: 2 });
    });
  },
};

// ---------------------------------------------------------------- the mechanism diagram
interface Mech {
  color: string;
  unthemed?: boolean;
  withChart?: boolean;
  spec: { title: string; lines: string[] };
  decides: string[];
  controls: string[];
}

const MECH: Record<'A' | 'B' | 'C', Mech> = {
  A: {
    color: C.meaning,
    spec: { title: 'chart spec', lines: ['period → YearMonth', 'game → Category', 'newUsers → Profit'] },
    decides: ['parse the values', 'pick scales and zero baselines', 'diverge around 0', 'choose formats and colors', 'aggregate duplicates', 'size bands from the data', 'fit the labels', 'place the legend'],
    controls: ['time units, UTC parsing', 'scale domains, midpoints', 'format strings', 'color ranges', 'steps, width, height', 'label limits and angles', 'legend orient and length'],
  },
  B: {
    color: C.look,
    unthemed: true,
    spec: { title: '"economist"', lines: ['a diverging palette, five steps', 'good is blue, bad is red', 'bold headline, grey deck', 'no lines on the category axis', 'key on top, red tab on the canvas', 'type never below 8 px'] },
    decides: ['which way the ramp runs', 'how many bins', 'where the key fits on this chart', 'which axis lines apply', 'type sizes', 'gaps, tab, headline'],
    controls: ['color ranges, scale types', 'legend position and length', 'axis and grid flags', 'fonts and sizes', 'mark strokes and gaps', 'title and tab views'],
  },
  C: {
    color: C.behavior,
    withChart: true,
    spec: { title: 'interaction spec', lines: ['click → highlight', 'drag → select', 'slider → filter', 'app listens for "Japan"'] },
    decides: ['hit-test this chart', 'raw input → semantic event', 'what an update touches', 'how to reset', 'resolve conflicts'],
    controls: ['pointer coordinates', 'signals, selection stores', 'conditional opacity and stroke', 'overlay layers', 'events to the app'],
  },
};

function mechanism(ctx: Ctx, w: number, h: number, m: Mech) {
  const s = Math.min(w / 1440, h / 620);
  const X = (v: number) => v * s + (w - 1440 * s) / 2, Y = (v: number) => v * s + (h - 620 * s) / 2, S = (v: number) => v * s;
  const colW = 380;
  // left column: the spec (plus an unthemed or real chart for B and C)
  const lx = 20;
  let specY = 60;
  if (m.unthemed || m.withChart) {
    text(ctx, m.unthemed ? 'an unthemed chart' : 'the chart', X(lx + colW / 2), Y(40), { size: S(22), color: C.ink2, align: 'center', maxWidth: S(colW) });
    if (m.unthemed) miniHeatmap(ctx, X(lx + 60), Y(60), S(260), S(150), { rows: 4, cols: 8, seed: 21, palette: ['#d6604d', '#f4a582', '#f7f7f7', '#92c5de', '#4393c3'] });
    else { miniLines(ctx, X(lx + 60), Y(60), S(260), S(150), { seed: 22 }); dot(ctx, X(lx + 200), Y(110), S(10), C.behavior, { seed: 23 }); }
    specY = 250;
  }
  const specH = 70 + m.spec.lines.length * 44;
  card(ctx, X(lx), Y(specY), S(colW), S(specH), { seed: 200, color: m.color, w: 3.5 });
  text(ctx, m.spec.title, X(lx + colW / 2), Y(specY + 46), { size: S(30), kind: 'handBold', color: m.color, align: 'center', maxWidth: S(colW - 30) });
  m.spec.lines.forEach((l, i) => text(ctx, l, X(lx + 26), Y(specY + 92 + i * 44), { size: S(23), color: C.ink, maxWidth: S(colW - 50), maxLines: 1 }));
  // middle: the compiler and what it decides
  const mx = 500;
  const midH = 90 + m.decides.length * 46;
  const midY = Math.max(20, (620 - midH) / 2);
  card(ctx, X(mx), Y(midY), S(colW + 40), S(midH), { seed: 210, color: C.ink, fill: C.panel, w: 3.5 });
  text(ctx, 'compiler decides', X(mx + (colW + 40) / 2), Y(midY + 50), { size: S(30), kind: 'handBold', align: 'center', maxWidth: S(colW) });
  handList(ctx, m.decides.map((d): [string, string] => [d, C.ink]), X(mx + 28), Y(midY + 100), S(colW - 10), { size: S(23), gap: S(14) });
  // right: what it controls
  const rx = 1040;
  const rightH = 90 + m.controls.length * 46;
  const rightY = Math.max(20, (620 - rightH) / 2);
  text(ctx, 'low-level settings it controls', X(rx + colW / 2), Y(rightY + 30), { size: S(26), kind: 'handBold', color: C.ink2, align: 'center', maxWidth: S(colW) });
  handList(ctx, m.controls.map((d): [string, string] => [d, C.ink2]), X(rx + 10), Y(rightY + 84), S(colW - 20), { size: S(22), gap: S(14) });
  rect(ctx, X(rx - 10), Y(rightY - 6), S(colW + 10), S(rightH), { w: 2, color: C.soft, seed: 230, overshoot: 3 });
  // arrows
  arrow(ctx, X(lx + colW + 10), Y(specY + specH / 2), X(mx - 14), Y(midY + midH / 2), { w: S(4), color: m.color, seed: 240, head: S(16) });
  arrow(ctx, X(mx + colW + 54), Y(midY + midH / 2), X(rx - 22), Y(rightY + rightH / 2), { w: S(4), color: C.ink, seed: 241, head: S(16) });
}

// ---------------------------------------------------------------- how it works: four panels in a row
// Drawn on a 2000 × 600 board, like the video's mechanism frames: panels joined by labelled arrows.
type Board = { X: (v: number) => number; Y: (v: number) => number; S: (v: number) => number };
type Panel = { title: string; draw: (b: Board, x: number) => void };

const PANEL_W = 400, PANEL_X = [20, 540, 1060, 1580];

function pipeline(ctx: Ctx, w: number, h: number, panels: Panel[], arrows: { label: string; color?: string }[], xs: number[] = PANEL_X) {
  const s = Math.min(w / 2000, h / 600);
  const b: Board = { X: (v) => v * s + (w - 2000 * s) / 2, Y: (v) => v * s + (h - 600 * s) / 2, S: (v) => v * s };
  const { X, Y, S } = b;
  panels.forEach((p, i) => {
    const x = xs[i];
    card(ctx, X(x), Y(20), S(PANEL_W), S(560), { seed: 400 + i * 7, color: C.ink, fill: C.paper, w: 2.5 });
    text(ctx, p.title, X(x + PANEL_W / 2), Y(92), { size: S(40), kind: 'handBold', align: 'center', maxWidth: S(PANEL_W - 40), maxLines: 1 });
    p.draw(b, x);
  });
  arrows.forEach((a, i) => {
    const x1 = xs[i] + PANEL_W + 10, x2 = xs[i + 1] - 10;
    text(ctx, a.label, X((x1 + x2) / 2), Y(268), { size: S(30), kind: 'handBold', color: a.color ?? C.ink2, align: 'center', maxWidth: S(x2 - x1 + 20), maxLines: 2 });
    arrow(ctx, X(x1), Y(300), X(x2), Y(300), { w: S(3.5), color: a.color ?? C.ink, seed: 450 + i, head: S(16) });
  });
}

const mono = (ctx: Ctx, b: Board, s: string, x: number, y: number, o: { size?: number; color?: string; max?: number } = {}) =>
  text(ctx, s, b.X(x), b.Y(y), { size: b.S(o.size ?? 24), kind: 'mono', color: o.color ?? C.ink, maxWidth: b.S(o.max ?? 340), maxLines: 1 });

/** An operator chip: a coloured wash with a name in code, and what it does in hand lettering beside it. */
function chip(ctx: Ctx, b: Board, x: number, y: number, name: string, color: string, label: string, seed: number, chipW = 170) {
  const { X, Y, S } = b;
  washRect(ctx, X(x), Y(y - 30), S(chipW), S(44), color, { alpha: 0.35, seed });
  rect(ctx, X(x), Y(y - 30), S(chipW), S(44), { w: 2, color, seed: seed + 1 });
  text(ctx, name, X(x + chipW / 2), Y(y), { size: S(21), kind: 'mono', align: 'center', maxWidth: S(chipW - 14), maxLines: 1 });
  text(ctx, label, X(x + chipW + 14), Y(y + 2), { size: S(25), kind: 'handBold', maxWidth: S(PANEL_W - chipW - 50), maxLines: 2, lineHeight: 1.05 });
}

const tick = (ctx: Ctx, b: Board, x: number, y: number) =>
  stroke(ctx, [[b.X(x), b.Y(y)], [b.X(x + 12), b.Y(y + 14)], [b.X(x + 36), b.Y(y - 18)]], { w: b.S(3.5), color: C.green, seed: 470 + x });
const cross = (ctx: Ctx, b: Board, x: number, y: number) => {
  line(ctx, b.X(x), b.Y(y - 14), b.X(x + 26), b.Y(y + 12), { w: b.S(3), color: C.red, seed: 480 + x });
  line(ctx, b.X(x + 26), b.Y(y - 14), b.X(x), b.Y(y + 12), { w: b.S(3), color: C.red, seed: 481 + x });
};
const ECON_DIVERGING = ['#006ba2', '#7ba7b8', '#e9e5dc', '#c8967a', '#a1655a'];
const DEFAULT_DIVERGING = ['#ca0020', '#f4a582', '#f7f7f7', '#92c5de', '#0571b0'];

/** Axes for a small chart in a panel. */
function axes(ctx: Ctx, b: Board, x: number, y: number, w: number, h: number, seed: number) {
  line(ctx, b.X(x), b.Y(y), b.X(x), b.Y(y + h), { w: b.S(2.5), color: C.ink, seed });
  line(ctx, b.X(x), b.Y(y + h), b.X(x + w), b.Y(y + h), { w: b.S(2.5), color: C.ink, seed: seed + 1 });
}

Object.assign(SKETCHES, {
  /** A, how it works: raw values, what they mean, what the compiler decides, the chart. */
  typesHow(ctx: Ctx, w: number, h: number) {
    pipeline(ctx, w, h, [
      { title: 'Data + types', draw: (b, x) => {
        // The raw rows, on a soft grey wash: just numbers so far.
        washRect(ctx, b.X(x + 26), b.Y(124), b.S(348), b.S(176), C.soft, { alpha: 0.22, seed: 500 });
        rect(ctx, b.X(x + 26), b.Y(124), b.S(348), b.S(176), { w: b.S(1.5), color: C.soft, seed: 504 });
        mono(ctx, b, 'period   newUsers', x + 40, 156, { size: 22, color: C.ink2 });
        line(ctx, b.X(x + 36), b.Y(170), b.X(x + 364), b.Y(170), { w: b.S(2), color: C.soft, seed: 501 });
        [['202101', '5948'], ['202101', '-1086'], ['…', '…']].forEach(([p, v], i) => {
          mono(ctx, b, p, x + 40, 210 + i * 36, { size: 22 });
          mono(ctx, b, v.padStart(8), x + 196, 210 + i * 36, { size: 22, color: v.startsWith('-') ? C.red : C.ink });
        });
        ellipse(ctx, b.X(x + 80), b.Y(203), b.S(58), b.S(22), { w: b.S(2.5), color: C.amber, seed: 502 });
        // The semantic types, highlighted in blue: the part the agent adds.
        washRect(ctx, b.X(x + 26), b.Y(326), b.S(348), b.S(232), C.meaning, { alpha: 0.2, seed: 505 });
        rect(ctx, b.X(x + 26), b.Y(326), b.S(348), b.S(232), { w: b.S(2.5), color: C.meaning, seed: 506 });
        text(ctx, '+ semantic types', b.X(x + 44), b.Y(370), { size: b.S(28), kind: 'handBold', color: C.meaning, maxWidth: b.S(320), maxLines: 1 });
        [['period', 'YearMonth'], ['game', 'Category'], ['newUsers', 'Profit']].forEach(([f, t], i) => {
          const y = 424 + i * 46;
          mono(ctx, b, `${f}:`, x + 44, y, { size: 22, color: C.ink2 });
          text(ctx, t, b.X(x + 44 + (f.length + 2) * 13.6), b.Y(y), { size: b.S(23), kind: 'mono', color: C.meaning, maxWidth: b.S(200), maxLines: 1 });
          line(ctx, b.X(x + 44 + (f.length + 2) * 13.6), b.Y(y + 6), b.X(x + 44 + (f.length + 2) * 13.6 + t.length * 13.8), b.Y(y + 6), { w: b.S(2.5), color: C.meaning, seed: 507 + i });
        });
      } },
      { title: 'What it means', draw: (b, x) => {
        chip(ctx, b, x + 24, 200, 'parse', C.blue, '202101 is Jan 2021', 511);
        chip(ctx, b, x + 24, 300, 'sum', C.amber, '4 regions, 1 cell', 513);
        chip(ctx, b, x + 24, 400, 'diverge', C.red, 'colors split at 0', 515);
        chip(ctx, b, x + 24, 500, 'format', C.teal, 'Jan 2021, -1.1k', 517);
      } },
      { title: 'Layout', draw: (b, x) => {
        // The data pushes the plot out; the canvas pushes back: a dashed canvas around a plot that stretched.
        rect(ctx, b.X(x + 30), b.Y(150), b.S(340), b.S(260), { w: b.S(2), color: C.soft, seed: 521 });
        miniHeatmap(ctx, b.X(x + 60), b.Y(176), b.S(290), b.S(170), { rows: 6, cols: 12, seed: 31, palette: DEFAULT_DIVERGING, frame: false });
        arrow(ctx, b.X(x + 205), b.Y(370), b.X(x + 345), b.Y(370), { w: b.S(2.5), color: C.purple, seed: 522, head: b.S(10) });
        arrow(ctx, b.X(x + 205), b.Y(370), b.X(x + 65), b.Y(370), { w: b.S(2.5), color: C.purple, seed: 523, head: b.S(10) });
        ['2021', '2023', '2025'].forEach((t, i) => text(ctx, t, b.X(x + 80 + i * 120), b.Y(398), { size: b.S(20), color: C.ink2, align: 'center', maxWidth: b.S(80) }));
        chip(ctx, b, x + 24, 470, 'fit', C.purple, 'cells sized to the canvas', 524);
        chip(ctx, b, x + 24, 540, 'ticks', C.teal, 'one label a year', 526);
      } },
      { title: 'Any backend', draw: (b, x) => {
        const libs: [string, string][] = [['Vega-Lite', C.blue], ['ECharts', C.red], ['Chart.js', C.amber], ['Plotly', C.teal], ['Excel', C.green]];
        libs.forEach(([name, color], i) => {
          const y = 150 + i * 84;
          washRect(ctx, b.X(x + 30), b.Y(y), b.S(340), b.S(62), color, { alpha: 0.18, seed: 531 + i });
          rect(ctx, b.X(x + 30), b.Y(y), b.S(340), b.S(62), { w: b.S(2), color, seed: 541 + i });
          miniHeatmap(ctx, b.X(x + 42), b.Y(y + 10), b.S(96), b.S(42), { rows: 3, cols: 6, seed: 31 + i, palette: DEFAULT_DIVERGING, frame: false });
          text(ctx, name, b.X(x + 160), b.Y(y + 42), { size: b.S(26), kind: 'handBold', maxWidth: b.S(200), maxLines: 1 });
        });
      } },
    ], [{ label: 'compiler' }, { label: 'compiler' }, { label: 'compiles to' }]);
  },

  /** B, how it works: an unthemed chart, the theme spec, what the compiler decides for this chart, the result. */
  themeHow(ctx: Ctx, w: number, h: number) {
    pipeline(ctx, w, h, [
      { title: 'Unthemed chart', draw: (b, x) => {
        miniHeatmap(ctx, b.X(x + 40), b.Y(170), b.S(320), b.S(250), { rows: 6, cols: 8, seed: 41, palette: DEFAULT_DIVERGING });
        text(ctx, 'library defaults', b.X(x + 200), b.Y(500), { size: b.S(28), color: C.ink2, align: 'center', maxWidth: b.S(340) });
      } },
      { title: 'Theme spec', draw: (b, x) => {
        ['diverging: 5 stops', 'positive: "#006ba2"', 'negative: "#e3120b"', 'category grid: omit', 'minSize: 8', 'accent: "#e3120b"'].forEach((l, i) =>
          mono(ctx, b, l, x + 30, 180 + i * 62, { size: 23, color: i === 1 ? '#006ba2' : i === 2 || i === 5 ? '#c0392b' : C.ink }));
      } },
      { title: 'For this chart', draw: (b, x) => {
        chip(ctx, b, x + 24, 180, 'ramp', C.blue, 'gains blue, losses red', 531, 130);
        chip(ctx, b, x + 24, 258, 'bins', C.teal, 'five steps', 533, 130);
        chip(ctx, b, x + 24, 336, 'legend', C.amber, 'key on top, sized to fit', 535, 130);
        chip(ctx, b, x + 24, 414, 'axes', C.purple, 'no lines between games', 537, 130);
        chip(ctx, b, x + 24, 492, 'type', C.red, 'never below 8 px', 539, 130);
      } },
      { title: 'Themed chart', draw: (b, x) => {
        washRect(ctx, b.X(x + 40), b.Y(140), b.S(44), b.S(12), '#e3120b', { alpha: 0.95, seed: 541 });
        text(ctx, 'Net new users by game', b.X(x + 40), b.Y(196), { size: b.S(28), kind: 'handBold', maxWidth: b.S(320), maxLines: 1 });
        line(ctx, b.X(x + 40), b.Y(214), b.X(x + 260), b.Y(214), { w: b.S(2), color: C.soft, seed: 542 });
        miniHeatmap(ctx, b.X(x + 40), b.Y(240), b.S(320), b.S(250), { rows: 6, cols: 8, seed: 41, palette: ECON_DIVERGING, gap: 4, frame: false });
      } },
    ], [{ label: '+ theme', color: C.look }, { label: 'compiler' }, { label: 'compiler' }]);
  },

  /** C, how it works: raw input, a semantic event, the updates you map it to, the chart. */
  interactionHow(ctx: Ctx, w: number, h: number) {
    const pts: [number, number, string, number][] = [[70, 330, C.amber, 9], [110, 270, C.red, 18], [150, 250, C.red, 22], [190, 280, C.blue, 10], [230, 230, C.teal, 11], [270, 200, C.teal, 12], [300, 170, C.red, 10], [320, 160, C.blue, 13], [340, 175, C.teal, 14], [130, 360, C.amber, 9], [230, 345, C.amber, 9]];
    pipeline(ctx, w, h, [
      { title: 'Raw input', draw: (b, x) => {
        axes(ctx, b, x + 40, 130, 320, 260, 551);
        pts.forEach(([px, py, c, r], i) => dot(ctx, b.X(x + px), b.Y(py), b.S(r), c, { alpha: 0.85, seed: 552 + i }));
        mono(ctx, b, '(x, y) = (412, 287)', x + 70, 430, { size: 22, color: C.ink2 });
        ellipse(ctx, b.X(x + 80), b.Y(482), b.S(20), b.S(20), { w: b.S(2.5), color: C.amber, seed: 566 });
        dot(ctx, b.X(x + 80), b.Y(482), b.S(5), C.ink, { seed: 567 });
        rect(ctx, b.X(x + 170), b.Y(464), b.S(56), b.S(36), { w: b.S(2), color: C.teal, seed: 568 });
        rect(ctx, b.X(x + 290), b.Y(462), b.S(64), b.S(40), { w: b.S(2), color: C.ink, seed: 569 });
        text(ctx, 'Tab', b.X(x + 322), b.Y(490), { size: b.S(20), kind: 'mono', align: 'center', maxWidth: b.S(56) });
        [['Click', 80], ['Drag', 198], ['Key', 322]].forEach(([t, cx]) => text(ctx, t as string, b.X(x + (cx as number)), b.Y(548), { size: b.S(28), kind: 'handBold', color: C.ink2, align: 'center', maxWidth: b.S(110) }));
      } },
      { title: 'Semantic event', draw: (b, x) => {
        mono(ctx, b, 'action: "click-element"', x + 24, 180, { size: 22 });
        mono(ctx, b, 'phase:  "commit"', x + 24, 226, { size: 22 });
        mono(ctx, b, 'target: {', x + 24, 272, { size: 22 });
        mono(ctx, b, 'Country: "Japan"', x + 50, 318, { size: 22 });
        ellipse(ctx, b.X(x + 222), b.Y(310), b.S(76), b.S(26), { w: b.S(2.5), color: C.amber, seed: 571 });
        mono(ctx, b, '}', x + 24, 364, { size: 22 });
        tick(ctx, b, x + 330, 316);
        mono(ctx, b, '<path d="M412,287 L…">', x + 24, 470, { size: 20, color: C.ink2 });
        line(ctx, b.X(x + 20), b.Y(463), b.X(x + 310), b.Y(463), { w: b.S(2.5), color: C.red, seed: 572 });
        cross(ctx, b, x + 330, 464);
      } },
      { title: 'Update operators', draw: (b, x) => {
        chip(ctx, b, x + 24, 200, 'set-style', C.amber, 'highlight', 581, 190);
        chip(ctx, b, x + 24, 320, 'annotate-text', C.teal, 'annotate', 583, 190);
        chip(ctx, b, x + 24, 440, 'set-viewport', C.blue, 'pan & zoom', 585, 190);
      } },
      { title: 'Chart', draw: (b, x) => {
        axes(ctx, b, x + 40, 130, 320, 300, 591);
        pts.forEach(([px, py, , r], i) => dot(ctx, b.X(x + px + 10), b.Y(py + 20), b.S(r), C.soft, { alpha: 0.35, seed: 592 + i }));
        dot(ctx, b.X(x + 290), b.Y(170), b.S(13), C.red, { seed: 605 });
        line(ctx, b.X(x + 286), b.Y(184), b.X(x + 262), b.Y(250), { w: b.S(2.5), color: C.ink, seed: 606 });
        text(ctx, 'Japan 82.6 yrs', b.X(x + 200), b.Y(290), { size: b.S(32), kind: 'handBold', align: 'center', maxWidth: b.S(300), maxLines: 1 });
      } },
    ], [{ label: 'compiler' }, { label: 'you map', color: C.red }, { label: 'compiler' }]);
  },
});

Object.assign(SKETCHES, {
  /** B.1: before, loose files wired into every chart by hand; now, one theme spec the compiler applies to every chart. */
  themeBeforeNow(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1000, h / 720);
    const X = (v: number) => v * s + (w - 1000 * s) / 2, Y = (v: number) => v * s + (h - 720 * s) / 2, S = (v: number) => v * s;
    const chartAt = (x: number, y: number, i: number, themed: boolean) => {
      rect(ctx, X(x), Y(y), S(220), S(84), { w: S(2), color: C.soft, seed: 700 + i * 3 + (themed ? 50 : 0) });
      if (themed) washRect(ctx, X(x + 12), Y(y + 10), S(26), S(7), '#e3120b', { alpha: 0.95, seed: 760 + i });
      const kind = i % 3;
      const pal = themed ? ['#006ba2', '#3ebcd2', '#ebb434'] : [['#4c78a8'], ['#f58518', '#54a24b', '#e45756'], ['#b279a2']][kind];
      if (kind === 0) miniBars(ctx, X(x + 20), Y(y + 22), S(180), S(54), { color: themed ? '#006ba2' : pal[0], seed: 710 + i });
      if (kind === 1) miniLines(ctx, X(x + 20), Y(y + 22), S(180), S(54), { colors: pal, seed: 720 + i });
      if (kind === 2) miniHeatmap(ctx, X(x + 24), Y(y + 22), S(172), S(54), { rows: 3, cols: 8, seed: 730 + i, palette: themed ? ECON_DIVERGING : DEFAULT_DIVERGING, frame: false });
    };
    const charts = [0, 1, 2];

    // before
    text(ctx, 'Before', X(20), Y(58), { size: S(44), kind: 'handBold', maxWidth: S(200), maxLines: 1 });
    text(ctx, 'set up once per chart', X(200), Y(58), { size: S(32), color: C.red, maxWidth: S(420), maxLines: 1 });
    const files = ['style-guide.pdf', 'design-kit.fig', 'colors.css', 'vega-config.json'];
    files.forEach((f, i) => {
      const y = 96 + i * 66;
      rect(ctx, X(20), Y(y), S(250), S(48), { w: S(2), color: C.ink2, seed: 740 + i });
      line(ctx, X(250), Y(y), X(270), Y(y + 18), { w: S(2), color: C.ink2, seed: 745 + i });
      text(ctx, f, X(36), Y(y + 32), { size: S(21), kind: 'mono', color: C.ink2, maxWidth: S(220), maxLines: 1 });
    });
    charts.forEach((i) => chartAt(760, 84 + i * 100, i, false));
    files.forEach((_, a) => charts.forEach((c) => {
      line(ctx, X(276), Y(120 + a * 66), X(752), Y(126 + c * 100 + (a - 1.5) * 8), { w: S(1.6), color: C.soft, seed: 750 + a * 5 + c });
    }));
    line(ctx, X(20), Y(400), X(980), Y(400), { w: S(1.5), color: C.soft, seed: 790 });

    // now
    text(ctx, 'Now', X(20), Y(462), { size: S(44), kind: 'handBold', maxWidth: S(200), maxLines: 1 });
    text(ctx, 'written once per theme', X(140), Y(462), { size: S(32), color: C.green, maxWidth: S(420), maxLines: 1 });
    card(ctx, X(20), Y(520), S(290), S(130), { seed: 795, color: C.look, w: 3.5 });
    text(ctx, 'theme spec', X(165), Y(570), { size: S(26), color: C.ink2, align: 'center', maxWidth: S(260), maxLines: 1 });
    text(ctx, '"economist"', X(165), Y(620), { size: S(30), kind: 'mono', color: C.look, align: 'center', maxWidth: S(260), maxLines: 1 });
    charts.forEach((i) => {
      chartAt(760, 432 + i * 100, i, true);
      arrow(ctx, X(318), Y(585), X(750), Y(474 + i * 100), { w: S(3), color: C.look, seed: 800 + i, head: S(14) });
    });
  },
});

Object.assign(SKETCHES, {
  /** C.1: before, interaction code reads pixels and SVG paths; now, it gets a semantic event, or a preset does it all. */
  interactionBeforeNow(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1000, h / 720);
    const X = (v: number) => v * s + (w - 1000 * s) / 2, Y = (v: number) => v * s + (h - 720 * s) / 2, S = (v: number) => v * s;
    const cursor = (x: number, y: number, seed: number) => {
      ellipse(ctx, X(x), Y(y), S(16), S(16), { w: S(2.5), color: C.amber, seed });
      dot(ctx, X(x), Y(y), S(4), C.ink, { seed: seed + 1 });
    };

    // before
    text(ctx, 'Before', X(20), Y(58), { size: S(44), kind: 'handBold', maxWidth: S(200), maxLines: 1 });
    text(ctx, 'the code has to read the drawing', X(200), Y(58), { size: S(32), color: C.red, maxWidth: S(560), maxLines: 1 });
    miniHeatmap(ctx, X(20), Y(100), S(240), S(170), { rows: 5, cols: 7, seed: 901, palette: ECON_DIVERGING });
    cursor(150, 170, 902);
    text(ctx, '(x, y) = (412, 287)', X(20), Y(318), { size: S(21), kind: 'mono', color: C.ink2, maxWidth: S(260), maxLines: 1 });
    for (let i = 0; i < 6; i++) {
      stroke(ctx, [[X(275), Y(150 + i * 18)], [X(360 + (i % 3) * 30), Y(110 + ((i * 47) % 200))], [X(440 - (i % 2) * 40), Y(260 - ((i * 31) % 150))], [X(565), Y(120 + i * 38)]], { w: S(1.8), color: C.soft, seed: 910 + i });
    }
    rect(ctx, X(575), Y(88), S(405), S(270), { w: S(2.5), color: C.ink2, seed: 920 });
    ['hit-test <path d="M412,287…">', 'invert the x and y scales', 'find the row behind the mark', 'track the selection signal', 'restyle every other mark', '…'].forEach((l, i) =>
      text(ctx, l, X(595), Y(130 + i * 40), { size: S(20), kind: 'mono', color: i === 0 ? C.red : C.ink2, maxWidth: S(370), maxLines: 1 }));
    line(ctx, X(20), Y(400), X(980), Y(400), { w: S(1.5), color: C.soft, seed: 930 });

    // now
    text(ctx, 'Now', X(20), Y(462), { size: S(44), kind: 'handBold', maxWidth: S(200), maxLines: 1 });
    text(ctx, 'the click arrives as a semantic event', X(140), Y(462), { size: S(32), color: C.green, maxWidth: S(620), maxLines: 1 });
    miniHeatmap(ctx, X(20), Y(510), S(220), S(150), { rows: 5, cols: 7, seed: 901, palette: ECON_DIVERGING });
    cursor(140, 570, 940);
    arrow(ctx, X(255), Y(585), X(330), Y(585), { w: S(3), color: C.ink, seed: 941, head: S(14) });
    card(ctx, X(340), Y(512), S(320), S(150), { seed: 942, color: C.behavior, w: 3 });
    text(ctx, 'click-element', X(360), Y(560), { size: S(22), kind: 'mono', color: C.ink2, maxWidth: S(290), maxLines: 1 });
    text(ctx, 'game: "Neon Drift"', X(360), Y(612), { size: S(24), kind: 'mono', color: C.ink, maxWidth: S(290), maxLines: 1 });
    card(ctx, X(700), Y(512), S(280), S(150), { seed: 944, color: C.look, w: 3, fill: C.panel });
    text(ctx, 'or a preset, in one line', X(840), Y(556), { size: S(26), kind: 'handBold', align: 'center', maxWidth: S(250), maxLines: 1 });
    text(ctx, '"click-group-focus"', X(840), Y(612), { size: S(20), kind: 'mono', color: C.look, align: 'center', maxWidth: S(260), maxLines: 1 });
  },
});

Object.assign(SKETCHES, {
  /**
   * A.1: what each semantic type sets off, as a small tree per field. The type boxes and connectors are
   * drawn; the branch text is set over them as HTML (see TYPE_TREE in slides.tsx), on the same 1000 × 720 frame.
   */
  typesTree(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1000, h / 720);
    const X = (v: number) => v * s + (w - 1000 * s) / 2, Y = (v: number) => v * s + (h - 720 * s) / 2, S = (v: number) => v * s;
    TYPE_TREE.forEach((r, i) => {
      card(ctx, X(10), Y(r.cy - 40), S(300), S(80), { seed: 1000 + i * 9, color: C.meaning, w: 3 });
      text(ctx, r.label, X(160), Y(r.cy + 9), { size: S(25), kind: 'mono', color: C.meaning, align: 'center', maxWidth: S(280), maxLines: 1 });
      r.leaves.forEach((l, j) => {
        if (!l.mono) {
          stroke(ctx, [[X(312), Y(r.cy)], [X(345), Y((r.cy + l.y) / 2)], [X(372), Y(l.y)]], { w: S(2.2), color: C.ink2, seed: 1003 + i * 9 + j });
          dot(ctx, X(380), Y(l.y), S(5), C.ink2, { seed: 1030 + i * 9 + j });
        } else {
          line(ctx, X(398), Y(l.y - 32), X(398), Y(l.y), { w: S(2), color: C.soft, seed: 1050 + i * 9 + j });
          line(ctx, X(398), Y(l.y), X(422), Y(l.y), { w: S(2), color: C.soft, seed: 1060 + i * 9 + j });
        }
      });
    });
  },
});

// What each semantic type sets off; `y` is the middle of a leaf's line on the 1000 × 720 frame.
export type TypeLeaf = { y: number; text: string; mono?: boolean; tone?: 'muted' | 'good' };
export const TYPE_TREE: { cy: number; label: string; leaves: TypeLeaf[] }[] = [
  { cy: 140, label: 'period: YearMonth', leaves: [
    { y: 54, text: 'Try the month formats, in order' },
    { y: 104, text: '202101 · 2021-01 · 01/2021 · Jan 2021 · 2021M01', mono: true, tone: 'muted' },
    { y: 160, text: '202101 → Jan 2021', mono: true, tone: 'good' },
    { y: 218, text: 'Draw a time axis, labelled by year' },
  ] },
  { cy: 380, label: 'game: Category', leaves: [
    { y: 330, text: "No order of its own: keep the data's order" },
    { y: 402, text: 'One row each, names wrapped to fit' },
  ] },
  { cy: 592, label: 'newUsers: Profit', leaves: [
    { y: 512, text: 'It adds up: sum the four regions' },
    { y: 582, text: 'It can go negative: colors diverge at 0' },
    { y: 652, text: 'Same reach on both sides of 0' },
  ] },
];

// ---------------------------------------------------------------- section A: the vocabulary of semantic types
const TYPE_GROUPS: { group: string; color: string; types: string[]; x: number; y: number; w: number }[] = [
  // Placed by hand on a 1500 × 560 board: three columns, the bigger groups first.
  { group: 'Time units', color: C.blue, x: 20, y: 20, w: 470, types: ['Year', 'Quarter', 'Month', 'Week', 'Day', 'Hour', 'YearMonth', 'YearQuarter', 'YearWeek', 'Decade', 'Duration'] },
  { group: 'Points in time', color: C.blue, x: 20, y: 330, w: 470, types: ['DateTime', 'Date', 'Time', 'Timestamp'] },
  { group: 'Measures', color: C.amber, x: 515, y: 20, w: 470, types: ['Quantity', 'Count', 'Amount', 'Price', 'Percentage', 'Temperature'] },
  { group: 'Signed measures', color: C.red, x: 515, y: 255, w: 470, types: ['Profit', 'PercentageChange', 'Sentiment', 'Correlation'] },
  { group: 'Ordered numbers', color: C.green, x: 515, y: 440, w: 470, types: ['Rank', 'Score', 'ID'] },
  { group: 'Places', color: C.teal, x: 1010, y: 20, w: 470, types: ['Country', 'State', 'City', 'Region', 'Address', 'ZipCode', 'Latitude', 'Longitude'] },
  { group: 'Categories', color: C.purple, x: 1010, y: 310, w: 470, types: ['Category', 'Name', 'Status', 'Boolean', 'Direction', 'Range'] },
];

Object.assign(SKETCHES, {
  /** The semantic types, each family a hand-drawn group with its types as chips, laid out by hand. */
  typeCloud(ctx: Ctx, w: number, h: number) {
    const s = Math.min(w / 1500, h / 560);
    const X = (v: number) => v * s + (w - 1500 * s) / 2, Y = (v: number) => v * s + (h - 560 * s) / 2, S = (v: number) => v * s;
    const CHIP_H = 40, GAP = 10, PAD = 22, FS = 20;
    TYPE_GROUPS.forEach((g, gi) => {
      // Lay the chips out in rows first, so the group's outline fits them.
      ctx.save(); ctx.font = `500 ${S(FS)}px ui-monospace, 'SF Mono', Menlo, monospace`;
      const widths = g.types.map((t) => ctx.measureText(t).width / s + 26);
      ctx.restore();
      const rows: { t: string; w: number; x: number }[][] = [[]];
      let cx = 0;
      g.types.forEach((t, i) => {
        if (cx > 0 && cx + widths[i] > g.w - PAD * 2) { rows.push([]); cx = 0; }
        rows[rows.length - 1].push({ t, w: widths[i], x: cx });
        cx += widths[i] + GAP;
      });
      const gh = 62 + rows.length * (CHIP_H + GAP) + 8;
      washRect(ctx, X(g.x), Y(g.y), S(g.w), S(gh), g.color, { alpha: 0.13, seed: 2000 + gi });
      rect(ctx, X(g.x), Y(g.y), S(g.w), S(gh), { w: S(2.5), color: g.color, seed: 2010 + gi });
      text(ctx, g.group, X(g.x + PAD), Y(g.y + 40), { size: S(27), kind: 'handBold', color: g.color, maxWidth: S(g.w - PAD * 2), maxLines: 1 });
      rows.forEach((row, ri) => row.forEach((c, ci) => {
        const x = g.x + PAD + c.x, y = g.y + 58 + ri * (CHIP_H + GAP);
        card(ctx, X(x), Y(y), S(c.w), S(CHIP_H), { seed: 2100 + gi * 40 + ri * 10 + ci, color: g.color, fill: '#ffffff', w: 1.6 });
        text(ctx, c.t, X(x + c.w / 2), Y(y + CHIP_H / 2 + 7), { size: S(FS), kind: 'mono', color: C.ink, align: 'center', maxWidth: S(c.w - 8), maxLines: 1 });
      }));
    });
  },
});

// ---------------------------------------------------------------- act 4: three ways to use Flint

type TrioPanel = (ctx: Ctx, b: Board, x: number, py: number) => void;

/**
 * Three hand-drawn windows side by side. With `focus`, the other two fade back and that one is circled
 * in `ring`; the slide prints the labels underneath as text.
 */
function trio(panels: TrioPanel[], seed: number, focus?: number, ring: string = C.red): Draw {
  return (ctx, w, h) => {
    const s = Math.min(w / 1500, h / 410);
    const b: Board = { X: (v) => v * s + (w - 1500 * s) / 2, Y: (v) => v * s + (h - 410 * s) / 2, S: (v) => v * s };
    const { X, Y, S } = b;
    const PW = 420, PH = 330, xs = [45, 540, 1035], py = 40;
    xs.forEach((x, i) => {
      const k = seed + i * 100;
      card(ctx, X(x), Y(py), S(PW), S(PH), { seed: k, color: C.ink, fill: C.paper, w: 2.5 });
      line(ctx, X(x), Y(py + 34), X(x + PW), Y(py + 34), { w: S(2), color: C.soft, seed: k + 1 });
      [0, 1, 2].forEach((j) => dot(ctx, X(x + 20 + j * 18), Y(py + 17), S(5), [C.red, C.amber, C.green][j], { seed: k + 2 + j }));
      panels[i](ctx, b, x, py);
    });
    if (focus !== undefined) {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.66)';
      xs.forEach((x, i) => { if (i !== focus) ctx.fillRect(X(x - 20), Y(0), S(PW + 40), S(410)); });
      ctx.restore();
      ellipse(ctx, X(xs[focus] + PW / 2), Y(py + PH / 2), S(PW / 2 + 30), S(PH / 2 + 26), { w: S(5), color: ring, seed: seed + 900 + focus });
    }
  };
}

// The three ways to use Flint: a chat with a chart card in the reply; an app with a table linked to a
// chart; a theme's swatches and typeface carried onto three charts.
const USE_PANELS: TrioPanel[] = [
  (ctx, { X, Y, S }, x, py) => {
    washRect(ctx, X(x + 150), Y(py + 52), S(250), S(46), C.blue, { alpha: 0.22, seed: 1106 });
    line(ctx, X(x + 166), Y(py + 70), X(x + 376), Y(py + 70), { w: S(3), color: C.blue, seed: 1107 });
    line(ctx, X(x + 166), Y(py + 84), X(x + 320), Y(py + 84), { w: S(3), color: C.blue, seed: 1108 });
    dot(ctx, X(x + 32), Y(py + 128), S(12), C.ink, { seed: 1109 });
    card(ctx, X(x + 54), Y(py + 116), S(346), S(196), { seed: 1110, color: C.soft, fill: '#ffffff', w: 2 });
    miniLines(ctx, X(x + 74), Y(py + 140), S(306), S(150), { seed: 1111, series: 3 });
  },
  (ctx, { X, Y, S }, x, py) => {
    text(ctx, '<FlintChart />', X(x + 20), Y(py + 66), { size: S(22), kind: 'mono', color: C.meaning, maxWidth: S(220), maxLines: 1 });
    rect(ctx, X(x + 20), Y(py + 86), S(150), S(220), { w: S(2), color: C.soft, seed: 1201 });
    for (let i = 0; i < 6; i++) {
      line(ctx, X(x + 32), Y(py + 112 + i * 32), X(x + 158), Y(py + 112 + i * 32), { w: S(i === 2 ? 4 : 2), color: i === 2 ? C.amber : C.soft, seed: 1202 + i });
    }
    card(ctx, X(x + 196), Y(py + 86), S(204), S(220), { seed: 1210, color: C.soft, fill: '#ffffff', w: 2 });
    miniBars(ctx, X(x + 212), Y(py + 110), S(172), S(180), { seed: 1211, bars: 5, color: [C.soft, C.soft, C.amber, C.soft, C.soft] });
    arrow(ctx, X(x + 162), Y(py + 176), X(x + 252), Y(py + 176), { w: S(3), color: C.amber, seed: 1212, head: S(12) });
  },
  (ctx, { X, Y, S }, x, py) => {
    text(ctx, 'Aa', X(x + 28), Y(py + 100), { size: S(48), kind: 'handBold', color: C.ink, maxWidth: S(90), maxLines: 1 });
    ['#1f3b73', '#1b998b', '#e3a72f', '#8d99ae', '#c8553d'].forEach((c, i) => dot(ctx, X(x + 140 + i * 52), Y(py + 82), S(17), c, { seed: 1301 + i }));
    const pal = ['#1f3b73', '#1b998b', '#e3a72f'];
    [0, 1, 2].forEach((i) => {
      const cx = x + 22 + i * 132;
      card(ctx, X(cx), Y(py + 136), S(118), S(170), { seed: 1310 + i * 3, color: C.soft, fill: '#ffffff', w: 2 });
      if (i === 0) miniBars(ctx, X(cx + 12), Y(py + 160), S(94), S(130), { seed: 1320, bars: 4, color: pal[0] });
      if (i === 1) miniLines(ctx, X(cx + 10), Y(py + 160), S(98), S(130), { seed: 1321, series: 2, colors: pal });
      if (i === 2) miniHeatmap(ctx, X(cx + 12), Y(py + 164), S(94), S(118), { rows: 4, cols: 4, seed: 1322, palette: pal, frame: false });
    });
  },
];

// The three specs: semantic types that become a chart; a theme that turns a plain chart into a house
// chart; a click that arrives as an event naming the data.
const SPEC_PANELS: TrioPanel[] = [
  (ctx, { X, Y, S }, x, py) => {
    ['"period": "YearMonth"', '"game": "Category"', '"newUsers": "Profit"'].forEach((t, i) =>
      text(ctx, t, X(x + 24), Y(py + 72 + i * 32), { size: S(21), kind: 'mono', color: C.meaning, maxWidth: S(370), maxLines: 1 }));
    miniHeatmap(ctx, X(x + 40), Y(py + 178), S(340), S(110), { rows: 4, cols: 10, seed: 1511, palette: DEFAULT_DIVERGING, frame: false });
    line(ctx, X(x + 40), Y(py + 298), X(x + 380), Y(py + 298), { w: S(2), color: C.ink, seed: 1512 });
  },
  (ctx, { X, Y, S }, x, py) => {
    text(ctx, '"theme_spec": "economist"', X(x + 24), Y(py + 72), { size: S(21), kind: 'mono', color: C.look, maxWidth: S(370), maxLines: 1 });
    card(ctx, X(x + 20), Y(py + 104), S(160), S(200), { seed: 1601, color: C.soft, fill: '#ffffff', w: 2 });
    miniBars(ctx, X(x + 34), Y(py + 140), S(132), S(150), { seed: 1602, bars: 4, color: '#a7adb2' });
    arrow(ctx, X(x + 188), Y(py + 204), X(x + 232), Y(py + 204), { w: S(3), color: C.look, seed: 1603, head: S(12) });
    card(ctx, X(x + 240), Y(py + 104), S(160), S(200), { seed: 1604, color: C.soft, fill: '#ffffff', w: 2 });
    washRect(ctx, X(x + 254), Y(py + 118), S(30), S(9), '#e3120b', { alpha: 0.95, seed: 1605 });
    miniBars(ctx, X(x + 254), Y(py + 140), S(132), S(150), { seed: 1602, bars: 4, color: '#006ba2' });
  },
  (ctx, { X, Y, S }, x, py) => {
    const pts: [number, number, number][] = [[50, 250, 9], [80, 200, 12], [110, 230, 8], [140, 150, 14], [170, 180, 10], [200, 110, 11], [120, 280, 8], [60, 120, 9]];
    rect(ctx, X(x + 20), Y(py + 56), S(210), S(250), { w: S(2), color: C.soft, seed: 1701 });
    pts.forEach(([px, pyy, r], i) => dot(ctx, X(x + px), Y(py + pyy), S(r), i === 3 ? C.behavior : C.soft, { seed: 1702 + i }));
    ellipse(ctx, X(x + 140), Y(py + 150), S(22), S(22), { w: S(2.5), color: C.amber, seed: 1711 });
    arrow(ctx, X(x + 236), Y(py + 180), X(x + 262), Y(py + 180), { w: S(3), color: C.behavior, seed: 1712, head: S(10) });
    card(ctx, X(x + 268), Y(py + 116), S(136), S(130), { seed: 1713, color: C.behavior, fill: '#ffffff', w: 2.5 });
    text(ctx, 'click', X(x + 280), Y(py + 152), { size: S(19), kind: 'mono', color: C.ink2, maxWidth: S(116), maxLines: 1 });
    text(ctx, 'Country:', X(x + 280), Y(py + 188), { size: S(19), kind: 'mono', color: C.ink, maxWidth: S(116), maxLines: 1 });
    text(ctx, '"Japan"', X(x + 280), Y(py + 222), { size: S(19), kind: 'mono', color: C.behavior, maxWidth: S(116), maxLines: 1 });
  },
];

const SPEC_RINGS = [C.meaning, C.look, C.behavior];

Object.assign(SKETCHES, {
  useCases: trio(USE_PANELS, 1100),
  useCase1: trio(USE_PANELS, 1100, 0),
  useCase2: trio(USE_PANELS, 1100, 1),
  useCase3: trio(USE_PANELS, 1100, 2),
  specs: trio(SPEC_PANELS, 1500),
  spec1: trio(SPEC_PANELS, 1500, 0, SPEC_RINGS[0]),
  spec2: trio(SPEC_PANELS, 1500, 1, SPEC_RINGS[1]),
  spec3: trio(SPEC_PANELS, 1500, 2, SPEC_RINGS[2]),
});
