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

parity(
  "jsdom 31's style accessors: cssFloat on CSSStyleDeclaration, no accessor for names it does not know",
  (w) => {
    const own = (proto, key) => Object.getOwnPropertyDescriptor(proto, key) !== undefined;
    const style = w.document.createElement('div').style;
    style.cssFloat = 'left';
    return [
      own(w.CSSStyleDeclaration.prototype, 'cssFloat'),
      own(w.CSSStyleProperties.prototype, 'cssFloat'),
      style.cssText,
      style.cssFloat,
      ...['voiceFamily', 'voice-family', 'cue', 'strokeColor', 'navUp', 'pause', 'color', 'float'].map(
        (k) => k in style,
      ),
      Object.getOwnPropertyNames(w.CSSStyleProperties.prototype).length,
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#348 review): an at-rule named past scope is unknown; a string in a style() query stays as written',
  (w) => {
    const d = w.document;
    const unknown = sheetOf(d, '@scopeé {} @scope\\41 {} p { color: red }');
    const container = sheetOf(d, '@container style(--x: "style(--y:1)") { p {} }').cssRules[0];
    return [
      [...unknown.cssRules].map((r) => r.cssText),
      container.conditionText,
      container.containerQuery,
      JSON.stringify(container.conditions),
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#348 review): a container query keeps what it does not read as written; a media query keeps its strings',
  (w) => {
    const d = w.document;
    return ['(x: "a  b")', 'foo("a  b"  c)', '(x:  "a\tb")', 'style(--x:  "a  b"   c)', 'style(--x: "a  b")'].map(
      (q) => [
        sheetOf(d, `@media ${q} {}`).cssRules[0]?.media.mediaText ?? null,
        sheetOf(d, `@container ${q} {}`).cssRules[0]?.conditionText ?? null,
      ],
    );
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#348 review): an escaped quote outside a string is no string; a string drops escaped newlines',
  (w) => {
    const d = w.document;
    const media = sheetOf(d, '@media all {}').cssRules[0].media;
    return ['foo(a\\"b)', "(x: a\\'b)", '(x: "a\\\nb")', '(x: "\\41\\\nB")', '(x: "a\\\r\nb")', '(x: "a\\\fb")'].map(
      (q) => {
        media.mediaText = q;
        const written = media.mediaText;
        media.mediaText = written;
        return [written, media.mediaText];
      },
    );
  },
  { jsdom: 31 },
);

// An escape is one token when a sheet is split into rules: a\"b {} is a
// rule, not a string running to the end of the sheet (#348 review).
for (const jsdom of [27, 30, 31])
  parity(
    `jsdom ${jsdom}: an escaped quote or brace in a selector or value does not end the sheet`,
    (w) => {
      const d = w.document;
      return ['a\\"b{color:red} c{}', "a\\'b{} c{}", 'a\\{b{} c{}', 'a{--x:a\\"b} b{color:red}'].map((text) =>
        [...sheetOf(d, text).cssRules].map((r) => r.cssText),
      );
    },
    { jsdom },
  );
