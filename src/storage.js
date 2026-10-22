// Web Storage (HTML standard, 12.2): localStorage and sessionStorage, one
// in-memory storage area each per window (nothing persists or is shared
// between windows, as in jsdom), with the standard's named properties
// (storage.key = value), a 5,000,000 code unit quota, and a SecurityError
// for opaque origins (about:blank).
import { S, state, domError } from './internal.js';

const QUOTA = 5000000;

// QuotaExceededError (WebIDL): a DOMException with the quota and the
// requested size when known. One class for all windows, like DOMException.
export class QuotaExceededError extends DOMException {
  #quota;
  #requested;
  constructor(message = '', options = {}) {
    super(message, 'QuotaExceededError');
    // Some Node releases (24.6, for one) return a plain DOMException from
    // its constructor whatever the subclass; give the instance its class.
    if (Object.getPrototypeOf(this) !== new.target.prototype) Object.setPrototypeOf(this, new.target.prototype);
    this.#quota = options.quota ?? null;
    this.#requested = options.requested ?? null;
  }

  get quota() {
    return this.#quota;
  }
  get requested() {
    return this.#requested;
  }
}
Object.defineProperty(QuotaExceededError.prototype, Symbol.toStringTag, {
  value: 'QuotaExceededError',
  configurable: true,
});

const items = (storage) => state(storage).items;

// The area's size in code units (keys and values) is kept as items change.
function setItem(storage, key, value) {
  const s = state(storage);
  const k = String(key);
  const v = String(value);
  const old = s.items.get(k);
  if (old === v) return;
  const size = s.size - (old === undefined ? 0 : k.length + old.length) + k.length + v.length;
  if (size > QUOTA) throw new QuotaExceededError(`The ${QUOTA}-code unit storage quota has been exceeded.`);
  s.items.set(k, v);
  s.size = size;
}

function removeItem(storage, key) {
  const s = state(storage);
  const old = s.items.get(key);
  if (old === undefined) return;
  s.items.delete(key);
  s.size -= key.length + old.length;
}

function clearItems(storage) {
  const s = state(storage);
  s.items.clear();
  s.size = 0;
}

const required = (method, args, n) => {
  if (args.length < n)
    throw new TypeError(
      `Failed to execute '${method}' on 'Storage': ${n} argument${n > 1 ? 's' : ''} required, but only ${args.length} present.`,
    );
};

export const STORAGE_INTERFACE = {
  name: 'Storage',
  members: {
    get length() {
      return items(this).size;
    },
    key(...args) {
      required('key', args, 1);
      const index = Number(args[0]) >>> 0;
      if (index >= items(this).size) return null;
      let i = 0;
      for (const k of items(this).keys()) if (i++ === index) return k;
      return null;
    },
    getItem(...args) {
      required('getItem', args, 1);
      return items(this).get(String(args[0])) ?? null;
    },
    setItem(...args) {
      required('setItem', args, 2);
      setItem(this, args[0], args[1]);
    },
    removeItem(...args) {
      required('removeItem', args, 1);
      removeItem(this, String(args[0]));
    },
    clear() {
      clearItems(this);
    },
  },
};

// A Storage object: named properties go to the items, behind the
// interface's own members (Storage has no [LegacyOverrideBuiltIns]); any
// string assignment sets an item.
function createStorage(window) {
  const target = Object.create(window[S].protos.Storage);
  target[S] = { items: new Map(), size: 0 };
  const named = (t, key) => typeof key === 'string' && !(key in t);
  return new Proxy(target, {
    get(t, key, receiver) {
      if (named(t, key)) return t[S].items.get(key);
      return Reflect.get(t, key, receiver);
    },
    set(t, key, value, receiver) {
      if (typeof key !== 'string') return Reflect.set(t, key, value, receiver);
      setItem(receiver, key, value);
      return true;
    },
    deleteProperty(t, key) {
      if (typeof key === 'string' && t[S].items.has(key)) {
        removeItem(target, key);
        return true;
      }
      return Reflect.deleteProperty(t, key);
    },
    has(t, key) {
      return (typeof key === 'string' && t[S].items.has(key)) || Reflect.has(t, key);
    },
    ownKeys(t) {
      return [...t[S].items.keys()]
        .filter((k) => !(k in Object.getPrototypeOf(t)))
        .concat(Reflect.ownKeys(t).filter((k) => k !== S));
    },
    getOwnPropertyDescriptor(t, key) {
      if (named(t, key) && t[S].items.has(key)) {
        return { value: t[S].items.get(key), writable: true, enumerable: true, configurable: true };
      }
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    defineProperty(t, key, descriptor) {
      if (typeof key === 'string' && 'value' in descriptor) {
        setItem(target, key, descriptor.value);
        return true;
      }
      return Reflect.defineProperty(t, key, descriptor);
    },
  });
}

function storageOf(window, which) {
  const ws = state(window);
  if (ws.url.origin === 'null') throw domError(`${which} is not available for opaque origins`, 'SecurityError');
  return ws[which] ?? (ws[which] = createStorage(window));
}

export const STORAGE_WINDOW_MEMBERS = {
  get localStorage() {
    return storageOf(this, 'localStorage');
  },
  get sessionStorage() {
    return storageOf(this, 'sessionStorage');
  },
};

// For the per-file reset (reset.js).
export function clearStorage(window) {
  const ws = window[S];
  if (ws.localStorage) clearItems(ws.localStorage);
  if (ws.sessionStorage) clearItems(ws.sessionStorage);
}
