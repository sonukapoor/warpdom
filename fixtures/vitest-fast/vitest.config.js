// Fast mode's integration fixture (test/vitest-fast.test.js). Its own root
// (Vite's root is here, warpdom's environment outside it, as when warpdom
// is installed in a workspace's node_modules and a package's tests run).
import { withFastMode } from '../../src/vitest-fast.js';

// Alphabetical file order, so a-sets.spec.js runs before b-reads.spec.js in a shared worker.
class ByName {
  async sort(files) { return [...files].sort((a, b) => String(a.moduleId ?? a[1]).localeCompare(String(b.moduleId ?? b[1]))); }
  async shard(files) { return files; }
}

export default withFastMode({
  test: {
    include: ['*.spec.js'],
    environment: 'warpdom',
    setupFiles: ['./setup.js'],
    typecheck: { enabled: true, include: ['*.spec-d.ts'] },
    sequence: { sequencer: ByName },
    maxWorkers: 1,
  },
}, { cache: process.env.FAST_FIXTURE_CACHE ?? '.warpdom/fast-mode.json' });
