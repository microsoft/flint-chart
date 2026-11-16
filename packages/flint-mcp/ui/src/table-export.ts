// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** A drawn table as an image: the rows in view, in their own type, inks and rules. */

const SCALE = 2;

/** Draws the part of a table that is in view at its place, `origin` being the page point the canvas starts at. */
export function drawTable(ctx: CanvasRenderingContext2D, table: HTMLElement, origin: { left: number; top: number }): void {
  const view = table.getBoundingClientRect();
  const x = view.left - origin.left;
  const y = view.top - origin.top;
  const style = getComputedStyle(table);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, view.width, view.height);
  ctx.clip();
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(x, y, view.width, view.height);
  const headerRule = style.getPropertyValue('--flint-table-header-rule').trim();
  const head = table.querySelector('thead')?.getBoundingClientRect();
  for (const cell of table.querySelectorAll<HTMLElement>('th, td')) {
    const rect = cell.getBoundingClientRect();
    if (rect.bottom < view.top || rect.top > view.bottom) continue;
    if (cell.tagName === 'TD' && head && rect.bottom <= head.bottom) continue;
    const cellStyle = getComputedStyle(cell);
    const row = cell.parentElement ? Number(getComputedStyle(cell.parentElement).opacity) : 1;
    ctx.globalAlpha = Number.isFinite(row) ? row : 1;
    const left = rect.left - origin.left;
    const top = rect.top - origin.top;
    if (cell.tagName === 'TH') {
      ctx.fillStyle = style.backgroundColor;
      ctx.fillRect(left, top, rect.width, rect.height);
    }
    const rule = cell.tagName === 'TH' ? headerRule : cellStyle.borderBottomColor;
    const ruleWidth = cell.tagName === 'TH' ? 1 : parseFloat(cellStyle.borderBottomWidth);
    if (rule && ruleWidth > 0) {
      ctx.fillStyle = rule;
      ctx.fillRect(left, top + rect.height - ruleWidth, rect.width, ruleWidth);
    }
    const text = cell.textContent?.trim();
    if (!text) continue;
    const textStyle = getComputedStyle(cell.querySelector('button') ?? cell);
    ctx.font = `${textStyle.fontStyle} ${textStyle.fontWeight} ${textStyle.fontSize} ${textStyle.fontFamily}`;
    ctx.fillStyle = textStyle.color;
    ctx.textBaseline = 'middle';
    const end = cellStyle.textAlign === 'right' || cell.classList.contains('flint-table-end');
    ctx.textAlign = end ? 'right' : 'left';
    const inset = parseFloat(textStyle.paddingLeft) || parseFloat(cellStyle.paddingLeft) || 0;
    ctx.fillText(text, end ? left + rect.width - inset : left + inset, top + rect.height / 2);
  }
  ctx.globalAlpha = 1;
  // The theme's furniture: the tab or band above the title and the rules, drawn as the blocks they are.
  for (const piece of table.querySelectorAll<Element>('.flint-table-furniture rect, .flint-table-rule')) {
    const rect = piece.getBoundingClientRect();
    const fill = piece instanceof HTMLElement ? getComputedStyle(piece).backgroundColor : piece.getAttribute('fill');
    if (!fill || rect.width === 0 || rect.height === 0) continue;
    ctx.fillStyle = fill;
    ctx.fillRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
  }
  ctx.textAlign = 'left';
  for (const line of table.querySelectorAll<HTMLElement>('.flint-table-source-line')) {
    const rect = line.getBoundingClientRect();
    if (rect.bottom < view.top || rect.top > view.bottom) continue;
    const lineStyle = getComputedStyle(line);
    ctx.font = `${lineStyle.fontStyle} ${lineStyle.fontWeight} ${lineStyle.fontSize} ${lineStyle.fontFamily}`;
    ctx.fillStyle = lineStyle.color;
    ctx.textBaseline = 'middle';
    const [start, end] = [...line.children] as HTMLElement[];
    const middle = rect.top - origin.top + rect.height / 2;
    if (start?.textContent?.trim()) ctx.fillText(start.textContent.trim(), rect.left - origin.left, middle);
    if (end?.textContent?.trim()) {
      ctx.textAlign = 'right';
      ctx.fillText(end.textContent.trim(), rect.right - origin.left, middle);
      ctx.textAlign = 'left';
    }
  }
  for (const line of table.querySelectorAll<HTMLElement>('.flint-table-title, .flint-table-subtitle, .flint-table-note')) {
    const text = line.textContent?.trim();
    if (!text) continue;
    const rect = line.getBoundingClientRect();
    if (rect.bottom < view.top || rect.top > view.bottom) continue;
    const lineStyle = getComputedStyle(line);
    ctx.font = `${lineStyle.fontStyle} ${lineStyle.fontWeight} ${lineStyle.fontSize} ${lineStyle.fontFamily}`;
    ctx.fillStyle = lineStyle.color;
    ctx.textBaseline = 'middle';
    const inset = parseFloat(lineStyle.paddingLeft) || 0;
    ctx.fillText(text, rect.left - origin.left + inset, rect.top - origin.top + rect.height / 2);
  }
  ctx.restore();
}

/** The table's view as a PNG. */
export function tablePng(table: HTMLElement): Promise<Blob> {
  const rect = table.getBoundingClientRect();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(rect.width * SCALE);
  canvas.height = Math.ceil(rect.height * SCALE);
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('No canvas to draw on'));
  ctx.scale(SCALE, SCALE);
  drawTable(ctx, table, rect);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The table could not be exported'))), 'image/png');
  });
}
