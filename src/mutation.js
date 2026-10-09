// MutationObserver and MutationRecord. The tree code reports changes through
// hooks only when the node's document has at least one registration, so
// documents without observers pay a single counter check per change.
// Records are delivered in a microtask, per window.
import { S, state, hooks } from './internal.js';
import { liveList } from './collections.js';

const windowOf = (node) => node[S].doc[S].window;

// Observers interested in a change at target: registrations on target, and
// on its ancestors with subtree. One record per observer.
function interested(target, accepts) {
  const found = new Map(); // observer -> wantsOldValue
  for (let n = target; n; n = n[S].parent) {
    const regs = n[S].observers;
    if (!regs) continue;
    for (const { observer, options } of regs) {
      if (n !== target && !options.subtree) continue;
      const want = accepts(options);
      if (want === false) continue;
      found.set(observer, (found.get(observer) ?? false) || want === 'old');
    }
  }
  return found;
}

function queue(target, fields, accepts, oldValue) {
  const observers = interested(target, accepts);
  if (!observers.size) return;
  const window = windowOf(target);
  for (const [observer, wantsOld] of observers) {
    const record = Object.create(window[S].protos.MutationRecord);
    record[S] = { ...fields, target, oldValue: wantsOld ? oldValue : null, protos: window[S].protos };
    state(observer).records.push(record);
    scheduleDelivery(window, observer);
  }
}

function scheduleDelivery(window, observer) {
  const ws = window[S];
  const pending = ws.pendingObservers ?? (ws.pendingObservers = new Set());
  pending.add(observer);
  if (ws.deliveryScheduled) return;
  ws.deliveryScheduled = true;
  queueMicrotask(() => {
    ws.deliveryScheduled = false;
    const observers = [...pending];
    pending.clear();
    for (const obs of observers) {
      const os = obs[S];
      if (!os.records.length) continue;
      const records = os.records;
      os.records = [];
      try {
        os.callback.call(obs, records, obs);
      } catch (error) {
        ws.onUnhandledError(error);
      }
    }
  });
}

hooks.childList = (target, added, removed, previousSibling, nextSibling) => {
  queue(target, { type: 'childList', added, removed, previousSibling, nextSibling },
    (o) => (o.childList ? true : false), null);
};

hooks.attribute = (element, name, oldValue) => {
  queue(element, { type: 'attributes', attributeName: name },
    (o) => {
      if (!o.attributes) return false;
      if (o.attributeFilter && !o.attributeFilter.includes(name)) return false;
      return o.attributeOldValue ? 'old' : true;
    }, oldValue ?? null);
};

hooks.characterData = (node, oldValue) => {
  queue(node, { type: 'characterData' },
    (o) => (o.characterData ? (o.characterDataOldValue ? 'old' : true) : false), oldValue);
};

function normalize(options = {}) {
  const o = { ...options };
  if ((o.attributeOldValue !== undefined || o.attributeFilter !== undefined) && o.attributes === undefined) o.attributes = true;
  if (o.characterDataOldValue !== undefined && o.characterData === undefined) o.characterData = true;
  if (!o.childList && !o.attributes && !o.characterData) {
    throw new TypeError("Failed to execute 'observe' on 'MutationObserver': The options object must set at least one of 'attributes', 'characterData', or 'childList' to true.");
  }
  if (o.attributeOldValue && !o.attributes) throw new TypeError('attributeOldValue requires attributes');
  if (o.attributeFilter && !o.attributes) throw new TypeError('attributeFilter requires attributes');
  if (o.characterDataOldValue && !o.characterData) throw new TypeError('characterDataOldValue requires characterData');
  return {
    childList: !!o.childList, attributes: !!o.attributes, characterData: !!o.characterData, subtree: !!o.subtree,
    attributeOldValue: !!o.attributeOldValue, characterDataOldValue: !!o.characterDataOldValue,
    attributeFilter: o.attributeFilter ? [...o.attributeFilter].map(String) : null,
  };
}

const nodeList = (r, nodes) => liveList(r[S].protos.NodeList, () => nodes);

export const MUTATION_INTERFACES = [
  {
    name: 'MutationObserver',
    construct: (w, self, [callback]) => {
      if (typeof callback !== 'function') {
        throw new TypeError("Failed to construct 'MutationObserver': The callback provided as parameter 1 is not a function.");
      }
      self[S] = { callback, records: [], targets: new Set() };
      return self;
    },
    members: {
      observe(target, options) {
        const os = state(this);
        if (!target?.[S]) throw new TypeError("Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.");
        const opts = normalize(options);
        const ts = target[S];
        const regs = ts.observers ?? (ts.observers = []);
        const existing = regs.find((r) => r.observer === this);
        if (existing) existing.options = opts;
        else {
          regs.push({ observer: this, options: opts });
          os.targets.add(target);
          const doc = ts.type === 9 ? target : ts.doc;
          doc[S].observerCount = (doc[S].observerCount ?? 0) + 1;
        }
      },
      disconnect() {
        const os = state(this);
        for (const target of os.targets) {
          const ts = target[S];
          ts.observers = ts.observers.filter((r) => r.observer !== this);
          const doc = ts.type === 9 ? target : ts.doc;
          doc[S].observerCount--;
        }
        os.targets.clear();
        os.records = [];
      },
      takeRecords() {
        const os = state(this);
        const records = os.records;
        os.records = [];
        return records;
      },
    },
  },
  {
    name: 'MutationRecord',
    members: {
      get type() { return state(this).type; },
      get target() { return state(this).target; },
      get addedNodes() { const s = state(this); return s.addedList ?? (s.addedList = nodeList(this, s.added ?? [])); },
      get removedNodes() { const s = state(this); return s.removedList ?? (s.removedList = nodeList(this, s.removed ?? [])); },
      get previousSibling() { return state(this).previousSibling ?? null; },
      get nextSibling() { return state(this).nextSibling ?? null; },
      get attributeName() { return state(this).attributeName ?? null; },
      get attributeNamespace() { state(this); return null; },
      get oldValue() { return state(this).oldValue; },
    },
  },
];

