// Hand-drawn sketch primitives for the talk deck, ported from the video (promo-en/render/lib.js):
// perfect-freehand strokes with a gentle wobble, watercolour washes, and Kalam lettering.
type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];

function getStroke(pts: (Pt | number[])[], options: any = {}): Pt[] {
  if (pts.length < 2) return [];
  const size = options.size ?? 4;
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const t = options.start?.taper && i < pts.length * 0.2
      ? (i / (pts.length * 0.2))
      : (options.end?.taper && i > pts.length * 0.8
        ? ((pts.length - 1 - i) / (pts.length * 0.2))
        : 1);
    const halfWidth = (size / 2) * Math.max(0.2, t);
    left.push([pts[i][0] + nx * halfWidth, pts[i][1] + ny * halfWidth]);
    right.push([pts[i][0] - nx * halfWidth, pts[i][1] - ny * halfWidth]);
  }
  return [...left, ...right.reverse()];
}

export const C = {
  paper: '#fbfbf8',
  card: '#ffffff',
  panel: '#f1f0ec',
  ink: '#1f2a33',
  ink2: '#52606b',
  soft: '#9aa3a8',
  amber: '#f4b41a',
  red: '#e4572e',
  blue: '#2f6db5',
  teal: '#2a9d8f',
  green: '#5a9a3a',
  purple: '#7a5ba6',
  meaning: '#2f6db5',
  look: '#e8954a',
  behavior: '#d9534f',
};

const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

function hash(...xs: (number | string)[]): number {
  let h = 2166136261;
  for (const x of xs) {
    const v = typeof x === 'number' ? Math.floor(x * 1000) : String(x).split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
    h ^= v; h = Math.imul(h, 16777619);
    h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995);
  }
  return ((h >>> 0) % 1000003) / 1000003;
}

export function rng(seed: number): () => number {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function resample(pts: Pt[], step: number): Pt[] {
  const out: Pt[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 1; k <= n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  return out;
}

function wobbleOffsets(seed: number, n: number, amp: number): Pt[] {
  const r = rng(hash(seed));
  const f1 = 0.05 + r() * 0.08, f2 = 0.17 + r() * 0.15, p1 = r() * 6.28, p2 = r() * 6.28;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    out.push([
      amp * (Math.sin(i * f1 + p1) * 0.7 + Math.sin(i * f2 + p2) * 0.3),
      amp * (Math.cos(i * f1 * 1.3 + p2) * 0.7 + Math.cos(i * f2 * 0.8 + p1) * 0.3),
    ]);
  }
  return out;
}

export interface StrokeOptions { w?: number; color?: string; seed?: number; alpha?: number; wobble?: number; taper?: boolean; bend?: number; head?: number }

/** A tapered, pressure-simulated brush stroke along `pts`. */
export function stroke(ctx: Ctx, pts: Pt[], o: StrokeOptions = {}): void {
  const { w = 4, color = C.ink, seed = 0, alpha = 1, wobble = 1.1, taper = true } = o;
  if (pts.length < 2) return;
  const dense = resample(pts, 7);
  const off = wobbleOffsets(seed, dense.length, wobble);
  const jit = dense.map(([x, y], i) => [x + off[i][0], y + off[i][1]]);
  const outline = getStroke(jit, {
    size: w, thinning: 0.5, smoothing: 0.55, streamline: 0.3, simulatePressure: true,
    start: { taper: taper ? w * 2.5 : 0, cap: true }, end: { taper: taper ? w * 2 : 0, cap: true }, last: true,
  });
  if (!outline.length) return;
  ctx.save(); ctx.globalAlpha *= alpha; ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i - 1], [x1, y1] = outline[i];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath(); ctx.fill(); ctx.restore();
}

export function line(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, o: StrokeOptions = {}): Pt[] {
  const bend = o.bend ?? 0;
  const nx = -(y2 - y1), ny = x2 - x1; const nl = Math.hypot(nx, ny) || 1;
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12; const b = Math.sin(k * Math.PI) * bend;
    pts.push([lerp(x1, x2, k) + nx / nl * b, lerp(y1, y2, k) + ny / nl * b]);
  }
  stroke(ctx, pts, o);
  return pts;
}

export function arrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, o: StrokeOptions = {}): void {
  const pts = line(ctx, x1, y1, x2, y2, o);
  const [ax, ay] = pts[pts.length - 1], [bx, by] = pts[pts.length - 3];
  const ang = Math.atan2(ay - by, ax - bx), L = o.head ?? 16;
  for (const s of [-1, 1]) {
    const a = ang + Math.PI + s * 0.5;
    line(ctx, ax, ay, ax + Math.cos(a) * L, ay + Math.sin(a) * L, { ...o, seed: (o.seed || 0) + s * 7, bend: 0 });
  }
}

/** Sketchy rectangle: four slightly overshooting strokes. */
export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, o: StrokeOptions & { overshoot?: number } = {}): void {
  const os = o.overshoot ?? 6, seed = o.seed || 0;
  const sides: [number, number, number, number][] = [
    [x - os, y, x + w + os * 0.5, y], [x + w, y - os, x + w, y + h + os * 0.6],
    [x + w + os, y + h, x - os * 0.5, y + h], [x, y + h + os * 0.6, x, y - os],
  ];
  sides.forEach((s, i) => line(ctx, ...s, { ...o, seed: seed + i * 13, bend: (hash(seed, i) - 0.5) * 3 }));
}

export function ellipse(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, o: StrokeOptions = {}): void {
  const pts: Pt[] = []; const seed = o.seed || 0;
  for (let i = 0; i <= 48; i++) {
    const a = -2.2 + i / 48 * Math.PI * 2 * 1.06; const k = 1 + (hash(seed, i % 48) - 0.5) * 0.04 + i / 48 * 0.05;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  stroke(ctx, pts, o);
}

function blobPoly(pts: Pt[], seed: number, amp: number): Pt[] {
  const dense = resample([...pts, pts[0]], 14);
  const off = wobbleOffsets(seed, dense.length, amp);
  return dense.map(([x, y], i) => [x + off[i][0], y + off[i][1]]);
}

/** Watercolour wash: layered jittered fills. */
export function wash(ctx: Ctx, pts: Pt[], color: string, o: { alpha?: number; seed?: number; amp?: number } = {}): void {
  const { alpha = 0.5, seed = 0, amp = 2.2 } = o;
  ctx.save();
  for (let k = 0; k < 2; k++) {
    const poly = blobPoly(pts, seed + k * 31, amp);
    ctx.globalAlpha = alpha * 0.62; ctx.fillStyle = color; ctx.beginPath();
    poly.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

export function washRect(ctx: Ctx, x: number, y: number, w: number, h: number, color: string, o: { alpha?: number; seed?: number; amp?: number } = {}): void {
  if (w <= 0 || h <= 0) return;
  wash(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color, o);
}

export function dot(ctx: Ctx, x: number, y: number, r: number, color: string, o: { alpha?: number; seed?: number } = {}): void {
  const pts: Pt[] = [];
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); }
  wash(ctx, pts, color, { amp: Math.min(1.2, r * 0.15), alpha: o.alpha ?? 0.9, seed: o.seed || 0 });
}

/** A card: a soft wash with a sketched outline. */
export function card(ctx: Ctx, x: number, y: number, w: number, h: number, o: { seed?: number; color?: string; fill?: string; w?: number } = {}): void {
  washRect(ctx, x, y, w, h, o.fill ?? C.card, { alpha: 0.9, seed: (o.seed || 0) + 5, amp: 1.5 });
  rect(ctx, x, y, w, h, { w: o.w ?? 3, color: o.color ?? C.ink, seed: o.seed || 0 });
}

export type FontKind = 'hand' | 'handBold' | 'mono' | 'sans';
export function font(size: number, kind: FontKind = 'hand'): string {
  if (kind === 'mono') return `500 ${size}px ui-monospace, 'SF Mono', Menlo, Consolas, monospace`;
  // The deck's own type, for sentences that sit in a sketch but should read as text.
  if (kind === 'sans') return `400 ${size}px 'Inter Variable', Inter, system-ui, sans-serif`;
  return `${kind === 'handBold' ? 700 : 400} ${size}px 'Kalam'`;
}

export interface TextOptions {
  size?: number; kind?: FontKind; color?: string; align?: CanvasTextAlign; maxWidth?: number;
  min?: number; lineHeight?: number; maxLines?: number;
}

/**
 * Hand lettering, fitted: shrinks until every line fits `maxWidth` (never below `min`) and wraps
 * words onto at most `maxLines`. Returns the box it used, so callers can stack labels.
 */
export function text(ctx: Ctx, s: string, x: number, y: number, o: TextOptions = {}): { width: number; height: number; size: number } {
  const { size = 26, kind = 'hand', color = C.ink, align = 'left', maxWidth = Infinity, min = 12, lineHeight = 1.18, maxLines = 3 } = o;
  const wrap = (fsz: number): string[] => {
    ctx.font = font(fsz, kind);
    const out: string[] = []; let cur = '';
    for (const word of s.split(/\s+/)) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !cur) cur = next; else { out.push(cur); cur = word; }
    }
    if (cur) out.push(cur);
    return out;
  };
  ctx.save();
  let fs = size;
  let lines = wrap(fs);
  while (fs > min && (lines.length > maxLines || lines.some((l) => ctx.measureText(l).width > maxWidth))) {
    fs -= 1;
    lines = wrap(fs);
  }
  ctx.font = font(fs, kind); ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * fs * lineHeight));
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
  ctx.restore();
  return { width, height: lines.length * fs * lineHeight, size: fs };
}
