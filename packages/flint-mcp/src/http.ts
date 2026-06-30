// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { createServer as createHttpServer, type Server } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, resolveBackends, VERSION, type CreateServerOptions } from './server.js';

/** Default endpoint path the MCP Streamable HTTP transport is served from. */
export const DEFAULT_MCP_PATH = '/mcp';
/** Default cap on a single request body (inline data can be large but bounded). */
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024;

export interface HttpServerOptions extends CreateServerOptions {
  /** TCP port to listen on. Default: 8080. */
  port?: number;
  /** Interface to bind. Default: 0.0.0.0 (all interfaces). */
  host?: string;
  /** Path the MCP endpoint is mounted at. Default: /mcp. */
  path?: string;
  /** Maximum accepted request body size in bytes. Default: 32 MiB. */
  maxBodyBytes?: number;
  /**
   * Allowed Host header values for DNS-rebinding protection. When provided,
   * rebinding protection is enabled. Leave unset for trusted/internal networks.
   */
  allowedHosts?: string[];
  /** Allowed Origin header values for DNS-rebinding protection. */
  allowedOrigins?: string[];
}

class BodyTooLargeError extends Error {}

/** Read and JSON-parse a request body with a hard size cap. */
function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new BodyTooLargeError());
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new SyntaxError('invalid JSON request body'));
      }
    });
    req.on('error', reject);
  });
}

/** Send a JSON-RPC-style error response with the given HTTP status. */
function sendJsonError(res: ServerResponse, status: number, message: string): void {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    error: { code: status === 400 ? -32700 : -32600, message },
    id: null,
  });
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(body);
}

/**
 * Build the Node HTTP request handler that serves the Flint MCP server over the
 * Streamable HTTP transport in STATELESS mode: a fresh McpServer + transport is
 * created per request, so the handler scales horizontally with no shared state.
 */
export function createMcpRequestListener(
  options: HttpServerOptions = {},
): (req: IncomingMessage, res: ServerResponse) => void {
  const path = options.path ?? DEFAULT_MCP_PATH;
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  const backends = resolveBackends(options);
  const serverOptions: CreateServerOptions = {
    enabledBackends: options.enabledBackends,
    // The HTTP transport is remote: local files belong to the server, not the
    // user. Block local file references by default (secure-by-default); pass
    // disableFileReference:false explicitly to opt back in.
    disableFileReference: options.disableFileReference ?? true,
  };
  const rebindingProtection =
    (options.allowedHosts?.length ?? 0) > 0 || (options.allowedOrigins?.length ?? 0) > 0;

  return (req: IncomingMessage, res: ServerResponse): void => {
    void handle(req, res).catch((err) => {
      if (!res.headersSent) {
        sendJsonError(res, 500, err instanceof Error ? err.message : 'internal error');
      } else {
        res.end();
      }
    });
  };

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    // Lightweight health/liveness endpoint for the platform (App Service, ACA).
    if (req.method === 'GET' && (url.pathname === '/health' || url.pathname === '/')) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(
        JSON.stringify({
          name: 'flint-chart-mcp',
          version: VERSION,
          status: 'ok',
          transport: 'http',
          backends,
        }),
      );
      return;
    }

    if (url.pathname !== path) {
      sendJsonError(res, 404, `not found; MCP endpoint is ${path}`);
      return;
    }

    // Stateless transport: GET (SSE) and DELETE (session teardown) are not
    // supported because there is no session to attach to.
    if (req.method !== 'POST') {
      res.writeHead(405, { allow: 'POST', 'content-type': 'application/json' }).end(
        JSON.stringify({
          jsonrpc: '2.0',
          error: { code: -32600, message: 'method not allowed; use POST for the MCP endpoint' },
          id: null,
        }),
      );
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(req, maxBodyBytes);
    } catch (err) {
      if (err instanceof BodyTooLargeError) {
        sendJsonError(res, 413, `request body exceeds ${maxBodyBytes} bytes`);
      } else {
        sendJsonError(res, 400, 'invalid JSON request body');
      }
      return;
    }

    // Fresh server + transport per request keeps the handler stateless and
    // avoids cross-request id collisions under concurrency.
    const server = createServer(serverOptions);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      ...(rebindingProtection
        ? {
            enableDnsRebindingProtection: true,
            allowedHosts: options.allowedHosts,
            allowedOrigins: options.allowedOrigins,
          }
        : {}),
    });
    res.on('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  }
}

export interface RunningHttpServer {
  server: Server;
  port: number;
  url: string;
  close: () => Promise<void>;
}

/** Start the Flint MCP HTTP server and resolve once it is listening. */
export function startHttpServer(options: HttpServerOptions = {}): Promise<RunningHttpServer> {
  const port = options.port ?? 8080;
  const host = options.host ?? '0.0.0.0';
  const path = options.path ?? DEFAULT_MCP_PATH;
  const httpServer = createHttpServer(createMcpRequestListener(options));

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, host, () => {
      httpServer.removeListener('error', reject);
      const address = httpServer.address();
      const boundPort = typeof address === 'object' && address ? address.port : port;
      resolve({
        server: httpServer,
        port: boundPort,
        url: `http://${host}:${boundPort}${path}`,
        close: () =>
          new Promise<void>((res, rej) =>
            httpServer.close((err) => (err ? rej(err) : res())),
          ),
      });
    });
  });
}
