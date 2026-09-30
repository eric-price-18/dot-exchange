import path from 'node:path';
import { unstable_startWorker } from 'wrangler';

const stateDir = path.resolve(process.argv[2] || '');
if (!stateDir.startsWith(path.resolve('.sites-runtime/test-db-'))) {
  throw new Error('The E2E Worker requires this run\'s disposable local D1 directory.');
}
// The test suite runs an immutable build. The interactive CLI enables registry
// updates and source/config watchers, which can replace a Worker mid-request.
// Use Wrangler's explicit ready/dispose lifecycle with local bindings and no watch.
const worker = await unstable_startWorker({
  config: path.resolve('dist/server/wrangler.json'),
  sendMetrics: false,
  dev: {
    remote: false,
    persist: stateDir,
    watch: false,
    liveReload: false,
    inspector: false,
    enableContainers: false,
    generateTypes: false,
    server: { hostname: '127.0.0.1', port: 8788 },
    logLevel: 'info',
  },
});
await worker.ready;
console.log('Immutable local E2E Worker ready:', (await worker.url).toString());
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await worker.dispose();
  process.exit(0);
}
process.on('SIGTERM', () => { void stop(); });
process.on('SIGINT', () => { void stop(); });
