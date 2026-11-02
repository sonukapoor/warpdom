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
// Equal to the stubs setup.js made and undid before importing this (#230).
const stubbed = (value) => ({ value, writable: true, enumerable: true, configurable: true });
Object.defineProperty(window, 'screenLeft', stubbed(500));
Object.defineProperty(window, 'screenTop', stubbed(900));
// Changes a member setup.js stubbed and unstubbed before importing this (#230).
Object.defineProperty(window, 'status', { value: 'from dep', writable: true, configurable: true });
// Replaces a member setup.js stubbed, spied on and unstubbed before importing this (#236 review).
Object.defineProperty(window, 'moveBy', { value: Object.assign(() => {}, { fromDep: true }), writable: true, configurable: true });
// Replaces one of two members holding one vi.fn(), and a member whose
// accessors setup.js spied on and restored (#236 review).
Object.defineProperty(window, 'resizeBy', { value: Object.assign(() => {}, { fromDep: true }), writable: true, configurable: true });
Object.defineProperty(window, 'scrollX', { value: 900, writable: true, configurable: true });
