// warpdom's core, required (CommonJS: the require condition, dist/warpdom.d.cts).
import warpdom = require('warpdom');

const window: warpdom.WarpdomWindow = warpdom.createWindow({ url: 'http://localhost/' });
const title: string = window.document.title;
void title;
// @ts-expect-error: fastFrames is a boolean
warpdom.createWindow({ fastFrames: 1 });
