// @ts-check

process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '0';

const DEFAULT_SERVER = 'https://localhost:3000';

/** @param {number} milliseconds */
function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Render one versioned Excel artifact through the running Office add-in worker.
 *
 * @param {unknown} artifact
 * @param {{ server?: string, scale?: number, timeoutMs?: number, retries?: number, inspectNativeChart?: boolean }} [options]
 * @returns {Promise<Buffer>}
 */
export async function renderExcelArtifact(artifact, options = {}) {
  const server = options.server ?? DEFAULT_SERVER;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const retries = options.retries ?? 3;
  let enqueue;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      enqueue = await fetch(`${server}/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artifact,
          renderOptions: {
            scale: options.scale ?? 3,
            inspectNativeChart: options.inspectNativeChart ?? false,
          },
        }),
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
    throw new Error(`Excel worker rejected the artifact (${enqueue.status}): ${message}`);
  }
  const payload = /** @type {{ id?: unknown }} */ (await enqueue.json());
  if (!Number.isInteger(payload.id)) throw new Error('Excel worker returned an invalid job id.');
  const id = /** @type {number} */ (payload.id);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    let response;
    try {
      response = await fetch(`${server}/result?id=${id}`);
    } catch (error) {
      if (Date.now() + 500 >= deadline) throw error;
      await wait(300);
      continue;
    }
    if (response.status === 200) {
      const result = /** @type {{ pngBase64?: unknown, error?: unknown }} */ (await response.json());
      if (result.error) throw new Error(String(result.error));
      if (typeof result.pngBase64 !== 'string' || result.pngBase64.length === 0) {
        throw new Error('Excel worker returned no PNG payload.');
      }
      return Buffer.from(result.pngBase64, 'base64');
    }
    if (response.status !== 204) {
      throw new Error(`Excel worker result polling failed with HTTP ${response.status}.`);
    }
    await wait(300);
  }

  await fetch(`${server}/cancel?id=${id}`, { method: 'POST' }).catch(() => {});
  throw new Error('Timed out waiting for the Excel Office.js worker.');
}
