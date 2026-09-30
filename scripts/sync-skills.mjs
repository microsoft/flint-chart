import { copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const skills = ['flint-chart-author', 'flint-theme-author', 'flint-interaction-author'];

for (const skill of skills) {
    const source = fileURLToPath(new URL(`agent-skills/${skill}/SKILL.md`, root));
    const target = fileURLToPath(new URL(`packages/flint-mcp/assets/${skill}.SKILL.md`, root));
    copyFileSync(source, target);
    console.log(`${skill}: copied`);
}
