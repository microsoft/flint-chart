// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, resolve as resolvePath } from 'node:path';
import { VERSION } from './version.js';
import { SUPPORTED_BACKENDS, type SupportedBackend } from './tools/schemas.js';
import { renderChart } from './render/index.js';
import type { RenderBackend, RenderFormat } from './render/types.js';

const COMPILE_HELP = `flint ${VERSION}

Compile a saved Flint ChartAssemblyInput JSON to SVG or PNG, entirely in-process.

Usage:
  flint compile <input> [options]
  flint <input> [options]              (shorthand, same as compile)

Arguments:
  <input>                 Path to JSON file containing ChartAssemblyInput, or "-" for stdin.

Options:
  --backend <id>          Rendering backend: ${SUPPORTED_BACKENDS.join(', ')}. Default: vegalite.
  --format <png|svg>      Output format. Default: svg (vegalite/echarts) or png (chartjs).
  --output <path>, -o <path>
                          Output file. Default: <input>.<format> next to input (chart.json → chart.svg).
                          Use "-" for stdout. Defaults to stdout when input is stdin and no output given.
  --scale <n>             Device scale for PNG (0.5–4). Default: 1.
  --background <color>    Background color. Default: #ffffff.
  -h, --help              Print this help and exit.
  -v, --version           Print version and exit.

Note:
  Relative data.url paths in the input resolve against the input file's
  directory, or against the current working directory when reading from stdin.

Examples:
  flint compile chart.json --format svg
  flint compile chart.json --backend echarts --format png --output chart.png
  cat chart.json | flint compile - --format svg > chart.svg
  flint chart.json --format svg --output chart.svg
`;

interface CompileOptions {
  input: string;
  backend: RenderBackend;
  format: RenderFormat;
  output?: string;
  scale?: number;
  background?: string;
}

type CompileParseResult =
  | { kind: 'run'; options: CompileOptions }
  | { kind: 'help' }
  | { kind: 'version' };

class CompileError extends Error {
  constructor(message: string, readonly exitCode: number = 2) {
    super(message);
  }
}

function parseCompileArgs(argv: string[]): CompileParseResult {
  let input: string | undefined;
  let backend: string | undefined;
  let format: string | undefined;
  let output: string | undefined;
  let scale: number | undefined;
  let background: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') {
      return { kind: 'help' };
    } else if (arg === '-v' || arg === '--version') {
      return { kind: 'version' };
    } else if (arg === '--backend') {
      backend = argv[++i];
      if (!backend) throw new CompileError('Missing value for --backend');
    } else if (arg.startsWith('--backend=')) {
      backend = arg.slice('--backend='.length);
    } else if (arg === '--format') {
      format = argv[++i];
      if (!format) throw new CompileError('Missing value for --format');
    } else if (arg.startsWith('--format=')) {
      format = arg.slice('--format='.length);
    } else if (arg === '--output' || arg === '-o') {
      output = argv[++i];
      if (!output) throw new CompileError('Missing value for --output');
    } else if (arg.startsWith('--output=')) {
      output = arg.slice('--output='.length);
    } else if (arg.startsWith('-o') && arg.length > 2 && !arg.startsWith('-output')) {
      output = arg.slice(2);
    } else if (arg === '--scale') {
      const raw = argv[++i];
      scale = Number(raw);
      if (!Number.isFinite(scale)) throw new CompileError(`Invalid --scale value: ${raw}`);
    } else if (arg.startsWith('--scale=')) {
      scale = Number(arg.slice('--scale='.length));
      if (!Number.isFinite(scale)) throw new CompileError(`Invalid --scale value: ${arg.slice('--scale='.length)}`);
    } else if (arg === '--background') {
      background = argv[++i];
      if (!background) throw new CompileError('Missing value for --background');
    } else if (arg.startsWith('--background=')) {
      background = arg.slice('--background='.length);
    } else if (arg === '-') {
      if (input) throw new CompileError(`Unexpected argument: ${arg} (input already set to "${input}")`);
      input = arg;
    } else if (arg.startsWith('-')) {
      throw new CompileError(`Unknown compile option: ${arg}\nRun "flint --help" for usage.`);
    } else {
      if (input) throw new CompileError(`Unexpected argument: ${arg} (input already set to "${input}")`);
      input = arg;
    }
  }

  if (!input) throw new CompileError('Missing <input> argument.\nRun "flint --help" for usage.');

  const resolvedBackend = (backend ?? 'vegalite') as RenderBackend;
  if (!SUPPORTED_BACKENDS.includes(resolvedBackend as SupportedBackend)) {
    throw new CompileError(`Unsupported backend "${resolvedBackend}". Choose one of: ${SUPPORTED_BACKENDS.join(', ')}`);
  }

  let resolvedFormat: RenderFormat;
  if (format) {
    const f = format.toLowerCase() as RenderFormat;
    if (f !== 'png' && f !== 'svg') throw new CompileError(`Unsupported format "${format}". Use "png" or "svg".`);
    resolvedFormat = f;
  } else {
    resolvedFormat = resolvedBackend === 'chartjs' ? 'png' : 'svg';
  }

  if (resolvedBackend === 'chartjs' && resolvedFormat === 'svg') {
    throw new CompileError('the chartjs backend supports png output only (no SVG engine); request format "png"');
  }

  if (scale !== undefined && (!Number.isFinite(scale) || scale < 0.5 || scale > 4)) {
    throw new CompileError(`Invalid --scale ${scale}: must be between 0.5 and 4`);
  }

  return {
    kind: 'run',
    options: { input, backend: resolvedBackend, format: resolvedFormat, output, scale, background },
  };
}

export interface CompileIo {
  readStdin(): string;
  stdout(data: string | Buffer): void;
  stderr(line: string): void;
}

const defaultCompileIo: CompileIo = {
  readStdin: () => readFileSync(0, 'utf8'),
  stdout: (data) => process.stdout.write(data),
  stderr: (line) => process.stderr.write(line),
};

function readInputJson(inputPath: string, io: CompileIo): { json: unknown; cwd: string | undefined } {
  let raw: string;
  let cwd: string | undefined;
  if (inputPath === '-') {
    try {
      raw = io.readStdin();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CompileError(`Failed to read stdin: ${msg}`, 1);
    }
  } else {
    const abs = resolvePath(inputPath);
    try {
      raw = readFileSync(abs, 'utf8');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new CompileError(`Failed to read input file "${inputPath}": ${msg}`, 1);
    }
    cwd = dirname(abs);
  }
  try {
    return { json: JSON.parse(raw), cwd };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new CompileError(`Invalid JSON in "${inputPath}": ${msg}`, 1);
  }
}

function resolveOutputPath(input: string, explicitOutput: string | undefined, format: RenderFormat): string | undefined {
  if (explicitOutput) {
    if (explicitOutput === '-') return undefined;
    return resolvePath(explicitOutput);
  }
  if (input === '-') return undefined;
  const absInput = resolvePath(input);
  const dir = dirname(absInput);
  const base = basename(absInput, extname(absInput));
  const outBase = base || 'chart';
  return resolvePath(dir, `${outBase}.${format}`);
}

export async function runCompile(argv: string[], io: CompileIo = defaultCompileIo): Promise<number> {
  let parsed: CompileParseResult;
  try {
    parsed = parseCompileArgs(argv);
  } catch (err) {
    if (err instanceof CompileError) {
      io.stderr(`${err.message}\n`);
      return err.exitCode;
    }
    throw err;
  }

  if (parsed.kind === 'help') {
    io.stdout(COMPILE_HELP);
    return 0;
  }
  if (parsed.kind === 'version') {
    io.stdout(`${VERSION}\n`);
    return 0;
  }

  const opts = parsed.options;
  let json: unknown;
  let cwd: string | undefined;
  try {
    ({ json, cwd } = readInputJson(opts.input, io));
  } catch (err) {
    if (err instanceof CompileError) {
      io.stderr(`${err.message}\n`);
      return err.exitCode;
    }
    throw err;
  }

  const input = json as Record<string, unknown>;
  if (input == null || typeof input !== 'object' || !('chart_spec' in input) || !('data' in input)) {
    io.stderr(
      'Input JSON must be a ChartAssemblyInput with at least { data, chart_spec }.\n' +
        'Example: { "data": { "values": [...] }, "chart_spec": { "chartType": "Bar Chart", "encodings": { "x": { "field": "a" }, "y": { "field": "b" } } } }\n',
    );
    return 2;
  }

  let result: Awaited<ReturnType<typeof renderChart>>;
  try {
    result = await renderChart(input as any, opts.backend, {
      format: opts.format,
      scale: opts.scale,
      background: opts.background,
      cwd,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.stderr(`Compile failed: ${msg}\n`);
    return 1;
  }

  for (const w of result.warnings) io.stderr(`warning [${w.code}]: ${w.message}\n`);

  const outPath = resolveOutputPath(opts.input, opts.output, opts.format);
  try {
    if (result.format === 'svg') {
      const svg = result.svg ?? '';
      if (outPath) {
        writeFileSync(outPath, svg, 'utf8');
        io.stderr(`Wrote ${result.backend} · ${result.format} · ${result.width}×${result.height}px → ${outPath}\n`);
      } else {
        io.stdout(svg);
      }
    } else {
      const buffer = result.buffer!;
      if (outPath) {
        writeFileSync(outPath, buffer);
        io.stderr(`Wrote ${result.backend} · ${result.format} · ${result.width}×${result.height}px → ${outPath}\n`);
      } else {
        io.stdout(buffer);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.stderr(`Failed to write output: ${msg}\n`);
    return 1;
  }
  return 0;
}


