import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const skills = ['flint-chart-author', 'flint-theme-author', 'flint-interaction-author', 'flint-board-author'];

for (const skill of skills) {
    const source = fileURLToPath(new URL(`agent-skills/${skill}/SKILL.md`, root));
    const target = fileURLToPath(new URL(`packages/flint-mcp/assets/${skill}.SKILL.md`, root));
    copyFileSync(source, target);
    console.log(`${skill}: copied`);
}

// The Copilot CLI canvas carries the chart skill with its own section appended: keep the skill
// current and the canvas section as it is.
const CANVAS_HEADING = '\n\n## Copilot CLI chart canvas\n';
const canvasPath = fileURLToPath(new URL('.github/extensions/flint-chart/skills/flint-chart-author/SKILL.md', root));
const canvas = readFileSync(canvasPath, 'utf8');
const at = canvas.indexOf(CANVAS_HEADING);
if (at < 0) throw new Error(`${canvasPath} has no "## Copilot CLI chart canvas" section to keep`);
const chartSkill = readFileSync(fileURLToPath(new URL('agent-skills/flint-chart-author/SKILL.md', root)), 'utf8');
writeFileSync(canvasPath, `${chartSkill.trimEnd()}${canvas.slice(at)}`);
console.log('flint-chart-author: canvas copy refreshed');
