// <progress> and <meter> (HTML standard, 4.10.13-14): their values come
// from attributes parsed as floating-point numbers and kept within the
// element's range; setters write the number back to the attribute.
import { state } from './internal.js';
import { writeAttribute } from './attributes.js';
import { parseFloatingPoint } from './reflect.js';

const number = (el, name) => {
  const value = state(el).attrs.get(name);
  return value === undefined ? null : parseFloatingPoint(value);
};

function setNumber(el, name, v, method) {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new TypeError(`Failed to set the '${method}' property on '${el.constructor.name}': The provided double value is non-finite.`);
  writeAttribute(el, name, String(n));
}

// progress: indeterminate without a value attribute.
const progressMax = (el) => { const n = number(el, 'max'); return n !== null && n > 0 ? n : 1; };
function progressValue(el) {
  const n = number(el, 'value');
  if (n === null || n < 0) return 0;
  return Math.min(n, progressMax(el));
}

export const PROGRESS_MEMBERS = {
  get value() { return state(this).attrs.has('value') ? progressValue(this) : 0; },
  set value(v) { setNumber(this, 'value', v, 'value'); },
  get position() { return state(this).attrs.has('value') ? progressValue(this) / progressMax(this) : -1; },
};

// meter: min, max, value, low, high and optimum, each kept within the
// range and in order.
function meterBounds(el) {
  const min = number(el, 'min') ?? 0;
  const maxAttr = number(el, 'max') ?? 1;
  const max = maxAttr < min ? min : maxAttr;
  return { min, max };
}
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

function meterLow(el, { min, max }) {
  const low = number(el, 'low') ?? min;
  return clamp(low, min, max);
}

export const METER_MEMBERS = {
  get min() { return meterBounds(this).min; },
  set min(v) { setNumber(this, 'min', v, 'min'); },
  get max() { return meterBounds(this).max; },
  set max(v) { setNumber(this, 'max', v, 'max'); },
  get value() { const b = meterBounds(this); return clamp(number(this, 'value') ?? 0, b.min, b.max); },
  set value(v) { setNumber(this, 'value', v, 'value'); },
  get low() { return meterLow(this, meterBounds(this)); },
  set low(v) { setNumber(this, 'low', v, 'low'); },
  get high() {
    const b = meterBounds(this);
    const high = number(this, 'high') ?? b.max;
    return clamp(high, meterLow(this, b), b.max);
  },
  set high(v) { setNumber(this, 'high', v, 'high'); },
  get optimum() { const b = meterBounds(this); return clamp(number(this, 'optimum') ?? (b.min + b.max) / 2, b.min, b.max); },
  set optimum(v) { setNumber(this, 'optimum', v, 'optimum'); },
};
