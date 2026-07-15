// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pluginRoot = resolve(
  fileURLToPath(new URL('../../..', import.meta.url)),
  '.github/extensions/flint-chart',
);

describe('Copilot Flint plugin bundle', () => {
  it('declares the bundled MCP server and Flint authoring skill', async () => {
    const manifest = JSON.parse(await readFile(resolve(pluginRoot, '.plugin/plugin.json'), 'utf8'));
    const mcp = JSON.parse(await readFile(resolve(pluginRoot, '.mcp.json'), 'utf8'));

    expect(manifest).toMatchObject({
      name: 'flint-chart',
      mcpServers: './.mcp.json',
      skills: './skills/',
    });
    expect(mcp.mcpServers.flint).toMatchObject({
      command: 'npx',
      args: ['--yes', 'flint-chart-mcp'],
    });
    await expect(readFile(resolve(pluginRoot, 'skills/flint-chart-author/SKILL.md'), 'utf8'))
      .resolves.toContain('Copilot CLI chart canvas');
  });

  it('packages the existing Flint canvas bundle for the native canvas bridge', async () => {
    const canvas = resolve(pluginRoot, 'assets/flint-app.html');

    await expect(stat(canvas)).resolves.toMatchObject({ size: expect.any(Number) });
    await expect(readFile(canvas, 'utf8')).resolves.toContain('Interactive chart workspace');
  });
});
