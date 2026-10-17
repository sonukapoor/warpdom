import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parityGaps, beyondCandidates, parityTitle, parityBody, plan, trackingBody, tickedKeys, trackingState, coverage, TRACKING_TITLE,
} from '../scripts/api-gaps.mjs';

const fixture = (name) => JSON.parse(readFileSync(new URL(`fixtures/api-gaps/${name}`, import.meta.url), 'utf8'));
const idl = fixture('idl.json');
const groups = fixture('spec-groups.json');

// Hand-written issues like warpdom's #1-#12, plus an adoption issue whose
// title happens to contain an interface name.
const issues = [
  { number: 1, title: 'window.crypto is missing (jsdom has it)', labels: [{ name: 'parity' }, { name: 'missing-api' }] },
  { number: 3, title: 'Blob and File are missing on the window (jsdom has them)', labels: [{ name: 'parity' }] },
  { number: 6, title: 'Opt-in: matchMedia', labels: [{ name: 'beyond-jsdom' }] },
  { number: 11, title: 'Opt-in: Web Animations: element.animate / getAnimations', labels: [{ name: 'beyond-jsdom' }] },
  { number: 14, title: 'Element Plus (jsdom 16.4): 8 tests still differ', labels: [{ name: 'adoption' }] },
];
const apiTitles = issues.filter((i) => i.labels.some((l) => l.name !== 'adoption')).map((i) => i.title);

test('parity gaps: per interface, across partial specs, largest first, engines found by name', () => {
  const gaps = parityGaps(idl, apiTitles);
  assert.deepEqual(gaps.map((g) => [g.name, g.missing, g.count]), [
    ['Gone', true, 2], ['Node', false, 2], ['Element', false, 1], ['OtherGap', true, 0],
  ]);
  const node = gaps.find((g) => g.name === 'Node');
  assert.deepEqual(node.specs.map((s) => [s.spec, s.members]), [['dom', [['moveBefore', 'o']]], ['html', [['extra', 'a']]]]);
  // The defining spec comes first for a missing interface; only members jsdom has.
  assert.deepEqual(gaps[0].specs.map((s) => [s.spec, s.members]), [['dom', [['a', 'a']]], ['html', [['fromHtml', 'a']]]]);
});

test('parity gaps: what issue titles name is covered (Blob, window.crypto); a stub or unprobed status is no gap', () => {
  const names = (titles) => parityGaps(idl, titles).map((g) => g.name);
  assert.ok(names([]).includes('Blob'));
  assert.ok(names([]).includes('Window'));
  assert.ok(!names(apiTitles).includes('Blob'));
  assert.ok(!names(apiTitles).includes('Window'), 'window.crypto covers Window.crypto');
  assert.ok(!names([]).includes('Stubby'));
  assert.ok(!names([]).includes('Unprobed'));
  // A generated title covers its interface, so no title is opened twice.
  assert.ok(!names(['Parity: Gone is missing (jsdom has it)']).includes('Gone'));
});

test('coverage: interface words, window.<name>, members with their interface or camelCase, multi-word spec titles', () => {
  const c = coverage(['Opt-in: Element.scrollIntoView', 'Opt-in: HTMLDialogElement show/showModal/close', 'window.performance is missing', 'WPT: run all test-DOM-relevant areas']);
  assert.equal(c.iface('Element'), false, 'Element.x names a member, not the interface');
  assert.equal(c.member('Element', 'scrollIntoView'), true);
  assert.equal(c.iface('HTMLDialogElement'), true);
  assert.equal(c.member('HTMLDialogElement', 'close'), true);
  assert.equal(c.member('WebSocket', 'close'), false, 'a plain word needs its interface in the title');
  assert.equal(c.iface('Performance'), true);
  assert.equal(c.member('Window', 'performance'), true);
  assert.equal(c.spec('DOM'), false, 'one-word spec titles are too common to match');
});

test('parity titles and body', () => {
  const [gone, node] = parityGaps(idl, apiTitles);
  assert.equal(parityTitle(gone), 'Parity: Gone is missing (jsdom has it)');
  assert.equal(parityTitle(node), 'Parity: Node (2 members jsdom has)');
  const body = parityBody(node, idl);
  assert.match(body, /https:\/\/domparity\.github\.io\/coverage\/interface\/Node\n/);
  assert.match(body, /\[`moveBefore`\]\(https:\/\/domparity\.github\.io\/coverage\/interface\/Node#m-moveBefore\) \(operation\)/);
  assert.match(body, /\*\*\[DOM Standard\]\(https:\/\/dom\.spec\.whatwg\.org\/\)\*\*/);
  assert.match(body, /of 2026-10-17T00:00:00\.000Z/);
  assert.match(body, /jsdom 30\.1\.3, warpdom 0\.1\.3, happy-dom 21\.0\.3, linkedom 0\.18\.13/);
});

test('beyond-jsdom: core specs only, happy-dom has it, neither jsdom nor warpdom; issue names excluded', () => {
  const beyond = beyondCandidates(idl, groups, apiTitles);
  assert.deepEqual(beyond.map((s) => s.spec), ['dom', 'html'], 'web-animations is covered by #11 by its title, exotic is not core');
  const dom = Object.fromEntries(beyond[0].items.map((i) => [i.name, i]));
  assert.deepEqual(Object.keys(dom).sort(), ['Fancy', 'Gone', 'Node', 'Window']);
  assert.deepEqual(dom.Fancy, { key: 'dom/Fancy', name: 'Fancy', interface: true, count: 2, happy: 1, linkedom: true });
  assert.deepEqual(dom.Window.members, [['closed', 'a'], ['opener', 'a']], 'matchMedia is covered by #6');
  assert.equal(dom.Window.linkedom, 1);
  assert.deepEqual(dom.Node.members, [['fancy', 'a']]);
  assert.deepEqual(beyond[1].items.map((i) => [i.key, i.members]), [['html/Gone', [['notInJsdom', 'a']]]]);
});

test('plan: cap, pending list, labels; only API-labeled issues count as coverage', () => {
  const p = plan({ idl, groups, issues, cap: 2 });
  assert.deepEqual(p.create.map((c) => c.title), ['Parity: Gone is missing (jsdom has it)', 'Parity: Node (2 members jsdom has)']);
  assert.deepEqual(p.create[0].labels, ['parity', 'missing-api']);
  assert.deepEqual(p.pending.map((g) => g.name), ['Element', 'OtherGap'], '"Element Plus" (adoption) does not cover Element');
  assert.equal(p.tracking.number, null);
  assert.deepEqual(p.tracking.labels, ['beyond-jsdom']);
  assert.match(p.tracking.body, /^<!-- api-gaps date:2026-10-17T00:00:00\.000Z pending:2 -->/);
  assert.match(p.tracking.body, /- Parity: Element \(1 members jsdom has\)/);
  // An opened parity issue does not hide the rest of its interface from the checklist.
  const after = plan({ idl, groups, issues: [...issues, { number: 20, title: 'Parity: Node (2 members jsdom has)', labels: ['parity'] }], cap: 2 });
  assert.ok(!after.create.some((c) => c.gap.name === 'Node'));
  assert.match(after.tracking.body, /<!-- key:dom\/Node -->/);
});

test('tracking checklist: ticked boxes survive a rewrite, vanished items drop out', () => {
  const beyond = beyondCandidates(idl, groups, apiTitles);
  const first = trackingBody({ idl, beyond });
  assert.equal(tickedKeys(first).size, 0);
  assert.match(first, /^- \[ \] \[`Fancy`\]\(https:\/\/domparity\.github\.io\/coverage\/interface\/Fancy\): interface, 2 members \(happy-dom: has it, 1\/2 members; linkedom: has it\) <!-- key:dom\/Fancy -->$/m);
  assert.match(first, /^- \[ \] \[`Window`\]\([^)]*\): 2 members: `closed`, `opener` \(happy-dom: 2\/2; linkedom: 1\/2\) <!-- key:dom\/Window -->$/m);
  assert.match(first, /^### \[DOM Standard\]\(https:\/\/dom\.spec\.whatwg\.org\/\) \(`dom`\)$/m);
  const edited = first
    .replace('- [ ] [`Fancy`]', '- [x] [`Fancy`]')
    .replace('- [ ] [`Window`]', '- [X] [`Window`]')
    .concat('- [x] `Gone`: was here <!-- key:dom/Vanished -->\n');
  assert.deepEqual([...tickedKeys(edited)].sort(), ['dom/Fancy', 'dom/Vanished', 'dom/Window']);
  const second = trackingBody({ idl, beyond, previousBody: edited });
  assert.deepEqual([...tickedKeys(second)].sort(), ['dom/Fancy', 'dom/Window']);
  assert.match(second, /^- \[ \] \[`Node`\]/m);
});

test('data version: same date and nothing pending skips; pending or a new date runs; --force runs', () => {
  const done = { number: 30, body: trackingBody({ idl, beyond: [] }) };
  assert.deepEqual(trackingState(done.body), { date: idl.date, pending: 0 });
  assert.match(plan({ idl, groups, issues, tracking: done }).skip, /unchanged since the last run \(2026-10-17T00:00:00\.000Z\)/);
  assert.equal(plan({ idl, groups, issues, tracking: done, force: true }).skip, undefined);
  const pending = { number: 30, body: trackingBody({ idl, beyond: [], pending: [{ name: 'X', missing: true }] }) };
  assert.equal(plan({ idl, groups, issues, tracking: pending }).skip, undefined);
  const newer = plan({ idl: { ...idl, date: '2026-10-24T00:00:00.000Z' }, groups, issues, tracking: done });
  assert.equal(newer.skip, undefined);
  assert.equal(newer.tracking.number, 30);
  assert.ok(!issues.some((i) => i.title === TRACKING_TITLE));
});
