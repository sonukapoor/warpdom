// Custom elements, checked against jsdom (parity.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWindow } from '../src/node.js';
import { parity, html } from './parity.js';

const tag = (el) => (el?.id ? `${el.localName}#${el.id}` : (el?.localName ?? String(el)));

function defineLogger(w, name, log, extra = {}) {
  class Logger extends w.HTMLElement {
    static get observedAttributes() {
      return ['data-x', 'title'];
    }
    constructor() {
      super();
      log.push(`constructor ${name} attrs=${this.attributes.length} connected=${this.isConnected}`);
    }
    connectedCallback() {
      log.push(`connected ${tag(this)}`);
    }
    disconnectedCallback() {
      log.push(`disconnected ${tag(this)}`);
    }
    adoptedCallback(oldDoc, newDoc) {
      log.push(`adopted ${tag(this)} ${oldDoc === newDoc}`);
    }
    attributeChangedCallback(attr, oldValue, value) {
      log.push(`attr ${tag(this)} ${attr} ${oldValue} -> ${value}`);
    }
  }
  Object.assign(Logger.prototype, extra);
  w.customElements.define(name, Logger);
  return Logger;
}

parity('define, construct, callbacks in order', (w) => {
  const d = w.document;
  const log = [];
  const before = html(w, '<x-log id="early" data-x="1"></x-log>').getElementById('early');
  log.push(
    `before define: defined=${before.matches(':defined')} proto=${Object.getPrototypeOf(before) === w.HTMLElement.prototype}`,
  );
  const X = defineLogger(w, 'x-log', log);
  log.push(`after define: upgraded=${before instanceof X} defined=${before.matches(':defined')}`);
  const made = d.createElement('x-log');
  made.id = 'made';
  log.push(`created: ${made instanceof X}`);
  d.body.appendChild(made);
  made.setAttribute('data-x', '2');
  made.setAttribute('ignored', '1');
  made.title = 't';
  made.removeAttribute('data-x');
  d.body.removeChild(made);
  const direct = new X();
  direct.id = 'direct';
  log.push(`new X: ${direct.localName} ${direct instanceof w.HTMLElement}`);
  d.body.append(direct);
  const other = d.implementation.createHTMLDocument();
  other.body.appendChild(direct);
  d.body.innerHTML = '<div><x-log id="parsed" title="p"></x-log></div>';
  log.push(`parsed upgraded: ${d.getElementById('parsed') instanceof X}`);
  const frag = d.createElement('template');
  frag.innerHTML = '<x-log id="intemplate"></x-log>';
  log.push(`in template: ${frag.content.firstChild instanceof X}`);
  const clone = d.getElementById('parsed').cloneNode(true);
  log.push(`clone: ${clone instanceof X}`);
  return log;
});

parity('registry API and errors', async (w) => {
  const reg = w.customElements;
  const out = [reg instanceof w.CustomElementRegistry, reg.get('y-one'), reg.getName(class {})];
  const pending = reg.whenDefined('y-one');
  class One extends w.HTMLElement {}
  reg.define('y-one', One);
  out.push(
    reg.get('y-one') === One,
    reg.getName(One),
    (await pending) === One,
    (await reg.whenDefined('y-one')) === One,
  );
  for (const f of [
    () => reg.define('nodash', class extends w.HTMLElement {}),
    () => reg.define('y-one', class extends w.HTMLElement {}),
    () => reg.define('y-two', One),
    () => reg.define('y-three', () => {}),
    () => reg.define('font-face', class extends w.HTMLElement {}),
    () => new w.HTMLElement(),
    () => w.HTMLElement(),
    () => new (class extends w.HTMLElement {})(),
  ]) {
    try {
      f();
      out.push('ok');
    } catch (e) {
      out.push(e.name);
    }
  }
  try {
    await reg.whenDefined('bad');
  } catch (e) {
    out.push(`whenDefined: ${e.name}`);
  }
  const el = w.document.createElement('y-four');
  out.push(el.matches(':defined'), el.matches(':not(:defined)'), w.document.createElement('div').matches(':defined'));
  class Four extends w.HTMLElement {}
  reg.define('y-four', Four);
  out.push(el instanceof Four, 'upgrade only when connected or asked');
  reg.upgrade(el);
  out.push(el instanceof Four);
  return out;
});

parity('constructor errors and customized built-ins', (w) => {
  const d = w.document;
  const errors = [];
  w.addEventListener('error', (e) => {
    errors.push(e.error?.name ?? e.message);
    e.preventDefault();
  });
  w.customElements.define(
    'z-throws',
    class extends w.HTMLElement {
      constructor() {
        super();
        throw new RangeError('nope');
      }
    },
  );
  const el = d.createElement('z-throws');
  const out = [Object.getPrototypeOf(el) === w.HTMLUnknownElement.prototype, errors.splice(0)];
  w.customElements.define(
    'z-button',
    class extends w.HTMLButtonElement {
      constructor() {
        super();
        this.dataset.made = 'yes';
      }
    },
    { extends: 'button' },
  );
  const b = d.createElement('button', { is: 'z-button' });
  out.push(b.localName, b.dataset.made, b instanceof w.HTMLButtonElement, b.outerHTML);
  d.body.innerHTML = '<button is="z-button" id="pb"></button>';
  out.push(d.getElementById('pb').dataset.made ?? 'not upgraded');
  return out;
});

// Following the standard where jsdom differs: an element whose constructor
// threw is "failed", which :defined does not match (jsdom matches it).
test('a failed custom element is not :defined', () => {
  const w = createWindow();
  w.addEventListener('error', (e) => e.preventDefault());
  w.customElements.define(
    'z-fails',
    class extends w.HTMLElement {
      constructor() {
        super();
        throw new Error('x');
      }
    },
  );
  assert.equal(w.document.createElement('z-fails').matches(':defined'), false);
});

test('without custom element definitions, tree operations skip reactions', () => {
  const w = createWindow();
  const S = Object.getOwnPropertySymbols(w.document)[0];
  w.document.body.appendChild(w.document.createElement('x-undefined'));
  assert.equal(w.document.body.firstChild[S].ceState, 'undefined');
});

// Documents without a browsing context look up no custom element
// definitions (before, warpdom ran the constructor there, which failed).
parity('documents without a browsing context do not create custom elements', (w) => {
  const errors = [];
  w.addEventListener('error', (e) => errors.push(e.message));
  class Z extends w.HTMLElement {
    constructor() {
      super();
      this.made = true;
    }
  }
  w.customElements.define('x-z', Z);
  const docs = [
    w.document.implementation.createHTMLDocument(),
    new w.DOMParser().parseFromString('<x-z></x-z>', 'text/html'),
    w.document.implementation.createDocument('http://www.w3.org/1999/xhtml', 'html'),
  ];
  const out = docs.map((d) => {
    const e = d.createElement('x-z');
    const parsed = d.querySelector('x-z');
    return [e.constructor.name, !!e.made, parsed && [parsed.constructor.name, !!parsed.made]];
  });
  const e = docs[0].createElement('x-z');
  w.document.body.append(e);
  out.push([e instanceof Z, !!e.made], w.document.importNode(docs[1].querySelector('x-z')) instanceof Z, errors);
  return out;
});

// ElementInternals and attachInternals() (#20), measured on jsdom 20.0.3 to
// 30.1.3: from 23.1.0, labels and form-associated custom elements from
// 26.0.0, role and ARIA accessors that work from 27.0.0 (they throw a
// TypeError before), :disabled for form-associated elements from 27.0.0.
const caught = (f) => {
  try {
    return f();
  } catch (err) {
    return `${err.constructor.name}(${err.name}): ${err.message}`;
  }
};
function defineInternals(w) {
  const ce = w.customElements;
  ce.define('x-a', class extends w.HTMLElement {});
  ce.define(
    'x-f',
    class extends w.HTMLElement {
      static formAssociated = true;
      constructor() {
        super();
        this.i = this.attachInternals();
      }
      formResetCallback() {
        w.log = 'reset';
      }
    },
  );
  ce.define(
    'x-d',
    class extends w.HTMLElement {
      static disabledFeatures = ['internals'];
    },
  );
  ce.define(
    'x-s',
    class extends w.HTMLElement {
      static disabledFeatures = ['shadow'];
    },
  );
  ce.define('x-b', class extends w.HTMLButtonElement {}, { extends: 'button' });
  ce.define(
    'x-p',
    class extends w.HTMLElement {
      constructor() {
        super();
        this.i = this.attachInternals();
      }
    },
  );
}

for (const jsdom of [20, 22, 25, 26, 30]) {
  parity(
    `ElementInternals: interface and attachInternals() errors (jsdom ${jsdom})`,
    (w) => {
      defineInternals(w);
      const d = w.document;
      const out = [
        typeof w.ElementInternals,
        'attachInternals' in w.HTMLElement.prototype,
        caught(() => d.createElement('x-s').attachShadow({ mode: 'open' })),
      ];
      if (!w.ElementInternals) return out;
      const proto = w.ElementInternals.prototype;
      const early = d.createElement('x-z');
      w.customElements.define('x-z', class extends w.HTMLElement {});
      out.push(
        Object.getOwnPropertyNames(proto).filter((k) => k !== 'constructor'),
        caught(() => new w.ElementInternals()),
        w.HTMLElement.prototype.attachInternals.length,
        Object.prototype.toString.call(proto),
        'CustomStateSet' in w,
        'setFormValue' in proto,
        ...[
          () => d.createElement('div'),
          () => d.createElement('x-u'),
          () => d.createElement('button', { is: 'x-b' }),
          () => d.createElement('x-a', { is: 'x-q' }),
          () => d.createElement('x-d'),
          () => {
            const a = d.createElement('x-a');
            a.attachInternals();
            return a;
          },
          () => early,
          () => d.implementation.createHTMLDocument().createElement('x-a'),
        ].map((make) => caught(() => make().attachInternals() instanceof w.ElementInternals)),
      );
      w.customElements.upgrade(early);
      d.body.innerHTML = '<x-p></x-p>';
      out.push(
        early.attachInternals() instanceof w.ElementInternals,
        d.body.firstChild.i instanceof w.ElementInternals,
        d.createElement('x-a', { is: 'x-q' }).outerHTML,
      );
      const host = d.createElement('x-a');
      const internals = host.attachInternals();
      const before = internals.shadowRoot;
      const root = host.attachShadow({ mode: 'closed' });
      out.push(before, internals.shadowRoot === root);
      return out;
    },
    { jsdom },
  );

  parity(
    `ElementInternals: role and ARIA attributes (jsdom ${jsdom})`,
    (w) => {
      defineInternals(w);
      if (!w.ElementInternals) return 'absent';
      const host = w.document.createElement('x-a');
      const i = host.attachInternals();
      return [
        caught(() => i.role),
        caught(() => {
          i.role = 'button';
          return [i.role, host.getAttribute('role'), host.role];
        }),
        caught(() => {
          i.role = null;
          return i.role;
        }),
        caught(() => {
          i.role = undefined;
          return i.role;
        }),
        caught(() => {
          i.ariaLabel = 5;
          return [i.ariaLabel, host.ariaLabel];
        }),
        caught(() => {
          host.setAttribute('aria-label', 'attr');
          return i.ariaLabel;
        }),
        caught(() => {
          i.ariaChecked = true;
          return i.ariaChecked;
        }),
        caught(() => i.ariaRelevant),
        Reflect.ownKeys(i).filter((k) => typeof k === 'string'),
      ];
    },
    { jsdom },
  );

  parity(
    `ElementInternals: form-associated custom elements and labels (jsdom ${jsdom})`,
    (w) => {
      defineInternals(w);
      if (!w.ElementInternals) return 'absent';
      const d = w.document;
      d.body.innerHTML =
        '<form id=f><label for=xf>L1</label></form><label id=wrap>T<x-f></x-f></label><fieldset id=fs disabled><x-f id=dis></x-f></fieldset>';
      const x = d.createElement('x-f');
      x.id = 'xf';
      d.getElementById('f').appendChild(x);
      const labels = caught(() => x.i.labels);
      d.getElementById('f').reset();
      return [
        caught(() => d.createElement('x-a').attachInternals().labels),
        caught(() => [labels.length, labels[0].textContent, labels === x.i.labels]),
        d.querySelector('label').control?.localName ?? null,
        d.getElementById('wrap').control?.localName ?? null,
        d.getElementById('f').elements.length,
        ['dis', 'xf'].map((id) => [
          d.getElementById(id).matches(':disabled'),
          d.getElementById(id).matches(':enabled'),
        ]),
        w.log ?? null,
      ];
    },
    { jsdom },
  );
}

parity(
  'custom element definitions: disabledFeatures and formAssociated are read in order, disabledFeatures converted (jsdom 30)',
  (w) => {
    const seen = [];
    class Q extends w.HTMLElement {
      attributeChangedCallback() {}
    }
    for (const key of ['observedAttributes', 'disabledFeatures', 'formAssociated'])
      Object.defineProperty(Q, key, {
        get() {
          seen.push(key);
          return undefined;
        },
      });
    Object.defineProperty(Q.prototype, 'formAssociatedCallback', {
      get() {
        seen.push('formAssociatedCallback');
        return undefined;
      },
    });
    w.customElements.define('x-q', Q);
    const results = [
      null,
      {},
      true,
      'abc',
      ['internals', 'x'],
      new Set(['internals']),
      [['internals']],
      { length: 1, 0: 'internals' },
    ].map((disabledFeatures, n) =>
      caught(() => {
        w.customElements.define(
          `x-df${n}`,
          class extends w.HTMLElement {
            static disabledFeatures = disabledFeatures;
          },
        );
        return caught(() => !!w.document.createElement(`x-df${n}`).attachInternals());
      }),
    );
    return [seen, results];
  },
);

test('ElementInternals version boundaries: 23.1.0, labels 26.0.0, ARIA 27.0.0', () => {
  for (const [jsdom, exists, labels, aria] of [
    ['23.0.1', false, false, false],
    ['23.1.0', true, false, false],
    ['25.0.1', true, false, false],
    ['26.0.0', true, true, false],
    ['26.1.0', true, true, false],
    ['27.0.0', true, true, true],
    ['30.1.3', true, true, true],
  ]) {
    const w = createWindow({ jsdom });
    assert.equal('ElementInternals' in w, exists, `ElementInternals in jsdom ${jsdom}`);
    assert.equal('attachInternals' in w.HTMLElement.prototype, exists);
    if (!exists) continue;
    assert.equal('labels' in w.ElementInternals.prototype, labels, `labels in jsdom ${jsdom}`);
    class F extends w.HTMLElement {
      static formAssociated = true;
    }
    w.customElements.define('x-f', F);
    const label = w.document.body.appendChild(w.document.createElement('label'));
    const f = label.appendChild(new F());
    assert.equal(label.control === f, labels, `form-associated elements are labelable in jsdom ${jsdom}`);
    const internals = f.attachInternals();
    assert.equal(
      caught(() => internals.role),
      aria ? null : "TypeError(TypeError): Cannot read properties of undefined (reading 'get')",
    );
    assert.equal(
      caught(() => {
        internals.ariaLabel = 'x';
        return internals.ariaLabel;
      }),
      aria ? 'x' : "TypeError(TypeError): Cannot read properties of undefined (reading 'set')",
    );
  }
});

// Lifecycle callbacks are called directly, as jsdom does (20.0.3 and 30),
// not through their own apply property.
for (const jsdom of [20, 30]) {
  parity(
    `custom element callbacks whose apply property is overwritten (jsdom ${jsdom})`,
    (w) => {
      const seen = [];
      const record = (name) => {
        const fn = function (...args) {
          seen.push(name, this.localName, args.join());
        };
        fn.apply = () => seen.push('own apply');
        return fn;
      };
      const C = class extends w.HTMLElement {
        static observedAttributes = ['a'];
      };
      C.prototype.connectedCallback = record('connected');
      C.prototype.attributeChangedCallback = record('attribute');
      C.prototype.disconnectedCallback = record('disconnected');
      w.customElements.define('x-apply', C);
      const el = w.document.createElement('x-apply');
      w.document.body.append(el);
      el.setAttribute('a', '1');
      el.remove();
      return seen;
    },
    { jsdom },
  );
}
