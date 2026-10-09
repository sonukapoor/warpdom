// Live collections: NodeList (childNodes) and HTMLCollection (children,
// getElementsBy*). Each wraps a function that returns the current items, so
// they reflect later changes; indexed access goes through a Proxy, as in jsdom.
import { S, state } from './internal.js';

const isIndex = (key) => typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key);
const items = (list) => state(list).items();

export function liveList(proto, getItems) {
  const target = Object.create(proto);
  target[S] = { items: getItems };
  return new Proxy(target, {
    get(t, key, receiver) {
      return isIndex(key) ? t[S].items()[key] : Reflect.get(t, key, receiver);
    },
    has(t, key) {
      return isIndex(key) ? Number(key) < t[S].items().length : Reflect.has(t, key);
    },
    ownKeys(t) {
      return [...t[S].items().keys()].map(String).concat(Reflect.ownKeys(t).filter((k) => typeof k !== 'symbol' || k !== S));
    },
    getOwnPropertyDescriptor(t, key) {
      if (isIndex(key)) {
        const value = t[S].items()[key];
        return value === undefined ? undefined : { value, enumerable: true, configurable: true, writable: false };
      }
      return Reflect.getOwnPropertyDescriptor(t, key);
    },
    set(t, key, value, receiver) {
      return isIndex(key) ? true : Reflect.set(t, key, value, receiver);
    },
  });
}

const iterate = {
  [Symbol.iterator]() { return items(this)[Symbol.iterator](); },
};

export const COLLECTION_INTERFACES = [
  {
    name: 'NodeList',
    members: {
      get length() { return items(this).length; },
      item(index) { return items(this)[index] ?? null; },
      forEach(callback, thisArg) { items(this).forEach((node, i) => callback.call(thisArg, node, i, this)); },
      entries() { return items(this).entries(); },
      keys() { return items(this).keys(); },
      values() { return items(this).values(); },
      ...iterate,
    },
  },
  {
    name: 'HTMLCollection',
    members: {
      get length() { return items(this).length; },
      item(index) { return items(this)[index] ?? null; },
      namedItem(name) {
        return items(this).find((el) => el[S].attrs.get('id') === name || el[S].attrs.get('name') === name) ?? null;
      },
      ...iterate,
    },
  },
];
