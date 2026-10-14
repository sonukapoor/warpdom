// Fast mode's fixture for errors thrown after their test ended
// (test/vitest-fast.test.js): a-leaves.spec.js leaves an un-awaited
// vi.waitFor behind; it times out while a later file of the same worker
// runs, and Vitest reports the error with that file.
import { withFastMode } from '../../src/vitest-fast.js';

// Alphabetical file order, so a-leaves.spec.js runs first in a shared worker.
class ByName {
  async sort(files) { return [...files].sort((a, b) => String(a.moduleId ?? a[1]).localeCompare(String(b.moduleId ?? b[1]))); }
  async shard(files) { return files; }
}

export default withFastMode({
  test: {
    include: ['*.spec.js'],
    environment: 'warpdom',
    sequence: { sequencer: ByName },
    maxWorkers: 1,
  },
});
