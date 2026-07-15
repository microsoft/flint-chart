import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = resolve(root, '.github/extensions/flint-chart');

const canvasTarget = resolve(pluginRoot, 'assets/flint-app.html');
await mkdir(dirname(canvasTarget), { recursive: true });
await cp(resolve(root, 'packages/flint-mcp/assets/flint-app.html'), canvasTarget);

const skillTarget = resolve(pluginRoot, 'skills/flint-chart-author/SKILL.md');
await mkdir(dirname(skillTarget), { recursive: true });
const skill = await readFile(resolve(root, 'agent-skills/flint-chart-author/SKILL.md'), 'utf8');
await writeFile(
  skillTarget,
  `${skill.trimEnd()}\n\n## Copilot CLI chart canvas\n\nWhen this plugin's native **Flint Chart Canvas** is available, open it with the complete \`ChartAssemblyInput\` after the input has been validated. Pass the exact inline \`data.values\`, \`semantic_types\`, and \`chart_spec\` that Flint will render. The canvas owns interactive chart customization and shows its Vega-Lite output; do not recreate that UI or replace it with a browser page.\n`,
);
