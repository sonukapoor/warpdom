// jsdom 31's :host, :host(), :host-context() and ::slotted() (black box,
// 31.0.1; CSS Scoping 3): a shadow tree's rules for its host and for the
// elements in its slots, in the cascade by context (the outer tree's
// normal declarations first, the inner tree's !important ones first,
// before the style attribute and layers). jsdom 30 applies none of them;
// the same scenarios run on both.
import { parity } from './parity.js';

// [document css, shadow css, the host's children, element (host, a
// selector in the host, ::pseudo after it), properties]
const CASES = [
  ['', ':host(.a) { margin-top: 1px } :host { margin-top: 2px }', '', 'host', 'margin-top'],
  ['', ':host { margin-top: 2px } :host(.a) { margin-top: 1px }', '', 'host', 'margin-top'],
  ['', ':host(#host) { margin-top: 1px } :host(.a.a) { margin-top: 2px }', '', 'host', 'margin-top'],
  ['div { margin-top: 1px }', ':host { margin-top: 2px !important }', '', 'host', 'margin-top'],
  ['div { margin-top: 1px !important }', ':host { margin-top: 2px !important }', '', 'host', 'margin-top'],
  ['div { margin-top: 1px !important }', ':host { margin-top: 2px }', '', 'host', 'margin-top'],
  ['div { margin-top: 1px }', ':host { margin-top: 2px; margin-left: 2px }', '', 'host', 'margin-top margin-left'],
  ['', ':host { color: rgb(1, 2, 3) }', '<span>x</span>', 'span', 'color'],
  [
    '',
    ':host-context(.a) { margin-top: 4px } :host-context(body) { margin-left: 4px }',
    '',
    'host',
    'margin-top margin-left',
  ],
  [
    '',
    ':host-context(.nope) { margin-top: 4px } :host(:not(.z)) { margin-left: 4px }',
    '',
    'host',
    'margin-top margin-left',
  ],
  ['', '* { margin-top: 4px } :host * { margin-left: 4px }', '<span>x</span>', 'host', 'margin-top margin-left'],
  [
    '',
    '.a:host { margin-top: 1px } :host.a { margin-left: 1px } :host:not(.z) { margin-right: 1px } #host:host { padding-top: 1px }',
    '',
    'host',
    'margin-top margin-left margin-right padding-top',
  ],
  [
    '',
    ':host:first-child { margin-top: 1px } :host(.a):host(div) { margin-left: 1px } :host(.a, .z) { margin-right: 1px } :host-context(.a):host { padding-top: 1px }',
    '',
    'host',
    'margin-top margin-left margin-right padding-top',
  ],
  [
    '',
    ':host * { margin-top: 4px } :host > * { margin-left: 4px }',
    '<span>x</span>',
    'span',
    'margin-top margin-left',
  ],
  [
    '',
    '::slotted(span) { margin-top: 1px } ::slotted(.k) { margin-top: 2px }',
    '<span class=k>x</span>',
    'span',
    'margin-top',
  ],
  [
    '',
    '::slotted(.k) { margin-top: 2px } ::slotted(span) { margin-top: 1px }',
    '<span class=k>x</span>',
    'span',
    'margin-top',
  ],
  [
    '',
    '::slotted(span) { margin-top: 1px } slot::slotted(span) { margin-top: 2px } ::slotted(span) { margin-top: 3px }',
    '<span>x</span>',
    'span',
    'margin-top',
  ],
  [
    'span { margin-top: 5px }',
    '::slotted(span) { margin-top: 1px !important }',
    '<span>x</span>',
    'span',
    'margin-top',
  ],
  ['span { margin-top: 5px }', '#w ::slotted(span) { margin-top: 1px }', '<span>x</span>', 'span', 'margin-top'],
  [
    '',
    '::slotted(span b) { margin-top: 1px } ::slotted(*) b { margin-left: 1px }',
    '<span>x<b>b</b></span>',
    'b',
    'margin-top margin-left',
  ],
  [
    '',
    '::slotted(i) { margin-top: 1px } ::slotted(em) { margin-left: 1px }',
    'text<i slot=n>x</i><em>e</em>',
    'i',
    'margin-top margin-left',
  ],
  [
    '',
    ':host(.a) ::slotted(i) { margin-top: 1px } :host(.z) ::slotted(i) { margin-left: 1px } ::slotted(i:first-child) { margin-right: 1px } ::slotted(i, b) { padding-top: 1px }',
    '<i>x</i>',
    'i',
    'margin-top margin-left margin-right padding-top',
  ],
  [
    '',
    ':host-context(.a) ::slotted(i) { margin-top: 1px } div ::slotted(i) { margin-left: 2px } ::slotted(.a .x) { padding-top: 1px }',
    '<i class=x>x</i>',
    'i',
    'margin-top margin-left padding-top',
  ],
  ['', '::slotted(span)::before { content: "x"; margin-top: 2px }', '<span>x</span>', 'span::before', 'margin-top'],
  [
    '',
    ':host::before { content: "h"; margin-top: 3px } :host(.a)::after { content: "a"; margin-top: 4px }',
    '',
    'host::before',
    'margin-top',
  ],
  ['', ':host(.a)::after { content: "a"; margin-top: 4px }', '', 'host::after', 'margin-top'],
  ['', '@layer a { :host { margin-top: 1px } } :host { margin-top: 2px }', '', 'host', 'margin-top'],
  ['@layer a { div { margin-top: 1px } }', ':host { margin-top: 2px }', '', 'host', 'margin-top'],
  ['', ':host { --v: 3px } ::slotted(i) { margin-top: var(--v) }', '<i>x</i>', 'i', 'margin-top'],
  [
    '',
    ':host { margin-top: revert } :host { margin-left: 3px !important; margin-left: revert-layer !important }',
    '',
    'host',
    'margin-top margin-left',
  ],
  ['', ':host { display: inline-block } ::slotted(b) { display: block }', '<b>b</b>', 'host', 'display'],
  // (#342 review) host-only arguments of ::slotted() match no element; a
  // ::slotted() in :is() is a pseudo-element there, with no specificity
  [
    '',
    '::slotted(:host) { margin-top: 9px } ::slotted(:host-context(body)) { margin-left: 9px } ::slotted(:host(i)) { margin-right: 9px }',
    '<i>x</i>',
    'i',
    'margin-top margin-left margin-right',
  ],
  [':is(.a, ::slotted(#x)) { margin-top: 1px } .a.a { margin-top: 2px }', '', '', 'host', 'margin-top'],
  ['', '@scope (#w) { ::slotted(i) { margin-top: 1px } }', '<i>x</i>', 'i', 'margin-top'],
];

const read = (w, [documentCss, shadowCss, light, which, properties]) => {
  const d = w.document;
  d.head.innerHTML = `<style>${documentCss}</style>`;
  d.body.innerHTML = `<div id=host class=a>${light}</div>`;
  const host = d.getElementById('host');
  host.attachShadow({ mode: 'open' }).innerHTML =
    `<style>${shadowCss}</style><div id=w><slot></slot><slot name=n></slot></div>`;
  const [selector, pseudo] = which.split('::');
  const element = selector === 'host' ? host : host.querySelector(selector);
  const style = w.getComputedStyle(element, pseudo ? `::${pseudo}` : undefined);
  return properties
    .split(' ')
    .map((p) => style.getPropertyValue(p))
    .join(',');
};

// (jsdom 30 matches some compounds of :host and other selectors, as it
// applies the shadow tree's sheet to the document too: .a:host no,
// :host(.a):host(div) yes; and it counts ::slotted(#x) in :is() in
// specificity; warpdom's jsdom 30 profile does not model those, as
// before; jsdom 31 only)
const JSDOM31_ONLY = new Set([11, 12, 32]);

for (const jsdom of [30, 31]) {
  parity(
    `jsdom ${jsdom}: :host, :host-context() and ::slotted() rules in the cascade`,
    (w) => CASES.filter((c, i) => jsdom === 31 || !JSDOM31_ONLY.has(i)).map((c) => read(w, c)),
    {
      jsdom,
    },
  );

  parity(
    `jsdom ${jsdom}: :host and ::slotted() against the style attribute, through nested slots, after changes`,
    (w) => {
      const d = w.document;
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      d.body.innerHTML =
        '<div id=host class=a style="margin-top: 1px !important; margin-left: 1px"><span id=s style="margin-top: 1px !important">x</span><em id=e>e</em></div>';
      const host = d.getElementById('host');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML =
        '<style>:host { margin-top: 2px !important; margin-left: 2px !important } :host(.b) { padding-top: 9px } ::slotted(span) { margin-top: 2px !important } ::slotted(em) { color: rgb(1, 1, 1) }</style><div id=inner><slot></slot></div>';
      const inner = root.getElementById('inner');
      inner.attachShadow({ mode: 'open' }).innerHTML =
        '<style>::slotted(*) { padding-top: 5px } ::slotted(slot) { padding-left: 6px }</style><slot></slot>';
      const em = d.getElementById('e');
      const out = [
        cs(host, 'margin-top'),
        cs(host, 'margin-left'),
        cs(d.getElementById('s'), 'margin-top'),
        cs(em, 'padding-top'),
        cs(em, 'color'),
        cs(root.querySelector('slot'), 'padding-left'),
      ];
      // a class, a slot assignment and the shadow tree's sheet changing
      host.className = 'b';
      out.push(cs(host, 'padding-top'));
      em.slot = 'none';
      out.push(cs(em, 'padding-top'), cs(em, 'color'));
      em.removeAttribute('slot');
      root.querySelector('style').textContent = '::slotted(em) { color: rgb(2, 2, 2) }';
      out.push(cs(em, 'color'), cs(host, 'margin-left'));
      // DOM selectors: none of these match an element
      out.push(host.matches(':host'), root.querySelectorAll('::slotted(em), :host').length);
      return out;
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: :host and ::slotted() rules for color-scheme, custom property names, the flow and logical properties (#342 review)`,
    (w) => {
      const d = w.document;
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      d.body.innerHTML =
        '<p>p</p><div id=h1></div><div id=h2></div><div id=h3><span id=s>s</span></div><div id=h4><em class=x id=e>e</em></div>';
      cs(d.querySelector('p'), 'color');
      cs(d.body, 'color');
      const h1 = d.getElementById('h1');
      const r1 = h1.attachShadow({ mode: 'open' });
      r1.innerHTML =
        '<style>:host { color-scheme: dark; background-color: light-dark(rgb(255, 255, 255), rgb(0, 0, 0)); color: light-dark(rgb(1, 1, 1), rgb(2, 2, 2)) }</style><b>b</b>';
      const out = [cs(h1, 'color-scheme'), cs(h1, 'background-color'), cs(r1.querySelector('b'), 'color')];
      const h2 = d.getElementById('h2');
      const r2 = h2.attachShadow({ mode: 'open' });
      r2.innerHTML = '<style>:host { --host: 1; --b: 2 }</style><i>i</i>';
      const names = (e) => [...w.getComputedStyle(e)].filter((n) => n.startsWith('--')).join(' ');
      out.push(cs(h2, '--host'), names(h2), names(r2.querySelector('i')));
      const h3 = d.getElementById('h3');
      h3.attachShadow({ mode: 'open' }).innerHTML =
        '<style>:host { direction: rtl; margin-inline-start: 5px } ::slotted(span) { writing-mode: vertical-rl; margin-block-start: 3px; display: block }</style><slot></slot>';
      const span = d.getElementById('s');
      out.push(cs(h3, 'direction'), cs(h3, 'margin-left'), cs(h3, 'margin-right'));
      out.push(cs(span, 'writing-mode'), cs(span, 'margin-top'), cs(span, 'margin-right'), cs(span, 'margin-left'));
      const r4 = d.getElementById('h4').attachShadow({ mode: 'open' });
      r4.innerHTML =
        '<style>::slotted(em) { margin-top: 1px } ::slotted(em) { margin-inline-start: 3px !important }</style><div id=in><slot></slot></div>';
      r4.getElementById('in').attachShadow({ mode: 'open' }).innerHTML =
        '<style>::slotted(*) { margin-block-start: 2px; margin-left: 4px !important }</style><slot></slot>';
      const em = d.getElementById('e');
      out.push(cs(em, 'margin-top'), cs(em, 'margin-left'));
      return out;
    },
    { jsdom },
  );
}
