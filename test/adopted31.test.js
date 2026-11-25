// jsdom 31's adoptedStyleSheets (black box, 31.0.1; CSSOM, WebIDL
// observable arrays): Document and ShadowRoot keep a list of constructed
// sheets, which their tree's rules read after its <style> sheets. jsdom 30
// has none.
import { parity } from './parity.js';

const attempt = (f) => {
  try {
    const value = f();
    return value === undefined ? 'ok' : value;
  } catch (e) {
    return `${e.name}: ${e.message}`;
  }
};
const sheet = (w, text, options) => {
  const s = new w.CSSStyleSheet(options);
  s.replaceSync(text);
  return s;
};

parity(
  'jsdom 30: no adoptedStyleSheets',
  (w) => ['adoptedStyleSheets' in w.document, 'adoptedStyleSheets' in w.ShadowRoot.prototype],
  { jsdom: 30 },
);

parity(
  'jsdom 31: adoptedStyleSheets is an observable array of constructed sheets of the same document',
  (w) => {
    const d = w.document;
    const out = [];
    for (const proto of [w.Document.prototype, w.ShadowRoot.prototype]) {
      const desc = Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets');
      out.push(typeof desc.get, typeof desc.set, desc.enumerable, desc.configurable, desc.get.name, desc.set.name);
    }
    const names = Object.getOwnPropertyNames(w.ShadowRoot.prototype);
    out.push(names.indexOf('adoptedStyleSheets') - names.indexOf('styleSheets'));
    const array = d.adoptedStyleSheets;
    out.push(Array.isArray(array), array.length, Object.isFrozen(array), array === d.adoptedStyleSheets);
    // (jsdom's array is its window's realm's; warpdom has the one realm, the
    // test's, as for its other arrays)
    out.push(Object.prototype.toString.call(array));
    const a = sheet(w, 'p { margin-top: 1px }');
    const b = sheet(w, 'p { margin-top: 2px }');
    d.head.innerHTML = '<style>p {}</style>';
    const owned = d.styleSheets[0];
    out.push(
      attempt(() => array.push(a, b)),
      array.length,
      array[1] === b,
    );
    d.adoptedStyleSheets = [b];
    out.push(array.length, array[0] === b, d.adoptedStyleSheets === array, d.styleSheets.length);
    // errors: the type, then the sheet (constructed, by this document)
    out.push(
      attempt(() => {
        d.adoptedStyleSheets = [{}];
      }),
      attempt(() => {
        d.adoptedStyleSheets = 5;
      }),
      attempt(() => {
        d.adoptedStyleSheets = null;
      }),
      attempt(() => {
        d.adoptedStyleSheets = { length: 1, 0: a };
      }),
      attempt(() => {
        d.adoptedStyleSheets = [owned];
      }),
      attempt(() => array.push({})),
      attempt(() => {
        array[0] = 'x';
      }),
    );
    // (a type error leaves the list as it was; a sheet that cannot be
    // adopted stops the copy there)
    out.push(array.length, array[0] === b);
    out.push(
      attempt(() => {
        d.adoptedStyleSheets = [a, owned, b];
      }),
      array.length,
      array[0] === a,
    );
    out.push(
      attempt(() => array.push(b, owned, b)),
      array.length,
    );
    // another document: its own list, no sheet of this one
    const other = d.implementation.createHTMLDocument('');
    out.push(
      other.adoptedStyleSheets.length,
      attempt(() => {
        other.adoptedStyleSheets = [a];
      }),
      attempt(() => {
        d.createElement('template').content.ownerDocument.adoptedStyleSheets = [a];
      }),
    );
    // the same sheet twice
    d.adoptedStyleSheets = [a, a];
    out.push(array.length);
    // writes: an index up to the length, a length down to 0, delete the last
    out.push(
      attempt(() => {
        array[2] = b;
        return array.length;
      }),
      attempt(() => {
        array[5] = b;
      }),
      attempt(() => {
        array.length = 9;
      }),
      attempt(() => {
        array.length = 1;
        return array.length;
      }),
      attempt(() => {
        delete array[0];
        return array.length;
      }),
      attempt(() => {
        array.bar = 2;
        return array.bar;
      }),
      Object.keys(array).join(','),
    );
    const rs = d.body.appendChild(d.createElement('div')).attachShadow({ mode: 'open' });
    out.push(
      rs.adoptedStyleSheets.length,
      rs.adoptedStyleSheets === rs.adoptedStyleSheets,
      attempt(() => {
        rs.adoptedStyleSheets = [{}];
      }),
      attempt(() => rs.adoptedStyleSheets.push(1)),
      attempt(() => {
        rs.adoptedStyleSheets = 1;
      }),
      attempt(() => {
        rs.adoptedStyleSheets = [owned];
      }),
    );
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: document.adoptedStyleSheets in the cascade, after the <style> sheets, as the list changes',
  async (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id=h></div><section><p id=p class=a>p</p></section>';
    const p = d.getElementById('p');
    const cs = (e, name) => w.getComputedStyle(e).getPropertyValue(name);
    const a = sheet(w, 'p { margin-top: 1px }');
    const b = sheet(w, 'p { margin-top: 2px }');
    const c = sheet(w, 'p { margin-left: 4px }');
    const array = d.adoptedStyleSheets;
    const out = [cs(p, 'margin-top')];
    array.push(a, b);
    out.push(cs(p, 'margin-top'));
    array.pop();
    out.push(cs(p, 'margin-top'));
    array.splice(0, 1, c, b);
    out.push(cs(p, 'margin-top'), cs(p, 'margin-left'));
    array.length = 1;
    out.push(cs(p, 'margin-top'), cs(p, 'margin-left'));
    array[0] = a;
    out.push(cs(p, 'margin-top'), cs(p, 'margin-left'));
    array[1] = b;
    out.push(cs(p, 'margin-top'));
    delete array[1];
    out.push(cs(p, 'margin-top'));
    d.adoptedStyleSheets = [a, b];
    array.reverse();
    out.push(cs(p, 'margin-top'));
    array.unshift(c);
    out.push(cs(p, 'margin-left'));
    d.adoptedStyleSheets = new Set([b]);
    out.push(cs(p, 'margin-top'));
    // after the <style> sheets (their !important declarations too)
    d.head.innerHTML = '<style>p { margin-top: 7px; margin-bottom: 1px !important } p.a { padding-right: 1px }</style>';
    d.adoptedStyleSheets = [sheet(w, 'p { margin-top: 3px; margin-bottom: 2px !important; padding-right: 2px }')];
    out.push(cs(p, 'margin-top'), cs(p, 'margin-bottom'), cs(p, 'padding-right'));
    // layers: the adopted sheets' layers come after the document's
    d.head.innerHTML =
      '<style>@layer b, a; @layer a { p { margin-top: 1px } } @layer b { p { margin-top: 2px } }</style>';
    const layered = sheet(
      w,
      '@layer a, c; @layer c { p { margin-top: 3px } } @layer a { p { margin-left: 5px } } @layer b { p { margin-left: 6px } }',
    );
    d.adoptedStyleSheets = [layered];
    out.push(cs(p, 'margin-top'), cs(p, 'margin-left'));
    d.adoptedStyleSheets = [layered, sheet(w, 'p { margin-top: 9px }')];
    out.push(cs(p, 'margin-top'));
    d.head.innerHTML = '';
    // the sheet changing: its rules, a rule's style and selector, media
    const m = sheet(w, 'p { padding-left: 2px }');
    d.adoptedStyleSheets = [m];
    out.push(cs(p, 'padding-left'));
    m.cssRules[0].style.paddingLeft = '7px';
    out.push(cs(p, 'padding-left'));
    m.cssRules[0].selectorText = 'div';
    out.push(cs(p, 'padding-left'), cs(d.getElementById('h'), 'padding-left'));
    m.cssRules[0].selectorText = 'p';
    m.media.appendMedium('print');
    out.push(cs(p, 'padding-left'), m.media.mediaText);
    m.media.mediaText = '';
    out.push(cs(p, 'padding-left'));
    m.insertRule('p { padding-top: 3px }');
    out.push(cs(p, 'padding-top'));
    m.deleteRule(0);
    out.push(cs(p, 'padding-top'));
    m.replaceSync('p { padding-bottom: 5px }');
    out.push(cs(p, 'padding-bottom'), cs(p, 'padding-left'));
    m.disabled = true;
    out.push(cs(p, 'padding-bottom'));
    m.disabled = false;
    out.push(cs(p, 'padding-bottom'));
    // the media and disabled options
    d.adoptedStyleSheets = [
      sheet(w, 'p { padding-top: 1px }', { media: 'print' }),
      sheet(w, 'p { padding-left: 1px }', { media: 'screen' }),
      sheet(w, 'p { padding-right: 1px }', { disabled: true }),
    ];
    out.push(cs(p, 'padding-top'), cs(p, 'padding-left'), cs(p, 'padding-right'));
    // replace()
    const later = new w.CSSStyleSheet();
    const pending = later.replace('p { border-top-width: 3px; border-top-style: solid }');
    d.adoptedStyleSheets = [later];
    await pending;
    out.push(cs(p, 'border-top-width'));
    // @scope without a prelude: the document's root element
    d.adoptedStyleSheets = [
      sheet(
        w,
        '@scope { p { margin-left: 3px } :scope { margin-right: 3px } } @scope (section) { p { padding-left: 3px } }',
      ),
    ];
    out.push(
      cs(p, 'margin-left'),
      cs(d.documentElement, 'margin-right'),
      cs(p, 'padding-left'),
      cs(d.body, 'margin-right'),
    );
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: a shadow root adoptedStyleSheets: its tree, :host and ::slotted(), shared sheets, a host moved to another document',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id=h><i>i</i></div><p id=p>p</p>';
    const h = d.getElementById('h');
    const p = d.getElementById('p');
    const cs = (e, name) => w.getComputedStyle(e).getPropertyValue(name);
    const r = h.attachShadow({ mode: 'open' });
    r.innerHTML = '<i id=si>si</i><style>i { margin-top: 1px }</style><div id=in><slot></slot></div>';
    const si = r.getElementById('si');
    const light = h.querySelector('i');
    const own = sheet(
      w,
      'i { margin-top: 3px } :host { margin-left: 6px } ::slotted(i) { margin-right: 5px } p { padding-top: 1px }',
    );
    r.adoptedStyleSheets = [own];
    const out = [
      cs(si, 'margin-top'),
      cs(h, 'margin-left'),
      cs(light, 'margin-right'),
      cs(light, 'margin-top'),
      cs(p, 'padding-top'),
      r.styleSheets.length,
    ];
    // the document's adopted sheets do not reach the shadow tree
    d.adoptedStyleSheets = [sheet(w, 'i { padding-top: 8px } div { padding-left: 4px }')];
    out.push(cs(si, 'padding-top'), cs(light, 'padding-top'), cs(h, 'padding-left'));
    // :host by context: the outer tree's normal declarations, the inner
    // tree's !important ones
    r.adoptedStyleSheets = [sheet(w, ':host { padding-left: 5px; padding-top: 5px !important }')];
    d.head.innerHTML = '<style>div { padding-top: 1px !important }</style>';
    out.push(cs(h, 'padding-left'), cs(h, 'padding-top'));
    // one sheet in two trees, and in the document
    const shared = sheet(w, 'i { padding-right: 2px }');
    const h2 = d.body.appendChild(d.createElement('div'));
    const r2 = h2.attachShadow({ mode: 'closed' });
    r2.innerHTML = '<i id=s2>i</i>';
    r.adoptedStyleSheets = [shared];
    r2.adoptedStyleSheets = [shared];
    out.push(cs(si, 'padding-right'), cs(r2.getElementById('s2'), 'padding-right'), cs(light, 'padding-right'));
    d.adoptedStyleSheets = [shared];
    out.push(cs(light, 'padding-right'));
    r.adoptedStyleSheets = [];
    out.push(cs(si, 'padding-right'), cs(r2.getElementById('s2'), 'padding-right'));
    shared.replaceSync('i { padding-right: 6px }');
    out.push(cs(r2.getElementById('s2'), 'padding-right'), cs(light, 'padding-right'));
    // @scope without a prelude matches nothing in a shadow tree's
    r.adoptedStyleSheets = [sheet(w, '@scope { i { margin-left: 3px } :scope { margin-right: 3px } }')];
    out.push(cs(si, 'margin-left'), cs(r.getElementById('in'), 'margin-right'), cs(h, 'margin-right'));
    // a host moved to another document: its shadow root's list empties
    // (the same array); in and out of its own document it stays
    const h4 = d.createElement('div');
    const r4 = h4.attachShadow({ mode: 'open' });
    r4.innerHTML = '<b>b</b>';
    r4.adoptedStyleSheets = [sheet(w, 'b { margin-top: 2px }')];
    const array = r4.adoptedStyleSheets;
    out.push(array.length);
    d.body.append(h4);
    out.push(array.length, cs(r4.firstChild, 'margin-top'));
    h4.remove();
    out.push(array.length);
    const other = d.implementation.createHTMLDocument('');
    other.adoptNode(h4);
    out.push(array.length, r4.adoptedStyleSheets === array);
    d.adoptNode(h4);
    d.body.append(h4);
    out.push(array.length, cs(r4.firstChild, 'margin-top'));
    r4.adoptedStyleSheets = [shared];
    other.body.append(h4);
    out.push(
      array.length,
      attempt(() => {
        r4.adoptedStyleSheets = [shared];
      }),
      array.length,
    );
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: adoptedStyleSheets edge cases: moves without a style read, array properties, iterator lookups, extensibility, length descriptors',
  (w) => {
    const d = w.document;
    const cs = (el) => w.getComputedStyle(el).marginTop;
    const out = [];
    // (moved to another document and back with no style read between: the
    // emptied list applies no rules)
    d.body.innerHTML = '<div id=h></div><p>p</p>';
    const h = d.getElementById('h');
    const r = h.attachShadow({ mode: 'open' });
    r.innerHTML = '<b>b</b>';
    r.adoptedStyleSheets = [sheet(w, 'b { margin-top: 2px }')];
    out.push(cs(r.firstChild));
    const other = d.implementation.createHTMLDocument('');
    other.body.append(h);
    d.body.prepend(h);
    out.push(r.adoptedStyleSheets.length, cs(r.firstChild));
    // (Symbol.isConcatSpreadable on the array does not change the cascade)
    const p = sheet(w, 'p { margin-top: 3px }');
    out.push(
      attempt(() => {
        d.adoptedStyleSheets[Symbol.isConcatSpreadable] = false;
        d.adoptedStyleSheets.push(p);
        return cs(d.querySelector('p'));
      }),
    );
    d.adoptedStyleSheets = [];
    // (the iterator is looked up once)
    let lookups = 0;
    const once = {
      get [Symbol.iterator]() {
        lookups++;
        return lookups === 1
          ? function* () {
              yield p;
            }
          : undefined;
      },
    };
    out.push(
      attempt(() => {
        d.adoptedStyleSheets = once;
        return d.adoptedStyleSheets.length;
      }),
      lookups,
    );
    d.adoptedStyleSheets = [];
    // (the array stays extensible)
    const array = d.adoptedStyleSheets;
    out.push(
      Reflect.preventExtensions(array),
      attempt(() => Object.freeze(array)) === array,
      attempt(() => Object.seal(array)) === array,
      Object.isExtensible(array),
    );
    array.push(p);
    out.push(array.length);
    // (length keeps its flags; a refused descriptor removes no sheet)
    for (const flags of [{ configurable: true }, { enumerable: true }, { writable: false }])
      out.push(Reflect.defineProperty(array, 'length', { value: 0, ...flags }), array.length);
    const desc = Object.getOwnPropertyDescriptor(array, 'length');
    out.push(desc.value, desc.writable, desc.enumerable, desc.configurable, cs(d.querySelector('p')));
    return out;
  },
  { jsdom: 31 },
);

parity(
  'jsdom 31: adoptedStyleSheets: an accessor on the array runs with the array as this, so its changes are checked',
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<p>p</p>';
    const cs = () => w.getComputedStyle(d.body.firstChild).marginTop;
    const array = d.adoptedStyleSheets;
    const out = [cs()];
    let self;
    Object.defineProperty(array, 'add', {
      set(v) {
        self = this;
        this.push(v);
      },
      configurable: true,
    });
    out.push(
      attempt(() => {
        array.add = sheet(w, 'p { margin-top: 3px }');
        return array.length;
      }),
      self === array,
      cs(),
      attempt(() => {
        array.add = 'x';
        return array.length;
      }),
      array.length,
      cs(),
    );
    return out;
  },
  { jsdom: 31 },
);
