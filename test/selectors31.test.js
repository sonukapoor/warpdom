// jsdom 31's selectors (black box, 31.0.1; #269 part F3a): its own
// engine, which takes fewer and more selectors than jsdom 30's; a style
// rule whose selector it refuses is dropped from a sheet and refused by
// insertRule, and a rule's selectorText is the selector serialized.
import { parity } from './parity.js';

const SELECTORS = [
  'a:hover',
  'a:focus-visible',
  'a:focus-within',
  'a:active',
  'a:visited',
  'a:link',
  'a:any-link',
  'a:target',
  'a:checked',
  'a:disabled',
  'a:enabled',
  'a:required',
  'a:optional',
  'a:invalid',
  'a:valid',
  'a:placeholder-shown',
  'a:read-only',
  'a:read-write',
  'a:empty',
  'a:root',
  'a:scope',
  'a:first-child',
  'a:last-child',
  'a:only-child',
  'a:first-of-type',
  'a:nth-child(2n+1)',
  'a:nth-child(2 of .b)',
  'a:nth-of-type(odd)',
  'a:not(.b)',
  'a:is(.b, .c)',
  'a:where(.b)',
  'a:has(> .b)',
  'a:lang(en)',
  'a:dir(ltr)',
  'a:defined',
  'a:host',
  ':host(.a)',
  ':host-context(.a)',
  '::slotted(a)',
  '::part(x)',
  'a::before',
  'a::after',
  'a:before',
  'a:after',
  'a::first-line',
  'a::first-letter',
  'a::placeholder',
  'a::selection',
  'a::marker',
  'a::backdrop',
  'a::-webkit-scrollbar',
  'a::-moz-selection',
  'a:-moz-focusring',
  'a:-webkit-autofill',
  'a:autofill',
  'a::file-selector-button',
  'a:indeterminate',
  'a:default',
  'a:in-range',
  'a:out-of-range',
  'a:fullscreen',
  'a:modal',
  'a:popover-open',
  'a:user-invalid',
  'a:open',
  'a:state(x)',
  'a:HOVER',
  '[a=b i]',
  '[a="b" s]',
  'ns|a',
  '*|a',
  '|a',
  'a > b',
  'a ~ b',
  'a + b',
  'a || b',
  'a:nth-last-child(1)',
  'a:matches(.b)',
  'a:-webkit-any(.b)',
  'a::cue',
  'a::view-transition',
  'a:current',
  'a:past',
  'a:playing',
  'a:paused',
  'a::highlight(x)',
  'a::grammar-error',
  'a::spelling-error',
  'a::target-text',
  'a::details-content',
  ':root',
  '&',
  '& a',
  'a:focus',
  'a::-webkit-foo',
  'a::-webkit-inner-spin-button',
  'a::-webkit-input-placeholder',
  'a::-moz-placeholder',
  'a:-ms-input-placeholder',
  'a::-ms-clear',
  'a:-webkit-any-link',
  'a:-moz-any-link',
  'a:-moz-placeholder',
  'a::-moz-focus-inner',
  'a:-webkit-full-screen',
  'a:-moz-full-screen',
  'a:-moz-ui-invalid',
  'a:first-line',
  'a:first-letter',
  'a:marker',
  'a:selection',
  'a:placeholder',
  'a::FIRST-LINE',
  'a::BEFORE',
  'a:BEFORE',
  'a::foo',
  'a:foo()',
  'a:hover()',
  'a:not()',
  'a:is()',
  'a:where()',
  'a:has()',
  'a:not(a:hover)',
  'a:not(::before)',
  'a:is(::before)',
  'a::before:hover',
  'a::before.b',
  'a::before b',
  'a::part(x):hover',
  'a::slotted(b)',
  'a::slotted()',
  'a:host(b c)',
  'a:nth-child(n)',
  'a:nth-child(-n+3)',
  'a:nth-child(+5)',
  'a:nth-child(2n + 1)',
  'a:nth-child( 2n+1 )',
  'a:nth-child(2n- 1)',
  'a:nth-child(2N+1)',
  'a:nth-child(EVEN)',
  'a:nth-child(3 of)',
  'a:lang("en")',
  'a:lang(en, fr)',
  'a:lang(*-CH)',
  'a:dir(rtl)',
  'a:dir(foo)',
  'a:state()',
  'a:local-link',
  'a:target-within',
  'a:blank',
  'a:seeking',
  'a:buffering',
  'a:stalled',
  'a:muted',
  'a:volume-locked',
  'a:picture-in-picture',
  'a:has-slotted',
  'a:heading',
  'a:heading(1)',
  'a:active-view-transition',
  'a:active-view-transition-type(x)',
  'a:xr-overlay',
  'a:focus-ring',
  'a:enabled:disabled',
  'a:first',
  'a:left',
  'a:right',
  'a:-webkit-autofill:hover',
  '::-webkit-scrollbar',
  ':-webkit-scrollbar',
  'a::-webkit-scrollbar-thumb:hover',
  '[a|b]',
  '[*|b]',
  '[|b]',
  '[a=b I]',
  '[a=b x]',
  '[a~="b"]',
  '[a|="b"]',
  '[a^="b"]',
  '[a$="b"]',
  '[a*="b"]',
  '[a="b"i]',
  '[ a = b ]',
  '#1a',
  '.1a',
  '#-a',
  '.-',
  'a#b.c[d]:hover::before',
  '*',
  '*.a',
  'a*',
];

const valid = (d, selector) => {
  try {
    d.querySelector(selector);
    return true;
  } catch {
    return false;
  }
};

parity('jsdom 31: the selectors querySelector takes', (w) => SELECTORS.map((s) => [s, valid(w.document, s)]), {
  jsdom: 31,
});

parity(
  "jsdom 31: a rule with a selector it refuses is dropped, the others' selectorText serialized",
  (w) => {
    const d = w.document;
    return SELECTORS.map((s) => {
      const style = d.createElement('style');
      style.textContent = `${s} { color: red }`;
      d.head.append(style);
      const rule = style.sheet.cssRules[0];
      style.remove();
      return [s, rule === undefined ? 'dropped' : rule.selectorText];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: insertRule refuses a rule with a selector it refuses',
  (w) => {
    const style = w.document.createElement('style');
    w.document.head.append(style);
    return SELECTORS.map((s) => {
      try {
        style.sheet.insertRule(`${s} {}`, 0);
        const text = style.sheet.cssRules[0].selectorText;
        style.sheet.deleteRule(0);
        return [s, text];
      } catch (e) {
        return [s, e.name];
      }
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: what the names it knows match',
  (w) => {
    const d = w.document;
    d.body.innerHTML =
      '<div id=r><h1 id=h1>x</h1><h3 id=h3></h3><a id=l href="#x">l</a><a id=l2 href="http://other/">o</a>' +
      '<video id=v></video><input id=i><input id=f value=x><p id=e></p><slot id=s></slot></div>';
    const r = d.getElementById('r');
    const h1 = d.getElementById('h1');
    const names = [
      ':blank',
      'video:paused',
      ':playing',
      ':local-link',
      ':heading',
      ':heading(1)',
      ':heading(3)',
      ':heading(1, 3)',
      '&',
      '& h1',
      'div || h1',
      ':current',
      ':autofill',
      ':-webkit-autofill',
      'a:before',
      ':state(x)',
      ':dir(foo)',
      ':lang(en, fr)',
      ':is()',
      ':host',
      ':host-context(div)',
      ':has-slotted',
    ];
    return names.map((s) => {
      const all = (root) => {
        try {
          return [...root.querySelectorAll(s)].map((e) => `${e.localName}#${e.id}`).join(',');
        } catch (e) {
          return e.name;
        }
      };
      let closest;
      try {
        closest = h1.closest(s)?.localName ?? null;
      } catch (e) {
        closest = e.name;
      }
      return [s, all(d), all(r), closest];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: a selector list with one it refuses drops the whole rule from the cascade',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p id=p></p>';
    const lists = [
      '#p, b:foo',
      '#p, ::-moz-selection',
      '#p, :matches(b)',
      '#p, input:-webkit-autofill',
      '& #p',
      '#p, :current',
      '#p, a..b',
      '#p, ns|a',
    ];
    return lists.map((list) => {
      const style = d.createElement('style');
      style.textContent = `${list} { color: red }`;
      d.head.append(style);
      const color = w.getComputedStyle(d.getElementById('p')).color;
      style.remove();
      return [list, color];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: the selectorText setter takes a selector it knows, serialized',
  (w) => {
    const style = w.document.createElement('style');
    style.textContent = 'p {}';
    w.document.head.append(style);
    const rule = style.sheet.cssRules[0];
    return ['a:foo', 'A:BEFORE', '  a  >  b ', '*.x', 'a..b', '', ' .t', 'a, b:matches(c)', 'x /* c */ y', 'a,'].map(
      (text) => {
        rule.selectorText = text;
        return [text, rule.selectorText];
      },
    );
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31: a sheet's selectors as written there (comments, U+00A0, nesting's &)",
  (w) => {
    const style = w.document.createElement('style');
    style.textContent = ' .t {} /*x*/ a /*y*/ > b {} & .c {} .d, & {} :is(&) {}';
    w.document.head.append(style);
    return [...style.sheet.cssRules].map((r) => r.selectorText);
  },
  { jsdom: 31 },
);

parity('jsdom 30 keeps the rules jsdom 31 drops', (w) => {
  const style = w.document.createElement('style');
  style.textContent = 'a..b {} 1a {} a:foo {} > a {} a:matches(b) {} a:before {} *.a {}';
  w.document.head.append(style);
  return [...style.sheet.cssRules].map((r) => r.selectorText);
});

parity(
  "jsdom 31's selector(): :is() and :where() unforgiving, the selectors it knows",
  (w) => {
    const list = [
      ':-webkit-autofill',
      'a:before',
      '::-moz-selection',
      ':matches(a)',
      'a || b',
      '&',
      'a::before:hover',
      'a::before b',
      ':state(x)',
      ':host-context(a)',
      '::slotted(a)',
      ':is(::before)',
      ':is(a, ::before)',
      ':is(a, b:foo)',
      ':where()',
      ':not(:is(::before))',
      ':is(::slotted(i))',
      ':is(a)::before',
      ':is(:hover)',
    ];
    const style = w.document.createElement('style');
    style.textContent = list.map((s, i) => `@supports selector(${s}) { body { --s${i}: 1 } }`).join(' ');
    w.document.head.append(style);
    const computed = w.getComputedStyle(w.document.body);
    return list.map((s, i) => [s, w.CSS.supports(`selector(${s})`), computed.getPropertyValue(`--s${i}`)]);
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): U+00A0 alone, *||, escapes in pseudo-elements, :lang() lists, :blank and text',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = '\u00a0 { color: red } a::-webkit-\\! {} a::highlight(\\*) {} a::part(\\*) {} b {}';
    d.head.append(style);
    const texts = [...style.sheet.cssRules].map((r) => r.selectorText);
    const inserted = d.createElement('style');
    d.head.append(inserted);
    inserted.sheet.insertRule('\u00a0 { color: red }', 0);
    d.body.innerHTML =
      '<table><tr><td id=t></td></tr></table><div lang=en><i id=e></i></div><div lang=fr><i id=f></i></div>' +
      '<div lang=de><i id=g></i></div><textarea id=x></textarea>';
    const ids = (s) => [...d.querySelectorAll(s)].map((e) => e.id);
    const area = d.getElementById('x');
    area.append('');
    const rule = d.createElement('style');
    rule.textContent = 'textarea:blank { color: red }';
    d.head.append(rule);
    const colors = [w.getComputedStyle(area).color];
    area.firstChild.data = 'x';
    colors.push(w.getComputedStyle(area).color);
    area.value = '';
    colors.push(w.getComputedStyle(area).color);
    return [texts, inserted.sheet.cssRules[0].selectorText, ids('*||td'), ids('i:lang(en, fr)'), colors];
  },
  { jsdom: 31 },
);

parity(
  "jsdom 31 (#346 review): @scope's selectors in its grammar",
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = '@scope (:heading) { p { color: red } } @scope (div) to (:heading) { p { color: blue } }';
    d.head.append(style);
    d.body.innerHTML = '<h1><p id=a></p></h1><div><h2><p id=b></p></h2><p id=c></p></div>';
    const color = (id) => w.getComputedStyle(d.getElementById(id)).color;
    return [style.sheet.cssRules.length, color('a'), color('b'), color('c')];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): an escaped * is a type name; :local-link in an about:blank iframe',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = '\\* {} \\*.a {} |\\* {} [\\*] {} * {} b {}';
    d.head.append(style);
    d.body.innerHTML = '<p class=a></p>';
    const counts = ['\\*', '\\*.a', '|\\*', '*'].map((s) => d.querySelectorAll(s).length);
    const frame = d.createElement('iframe');
    d.body.append(frame);
    const inner = frame.contentDocument;
    inner.body.innerHTML = `<a id=a href="${w.location.href}">p</a><a id=b href="about:blank">b</a><a id=c href="#x">c</a>`;
    return [
      [...style.sheet.cssRules].map((r) => r.selectorText),
      counts,
      [...inner.querySelectorAll(':local-link')].map((e) => e.id),
    ];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): \\*::slotted() needs an element named *; @scope keeps U+00A0 in start and end',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id=h></div>';
    const host = d.getElementById('h');
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>\\*::slotted(i) { color: red } slot::slotted(b) { color: blue }</style><slot></slot>';
    host.innerHTML = '<i id=i></i><b id=b></b>';
    const color = (id) => w.getComputedStyle(d.getElementById(id)).color;
    const style = d.createElement('style');
    style.textContent = '@scope ( .a ) to ( p) { a { color: red } } @scope ( .b ) { a { color: red } }';
    d.head.append(style);
    return [color('i'), color('b'), [...style.sheet.cssRules].map((r) => [r.start, r.end])];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): :local-link styles follow pushState and replaceState, across shadow trees too',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = 'a:local-link { color: red } #h:local-link { color: green }';
    d.head.append(style);
    const here = new URL(w.location.href);
    d.body.innerHTML = `<a id=a href="${here.pathname}">a</a><a id=b href="/other">b</a><a id=h href="/other"><span id=s></span></a>`;
    d.getElementById('s').attachShadow({ mode: 'open' }).innerHTML = '<i>i</i>';
    const inner = d.getElementById('s').shadowRoot.firstChild;
    const read = () => [
      ...['a', 'b'].map((id) => w.getComputedStyle(d.getElementById(id)).color),
      w.getComputedStyle(inner).color,
    ];
    const out = [read()];
    w.history.pushState(null, '', '/other');
    out.push(read());
    w.history.replaceState(null, '', `${here.pathname}?q`);
    out.push(read());
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): ::slotted(a:local-link) styles follow pushState and replaceState',
  (w) => {
    const d = w.document;
    const here = new URL(w.location.href).pathname;
    d.body.innerHTML = '<div id=h><a id=a href="/other">a</a></div><div id=g><a id=b href="/other">b</a></div>';
    d.getElementById('h').attachShadow({ mode: 'open' }).innerHTML =
      '<style>::slotted(a:local-link) { color: red }</style><slot></slot>';
    d.getElementById('g').attachShadow({ mode: 'open' }).innerHTML =
      '<style>b:local-link { color: blue } ::slotted(a:local-link) { color: green }</style><slot></slot><b></b>';
    const read = () => ['a', 'b'].map((id) => w.getComputedStyle(d.getElementById(id)).color);
    const out = [read()];
    w.history.pushState(null, '', '/other');
    out.push(read());
    w.history.replaceState(null, '', here);
    out.push(read());
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): :heading() levels are written with six significant digits',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = [
      ':heading(1, 1234567)',
      ':heading(9999999)',
      ':heading(-1234567)',
      ':heading(9007199254740993)',
      ':heading(123456789012345678901234)',
      ':nth-child(1234567n+1234567)',
    ]
      .map((s) => `p, ${s} {}`)
      .join(' ');
    d.head.append(style);
    return [...style.sheet.cssRules].map((r) => r.selectorText);
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): a rule whose :heading() level is written with an exponent still applies',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = 'p, :heading(123456789012345678901234) { color: red } b { color: blue }';
    d.head.append(style);
    d.body.innerHTML = '<p id=p></p><b id=b></b><i id=i></i>';
    const color = (id) => w.getComputedStyle(d.getElementById(id)).color;
    const [first, second] = style.sheet.cssRules;
    const out = [first.selectorText, color('p')];
    second.selectorText = 'i, :heading(1111111111111111111111111)';
    out.push(second.selectorText, color('b'), color('i'));
    // (the text as written back: an exponent is no level)
    second.selectorText = 'b, :heading(1.11111e+24)';
    out.push(second.selectorText, color('b'), color('i'));
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#346 review): an exponent :heading() rule still applies after many others',
  (w) => {
    const d = w.document;
    const sheet = (text) => {
      const style = d.createElement('style');
      style.textContent = text;
      d.head.append(style);
      void style.sheet.cssRules.length;
      return style;
    };
    const rule = 'p, :heading(123456789012345678901234) { color: red }';
    const lossy = (from, count) => {
      const rules = [];
      for (let k = 0; k < count; k++) rules.push(`:heading(${100001 + from + k}000000000000000000) {}`);
      sheet(rules.join(' ')).remove();
    };
    // (selectors written with an exponent, and others, past what the
    // selector caches keep: 1000 of each, the rule, 1000 more written with
    // an exponent)
    lossy(0, 1000);
    for (let k = 0; k < 1000; k++) sheet(`q${k} {}`).remove();
    sheet(rule).remove();
    lossy(1000, 1000);
    sheet(rule);
    d.body.innerHTML = '<p id=p></p>';
    return w.getComputedStyle(d.getElementById('p')).color;
  },
  { jsdom: 31 },
);

const COMMENTED = [
  'p/**/b',
  'p /**/b',
  'div/**/.a',
  '#/**/a',
  '.a/**/p',
  ':/**/is(p)',
  'p/**/>b',
  '-/**/a',
  '/**/p/**/',
  '[a=/**/"b"]',
  'a\\/**/b',
  ':nth-child(2n/**/+1)',
  ':nth-child(2/**/n+1)',
  ':is/**/(p)',
  '[a="/**/"]',
];
parity(
  'jsdom 31 (#269 part F3b): a comment separates tokens, in queries and rules',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div class=a><p><b></b></p></div>';
    const style = d.createElement('style');
    d.head.append(style);
    return COMMENTED.map((selector) => {
      let count;
      try {
        count = d.querySelectorAll(selector).length;
      } catch (e) {
        count = e.name;
      }
      style.textContent = `${selector} {}`;
      const rule = style.sheet.cssRules[0];
      return [selector, count, rule ? rule.selectorText : null];
    });
  },
  { jsdom: 31 },
);

const FORGIVING = [
  ':is(1x, b)',
  ':is( 1x, b)',
  ':is(1x , b)',
  ':is(1x/* x */,b)',
  ':is(1x /**/, b)',
  ':is(b , 1x )',
  ':is( /**/ )',
  ':is(1x, )',
  ':is(1x,,b)',
  ':is(p/**/:bogus, b)',
  ':is(a  b:bogus, b)',
  ':is(:where(1x , b))',
  ':is(::before, b)',
  ':where(1x)',
  'p, :is(1x , b)',
];
parity(
  'jsdom 31 (#269 part F3b): :is() and :where() keep the items they cannot read, as written',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p><b></b></p>';
    const style = d.createElement('style');
    d.head.append(style);
    return FORGIVING.map((selector) => {
      let count;
      try {
        count = d.querySelectorAll(selector).length;
      } catch (e) {
        count = e.name;
      }
      style.textContent = `${selector} {}`;
      const rule = style.sheet.cssRules[0];
      return [selector, count, rule ? rule.selectorText : null];
    });
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#269 part F3b): @scope start and end serialized, an end relative, no pseudo-elements, comments',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent = [
      '@scope (a>b) to (c   d) {}',
      "@scope (DIV.A:HOVER, [a='b' i]) to (:IS(P)) {}",
      '@scope (:heading(01)) {}',
      '@scope (a /*x*/ b) {}',
      '@scope (a/*x*/b) {}',
      '@scope (p::before) {}',
      '@scope (.a) to (p::before) {}',
      '@scope (> .a) {}',
      '@scope (.a) to (> p, span) { b { color: red } }',
      '@scope (#r) to (~ span) { i { color: green } }',
    ].join(' ');
    d.head.append(style);
    d.body.innerHTML =
      '<div class=a id=r><p id=p><b id=b><i id=i></i></b></p><span id=s><b id=c></b><i id=j></i></span></div>';
    const color = (id) => w.getComputedStyle(d.getElementById(id)).color;
    return [[...style.sheet.cssRules].map((r) => [r.start, r.end, r.cssText]), ['b', 'c', 'i', 'j'].map(color)];
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#269 part F3b): an invalid selector throws "Invalid selector" from every query',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id=h><p></p></div>';
    const root = d.getElementById('h').attachShadow({ mode: 'open' });
    const fragment = d.createDocumentFragment();
    const p = d.querySelector('p');
    const calls = [
      (s) => d.querySelector(s),
      (s) => d.querySelectorAll(s),
      (s) => p.matches(s),
      (s) => p.closest(s),
      (s) => p.webkitMatchesSelector(s),
      (s) => root.querySelector(s),
      (s) => fragment.querySelectorAll(s),
    ];
    return ['', ':bogus', 'a[', 'a,,b', ':nth-child(x)', 'p/**/b'].map((s) =>
      calls.map((call) => {
        try {
          call(s);
          return 'ok';
        } catch (e) {
          return `${e.name}: ${e.message}`;
        }
      }),
    );
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#348 review): an escape ends a name with its space, a comment ends at its first */, an item kept as text still matches its list',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p class=ab id=p></p><b id=b></b>';
    const out = [];
    for (const selector of [
      '.\\61 /**/b',
      ':is(1x/* /* */, b)',
      ':is(1x/*a/*b*/, b)',
      ':is(1x/*a/*b*/ , b)',
      ':is(1x\\ , b)',
    ]) {
      let count;
      try {
        count = d.querySelectorAll(selector).length;
      } catch (e) {
        count = e.name;
      }
      const style = d.createElement('style');
      style.textContent = `${selector} { color: red }`;
      d.head.append(style);
      const rule = style.sheet.cssRules[0];
      out.push([
        selector,
        count,
        rule ? rule.selectorText : null,
        ...['p', 'b'].map((id) => w.getComputedStyle(d.getElementById(id)).color),
      ]);
      style.remove();
    }
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#348 review): an item kept as text in a scope boundary still lets the others match; a string ends before a trailing comment',
  (w) => {
    const d = w.document;
    const style = d.createElement('style');
    style.textContent =
      '@scope (:is(1x\\ , .a)) { i { color: red } } @scope (.b) to (:is(1x\\ , u)) { s { color: blue } }';
    d.head.append(style);
    d.body.innerHTML = '<div class=a><i id=i></i></div><div class=b><u><s id=s></s></u><s id=t></s></div>';
    const color = (id) => w.getComputedStyle(d.getElementById(id)).color;
    const out = [[...style.sheet.cssRules].map((r) => [r.start, r.end]), ['i', 's', 't'].map(color)];
    for (const selector of [':is(1x"/*"/*tail*/, b)', ':is(1x"/*" , b)', ':is(1x"a b", b)', ":is(1x'*/' /**/, b)"]) {
      let count;
      try {
        count = d.querySelectorAll(selector).length;
      } catch (e) {
        count = e.name;
      }
      const sheet = d.createElement('style');
      sheet.textContent = `${selector} {}`;
      d.head.append(sheet);
      out.push([selector, count, sheet.sheet.cssRules[0]?.selectorText ?? null]);
      sheet.remove();
    }
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31 (#348 review): a hex escape in an item kept as text ends with its space',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<b id=b></b>';
    return [':is(1x\\61 , b)', ':where(1x\\61 , b)', ':is(1x\\61  , b)', ':is(1x\\000061 , b)'].map((selector) => {
      let count;
      try {
        count = d.querySelectorAll(selector).length;
      } catch (e) {
        count = e.name;
      }
      const style = d.createElement('style');
      style.textContent = `${selector} { color: red }`;
      d.head.append(style);
      const out = [
        selector,
        count,
        style.sheet.cssRules[0]?.selectorText ?? null,
        w.getComputedStyle(d.getElementById('b')).color,
      ];
      style.remove();
      return out;
    });
  },
  { jsdom: 31 },
);
