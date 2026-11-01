import { vi } from 'vitest';
// Imported by setup.js after it undid a first stub and spy: loaded once per
// worker without isolation, it changes window members whose originals the
// setup's later stub and spy then take (#201).
Object.defineProperty(window, 'devicePixelRatio', { value: 900, writable: true, configurable: true });
Object.defineProperty(window, 'screenX', { get: () => 900, configurable: true });
// An accessor whose getter is a vi.fn() returning an ordinary function:
// Vitest 4 and 5 spy on the returned function, a new spy (#228 review).
const scrollBy = Object.assign(() => {}, { fromDep: true });
Object.defineProperty(window, 'scrollBy', { get: vi.fn(() => scrollBy), configurable: true });
