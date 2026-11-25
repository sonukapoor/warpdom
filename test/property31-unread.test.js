// jsdom 31's registered custom properties (#269 part F2): a document's
// @property rule registers for an element read first in a shadow tree
// that has no sheets, before anything reads the document's (in a process
// where no @property rule is made yet; cascade.js registration31; #345
// review).
import { parity } from './parity.js';

parity(
  "a document's @property rule registers for a shadow tree read first",
  (w) => {
    const d = w.document;
    d.body.innerHTML = '<div id="h"></div>';
    const style = d.createElement('style');
    style.textContent = '@property --b { syntax: "<length>"; inherits: false; initial-value: 1px; } #h { --b: 5px }';
    d.head.append(style);
    const root = d.getElementById('h').attachShadow({ mode: 'open' });
    root.innerHTML = '<i></i>';
    return [
      w.getComputedStyle(root.firstChild).getPropertyValue('--b'),
      w.getComputedStyle(d.getElementById('h')).getPropertyValue('--b'),
    ];
  },
  { jsdom: 31 },
);
