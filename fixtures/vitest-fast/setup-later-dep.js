// Imported by setup.js after it undid a first stub and spy: loaded once per
// worker without isolation, it changes window members whose originals the
// setup's later stub and spy then take (#201).
Object.defineProperty(window, 'devicePixelRatio', { value: 900, writable: true, configurable: true });
Object.defineProperty(window, 'screenX', { get: () => 900, configurable: true });
