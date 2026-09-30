import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pluginRoot = resolve(root, '.github/extensions/flint-chart');
const checkOnly = process.argv.includes('--check');
const packageJson = JSON.parse(await readFile(resolve(root, 'packages/flint-mcp/package.json'), 'utf8'));
const manifestPath = resolve(pluginRoot, '.plugin/plugin.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const mcpPath = resolve(pluginRoot, '.mcp.json');
const mcp = JSON.parse(await readFile(mcpPath, 'utf8'));
const skill = await readFile(resolve(root, 'agent-skills/flint-chart-author/SKILL.md'), 'utf8');

manifest.version = packageJson.version;
mcp.mcpServers.flint.args = ['--yes', `flint-chart-mcp@${packageJson.version}`];

const outputs = new Map([
  [manifestPath, `${JSON.stringify(manifest, null, 2)}\n`],
  [mcpPath, `${JSON.stringify(mcp, null, 2)}\n`],
  [resolve(pluginRoot, 'assets/flint-app.html'), await readFile(resolve(root, 'packages/flint-mcp/assets/flint-app.html'), 'utf8')],
  [resolve(pluginRoot, 'skills/flint-chart-author/SKILL.md'), `${skill.trimEnd()}\n\n## Copilot CLI chart canvas\n\nWhen this plugin's native **Flint Chart Canvas** is available, prefer it over \`create_chart_view\`. Validate the complete \`ChartAssemblyInput\` first, then open the canvas with that input, including any theme, options, and \`interaction_spec\`. Pass resolved inline \`data.values\`, not a local \`data.url\`: the canvas cannot read local data files. The canvas owns interactive chart customization; do not recreate that UI or replace it with a browser page.\n`],
]);

for (const [target, content] of outputs) {
  if (checkOnly) {
    if (await readFile(target, 'utf8') !== content) {
      throw new Error(`Copilot plugin is stale: ${target}. Run npm run build:copilot-plugin.`);
    }
  } else {
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

console.log(`Copilot plugin ${packageJson.version}: ${checkOnly ? 'verified' : 'synced'}.`);