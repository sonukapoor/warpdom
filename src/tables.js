// Tables (HTML standard, 4.9): the table, section (thead, tbody, tfoot),
// row and cell interfaces' members: caption, tHead, tFoot, tBodies, rows
// and their create/delete/insert methods, cells, rowIndex,
// sectionRowIndex, cellIndex. Collections are live and their arrays are
// rebuilt only after the document's tree changes.
import { S, state, domError, insert, remove, ELEMENT_NODE, HTML_NS } from './internal.js';
import { liveList } from './collections.js';

const isTag = (n, tag) => { const s = n[S]; return s.type === ELEMENT_NODE && s.ns === HTML_NS && s.tag === tag; };
const isSection = (n) => isTag(n, 'thead') || isTag(n, 'tbody') || isTag(n, 'tfoot');
const isCell = (n) => isTag(n, 'td') || isTag(n, 'th');

function children(el, test) {
  const out = [];
  for (let c = el[S].first; c; c = c[S].next) if (test(c)) out.push(c);
  return out;
}

function firstChild(el, tag) {
  for (let c = el[S].first; c; c = c[S].next) if (isTag(c, tag)) return c;
  return null;
}

// An array computed from the element, cached until the document changes.
function cached(el, key, compute) {
  const s = el[S];
  const rev = s.doc[S].treeRev ?? 0;
  const cache = s.tableCache ?? (s.tableCache = new Map());
  const hit = cache.get(key);
  if (hit && hit.rev === rev) return hit.items;
  const items = compute();
  cache.set(key, { rev, items });
  return items;
}

function collection(el, key, compute) {
  const s = el[S];
  const lists = s.tableLists ?? (s.tableLists = new Map());
  let list = lists.get(key);
  if (!list) lists.set(key, list = liveList(s.doc[S].window[S].protos.HTMLCollection, () => cached(el, key, compute)));
  return list;
}

const create = (el, tag) => state(el).doc.createElement(tag);
const indexError = (index, length) => domError(`The index provided (${index}) is outside the range [-1, ${length}].`, 'IndexSizeError');

// The table's rows: the thead's, then rows directly in the table or in its
// tbodies (in tree order), then the tfoot's.
function tableRows(table) {
  const head = [], body = [], foot = [];
  for (let c = table[S].first; c; c = c[S].next) {
    if (isTag(c, 'tr')) body.push(c);
    else if (isTag(c, 'thead')) head.push(...children(c, (n) => isTag(n, 'tr')));
    else if (isTag(c, 'tbody')) body.push(...children(c, (n) => isTag(n, 'tr')));
    else if (isTag(c, 'tfoot')) foot.push(...children(c, (n) => isTag(n, 'tr')));
  }
  return [...head, ...body, ...foot];
}

function setSection(table, value, tag, place) {
  state(table);
  const property = tag === 'thead' ? 'tHead' : 'tFoot';
  // The IDL type (HTMLTableSectionElement) is checked first, then the tag.
  if (value !== null && !(value?.[S] && isSection(value))) {
    throw new TypeError(`Failed to set the '${property}' property on 'HTMLTableElement': Failed to convert value to 'HTMLTableSectionElement'.`);
  }
  if (value !== null && !isTag(value, tag)) throw domError(`Failed to set the '${tag === 'thead' ? 'tHead' : 'tFoot'}' property on 'HTMLTableElement': Not a ${tag} element.`, 'HierarchyRequestError');
  const old = firstChild(table, tag);
  if (old) remove(table, old);
  if (value !== null) place(value);
}

// Before the first child that is not a caption or colgroup.
function insertHead(table, head) {
  let ref = table[S].first;
  while (ref && (ref[S].type !== ELEMENT_NODE || isTag(ref, 'caption') || isTag(ref, 'colgroup'))) ref = ref[S].next;
  insert(table, head, ref);
}

export const TABLE_MEMBERS = {
  get caption() { state(this); return firstChild(this, 'caption'); },
  set caption(value) {
    state(this);
    const old = firstChild(this, 'caption');
    if (old) remove(this, old);
    if (value != null) insert(this, value, this[S].first);
  },
  createCaption() {
    return firstChild(this, 'caption') ?? insert(this, create(this, 'caption'), this[S].first);
  },
  deleteCaption() { const c = firstChild(this, 'caption'); if (c) remove(this, c); },
  get tHead() { state(this); return firstChild(this, 'thead'); },
  set tHead(value) { setSection(this, value, 'thead', (v) => insertHead(this, v)); },
  createTHead() {
    const existing = firstChild(this, 'thead');
    if (existing) return existing;
    const head = create(this, 'thead');
    insertHead(this, head);
    return head;
  },
  deleteTHead() { const h = firstChild(this, 'thead'); if (h) remove(this, h); },
  get tFoot() { state(this); return firstChild(this, 'tfoot'); },
  set tFoot(value) { setSection(this, value, 'tfoot', (v) => insert(this, v, null)); },
  createTFoot() { return firstChild(this, 'tfoot') ?? insert(this, create(this, 'tfoot'), null); },
  deleteTFoot() { const f = firstChild(this, 'tfoot'); if (f) remove(this, f); },
  get tBodies() { state(this); return collection(this, 'tBodies', () => children(this, (n) => isTag(n, 'tbody'))); },
  createTBody() {
    const body = create(this, 'tbody');
    let last = null;
    for (let c = this[S].first; c; c = c[S].next) if (isTag(c, 'tbody')) last = c;
    insert(this, body, last ? last[S].next : null);
    return body;
  },
  get rows() { state(this); return collection(this, 'rows', () => tableRows(this)); },
  insertRow(index = -1) {
    state(this);
    const i = Number(index) | 0;
    const rows = tableRows(this);
    if (i < -1 || i > rows.length) throw indexError(i, rows.length);
    const row = create(this, 'tr');
    if (rows.length === 0) {
      let lastBody = null;
      for (let c = this[S].first; c; c = c[S].next) if (isTag(c, 'tbody')) lastBody = c;
      if (lastBody) insert(lastBody, row, null);
      else insert(insert(this, create(this, 'tbody'), null), row, null);
    } else if (i === -1 || i === rows.length) {
      const last = rows[rows.length - 1];
      insert(last[S].parent, row, null);
    } else {
      insert(rows[i][S].parent, row, rows[i]);
    }
    return row;
  },
  deleteRow(index) {
    state(this);
    const i = Number(index) | 0;
    const rows = tableRows(this);
    if (i === -1) { if (rows.length) remove(rows[rows.length - 1][S].parent, rows[rows.length - 1]); return; }
    if (i < 0 || i >= rows.length) throw indexError(i, rows.length);
    remove(rows[i][S].parent, rows[i]);
  },
};

const sectionRows = (section) => children(section, (n) => isTag(n, 'tr'));

export const SECTION_MEMBERS = {
  get rows() { state(this); return collection(this, 'rows', () => sectionRows(this)); },
  insertRow(index = -1) {
    state(this);
    const i = Number(index) | 0;
    const rows = sectionRows(this);
    if (i < -1 || i > rows.length) throw indexError(i, rows.length);
    const row = create(this, 'tr');
    insert(this, row, i === -1 || i === rows.length ? null : rows[i]);
    return row;
  },
  deleteRow(index) {
    state(this);
    const i = Number(index) | 0;
    const rows = sectionRows(this);
    if (i === -1) { if (rows.length) remove(this, rows[rows.length - 1]); return; }
    if (i < 0 || i >= rows.length) throw indexError(i, rows.length);
    remove(this, rows[i]);
  },
};

const rowCells = (row) => children(row, isCell);

export const ROW_MEMBERS = {
  get rowIndex() {
    state(this);
    const parent = this[S].parent;
    if (!parent) return -1;
    const table = isTag(parent, 'table') ? parent : isSection(parent) && parent[S].parent && isTag(parent[S].parent, 'table') ? parent[S].parent : null;
    return table ? tableRows(table).indexOf(this) : -1;
  },
  get sectionRowIndex() {
    state(this);
    const parent = this[S].parent;
    if (!parent) return -1;
    if (isTag(parent, 'table')) return tableRows(parent).indexOf(this);
    return isSection(parent) ? sectionRows(parent).indexOf(this) : -1;
  },
  get cells() { state(this); return collection(this, 'cells', () => rowCells(this)); },
  insertCell(index = -1) {
    state(this);
    const i = Number(index) | 0;
    const cells = rowCells(this);
    if (i < -1 || i > cells.length) throw indexError(i, cells.length);
    const cell = create(this, 'td');
    insert(this, cell, i === -1 || i === cells.length ? null : cells[i]);
    return cell;
  },
  deleteCell(index) {
    state(this);
    const i = Number(index) | 0;
    const cells = rowCells(this);
    if (i === -1) { if (cells.length) remove(this, cells[cells.length - 1]); return; }
    if (i < 0 || i >= cells.length) throw indexError(i, cells.length);
    remove(this, cells[i]);
  },
};

const SCOPES = new Set(['row', 'col', 'rowgroup', 'colgroup']);

export const CELL_MEMBERS = {
  get cellIndex() {
    state(this);
    const parent = this[S].parent;
    return parent && isTag(parent, 'tr') ? rowCells(parent).indexOf(this) : -1;
  },
  // Enumerated, limited to known values.
  get scope() {
    const value = (state(this).attrs.get('scope') ?? '').toLowerCase();
    return SCOPES.has(value) ? value : '';
  },
  set scope(v) { this.setAttribute('scope', String(v)); },
};
