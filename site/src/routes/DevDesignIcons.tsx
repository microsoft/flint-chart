/** Small hand-drawn icons for the design page, in the video's sketch style (the talk's port of promo-en/render/lib.js). */
import { useEffect, useRef } from 'react';
import { C, arrow, dot, ellipse, line, rect, rng, stroke, washRect } from '../talk/sketch';

type Ctx = CanvasRenderingContext2D;
type Pt = [number, number];
export type SketchIconKind = 'agent' | 'untangle' | 'many';

/** Every icon is drawn on a 240 × 180 board, then scaled to its box. */
const BW = 240;
const BH = 180;
/** Strokes a little heavier than the video's, so they read at icon size. */
const T = 1.45;

function roundRect(x: number, y: number, w: number, h: number, r: number): Pt[] {
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
  pts.push(pts[0]);
  return pts;
}

/** The video's agent: a rounded head, an antenna with an amber bulb, two eyes; beside it the chart it made. */
function agent(ctx: Ctx) {
  const hx = 18, hy = 62, hw = 96, hh = 78;
  washRect(ctx, hx + 4, hy + 4, hw - 8, hh - 8, C.card, { alpha: 0.9, seed: 3 });
  stroke(ctx, roundRect(hx, hy, hw, hh, 20), { w: 4.5 * T, seed: 301 });
  line(ctx, hx + hw / 2, hy, hx + hw / 2, hy - 24, { w: 4 * T, seed: 302 });
  dot(ctx, hx + hw / 2, hy - 30, 8, C.amber, { seed: 303 });
  dot(ctx, hx + hw / 2 - 20, hy + 36, 7, C.ink, { seed: 304 });
  dot(ctx, hx + hw / 2 + 20, hy + 36, 7, C.ink, { seed: 305 });
  // The chart: three bars on a baseline, washed in the deck's colours.
  const bx = 140, base = 140;
  [[0, 44, C.blue], [28, 78, C.teal], [56, 60, C.amber]].forEach(([dx, h, color], i) => {
    washRect(ctx, bx + (dx as number), base - (h as number), 20, h as number, color as string, { alpha: 0.75, seed: 40 + i });
    rect(ctx, bx + (dx as number), base - (h as number), 20, h as number, { w: 2.6 * T, seed: 50 + i * 7, overshoot: 2 });
  });
  line(ctx, bx - 10, base, bx + 88, base, { w: 3.4 * T, seed: 60 });
  // A small spark: it looks good.
  const sx = 214, sy = 48;
  line(ctx, sx, sy - 13, sx, sy + 13, { w: 3 * T, color: C.amber, seed: 70 });
  line(ctx, sx - 13, sy, sx + 13, sy, { w: 3 * T, color: C.amber, seed: 71 });
}

/** The talk's tangle (site/src/talk/sketches.ts): many short strands in the three colours, crossing in one ball. */
function knot(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, colors: string[], strands: number) {
  const r = rng(0.4141);
  for (let k = 0; k < strands; k++) {
    const pts: Pt[] = [];
    let a = r() * Math.PI * 2;
    for (let i = 0; i < 9; i++) {
      a += (r() - 0.3) * 1.8;
      const rr = 0.25 + r() * 0.75;
      pts.push([cx + Math.cos(a) * rx * rr, cy + Math.sin(a) * ry * rr]);
    }
    stroke(ctx, pts, { w: 2.2 * T, color: colors[k % 3], alpha: 0.85, seed: k * 5 + 1, wobble: 1.6 });
  }
}

/** Meaning, look and behaviour knotted into one ball; the compiler pulls them out as three clean threads. */
function untangle(ctx: Ctx) {
  const colors = [C.meaning, C.look, C.behavior];
  knot(ctx, 64, 92, 52, 52, colors, 12);
  arrow(ctx, 124, 92, 152, 92, { w: 3.4 * T, seed: 30, head: 11, color: C.ink2 });
  colors.forEach((color, i) => line(ctx, 164, 64 + i * 28, 230, 64 + i * 28, { w: 4.4 * T, color, seed: 40 + i }));
}

/** A fan of chart cards, a bar, a line and a pie, in different looks. */
function many(ctx: Ctx) {
  const cardAt = (x: number, y: number, w: number, h: number, angle: number, seed: number, draw: () => void) => {
    ctx.save(); ctx.translate(x + w / 2, y + h / 2); ctx.rotate(angle); ctx.translate(-w / 2, -h / 2);
    washRect(ctx, 0, 0, w, h, C.card, { alpha: 0.95, seed });
    rect(ctx, 0, 0, w, h, { w: 3 * T, seed: seed + 1, overshoot: 3 });
    draw();
    ctx.restore();
  };
  cardAt(14, 50, 84, 74, -0.16, 100, () => {
    [[14, 30, C.blue], [34, 46, C.blue], [54, 22, C.blue]].forEach(([x, h, color], i) => washRect(ctx, x as number, 62 - (h as number), 14, h as number, color as string, { alpha: 0.8, seed: 110 + i }));
    line(ctx, 8, 62, 76, 62, { w: 2.4 * T, seed: 120 });
  });
  cardAt(144, 46, 84, 74, 0.14, 200, () => {
    ellipse(ctx, 42, 37, 22, 22, { w: 2.6 * T, seed: 210 });
    washRect(ctx, 30, 22, 14, 14, C.amber, { alpha: 0.8, seed: 211 });
    line(ctx, 42, 37, 42, 15, { w: 2.2 * T, seed: 212 }); line(ctx, 42, 37, 61, 46, { w: 2.2 * T, seed: 213 });
  });
  cardAt(76, 70, 90, 80, 0, 300, () => {
    stroke(ctx, [[10, 58], [28, 40], [44, 48], [62, 22], [80, 30]], { w: 3.4 * T, color: C.red, seed: 310 });
    line(ctx, 8, 66, 82, 66, { w: 2.4 * T, seed: 311 });
  });
  [C.blue, C.teal, C.amber, C.red, C.purple].forEach((color, i) => dot(ctx, 84 + i * 18, 26, 6, color, { seed: 400 + i }));
}

const DRAW: Record<SketchIconKind, (ctx: Ctx) => void> = { agent, untangle, many };

export function SketchIcon({ kind, label }: { kind: SketchIconKind; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const draw = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      if (!w || !h) return;
      const dpr = Math.max(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext('2d')!;
      const k = Math.min(w / BW, h / BH);
      ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (w - BW * k) / 2, dpr * (h - BH * k) / 2);
      ctx.clearRect(0, 0, BW, BH);
      DRAW[kind](ctx);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [kind]);
  return <canvas ref={ref} role="img" aria-label={label} style={{ width: '100%', height: '100%', display: 'block' }} />;
}
