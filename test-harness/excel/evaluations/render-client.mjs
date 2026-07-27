// @ts-check

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:https';

const DEFAULT_SERVER = 'https://localhost:3000';
const HEALTH_CHECK_INTERVAL_MS = 2_000;
const DEV_CA_PATH = join(homedir(), '.office-addin-dev-certs', 'ca.crt');

/**
 * Fetch from the local Office runner while trusting its development CA.
 * @param {string} url
 * @param {{ method?: string, headers?: Record<string, string>, body?: string }} [options]
 * @returns {Promise<Response>}
 */
function runnerFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: options.method,
      headers: options.headers,
      ca: existsSync(DEV_CA_PATH) ? readFileSync(DEV_CA_PATH) : undefined,
    }, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on('end', () => {
        const status = response.statusCode ?? 500;
        const body = status === 204 ? null : Buffer.concat(chunks);
        const headers = new Headers();
        for (const [name, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            for (const item of value) headers.append(name, item);
          } else if (value !== undefined) {
            headers.set(name, value);
          }
        }
        resolve(new Response(body, { status, headers }));
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/** @param {number} milliseconds */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * @param {string} server
 * @returns {Promise<{ instance_id: string, worker_ready: boolean }>}
 */
async function readHealth(server) {
  const response = await runnerFetch(`${server}/health`);
  if (!response.ok) throw new Error(`Office runner health check failed with HTTP ${response.status}.`);
  const health = /** @type {{ instance_id?: unknown, worker_ready?: unknown }} */ (await response.json());
  if (typeof health.instance_id !== 'string' || typeof health.worker_ready !== 'boolean') {
    throw new Error('Office runner returned an invalid health response.');
  }
  return { instance_id: health.instance_id, worker_ready: health.worker_ready };
}

/**
 * @param {string} path
 * @param {unknown} body
 * @param {{ server?: string, timeoutMs?: number, retries?: number }} options
 * @returns {Promise<{ png: Buffer, inspection: unknown | null }>}
 */
async function enqueueAndCollect(path, body, options) {
  const server = options.server ?? DEFAULT_SERVER;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = options.retries ?? 3;
  let initialHealth;
  try {
    initialHealth = await readHealth(server);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Excel worker is unreachable at ${server}: ${message}`);
  }
  if (!initialHealth.worker_ready) {
    throw new Error('Excel task pane is not connected; open the Flint Render add-in before rendering.');
  }
  let enqueue;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      enqueue = await runnerFetch(`${server}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      break;
    } catch (error) {
      if (attempt === retries) throw error;
      await wait(500 * attempt);
    }
  }

  if (!enqueue) throw new Error(`Excel worker is unreachable at ${server}.`);
  if (!enqueue.ok) {
    const message = await enqueue.text();
    throw new Error(`Excel worker rejected the job (${enqueue.status}): ${message}`);
  }
  const payload = /** @type {{ id?: unknown }} */ (await enqueue.json());
  if (!Number.isInteger(payload.id)) throw new Error('Excel worker returned an invalid job id.');
  const id = /** @type {number} */ (payload.id);
  const deadline = Date.now() + timeoutMs;
  let nextHealthCheckAt = Date.now() + HEALTH_CHECK_INTERVAL_MS;

  while (Date.now() < deadline) {
    let response;
    try {
      response = await runnerFetch(`${server}/result?id=${id}`);
    } catch (error) {
      if (Date.now() + 500 >= deadline) throw error;
      await wait(300);
      continue;
    }
    if (response.status === 200) {
      const result = /** @type {{ pngBase64?: unknown, inspection?: unknown, error?: unknown }} */ (await response.json());
      if (result.error) throw new Error(String(result.error));
      if (typeof result.pngBase64 !== 'string' || result.pngBase64.length === 0) {
        throw new Error('Excel worker returned no PNG payload.');
      }
      return {
        png: Buffer.from(result.pngBase64, 'base64'),
        inspection: result.inspection ?? null,
      };
    }
    if (response.status !== 204) {
      throw new Error(`Excel worker result polling failed with HTTP ${response.status}.`);
    }
    if (Date.now() >= nextHealthCheckAt) {
      const health = await readHealth(server);
      if (health.instance_id !== initialHealth.instance_id) {
        throw new Error('Office runner restarted while rendering; the queued job was lost and must be retried.');
      }
      if (!health.worker_ready) {
        await runnerFetch(`${server}/cancel?id=${id}`, { method: 'POST' }).catch(() => {});
        throw new Error('Excel task pane disconnected while rendering.');
      }
      nextHealthCheckAt = Date.now() + HEALTH_CHECK_INTERVAL_MS;
    }
    await wait(300);
  }

  await runnerFetch(`${server}/cancel?id=${id}`, { method: 'POST' }).catch(() => {});
  throw new Error('Timed out waiting for the Excel Office.js worker.');
}

/**
 * Render one versioned Excel artifact through the running Office add-in worker.
 *
 * @param {unknown} artifact
 * @param {{ server?: string, scale?: number, timeoutMs?: number, retries?: number, inspectNativeChart?: boolean }} [options]
 * @returns {Promise<{ png: Buffer, inspection: unknown | null }>}
 */
export async function renderExcelArtifactDetailed(artifact, options = {}) {
  return enqueueAndCollect('/enqueue', {
    artifact,
    renderOptions: {
      scale: options.scale ?? 3,
      inspectNativeChart: options.inspectNativeChart ?? false,
    },
  }, options);
}

/**
 * Render one evaluation-only Office.js program over transformed rows.
 *
 * @param {string} officejsCode
 * @param {Array<Record<string, unknown>>} data
 * @param {{ server?: string, scale?: number, timeoutMs?: number, retries?: number, inspectNativeChart?: boolean }} [options]
 * @returns {Promise<{ png: Buffer, inspection: unknown | null }>}
 */
export async function renderOfficeJsProgramDetailed(officejsCode, data, options = {}) {
  return enqueueAndCollect('/enqueue-program', {
    officejsCode,
    data,
    renderOptions: {
      scale: options.scale ?? 2,
      inspectNativeChart: options.inspectNativeChart ?? false,
    },
  }, options);
}

/**
 * Render one artifact and return only its PNG bytes.
 *
 * @param {unknown} artifact
 * @param {{ server?: string, scale?: number, timeoutMs?: number, retries?: number, inspectNativeChart?: boolean }} [options]
 * @returns {Promise<Buffer>}
 */
export async function renderExcelArtifact(artifact, options = {}) {
  return (await renderExcelArtifactDetailed(artifact, options)).png;
}
