// MutationObserver and MutationRecord. The tree code reports changes through
// hooks only when the node's document has at least one registration, so
// documents without observers pay a single counter check per change.
// Records are delivered in a microtask, per window.
import { S, state, hooks } from './internal.js';
import { liveList } from './collections.js';

const windowOf = (node) => node[S].doc[S].window;
let observerIds = 0;

// Observers interested in a change at target: registrations on target, and
// on its ancestors with subtree. One record per observer.
function interested(target, accepts) {
  const found = new Map(); // observer -> wantsOldValue
  for (let n = target; n; n = n[S].parent) {
    const regs = n[S].observers;
    if (!regs) continue;
    for (const { observer, options } of regs) {
      if (n !== target && !options.subtree) continue;
      const want = accepts(options, n);
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

// Queue a mutation observer microtask (one per window at a time), then
// notify observers in the order they were created; transient registered
// observers go away at notification, records or not.
function scheduleDelivery(window, observer) {
  const ws = window[S];
  const pending = ws.pendingObservers ?? (ws.pendingObservers = new Set());
  if (observer !== null) pending.add(observer);
  if (ws.deliveryScheduled) return;
  ws.deliveryScheduled = true;
  queueMicrotask(() => {
    ws.deliveryScheduled = false;
    const transient = ws.transientObservers;
    if (transient !== undefined) for (const obs of transient) pending.add(obs);
    const observers = [...pending].sort((a, b) => a[S].id - b[S].id);
    pending.clear();
    for (const obs of observers) {
      const os = obs[S];
      clearTransients(obs, ws);
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

// Transient registered observers (DOM "remove"): registrations with subtree
// on the removed node's former inclusive ancestors follow it until the
// observers are next notified.
hooks.removed = (parent, node) => {
  let added = false;
  for (let n = parent; n; n = n[S].parent) {
    const regs = n[S].observers;
    if (!regs) continue;
    for (const registered of regs) {
      if (!registered.options.subtree) continue;
      const ns = node[S];
      (ns.observers ?? (ns.observers = [])).push({
        observer: registered.observer,
        options: registered.options,
        source: registered.source ?? registered,
      });
      const os = registered.observer[S];
      (os.transientNodes ?? (os.transientNodes = new Set())).add(node);
      const ws = windowOf(node)[S];
      (ws.transientObservers ?? (ws.transientObservers = new Set())).add(registered.observer);
      added = true;
    }
  }
  if (added) scheduleDelivery(windowOf(node), null);
};

function clearTransients(observer, ws) {
  const os = observer[S];
  if (os.transientNodes === undefined || os.transientNodes.size === 0) return;
  for (const node of os.transientNodes) {
    const ns = node[S];
    if (ns.observers) ns.observers = ns.observers.filter((r) => !(r.source && r.observer === observer));
  }
  os.transientNodes.clear();
  ws?.transientObservers?.delete(observer);
}

hooks.childList = (target, added, removed, previousSibling, nextSibling) => {
  queue(
    target,
    { type: 'childList', added, removed, previousSibling, nextSibling },
    (o) => (o.childList ? true : false),
    null,
  );
};

// name is the attribute's qualified name; records carry its local name and
// namespace.
hooks.attribute = (element, name, oldValue) => {
  const info = element[S].attrNS?.get(name);
  const local = info?.local ?? name;
  const namespace = info?.ns ?? null;
  queue(
    element,
    { type: 'attributes', attributeName: local, attributeNamespace: namespace },
    (o) => {
      if (!o.attributes) return false;
      if (o.attributeFilter && (namespace !== null || !o.attributeFilter.includes(local))) return false;
      return o.attributeOldValue ? 'old' : true;
    },
    oldValue ?? null,
  );
};

hooks.characterData = (node, oldValue) => {
  queue(
    node,
    { type: 'characterData' },
    (o) => (o.characterData ? (o.characterDataOldValue ? 'old' : true) : false),
    oldValue,
  );
};

function normalize(options = {}) {
  const o = { ...options };
  if ((o.attributeOldValue !== undefined || o.attributeFilter !== undefined) && o.attributes === undefined)
    o.attributes = true;
  if (o.characterDataOldValue !== undefined && o.characterData === undefined) o.characterData = true;
  if (!o.childList && !o.attributes && !o.characterData) {
    throw new TypeError(
      "Failed to execute 'observe' on 'MutationObserver': The options object must set at least one of 'attributes', 'characterData', or 'childList' to true.",
    );
  }
  if (o.attributeOldValue && !o.attributes) throw new TypeError('attributeOldValue requires attributes');
  if (o.attributeFilter && !o.attributes) throw new TypeError('attributeFilter requires attributes');
  if (o.characterDataOldValue && !o.characterData) throw new TypeError('characterDataOldValue requires characterData');
  return {
    childList: !!o.childList,
    attributes: !!o.attributes,
    characterData: !!o.characterData,
    subtree: !!o.subtree,
    attributeOldValue: !!o.attributeOldValue,
    characterDataOldValue: !!o.characterDataOldValue,
    attributeFilter: o.attributeFilter ? [...o.attributeFilter].map(String) : null,
  };
}

const nodeList = (r, nodes) => liveList(r[S].protos.NodeList, () => nodes);

export const MUTATION_INTERFACES = [
  {
    name: 'MutationObserver',
    length: 1,
    construct: (w, self, [callback]) => {
      if (typeof callback !== 'function') {
        throw new TypeError(
          "Failed to construct 'MutationObserver': The callback provided as parameter 1 is not a function.",
        );
      }
      self[S] = { callback, records: [], targets: new Set(), id: ++observerIds, transientNodes: undefined };
      return self;
    },
    members: {
      observe(target, options = undefined) {
        const os = state(this);
        if (!target?.[S])
          throw new TypeError("Failed to execute 'observe' on 'MutationObserver': parameter 1 is not of type 'Node'.");
        const opts = normalize(options);
        const ts = target[S];
        const regs = ts.observers ?? (ts.observers = []);
        const existing = regs.find((r) => r.observer === this && !r.source);
        if (existing) {
          // Transient registrations from this one end.
          if (os.transientNodes) {
            for (const node of os.transientNodes) {
              const ns = node[S];
              if (ns.observers) ns.observers = ns.observers.filter((r) => r.source !== existing);
            }
          }
          existing.options = opts;
        } else {
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
        clearTransients(this, null);
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
      get type() {
        return state(this).type;
      },
      get target() {
        return state(this).target;
      },
      get addedNodes() {
        const s = state(this);
        return s.addedList ?? (s.addedList = nodeList(this, s.added ?? []));
      },
      get removedNodes() {
        const s = state(this);
        return s.removedList ?? (s.removedList = nodeList(this, s.removed ?? []));
      },
      get previousSibling() {
        return state(this).previousSibling ?? null;
      },
      get nextSibling() {
        return state(this).nextSibling ?? null;
      },
      get attributeName() {
        return state(this).attributeName ?? null;
      },
      get attributeNamespace() {
        return state(this).attributeNamespace ?? null;
      },
      get oldValue() {
        return state(this).oldValue;
      },
    },
  },
];
