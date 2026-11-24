// jsdom 31's shadow scoping (black box, 31.0.1): each tree's own style
// sheets apply in it (document.styleSheets, ShadowRoot.styleSheets), and
// inheritance follows the flat tree (a shadow tree's top from its host, a
// slotted element from its slot). jsdom 30 applies every sheet everywhere
// and inherits through the DOM tree; the same scenarios run on both.
import { parity } from './parity.js';

const tree = (w) => {
  const d = w.document;
  d.head.innerHTML = '<style>.docx { color: rgb(0, 128, 0) } b { letter-spacing: 7px }</style>';
  d.body.innerHTML =
    '<div id=host style="font-size: 30px; color: rgb(255, 0, 0); --v: 5px"><span id=light>l</span><i id=named slot=n>n</i><em id=loose slot=none>x</em></div><p id=outside class=docx>o</p>';
  const host = d.getElementById('host');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML =
    '<style>.inner { text-transform: uppercase } p { color: rgb(9, 9, 9) } slot { line-height: 40px } #host { padding-top: 1px }</style>' +
    '<b id=b class="docx inner">b</b><div id=wrap style="font-style: italic"><slot id=s></slot><slot name=n id=s2></slot></div>';
  return { d, host, root };
};

for (const jsdom of [30, 31]) {
  parity(
    `jsdom ${jsdom}: style sheets by tree and inheritance through the flat tree`,
    (w) => {
      const { d, host, root } = tree(w);
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      const b = root.getElementById('b');
      const light = d.getElementById('light');
      return {
        docSheets: d.styleSheets.length,
        rootSheets: root.styleSheets?.length,
        docRuleInShadow: [cs(b, 'color'), cs(b, 'letter-spacing')],
        ownRuleInShadow: cs(b, 'text-transform'),
        shadowRuleOutside: cs(d.getElementById('outside'), 'color'),
        shadowRuleOnHost: cs(host, 'padding-top'),
        topFromHost: [cs(b, 'font-size'), cs(b, '--v')],
        slottedFromSlot: [
          cs(light, 'line-height'),
          cs(light, 'font-style'),
          cs(d.getElementById('named'), 'font-style'),
        ],
        unslotted: cs(d.getElementById('loose'), 'font-size'),
      };
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: a shadow tree's sheets and slots after changes`,
    (w) => {
      const { d, host, root } = tree(w);
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      const b = root.getElementById('b');
      const named = d.getElementById('named');
      const out = [cs(b, 'word-spacing'), cs(named, 'line-height')];
      // a sheet added, then its text changed, then removed
      const style = root.appendChild(d.createElement('style'));
      style.textContent = 'b { word-spacing: 3px }';
      out.push(cs(b, 'word-spacing'), root.styleSheets?.length);
      style.textContent = 'b { word-spacing: 4px }';
      out.push(cs(b, 'word-spacing'));
      style.remove();
      out.push(cs(b, 'word-spacing'), root.styleSheets?.length);
      // a rule inserted through the CSSOM
      root.styleSheets?.[0]?.insertRule('b { word-spacing: 6px }', 0);
      out.push(cs(b, 'word-spacing'));
      // a slotted element moved to the other slot, then out of the slots
      named.removeAttribute('slot');
      out.push(cs(named, 'line-height'), cs(named, 'font-style'));
      named.setAttribute('slot', 'none');
      out.push(cs(named, 'font-size'));
      // the host's inherited value changing
      host.style.fontSize = '12px';
      out.push(cs(b, 'font-size'), cs(d.getElementById('light'), 'font-size'));
      return out;
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: nested shadow trees`,
    (w) => {
      const { root } = tree(w);
      const d = w.document;
      root.querySelector('style').textContent += ' section { text-transform: lowercase }';
      const inner = root.appendChild(d.createElement('section')).attachShadow({ mode: 'open' });
      inner.innerHTML = '<style>u { text-decoration-line: overline }</style><u id=u>u</u><slot></slot>';
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      const u = inner.getElementById('u');
      return {
        sheets: [d.styleSheets.length, root.styleSheets?.length, inner.styleSheets?.length],
        own: cs(u, 'text-decoration-line'),
        outerRule: cs(u, 'text-transform'),
        inherited: [cs(u, 'font-size'), cs(u, 'color'), cs(u, 'letter-spacing')],
      };
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: a host's pseudo-elements, and a host moved into another document (#340 review)`,
    (w) => {
      const d = w.document;
      const out = {};
      d.head.innerHTML = '<style>#h2::before { content: "x" } #h3::after { content: "y" }</style>';
      d.body.innerHTML =
        '<div id=h2 style="color: rgb(255, 0, 0); --v: 3px"><span>l</span></div><iframe id=f></iframe>';
      const h2 = d.getElementById('h2');
      h2.attachShadow({ mode: 'open' }).innerHTML = '<i>no default slot</i>';
      out.before = [
        w.getComputedStyle(h2, '::before').color,
        w.getComputedStyle(h2, '::before').getPropertyValue('--v'),
      ];
      const h3 = d.body.appendChild(d.createElement('div'));
      h3.id = 'h3';
      h3.style.color = 'rgb(0, 0, 255)';
      h3.attachShadow({ mode: 'open' }).innerHTML = '<slot style="color: rgb(9, 9, 9)"></slot>';
      out.after = w.getComputedStyle(h3, '::after').color;
      const frame = d.getElementById('f');
      const fd = frame.contentDocument;
      const fw = frame.contentWindow;
      fd.head.innerHTML = '<style>b { word-spacing: 9px }</style>';
      const host = d.createElement('div');
      const root = host.attachShadow({ mode: 'open' });
      root.innerHTML = '<style>b { text-transform: uppercase }</style><b id=b>b</b>';
      const sheets = root.styleSheets;
      fd.body.appendChild(host);
      const b = root.getElementById('b');
      out.moved = [fw.getComputedStyle(b).textTransform, fw.getComputedStyle(b).wordSpacing, sheets?.length];
      root.appendChild(fd.createElement('style')).textContent = 'b { font-style: italic }';
      out.added = [sheets?.length, root.styleSheets?.length, fw.getComputedStyle(b).fontStyle];
      return out;
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: a sheetless shadow tree after a document rule edit, and @scope through slots (#340 review)`,
    (w) => {
      const d = w.document;
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      d.head.innerHTML =
        '<style>#host { font-size: 20px } @scope (#sc) to (.stop) { span { margin-top: 7px } } @scope (.stop) { span { padding-top: 3px } }</style>';
      d.body.innerHTML = '<div id=host></div><div id=sc><span id=ls>l</span></div>';
      const host = d.getElementById('host');
      host.attachShadow({ mode: 'open' }).innerHTML = '<b id=b>b</b>';
      const b = host.shadowRoot.getElementById('b');
      const out = [cs(b, 'font-size')];
      d.styleSheets[0].cssRules[0].style.fontSize = '33px';
      out.push(cs(host, 'font-size'), cs(b, 'font-size'));
      d.getElementById('sc').attachShadow({ mode: 'open' }).innerHTML = '<div class=stop><slot></slot></div>';
      const ls = d.getElementById('ls');
      out.push(cs(ls, 'margin-top'), cs(ls, 'padding-top'));
      return out;
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: a shadow tree's inherited values after style text, text and outer shadow tree changes (#340 review)`,
    (w) => {
      const d = w.document;
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      d.head.innerHTML =
        '<style>#host { font-size: 20px }</style><style>#h2 { font-size: 10px } #h2:empty { font-size: 20px }</style>';
      d.body.innerHTML = '<div id=host></div><div id=h2></div><div id=h3></div>';
      const host = d.getElementById('host');
      host.attachShadow({ mode: 'open' }).innerHTML = '<b id=b>b</b>';
      const b = host.shadowRoot.getElementById('b');
      const out = [cs(b, 'font-size')];
      d.head.firstChild.firstChild.data = '#host { font-size: 33px }';
      out.push(cs(b, 'font-size'));
      const h2 = d.getElementById('h2');
      const text = h2.appendChild(d.createTextNode(''));
      h2.attachShadow({ mode: 'open' }).innerHTML = '<i id=i>i</i>';
      const i = h2.shadowRoot.getElementById('i');
      out.push(cs(i, 'font-size'));
      text.data = 'x';
      out.push(cs(h2, 'font-size'), cs(i, 'font-size'));
      const outer = d.getElementById('h3').attachShadow({ mode: 'open' });
      outer.innerHTML = '<style>section { font-size: 15px }</style><section id=sec></section>';
      const inner = outer.getElementById('sec').attachShadow({ mode: 'open' });
      inner.innerHTML = '<u id=u>u</u>';
      const u = inner.getElementById('u');
      out.push(cs(u, 'font-size'));
      outer.firstChild.firstChild.data = 'section { font-size: 17px }';
      out.push(cs(u, 'font-size'));
      return out;
    },
    { jsdom },
  );

  parity(
    `jsdom ${jsdom}: a slotted element's inherited values after its shadow tree's sheets change (#340 review)`,
    (w) => {
      const d = w.document;
      const cs = (e, p) => w.getComputedStyle(e).getPropertyValue(p);
      d.body.innerHTML = '<div id=host><span id=s>s</span></div>';
      const root = d.getElementById('host').attachShadow({ mode: 'open' });
      root.innerHTML = '<style>slot { font-size: 10px }</style><slot></slot>';
      const span = d.getElementById('s');
      const out = [cs(span, 'font-size')];
      root.firstChild.firstChild.data = 'slot { font-size: 30px }';
      out.push(cs(span, 'font-size'));
      root.styleSheets?.[0]?.cssRules[0].style.setProperty('font-size', '31px');
      out.push(cs(span, 'font-size'));
      return out;
    },
    { jsdom },
  );
}
