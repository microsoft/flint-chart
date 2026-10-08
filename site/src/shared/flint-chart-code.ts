export interface PresetCall {
  /** The preset factory, e.g. `clickHighlight`. */
  factory: string;
  /** The options argument, already formatted; empty for none. */
  options: string;
}

export function presetFactoryName(type: string): string {
  return type.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

/** React code that renders `chartInput` with the given presets through `<FlintChart>`. */
export function flintChartCode({
  presets,
  keyboardTargeting = false,
  logInteractions = false,
  preamble = [],
}: {
  presets: readonly PresetCall[];
  keyboardTargeting?: boolean;
  /** Add an `onInteraction` handler that logs each gesture. */
  logInteractions?: boolean;
  /** Lines placed between the imports and the component, such as a `chartInput` declaration. */
  preamble?: readonly string[];
}): string {
  const factories = [...new Set(presets.map((preset) => preset.factory))];
  const spec = keyboardTargeting
    ? '{ ...chartInput, interaction_spec: { keyboardTargeting: true } }'
    : 'chartInput';
  return [
    "import { FlintChart } from 'flint-chart/react';",
    ...(factories.length ? [`import { ${factories.join(', ')} } from 'flint-chart/interactive';`] : []),
    '',
    ...(preamble.length ? [...preamble, ''] : []),
    '<FlintChart',
    `  spec={${spec}}`,
    ...(presets.length
      ? [
        '  interactions={[',
        ...presets.map((preset) => `    ${preset.factory}(${preset.options.split('\n').join('\n    ')}),`),
        '  ]}',
      ]
      : []),
    ...(logInteractions
      ? ['  onInteraction={({ event }) => {', '    console.log(event.action, event);', '  }}']
      : []),
    '/>;',
  ].join('\n');
}
