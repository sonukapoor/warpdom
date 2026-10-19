// warpdom's API set includes jsdom's, for every modeled jsdom version (#18).
// For each jsdom below, the window jsdom makes and the window warpdom makes
// with that version's profile are walked black box (test/api-surface.js);
// every path jsdom has must be in warpdom's too, with the same kind
// (method, accessor or data), on the same interface, with the same parent
// interface and element interfaces. Known differences are listed in KNOWN.
// WARPDOM_API_REPORT=1 also prints what warpdom has that jsdom lacks (APIs
// jsdom lacks are opt-in by policy, #5): information, not a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createWindow } from '../src/node.js';
import { NEWEST_MODELED_JSDOM } from '../src/window-features.js';
import { HTML_ELEMENTS, PLAIN_TAGS } from '../src/html-elements.js';
import { apiSurface, differences } from './api-surface.js';

const require = createRequire(import.meta.url);

// One release per major from 20 to 30 (the latest of each; the newest is
// NEWEST_MODELED_JSDOM), plus the jsdom installed when it is another one.
const ALIASES = ['jsdom20', 'jsdom21', 'jsdom22', 'jsdom23', 'jsdom24', 'jsdom25', 'jsdom26', 'jsdom27', 'jsdom28', 'jsdom29', 'jsdom30', 'jsdom'];
const HTML_TAGS = [...new Set([...HTML_ELEMENTS.flatMap(([, , tags]) => tags), ...PLAIN_TAGS])];

// Known differences: a path pattern, optionally the difference and the
// jsdom majors it applies to, the issue and why. An entry that matches
// nothing in any version fails the test: remove it then.
const KNOWN = [
  // Removed when fix/svg-parity merges.
  { path: /^(window\.)?SVGSVGElement\b/, issues: [21], until: 'fix/svg-parity' },
  { path: /^(window\.)?SVG(Animated)?PreserveAspectRatio\b/, issues: [24, 60], until: 'fix/svg-parity' },
  { path: /^(window\.)?SVGStringList\b/, issues: [29], until: 'fix/svg-parity' },
  { path: /^SVGElement\.prototype\.(className|ownerSVGElement|viewportElement|nonce)$/, issues: [55], until: 'fix/svg-parity' },
  { path: /^(window\.)?SVGAnimated(Rect|String)\b/, issues: [61, 62], until: 'fix/svg-parity' },
  { path: /^SVGGraphicsElement\.prototype\.(requiredExtensions|systemLanguage)$/, issues: [63], until: 'fix/svg-parity' },
  { path: /^(window\.)?SVGSymbolElement\b|^<svg:symbol> is$/, issues: [64], until: 'fix/svg-parity' },
  { path: /^(window\.)?SVG(G|Defs|Desc|Metadata|Switch)Element\b|^<svg:(g|defs|desc|metadata|switch)> is$|^(window\.)?SVG(Number|Rect)\b/, issues: [], until: 'fix/svg-parity', reason: 'in DOMParity without an issue; done on the branch' },
  // Removed when fix/misc-parity merges.
  { path: /^(window\.)?ElementInternals\b|^HTMLElement\.prototype\.attachInternals$/, issues: [20], until: 'fix/misc-parity' },
  { path: /^(window\.)?PromiseRejectionEvent\b/, issues: [59], until: 'fix/misc-parity' },
  { path: /^(window\.)?BlobEvent\b/, issues: [56], until: 'fix/misc-parity' },
  { path: /^(window\.)?PageTransitionEvent\b/, issues: [], until: 'fix/misc-parity', reason: 'no issue; done on the branch' },
  { path: /^(window\.)?DeviceMotionEvent(Acceleration|RotationRate)\b/, issues: [52, 53], until: 'fix/misc-parity' },
  { path: /^(window\.)?(Plugin|MimeType|PluginArray|MimeTypeArray)\b|^(Navigator\.prototype|window\.navigator)\.(plugins|mimeTypes)$/, issues: [31, 33, 34, 54, 58], until: 'fix/misc-parity' },
  { path: /^HTMLMediaElement\.prototype\.(audioTracks|videoTracks)$/, issues: [57], until: 'fix/misc-parity' },
  { path: /^CSSMediaRule\.prototype\.matches$/, issues: [65], until: 'fix/misc-parity' },
  { path: /^(window\.)?CSSNestedDeclarations\b/, difference: /^missing$/, issues: [66], until: 'fix/misc-parity' },
  // Removed when fix/forms-parity merges.
  { path: /^(window\.)?HTMLDocument$|^<menuitem> is$/, issues: [51], until: 'fix/forms-parity' },
  // Removed when fix/websocket-window merges.
  { path: /^(window\.)?WebSocket\b/, issues: [26], until: 'fix/websocket-window' },
  // To be implemented, on by default, in its own branch after the parity
  // branches merge (PLAN.md, decided 2026-10-19).
  { path: /^(window\.)?XMLHttpRequest(EventTarget|Upload)?\b/, issues: [22, 30] },

  // No issue yet (found by this test; see #18).
  { path: /^(window\.)?XPathException\b/, issues: [], reason: 'XPathException (legacy) is on jsdom\'s window' },
  { path: /^HTMLIFrameElement\.prototype\.getSVGDocument$/, issues: [] },
  { path: /^(window\.document|(Document|HTMLElement|SVGElement)\.prototype)\.onloadend$/, jsdom: [20, 21], issues: [] },
  { path: /^window\.on(autocomplete|autocompleteerror|sort)$/, jsdom: [20, 26], issues: [] },
  { path: /^Window extends$/, jsdom: [20, 23], issues: [], reason: 'jsdom before 24 has no WindowProperties object: Window.prototype inherits from EventTarget.prototype' },
  { path: /^window\.(document|self|window|name|webkitURL)$/, difference: /^jsdom \w+, warpdom \w+$/, issues: [], reason: 'kind of the window member differs' },
  { path: /^window\.(innerWidth|innerHeight|outerWidth|outerHeight|devicePixelRatio|scrollX|scrollY|pageXOffset|pageYOffset|screenX|screenY|screenLeft|screenTop|status)$/, difference: /^jsdom data, warpdom accessor$/, jsdom: [20, 26], issues: [], reason: 'jsdom 26 and earlier: writable data properties' },
  { path: /^<(search|selectedcontent)> is$/, issues: [], reason: 'jsdom makes HTMLUnknownElement' },
  { path: /^HTML(Button|Input|Select|TextArea)Element\.prototype\.(autofocus|inputMode)$/, difference: /^on HTMLElement$/, issues: [], reason: 'jsdom has them on the element interface too' },
  { path: /^(HTMLFormControlsCollection|HTMLOptionsCollection|RadioNodeList|CSSStyleProperties)\.prototype\.\[Symbol\.iterator\]$/, difference: /^on /, issues: [], reason: 'jsdom gives each interface its own @@iterator' },
  { path: /^HTMLFormElement\.prototype\.\[Symbol\.iterator\]$/, jsdom: [26, 30], issues: [], reason: 'a form is iterable from jsdom 26 (not fixed by fix/forms-parity\'s #50)' },
  { path: /^CSSKeyframesRule\.prototype\.\[Symbol\.iterator\]$|^CSSSupportsRule\.prototype\.matches$/, jsdom: [29, 30], issues: [] },
  { path: /^CSS(\w*Rule|NestedDeclarations)\b|^CSSStyleSheet\.prototype\.(toString|parentStyleSheet)$/, jsdom: [20, 28], issues: [], reason: 'jsdom 28 and earlier take the CSSOM from cssom/rrweb-cssom: legacy constants, own members per rule interface, CSSStyleRule extends CSSRule, parse()' },
  { path: /^CSSStyleDeclaration\.prototype\.|^(document\.body\.style|getComputedStyle\(body\)) is$/, difference: /^(on subclass CSSStyleProperties|jsdom CSSStyleDeclaration, warpdom CSSStyleProperties)$/, jsdom: [20, 28], issues: [], reason: 'jsdom 28 and earlier (cssstyle): the style accessors are CSSStyleDeclaration\'s; warpdom\'s are CSSStyleProperties\'' },
  { path: /^CSSStyleDeclaration\.prototype\.(getPropertyCSSValue|getPropertyShorthand|isPropertyImplicit|azimuth)$/, jsdom: [20, 25], issues: [], reason: 'cssstyle 2 to 4.1' },
];

const known = (major, path, difference) => KNOWN.find((entry) => entry.path.test(path)
  && (!entry.difference || entry.difference.test(difference))
  && (!entry.jsdom || (major >= entry.jsdom[0] && major <= entry.jsdom[1])));

const report = process.env.WARPDOM_API_REPORT === '1';
const used = new Set();
const seen = new Set();

for (const alias of ALIASES) {
  const pkg = require(`${alias}/package.json`);
  test(`warpdom has jsdom ${pkg.version}'s API (${alias})`, { skip: seen.has(pkg.version) && 'the same version as another alias' }, () => {
    seen.add(pkg.version);
    const major = Number.parseInt(pkg.version, 10);
    // The cssstyle that jsdom loads (before jsdom 29), as the adapters pass it.
    const cssstyle = pkg.dependencies?.cssstyle ? createRequire(require.resolve(`${alias}/package.json`))('cssstyle/package.json').version : undefined;
    const { JSDOM } = require(alias);
    const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { url: 'http://localhost:3000/', runScripts: 'dangerously', pretendToBeVisual: true });
    const theirs = apiSurface(dom.window, HTML_TAGS);
    dom.window.close();
    const ours = apiSurface(createWindow({ url: 'http://localhost:3000/', jsdom: pkg.version, cssstyle }), HTML_TAGS);
    const unexplained = [];
    let allowed = 0;
    for (const [path, difference] of differences(theirs, ours)) {
      const entry = known(major, path, difference);
      if (entry) { used.add(entry); allowed++; } else unexplained.push(`${path}: ${difference}`);
    }
    if (report) {
      const extra = new Map();
      for (const path of ours.keys()) {
        if (theirs.has(path)) continue;
        const group = path.startsWith('window.') ? `window.${path.slice(7).split(/[ .]/)[0]}` : path.split(/[ .]/)[0];
        extra.set(group, (extra.get(group) ?? 0) + 1);
      }
      const top = [...extra].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([g, n]) => `${g} ${n}`).join(', ');
      console.log(`jsdom ${pkg.version}: ${theirs.size} paths, ${allowed} known differences; warpdom has ${[...extra.values()].reduce((a, b) => a + b, 0)} paths jsdom lacks (${extra.size} groups): ${top}`);
    }
    assert.deepEqual(unexplained, [], `warpdom lacks or differs from jsdom ${pkg.version} (add a fix, or a KNOWN entry with its issue)`);
  });
}

test('the versions cover every major from 20 to 30 and the newest modeled', () => {
  const versions = ALIASES.map((alias) => require(`${alias}/package.json`).version);
  for (let major = 20; major <= 30; major++) assert.ok(versions.some((v) => Number.parseInt(v, 10) === major), `jsdom ${major}`);
  assert.ok(versions.includes(NEWEST_MODELED_JSDOM), `NEWEST_MODELED_JSDOM ${NEWEST_MODELED_JSDOM}: update the jsdom30 alias`);
});

test('every KNOWN entry still matches a difference', () => {
  const stale = KNOWN.filter((entry) => !used.has(entry)).map((entry) => `${entry.path}${entry.until ? ` (${entry.until})` : ''}`);
  assert.deepEqual(stale, [], 'these differences are gone: remove their KNOWN entries');
});
