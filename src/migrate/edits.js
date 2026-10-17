// Text edits for `warpdom migrate` that keep a file's formatting: string
// literal replacements, dependency lists in package.json and pnpm catalogs
// in pnpm-workspace.yaml. Every function returns the new text, or null
// when the text has a shape it does not edit (the change is then reported
// as manual instead).
import { analyze, lineIndex } from './js.js';

const compareNames = (a, b) => a.localeCompare(b, 'en');

// Applies [{ start, end, text }] to a text (non-overlapping).
export function applyEdits(text, edits) {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let out = text;
  let limit = Infinity;
  for (const e of sorted) {
    if (e.end > limit) throw new Error('overlapping edits');
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    limit = e.start;
  }
  return out;
}

// A string literal with a new value, in the literal's own quotes.
export function replaceLiteral(token, value) {
  const q = token.quote;
  return { start: token.start, end: token.end, text: `${q}${value}${q}` };
}

const lineStart = (text, i) => text.lastIndexOf('\n', i - 1) + 1;
const lineEnd = (text, i) => {
  const e = text.indexOf('\n', i);
  return e < 0 ? text.length : (text[e - 1] === '\r' ? e - 1 : e);
};

// The order dependencies are in: sorted (as npm and pnpm write them) or not.
const isSorted = (names) => names.every((n, i) => i === 0 || compareNames(names[i - 1], n) <= 0);

// package.json: removes and adds dependencies of one section
// ("devDependencies"), one entry per line as the file has them, the new
// ones in sorted position when the section is sorted, else at its end. A
// missing section is added at the end of the file's object.
// changes: { remove: [name], add: [{ name, spec }] }.
export function editDependencies(text, section, { remove = [], add = [] }) {
  const a = analyze(text, { json: true });
  const { tokens } = a;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const topLevel = a.properties.filter((p) => p.path.length === 1);
  const prop = topLevel.find((p) => p.key === section);
  const firstKeyLine = topLevel[0] ? text.slice(lineStart(text, tokens[topLevel[0].keyToken].start), tokens[topLevel[0].keyToken].start) : '  ';
  const unit = /^[ \t]*$/.test(firstKeyLine) && firstKeyLine ? firstKeyLine : '  ';
  const entryText = (name, spec, indent, colon = ': ') => `${indent}${JSON.stringify(name)}${colon}${JSON.stringify(spec)}`;
  if (!prop) {
    if (!add.length) return text;
    const last = topLevel[topLevel.length - 1];
    if (!last) return null;
    const after = tokens[last.valueEnd - 1].end;
    const sorted = [...add].sort((x, y) => compareNames(x.name, y.name));
    const body = sorted.map((d) => entryText(d.name, d.spec, unit + unit)).join(`,${eol}`);
    return `${text.slice(0, after)},${eol}${unit}${JSON.stringify(section)}: {${eol}${body}${eol}${unit}}${text.slice(after)}`;
  }
  const open = tokens[prop.valueStart];
  if (open?.value !== '{') return null;
  const entries = a.properties.filter((p) => p.path.length === 2 && p.path[0] === section);
  const closeIndex = prop.valueEnd - 1;
  const close = tokens[closeIndex];
  if (close?.value !== '}') return null;
  const { lineOf } = lineIndex(text);
  const sectionIndent = text.slice(lineStart(text, tokens[prop.keyToken].start), tokens[prop.keyToken].start);
  const lines = entries.map((e) => lineOf(tokens[e.keyToken].start));
  // One entry per line, braces on their own lines.
  const oneEach = new Set(lines).size === lines.length && (!lines.length || (lines[0] > lineOf(open.start) && lines[lines.length - 1] < lineOf(close.start)));
  if (!oneEach) return null;
  const removing = new Set(remove);
  const present = new Set(entries.map((e) => e.key));
  const adding = add.filter((d) => !present.has(d.name));
  if (!adding.length && !entries.some((e) => removing.has(e.key))) return text;
  let indent = `${sectionIndent}${unit}`;
  let colon = ': ';
  if (entries.length) {
    const first = tokens[entries[0].keyToken];
    indent = text.slice(lineStart(text, first.start), first.start);
    colon = text.slice(first.end, tokens[entries[0].valueStart].start);
  }
  let rows = entries.map((e) => {
    const s = lineStart(text, tokens[e.keyToken].start);
    return { name: e.key, text: text.slice(s, lineEnd(text, tokens[e.valueEnd - 1].end)).replace(/,\s*$/, '') };
  });
  const sorted = isSorted(rows.map((r) => r.name));
  rows = rows.filter((r) => !removing.has(r.name));
  for (const d of adding) {
    const row = { name: d.name, text: entryText(d.name, d.spec, indent, colon) };
    const at = sorted ? rows.findIndex((r) => compareNames(r.name, d.name) > 0) : -1;
    if (at < 0) rows.push(row); else rows.splice(at, 0, row);
  }
  if (!rows.length) return `${text.slice(0, open.start)}{}${text.slice(close.end)}`;
  if (!entries.length) {
    return `${text.slice(0, open.start)}{${eol}${rows.map((r) => r.text).join(`,${eol}`)}${eol}${sectionIndent}}${text.slice(close.end)}`;
  }
  const from = lineStart(text, tokens[entries[0].keyToken].start);
  const lastEntry = entries[entries.length - 1];
  const to = lineEnd(text, tokens[lastEntry.valueEnd - 1].end);
  return text.slice(0, from) + rows.map((r) => r.text).join(`,${eol}`) + text.slice(to);
}

// pnpm-workspace.yaml: the lines of a catalog (catalogName 'default': the
// top-level `catalog:` or `catalogs: default:`), [{ name, value, line }]
// with 0-based line numbers, and the block's entry indentation; null when
// there is no such catalog.
export function catalogEntries(text, catalogName = 'default') {
  const lines = text.split(/\r?\n/);
  let start = -1;
  let headerIndent = 0;
  if (catalogName === 'default') start = lines.findIndex((l) => /^catalog:\s*(#.*)?$/.test(l));
  if (start < 0) {
    const catalogs = lines.findIndex((l) => /^catalogs:\s*(#.*)?$/.test(l));
    if (catalogs >= 0) {
      for (let i = catalogs + 1; i < lines.length && !/^\S/.test(lines[i]); i++) {
        const m = /^(\s+)(['"]?)([^'":]+)\2:\s*(#.*)?$/.exec(lines[i]);
        if (m && m[3] === catalogName) { start = i; headerIndent = m[1].length; break; }
      }
    }
  }
  if (start < 0) return null;
  const entries = [];
  let indent = null;
  let end = start + 1;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim() || /^\s*#/.test(l)) continue;
    const ind = l.length - l.trimStart().length;
    if (ind <= headerIndent) break;
    indent ??= ind;
    if (ind !== indent) continue;
    const m = /^\s+(['"]?)(.+?)\1:\s*(.*?)\s*(#.*)?$/.exec(l);
    if (m) entries.push({ name: m[2], value: m[3], line: i });
    end = i + 1;
  }
  return { start, end, indent: ' '.repeat(indent ?? headerIndent + 2), entries, lines };
}

// pnpm-workspace.yaml: removes and adds catalog entries, the new ones where
// the first removed one was (else after the last entry), with its quoting.
export function editCatalog(text, catalogName, { remove = [], add = [] }) {
  const cat = catalogEntries(text, catalogName);
  if (!cat) return null;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const { lines, entries } = cat;
  const present = new Set(entries.map((e) => e.name));
  const adding = add.filter((d) => !present.has(d.name));
  const removed = entries.filter((e) => remove.includes(e.name));
  if (!adding.length && !removed.length) return text;
  const model = removed[0] ?? entries[entries.length - 1];
  const quote = model && /^(['"])/.test(model.value) ? model.value[0] : "'";
  const keyOf = (name) => (/^[@!&*%|>'"#]/.test(name) || name.includes(':') ? `${quote}${name}${quote}` : name);
  const newLines = adding.map((d) => `${cat.indent}${keyOf(d.name)}: ${quote}${d.spec}${quote}`);
  const at = removed[0] ? removed[0].line : (entries.length ? entries[entries.length - 1].line + 1 : cat.start + 1);
  const drop = new Set(removed.map((e) => e.line));
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === at) out.push(...newLines);
    if (!drop.has(i)) out.push(lines[i]);
  }
  if (at >= lines.length) out.push(...newLines);
  return out.join(eol);
}
