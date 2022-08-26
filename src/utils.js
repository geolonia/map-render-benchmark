import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function rootPath() {
  return path.dirname(path.dirname(fileURLToPath(import.meta.url)));
}

export function serveDirectory() {
  return path.join(process.env.RUNNER_TEMP || '.', 'map-render-benchmark-tmp');
}
