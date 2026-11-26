// jsdom 31's insertRule and deleteRule (black box, 31.0.1; #269 part F3b):
// its own messages, parse a rule's CDO and CDC as tokens, and the order of
// @layer statements, @import and @namespace rules in a sheet.
import { parity } from './parity.js';

const attempt = (f) => {
  try {
    return `ok ${f()}`;
  } catch (e) {
    return `${e.name}: ${e.message}`;
  }
};
const names = (sheet) => [...sheet.cssRules].map((r) => r.constructor.name).join(' ');
const sheetOf = (d, text) => {
  const style = d.createElement('style');
  style.textContent = text;
  d.head.append(style);
  return style.sheet;
};

parity(
  "jsdom 31's insertRule and deleteRule messages",
  (w) => {
    const d = w.document;
    const sheet = sheetOf(d, '@namespace svg url(http://www.w3.org/2000/svg); p {} @media print { a {} }');
    const media = sheet.cssRules[2];
    return [
      ...['', '   ', '/**/', '}', 'p', '@bogus', '1x {}', 'a{} b{}', 'a{};', 'a{} x', '@charset "utf-8";'].map((text) =>
        attempt(() => sheet.insertRule(text, 3)),
      ),
      ...['<!-- a{}', 'a{} -->', 'a{} <!--'].map((text) => attempt(() => sheet.insertRule(text, 3))),
      attempt(() => sheet.insertRule('@font-palette-values x {}', 3)),
      attempt(() => sheet.insertRule('@font-palette-values --x { bogus: 1 }', 3)),
      attempt(() => sheet.insertRule('a {}', 9)),
      attempt(() => sheet.insertRule('}', 9)),
      attempt(() => sheet.insertRule('a {}', -1)),
      attempt(() => sheet.insertRule('a {}', 0)),
      attempt(() => sheet.insertRule('@namespace s url(x);', 1)),
      attempt(() => sheet.insertRule('@namespace s url(x);', 3)),
      attempt(() => media.insertRule('@namespace s url(x);', 0)),
      attempt(() => media.insertRule('a {}', 5)),
      attempt(() => media.deleteRule(5)),
      attempt(() => sheet.deleteRule(9)),
      attempt(() => sheet.deleteRule(0)),
      attempt(() => sheet.addRule('1x', 'color: red')),
      attempt(() => sheet.addRule('a', 'color: red', 99)),
      names(sheet),
    ];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's order of @layer statements, @import and @namespace rules",
  (w) => {
    const d = w.document;
    const out = [
      '@layer a; @import url(x.css); @namespace s url(y); p {}',
      '@layer a, b; @import url(x.css); p {}',
      '@layer a {} @import url(x.css); p {}',
      '@import url(x.css); @layer a; @import url(y.css); p {}',
      '@namespace url(x); @layer a; @namespace s url(y); p {}',
    ].map((text) => names(sheetOf(d, text)));
    const imports = sheetOf(d, '@layer a; @import url(x.css); p {}');
    out.push(
      attempt(() => imports.insertRule('@import url(y.css);', 1)),
      attempt(() => imports.insertRule('@import url(z.css);', 0)),
      attempt(() => imports.insertRule('@layer b;', 1)),
      attempt(() => imports.insertRule('@layer b;', 2)),
      attempt(() => imports.insertRule('@layer c, d;', 0)),
      attempt(() => imports.insertRule('@layer e {}', 0)),
      names(imports),
    );
    const namespaces = sheetOf(d, '@layer a; @namespace url(x);');
    out.push(
      attempt(() => namespaces.insertRule('@namespace s url(y);', 0)),
      attempt(() => namespaces.insertRule('@namespace t url(z);', 1)),
      attempt(() => namespaces.insertRule('@layer b;', 2)),
      attempt(() => namespaces.deleteRule(3)),
      names(namespaces),
    );
    return out;
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's insertRule reads the first rule before what follows it",
  (w) => {
    const d = w.document;
    const sheet = sheetOf(d, '');
    return [
      ...['{}', ' {  }', 'a{} {}', '{} a{}', ';', ' ; '].map((text) => attempt(() => sheet.insertRule(text, 0))),
      attempt(() => sheet.addRule('', '')),
      names(sheetOf(d, '{} a{} {color:red} b{}')),
    ];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's @keyframes cssText: each keyframe on a line of its own",
  (w) => {
    const d = w.document;
    const sheet = sheetOf(
      d,
      '@keyframes k { 0% { color: red } to { color: blue; left: 1px } } @keyframes e {} @keyframes f { 50% {} } @media all { @keyframes m { 0% { color: red } } }',
    );
    const [k, e] = sheet.cssRules;
    e.appendRule('from { top: 0 }');
    return [...sheet.cssRules].map((r) => r.cssText).concat(k.cssRules[1].cssText);
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31's @container: conditions serialized as its media queries, conditions, names",
  (w) => {
    const d = w.document;
    const preludes = [
      '(width>1px)',
      'card (min-width:400px)',
      'a (w>1px), b (h>1px)',
      'a, b (h>1px)',
      'style(--x:1)',
      'Style(--x:1)',
      'card style(--x: 1)',
      'not (width<10px)',
      '(10px<width<=20px)',
      '(bogus)',
      'card',
      'none (width>1px)',
      'and (width>1px)',
      '(WIDTH > 1PX)',
      'Card (width>1px)',
      '(width>calc(1px+2px))',
      '(orientation:portrait) and (width>1px) or (height>1px)',
      '(width: 1px) , (height: 2px)',
      '(aspect-ratio > 1/2)',
      '--c (width > 1px)',
    ];
    const out = preludes.map((prelude) => {
      const rule = sheetOf(d, `@container ${prelude} { p { color: red } }`).cssRules[0];
      return rule ? [rule.cssText, rule.containerName, rule.containerQuery, JSON.stringify(rule.conditions)] : null;
    });
    const rule = sheetOf(d, '@container a (width > 1px) {}').cssRules[0];
    out.push([
      rule.conditions === rule.conditions,
      Object.isFrozen(rule.conditions),
      Object.isFrozen(rule.conditions[0]),
    ]);
    return out;
  },
  { jsdom: 31 },
);
