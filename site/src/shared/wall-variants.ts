import type { TestCase } from 'flint-chart/test-data';

// Stress / degenerate variants exist for test coverage but look messy in a
// gallery — keep them out of the wall.
const SKIP_TAGS = new Set(['overflow', 'cutoff', 'edge-case', 'degenerate', 'stress']);

/** Evenly sample `cap` items across `pool` (returns the whole pool when ≤ cap). */
function strideSample(pool: TestCase[], cap: number): TestCase[] {
  if (cap <= 0) return [];
  if (pool.length <= cap) return pool;
  const out: TestCase[] = [];
  const stride = pool.length / cap;
  for (let i = 0; i < cap; i++) out.push(pool[Math.floor(i * stride)]);
  return out;
}

/**
 * Pick a small, diverse set of examples for one chart type, capped at `cap`.
 *
 * Curation policy (gallery balance): **real, recognizable datasets come first**
 * and are never dropped; a faceted small-multiples showcase (tagged
 * `gallery-facet`) is pinned as the last tile when present; any remaining slots
 * are filled with synthetic cases (even-sampled) whose job is to show off
 * layout/stretch/sizing behaviour. Stress/edge cases are excluded up front.
 *
 * This keeps each chart type to a handful of tiles that lead with real data and
 * only include synthetic examples for showcasing — rather than flooding the wall
 * with synthetic coverage cases.
 */
export function selectVariants(tests: TestCase[], cap = 4): TestCase[] {
  const clean = tests.filter((t) => !(t.tags ?? []).some((tag) => SKIP_TAGS.has(tag)));
  const pool = clean.length > 0 ? clean : tests;

  const isReal = (t: TestCase) => (t.tags ?? []).includes('real');
  const isFacet = (t: TestCase) => (t.tags ?? []).includes('gallery-facet');
  const isShowcase = (t: TestCase) => (t.tags ?? []).includes('gallery-showcase');

  const real = pool.filter(isReal);
  const facet = pool.find(isFacet);
  const showcase = pool.filter((t) => isShowcase(t) && !isReal(t) && !isFacet(t));
  const plain = pool.filter((t) => !isReal(t) && !isFacet(t) && !isShowcase(t));

  const out: TestCase[] = [];
  // 1. Real datasets first (prioritized, never dropped).
  for (const t of real) if (out.length < cap) out.push(t);
  // 2. Reserve the last slot for the faceted showcase when present.
  const reserve = facet ? 1 : 0;
  let fill = Math.max(cap - out.length - reserve, 0);
  // 3. Fill remaining slots with curated stretch/sizing showcases first, then
  //    even-sampled plain synthetic cases for variety.
  if (fill > 0) {
    const picks = showcase.slice(0, fill);
    out.push(...picks);
    fill -= picks.length;
    if (fill > 0) out.push(...strideSample(plain, fill));
  }
  // 4. Pin the faceted small-multiples example last.
  if (facet && out.length < cap) out.push(facet);

  return out;
}
