#!/usr/bin/env node
// @ts-check

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverPath = join(here, 'server.mjs');
const MIN_RESTART_DELAY_MS = 1_000;
const MAX_RESTART_DELAY_MS = 15_000;
const STABLE_RUN_MS = 30_000;

/** @type {import('node:child_process').ChildProcess | null} */
let child = null;
let stopping = false;
let restartDelayMs = MIN_RESTART_DELAY_MS;
/** @type {NodeJS.Timeout | null} */
let restartTimer = null;

function startServer() {
  const startedAt = Date.now();
  child = spawn(process.execPath, [serverPath], {
    env: process.env,
    stdio: 'inherit',
  });

  console.log(`[supervisor] started Office runner (pid ${child.pid})`);

  child.on('error', (error) => {
    console.error(`[supervisor] failed to start Office runner: ${error.message}`);
  });

  child.on('exit', (code, signal) => {
    child = null;
    if (stopping) process.exit(code ?? 0);

    if (Date.now() - startedAt >= STABLE_RUN_MS) {
      restartDelayMs = MIN_RESTART_DELAY_MS;
    }
    const reason = signal ? `signal ${signal}` : `exit code ${code}`;
    console.error(`[supervisor] Office runner stopped (${reason}); restarting in ${restartDelayMs} ms`);
    restartTimer = setTimeout(startServer, restartDelayMs);
    restartDelayMs = Math.min(restartDelayMs * 2, MAX_RESTART_DELAY_MS);
  });
}

/** @param {NodeJS.Signals} signal */
function stop(signal) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  console.log(`[supervisor] stopping Office runner (${signal})`);
  if (child) child.kill(signal);
  else process.exit(0);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

startServer();