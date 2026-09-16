import { TEST_GENERATORS } from 'flint-chart/test-data';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';

export interface Example {
  name: string;
  input: any;
}

/** Basic charts pulled straight from the gallery (first case of each). */
const GALLERY_PICKS: { name: string; generator: string }[] = [
  { name: 'Scatter', generator: 'Gallery: Scatter' },
  { name: 'Line', generator: 'Gallery: Line' },
  { name: 'Bar', generator: 'Gallery: Bar' },
  { name: 'Stacked Bar', generator: 'Gallery: Stacked Bar' },
  { name: 'Grouped Bar', generator: 'Gallery: Grouped Bar' },
  { name: 'Area', generator: 'Gallery: Area' },
  { name: 'Pie', generator: 'Gallery: Pie' },
  { name: 'Histogram', generator: 'Gallery: Histogram' },
  { name: 'Radar', generator: 'Gallery: Radar' },
  { name: 'Heatmap', generator: 'Omni: Heatmap' },
  { name: 'Waterfall', generator: 'Omni: Waterfall' },
  { name: 'Sunburst', generator: 'Omni: Sunburst' },
];

export const EXAMPLES: Example[] = GALLERY_PICKS.flatMap(({ name, generator }) => {
  const testCase = TEST_GENERATORS[generator]?.()[0];
  if (!testCase) return [];
  return [{ name, input: testCaseToAssemblyInput(testCase) }];
});

const interactiveCase = TEST_GENERATORS['Gallery: Stacked Bar']?.()[0];
if (interactiveCase) {
  EXAMPLES.push({
    name: 'Interactive bar',
    input: testCaseToAssemblyInput({
      ...interactiveCase,
      interactionSpec: {
        interactions: [
          { type: 'click-highlight' },
          { type: 'legend-toggle' },
          { type: 'navigate', options: { axes: 'y', pan: false, reset: ['double-click', 'escape'] } },
        ],
      },
    }),
  });
}
