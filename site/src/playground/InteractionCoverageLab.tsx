import { useMemo, useState } from 'react';
import {
  assembleVegaLite,
  declaredInteractionCapabilities,
  INTERACTION_CAPABILITY_DESCRIPTIONS,
  INTERACTION_PRESET_REQUIREMENTS,
  INTERACTION_PRESET_TYPES,
  vlAllTemplateDefs,
  type ChartTemplateDef,
  type InteractionCapability,
  type InteractionPresetType,
} from 'flint-chart';
import type { TestCase } from 'flint-chart/test-data';
import { INTERACTION_PRESETS } from 'flint-chart/interactive';
import { representativeCasesByChartType, testCaseToAssemblyInput } from '../shared/test-case-utils';
import './interaction-coverage.css';

type CellStatus = 'active' | 'declared' | 'unsupported';

type Cell =
  | { status: 'active' }
  | { status: 'declared' | 'unsupported'; missing: InteractionCapability };

interface Row {
  chartType: string;
  caseTitle?: string;
  declared: readonly InteractionCapability[];
  active: readonly InteractionCapability[];
  assembleError?: string;
  cells: Record<InteractionPresetType, Cell>;
}


function rowFor(def: ChartTemplateDef, testCase: TestCase | undefined): Row {
  const declared = declaredInteractionCapabilities(def.interactionSupport);
  let active: readonly InteractionCapability[] = [];
  let assembleError: string | undefined;
  if (testCase) {
    try {
      const spec = assembleVegaLite(testCaseToAssemblyInput(testCase)) as any;
      active = spec._interactionSemantics?.capabilities ?? [];
    } catch (error) {
      assembleError = error instanceof Error ? error.message : String(error);
    }
  }
  const declaredSet = new Set(declared);
  const activeSet = new Set(active);
  const cells = Object.fromEntries(INTERACTION_PRESET_TYPES.map((type) => {
    const requires = INTERACTION_PRESET_REQUIREMENTS[type];
    const missingDeclared = requires.find((capability) => !declaredSet.has(capability));
    if (missingDeclared) return [type, { status: 'unsupported', missing: missingDeclared }];
    const missingActive = requires.find((capability) => !activeSet.has(capability));
    if (missingActive) return [type, { status: 'declared', missing: missingActive }];
    return [type, { status: 'active' }];
  })) as Record<InteractionPresetType, Cell>;
  return { chartType: def.chart, caseTitle: testCase?.title, declared, active, assembleError, cells };
}

const GLYPH: Record<CellStatus, string> = { active: '●', declared: '○', unsupported: '×' };

function cellTitle(row: Row, type: InteractionPresetType, cell: Cell): string {
  const label = INTERACTION_PRESETS[type].label;
  if (cell.status === 'active') return `${label} on ${row.chartType}: supported, and active for "${row.caseTitle ?? 'this case'}".`;
  if (cell.status === 'declared') {
    return `${label} on ${row.chartType}: supported by the chart type, but "${row.caseTitle ?? 'this case'}" lacks ${INTERACTION_CAPABILITY_DESCRIPTIONS[cell.missing]}. A spec entry is dropped for this data.`;
  }
  return `${label} on ${row.chartType}: not supported. The chart type never offers ${INTERACTION_CAPABILITY_DESCRIPTIONS[cell.missing]}.`;
}

export function InteractionCoverageLab() {
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const cases = representativeCasesByChartType();
    return [...vlAllTemplateDefs]
      .sort((left, right) => left.chart.localeCompare(right.chart))
      .map((def) => rowFor(def, cases.get(def.chart)));
  }, []);
  const visible = filter.trim()
    ? rows.filter((row) => row.chartType.toLowerCase().includes(filter.trim().toLowerCase()))
    : rows;
  const tally = visible.reduce((counts, row) => {
    for (const cell of Object.values(row.cells)) counts[cell.status] += 1;
    return counts;
  }, { active: 0, declared: 0, unsupported: 0 } as Record<CellStatus, number>);

  return (
    <div className="dev-page ic-page">
      <header className="dev-page-heading">
        <h1>Interaction coverage</h1>
        <p>
          Every Vega-Lite chart type against every interaction preset. A chart type declares the properties it
          offers in its template; a preset declares the properties it needs in the registry. A filled dot means the
          preset is supported and active for the chart type's representative test case. A hollow dot means the chart
          type supports it, but this case's data lacks a property, so a spec entry would be dropped for this data.
          A cross means the chart type never offers what the preset needs.
        </p>
        <div className="ic-summary">
          <span><strong>{visible.length}</strong> chart types</span>
          <span><strong>{INTERACTION_PRESET_TYPES.length}</strong> presets</span>
          <span className="ic-summary-ok"><strong>{tally.active}</strong> active</span>
          <span className="ic-summary-warn"><strong>{tally.declared}</strong> supported, inactive for this data</span>
          <span><strong>{tally.unsupported}</strong> unsupported</span>
          <span><strong>{tally.active + tally.declared}</strong> supported by declaration</span>
        </div>
        <label className="ic-filter">
          <span>Chart type</span>
          <input
            type="search"
            value={filter}
            placeholder="Filter, for example bar"
            onChange={(event) => setFilter(event.target.value)}
          />
        </label>
      </header>
      <div className="ic-table-wrap">
        <table className="ic-table">
          <thead>
            <tr>
              <th scope="col" className="ic-chart">Chart type</th>
              <th scope="col" className="ic-caps">Declared properties</th>
              {INTERACTION_PRESET_TYPES.map((type) => (
                <th key={type} scope="col" className="ic-preset" title={INTERACTION_PRESETS[type].description}>
                  <span>{type}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.chartType}>
                <th scope="row" className="ic-chart" title={row.caseTitle ? `Representative case: ${row.caseTitle}` : undefined}>
                  {row.chartType}
                  {row.assembleError && <span className="ic-error" title={row.assembleError}> !</span>}
                </th>
                <td className="ic-caps">
                  {row.declared.map((capability) => (
                    <span
                      key={capability}
                      className={row.active.includes(capability) ? 'ic-cap ic-cap-active' : 'ic-cap'}
                      title={row.active.includes(capability)
                        ? `${capability}: declared and active for this case`
                        : `${capability}: declared; this case's data does not confirm it`}
                    >
                      {capability}
                    </span>
                  ))}
                </td>
                {INTERACTION_PRESET_TYPES.map((type) => {
                  const cell = row.cells[type];
                  return (
                    <td key={type} className={`ic-cell ic-cell-${cell.status}`} title={cellTitle(row, type, cell)}>
                      {GLYPH[cell.status]}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
