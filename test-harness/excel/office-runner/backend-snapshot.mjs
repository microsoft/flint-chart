import { readFileSync, statSync } from 'node:fs';

export function createBackendSnapshot(path) {
  let snapshot = { content: readFileSync(path), version: statSync(path).mtimeMs };
  return () => {
    try {
      const version = statSync(path).mtimeMs;
      if (version !== snapshot.version) {
        const content = readFileSync(path);
        if (content.length > 0) snapshot = { content, version };
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    return snapshot;
  };
}