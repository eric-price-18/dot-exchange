import '../scripts/sites-env.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { PUBLIC_ORIGIN } from './origin-fixture.mjs';

// Use Wrangler's pinned Miniflare dependency so options and runtime stay compatible.
const { Miniflare } = createRequire(import.meta.resolve('wrangler'))('miniflare');
const stateDir = path.resolve(process.argv[2] || '');
if (!stateDir.startsWith(path.resolve('.sites-runtime/test-db-'))) {
  throw Error('The test Worker requires its disposable local D1 directory.');
}
const { workerOptions, main, externalWorkers } = unstable_getMiniflareWorkerOptions('dist/server/wrangler.json', undefined, { overrides: { enableContainers: false } });
const modulesRoot = path.dirname(main);
// Vinext emits template-literal imports that need an explicit module list.
const modules = [main, ...fs.readdirSync(modulesRoot, { recursive: true })
  .filter(file => /\.m?js$/.test(file)).map(file => path.join(modulesRoot, file))
  .filter(file => file !== main).sort()]
  .map(file => ({ type: 'ESModule', path: file }));
// Run the compiled Worker and configured assets in workerd directly. Wrangler's
// development ProxyWorker can return a spurious restart 503 after an unread body.
const worker = new Miniflare({
  host: '127.0.0.1', port: 8788, cf: false, logRequests: true, unsafeLocalExplorer: false,
  d1Persist: path.join(stateDir, 'v3/d1'),
  workers: [{ ...workerOptions, name: 'dot-exchange', modules, modulesRoot,
    bindings: { ...workerOptions.bindings, PUBLIC_SITE_ORIGIN: process.argv[3] || PUBLIC_ORIGIN },
  }, ...externalWorkers],
});
await worker.ready;
console.log('Local test Worker ready on http://127.0.0.1:8788');
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await worker.dispose();
  process.exit(0);
}
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
// IPC permits graceful workerd disposal on Windows without POSIX process groups.
process.on('message', message => { if (message === 'stop') void stop(); });
