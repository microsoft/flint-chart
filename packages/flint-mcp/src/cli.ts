// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, resolveBackends } from './server.js';
import { VERSION } from './version.js';
import { startHttpServer, DEFAULT_MCP_PATH } from './http.js';
import { SUPPORTED_BACKENDS, type SupportedBackend } from './tools/schemas.js';

const HELP = `flint-chart-mcp ${VERSION}

MCP server that compiles and renders Flint chart specs to Vega-Lite, ECharts,
or Chart.js artifacts (PNG/SVG), entirely in-process.

Usage:
  flint-chart-mcp [options]   Start the MCP server (stdio by default)

Options:
  --transport <stdio|http>  Transport to use. Default: stdio.
  --port <n>              HTTP port (http transport only). Default: 8080.
                          Overridden by the PORT or FLINT_MCP_PORT env var.
  --host <addr>           HTTP bind address (http transport only).
                          Default: 0.0.0.0. Override with FLINT_MCP_HOST.
  --path <path>           HTTP endpoint path (http transport only).
                          Default: ${DEFAULT_MCP_PATH}.
  --allowed-hosts <list>  Comma-separated Host header allowlist enabling
                          DNS-rebinding protection (http transport only).
  --allowed-origins <list> Comma-separated Origin header allowlist enabling
                           DNS-rebinding protection (http transport only).
  --backends <list>       Comma-separated backends to expose
                          (subset of: ${SUPPORTED_BACKENDS.join(', ')}).
                          Overridden by the FLINT_MCP_BACKENDS env var if set.
  --disable-file-reference
                          Reject local data.url file references and accept only
                          inline data.values. By default any local file the agent
                          references can be read (relative paths resolve against
                          the working directory). Also enabled by the
                          FLINT_MCP_DISABLE_FILE_REFERENCE env var. Recommended
                          (and a sensible default) for the http transport.
  --data-roots <list>     Deprecated and ignored. Local files are readable by default.
  --data-root <dir>       Deprecated and ignored. Local files are readable by default.
  -v, --version           Print version and exit.
  -h, --help              Print this help and exit.

Tools:
  create_chart_view, render_chart, compile_chart, validate_chart,
  list_chart_types, list_themes

Resources:
  flint://agent-skill, flint://theme-skill, flint://chart-types,
  ui://flint-chart/chart-view.html

Prompts:
  author_flint_chart, author_flint_theme

Example MCP client config:
  { "command": "npx", "args": ["-y", "flint-chart-mcp"] }

Local file compile (no agent needed):
  flint compile chart.json --format svg   (via the separate "flint" binary)
  See "flint --help" for compile options.
`;

// keep runCompile re-export for existing tests importing from cli.js
export { runCompile, type CompileIo } from './compile.js';

interface ParsedArgs {
  transport: string;
  backends?: SupportedBackend[];
  disableFileReference: boolean;
  disableFileReferenceSet: boolean;
  usedDeprecatedDataRoots: boolean;
  port?: number;
  host?: string;
  path?: string;
  allowedHosts?: string[];
  allowedOrigins?: string[];
}

function parseBackends(raw: string | undefined): SupportedBackend[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean) as SupportedBackend[];
  return list.length ? list : undefined;
}

function parseList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined;
  const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

function parseBoolEnv(raw: string | undefined): boolean | undefined {
  if (raw == null) return undefined;
  const value = raw.trim().toLowerCase();
  if (value === '') return undefined;
  return value !== '0' && value !== 'false' && value !== 'no';
}

function parseArgs(argv: string[]): ParsedArgs {
  const out: ParsedArgs = {
    transport: 'stdio',
    disableFileReference: false,
    disableFileReferenceSet: false,
    usedDeprecatedDataRoots: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(HELP);
        process.exit(0);
        break;
      case '-v':
      case '--version':
        process.stdout.write(`${VERSION}\n`);
        process.exit(0);
        break;
      case '--transport':
        out.transport = argv[++i] ?? 'stdio';
        break;
      case '--port':
        out.port = Number(argv[++i]);
        break;
      case '--host':
        out.host = argv[++i];
        break;
      case '--path':
        out.path = argv[++i];
        break;
      case '--allowed-hosts':
        out.allowedHosts = parseList(argv[++i]);
        break;
      case '--allowed-origins':
        out.allowedOrigins = parseList(argv[++i]);
        break;
      case '--backends':
        out.backends = parseBackends(argv[++i]);
        break;
      case '--disable-file-reference':
        out.disableFileReference = true;
        out.disableFileReferenceSet = true;
        break;
      case '--data-roots':
      case '--data-root':
        i++;
        out.usedDeprecatedDataRoots = true;
        break;
      default:
        if (arg.startsWith('--transport=')) out.transport = arg.slice('--transport='.length);
        else if (arg.startsWith('--port=')) out.port = Number(arg.slice('--port='.length));
        else if (arg.startsWith('--host=')) out.host = arg.slice('--host='.length);
        else if (arg.startsWith('--path=')) out.path = arg.slice('--path='.length);
        else if (arg.startsWith('--allowed-hosts=')) out.allowedHosts = parseList(arg.slice('--allowed-hosts='.length));
        else if (arg.startsWith('--allowed-origins=')) out.allowedOrigins = parseList(arg.slice('--allowed-origins='.length));
        else if (arg.startsWith('--backends=')) out.backends = parseBackends(arg.slice('--backends='.length));
        else if (arg.startsWith('--data-roots=') || arg.startsWith('--data-root=')) out.usedDeprecatedDataRoots = true;
        else {
          process.stderr.write(`Unknown argument: ${arg}\n`);
          process.exit(2);
        }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const transport = (process.env.FLINT_MCP_TRANSPORT?.trim() || args.transport).toLowerCase();
  if (transport !== 'stdio' && transport !== 'http') {
    process.stderr.write(`Unsupported transport "${transport}". Use "stdio" or "http".\n`);
    process.exit(2);
  }

  const enabledBackends = parseBackends(process.env.FLINT_MCP_BACKENDS) ?? args.backends;
  const envDisable = parseBoolEnv(process.env.FLINT_MCP_DISABLE_FILE_REFERENCE);
  const disableFileReference = envDisable ?? (args.disableFileReferenceSet ? args.disableFileReference : transport === 'http');

  if (args.usedDeprecatedDataRoots || process.env.FLINT_MCP_DATA_ROOTS?.trim()) {
    process.stderr.write(
      'flint-chart-mcp: --data-roots / --data-root (and FLINT_MCP_DATA_ROOTS) are deprecated and have NO effect. Local data.url files are now readable by default, so you can safely REMOVE these flags and local-file charts keep working. (Only add --disable-file-reference if you instead want to BLOCK local file reads.)\n',
    );
  }

  const resolved = resolveBackends({ enabledBackends });
  const dataMode = disableFileReference ? 'local file references disabled' : 'local files readable on request';

  if (transport === 'http') {
    const portEnv = process.env.PORT?.trim() || process.env.FLINT_MCP_PORT?.trim();
    const port = Number(portEnv || args.port || 8080);
    if (!Number.isFinite(port) || port <= 0) {
      process.stderr.write(`Invalid http port: ${port}\n`);
      process.exit(2);
    }
    const host = process.env.FLINT_MCP_HOST?.trim() || args.host || '0.0.0.0';
    const running = await startHttpServer({
      enabledBackends,
      disableFileReference,
      port,
      host,
      path: args.path,
      allowedHosts: args.allowedHosts,
      allowedOrigins: args.allowedOrigins,
    });
    process.stderr.write(`flint-chart-mcp ${VERSION} listening on ${running.url} (backends: ${resolved.join(', ')}; ${dataMode})\n`);
    const shutdown = () => {
      void running.close().finally(() => process.exit(0));
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  const server = createServer({ enabledBackends, disableFileReference });
  const stdio = new StdioServerTransport();
  await server.connect(stdio);
  process.stderr.write(`flint-chart-mcp ${VERSION} ready on stdio (backends: ${resolved.join(', ')}; ${dataMode})\n`);
}

main().catch((err) => {
  process.stderr.write(`flint-chart-mcp failed to start: ${err?.stack ?? err}\n`);
  process.exit(1);
});
