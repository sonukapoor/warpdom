// A setup file runs before each file; its imports load once per worker without isolation.
import './setup-dep.js';

globalThis.__setupRuns = (globalThis.__setupRuns ?? 0) + 1;
