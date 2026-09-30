import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { INTERACTION_PRESET_REQUIREMENTS } from 'flint-chart';

const root = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(fileURLToPath(new URL(path, root)), 'utf8');

const SKILLS = ['flint-chart-author', 'flint-theme-author', 'flint-interaction-author'];
const interactionSkill = read('agent-skills/flint-interaction-author/SKILL.md');

describe('agent skills', () => {
  it('ship the same text in the MCP assets as in agent-skills', () => {
    for (const skill of SKILLS) {
      expect(read(`packages/flint-mcp/assets/${skill}.SKILL.md`), `${skill}: run npm run sync:skills`)
        .toBe(read(`agent-skills/${skill}/SKILL.md`));
    }
  });

  it('name only presets the library ships, and every one of them', () => {
    const presets = Object.keys(INTERACTION_PRESET_REQUIREMENTS);
    const named = new Set<string>();
    for (const [, name] of interactionSkill.matchAll(/`([a-z]+(?:-[a-z]+)*)`/g)) {
      if (presets.includes(name)) named.add(name);
    }
    expect([...named].sort()).toEqual([...presets].sort());

    const table = interactionSkill.slice(interactionSkill.indexOf('## Interaction Preset map'), interactionSkill.indexOf('## Presets by intent'));
    const listed = [...table.matchAll(/^\| `([a-z-]+)`(?:, `([a-z-]+)`)? \|/gm)].flatMap((m) => [m[1], m[2]].filter(Boolean));
    expect(listed.sort()).toEqual([...presets].sort());
  });
});
