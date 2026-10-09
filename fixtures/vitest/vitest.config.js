import { fileURLToPath } from 'node:url';

// Alphabetical file order, so patch-a.spec.js always runs before patch-b.spec.js.
class ByName {
  async sort(files) { return [...files].sort((a, b) => String(a.moduleId ?? a[1]).localeCompare(String(b.moduleId ?? b[1]))); }
  async shard(files) { return files; }
}

export default {
  test: {
    include: ['*.spec.js'],
    environment: fileURLToPath(new URL('../../src/vitest.js', import.meta.url)),
    sequence: { sequencer: ByName },
  },
};
