/** Dev helper: text boxes in an SVG that overlap one another (pairs), for sweeping a backend's cases. */
export function overlappingTexts(svg: SVGSVGElement, minArea = 6): Array<[string, string]> {
  const boxes = [...svg.querySelectorAll('text')].map((t) => ({ text: (t.textContent ?? '').trim(), r: t.getBoundingClientRect() }))
    .filter((b) => b.text && b.r.width > 0 && b.r.height > 0);
  const out: Array<[string, string]> = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r;
      const b = boxes[j].r;
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > 1 && h > 1 && w * h >= minArea) out.push([boxes[i].text, boxes[j].text]);
    }
  }
  return out;
}
