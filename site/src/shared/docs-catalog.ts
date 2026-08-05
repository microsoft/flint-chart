import agentIcon from '../assets/agent-icon.svg';

export type DocSection = 'documentation';

export interface DocEntry {
  slug: string;
  title: string;
  description: string;
  icon?: string;
  /** Path relative to site/ — resolved by Vite raw import glob. */
  file: string;
}

export interface DocGroup {
  id: string;
  label: string;
  docs: DocEntry[];
}

export const DOCUMENTATION_GROUPS: DocGroup[] = [
  {
    id: 'quick-start',
    label: 'Quick start',
    docs: [
      {
        slug: 'getting-started',
        title: 'Getting started',
        description:
          'Install Flint, then make your first chart from a simple DataSpec and ChartSpec.',
        file: '../../../docs/tutorials/getting-started.md',
      },
      {
        slug: 'data-story',
        title: 'Example: a data story',
        description:
          'One DataSpec, five bespoke chart designs: switch templates and backends by editing only the ChartSpec.',
        file: '../../../docs/tutorials/data-story.md',
      },
      {
        slug: 'theme-spec',
        title: 'Using themes',
        description: 'Use a preset, define a design system, or inherit and override a shipped theme.',
        file: '../../../docs/theme-spec.md',
      },
      {
        slug: 'setup-flint-mcp',
        title: 'Set up Flint MCP',
        description:
          'Configure the MCP server, data roots, tools, resources, backends, and first verification prompt.',
        icon: agentIcon,
        file: '../../../docs/tutorials/setup-flint-mcp.md',
      },
      {
        slug: 'agent-workflows',
        title: 'Agent workflows',
        description:
          'Walk through a Data Formulator-style agent workflow that uses Flint as the semantic chart layer.',
        icon: agentIcon,
        file: '../../../docs/tutorials/agent-workflows.md',
      },
    ],
  },
  {
    id: 'introduction',
    label: 'Language design',
    docs: [
      {
        slug: 'overview',
        title: 'Overview',
        description: 'Problem, dataSpec + chartSpec, compiler output, and doc map.',
        file: '../../../docs/overview.md',
      },
      {
        slug: 'architecture',
        title: 'Architecture',
        description: 'Three-stage pipeline, design principles, and repo layout.',
        file: '../../../docs/architecture.md',
      },
      {
        slug: 'semantic-types',
        title: 'Semantic Type',
        description: 'Type hierarchy, annotations, compilation pipeline, and resolution rules.',
        file: '../../../docs/design-semantics.md',
      },
      {
        slug: 'color-decisions',
        title: 'Color decisions',
        description: 'Scheme families, ColorDecision, and per-backend palette selection.',
        file: '../../../docs/color-decisions.md',
      },
      {
        slug: 'layout-model',
        title: 'Auto Layout Algorithm',
        description: 'Spring, gas-pressure, radial, and area sizing models.',
        file: '../../../docs/design-stretch-model.md',
      },
      {
        slug: 'api-reference',
        title: 'API reference',
        description: 'ChartAssemblyInput, assemblers, encodings, options, and exports.',
        file: '../../../docs/api-reference.md',
      },
    ],
  },
  {
    id: 'reference',
    label: 'Chart guide',
    docs: [
      {
        slug: 'reference-vegalite',
        title: 'Vega-Lite charts',
        description: 'Every Vega-Lite chart type, its channels, and configurable parameters.',
        file: '../../../docs/reference-vegalite.md',
      },
      {
        slug: 'reference-echarts',
        title: 'ECharts charts',
        description: 'Every ECharts chart type, its channels, and configurable parameters.',
        file: '../../../docs/reference-echarts.md',
      },
      {
        slug: 'reference-chartjs',
        title: 'Chart.js charts',
        description: 'Every Chart.js chart type, its channels, and configurable parameters.',
        file: '../../../docs/reference-chartjs.md',
      },
      {
        slug: 'reference-plotly',
        title: 'Plotly charts',
        description: 'Every Plotly chart type, its channels, and configurable parameters.',
        file: '../../../docs/reference-plotly.md',
      },
      {
        slug: 'reference-excel',
        title: 'Excel charts',
        description: 'Every native Excel chart type, its channels, and Office.js mapping.',
        file: '../../../docs/reference-excel.md',
      },
    ],
  },
  {
    id: 'extending',
    label: 'Development',
    docs: [
      {
        slug: 'development',
        title: 'Development guide',
        description: 'Monorepo setup, daily commands, and test strategy.',
        file: '../../../docs/DEVELOPMENT.md',
      },
      {
        slug: 'test-plan',
        title: 'Chart engine test plan',
        description: 'Shared visual cases, coverage matrices, and backend bring-up workflow.',
        file: '../../../docs/test_plan.md',
      },
      {
        slug: 'adding-a-semantic-type',
        title: 'Extending semantic types',
        description: 'Decide when a new field meaning is needed, then register and verify it.',
        file: '../../../docs/adding-a-semantic-type.md',
      },
      {
        slug: 'adding-a-backend',
        title: 'Extending backends',
        description: 'Add a rendering target while keeping semantics and layout in the shared pipeline.',
        file: '../../../docs/adding-a-backend.md',
      },
      {
        slug: 'adding-a-chart-template',
        title: 'Extending chart templates',
        description: 'Add a chart type to an existing backend, then cover it in tests and the gallery.',
        file: '../../../docs/adding-a-chart-template.md',
      },
    ],
  },
];

export function getDocGroups(_section: DocSection): DocGroup[] {
  return DOCUMENTATION_GROUPS;
}

export function getDocsForSection(section: DocSection): DocEntry[] {
  return getDocGroups(section).flatMap((g) => g.docs);
}

export function getDocEntry(section: DocSection, slug: string): DocEntry | undefined {
  return getDocsForSection(section).find((d) => d.slug === slug);
}
