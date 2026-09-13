import test from 'node:test';
import assert from 'node:assert/strict';
import { COLORS, DIRECTIONS, LEVELS, PIECES, RULES, getLevel, indexOf, ports } from '../src/data.js';
import { createLevel, edit, hint, start, step, stop, summarize } from '../src/game.js';

function installSolution(run) {
  const solution = getLevel(run.levelId).solution;
  for (const item of solution) assert.equal(edit(run, { type: 'place', ...item }), true, `${run.levelId}:${item.x},${item.z}`);
  return solution.reduce((sum, item) => sum + PIECES[item.kind].cost, 0);
}

function runToEnd(run, seconds = 40) {
  assert.equal(start(run), true);
  for (let elapsed = 0; elapsed < seconds && run.status === 'running'; elapsed += .25) step(run, .25);
  return run;
}

test('shared data exposes directions, ports, frozen levels and authored par values', () => {
  assert.deepEqual(DIRECTIONS, [[0, -1], [1, 0], [0, 1], [-1, 0]]);
  assert.deepEqual(ports('straight', 1), [1, 3]);
  assert.deepEqual(ports('elbow', 0), [0, 1]);
  assert.deepEqual(ports('splitter', 0), [2, 3, 1]);
  assert.deepEqual(ports('bridge', 2), [0, 1, 2, 3]);
  assert.deepEqual(ports('source', 1), [1]);
  assert.deepEqual(ports('flower', 0), [2, 0]);
  assert.deepEqual(COLORS[7], { mask: 7, name: '별빛', hex: 0xf4f2dc, css: '#f4f2dc' });
  assert.deepEqual(LEVELS.map((level) => level.title), ['첫 물길', '붉은 꽃의 기억', '햇빛의 조합', '두 정원으로', '엇갈린 빗방울', '구름 없이 내리는 비']);
  assert.deepEqual(LEVELS.map((level) => level.owner), ['아이리스', '아이리스', '율', '율', '대', '대']);
  assert.deepEqual(LEVELS.map((level) => level.par), [5, 8, 9, 11, 19, 17]);
  assert.equal(getLevel('missing'), null); assert.equal(indexOf(6, 6), 48); assert.equal(indexOf(7, 6), -1);
  for (const level of LEVELS) assert.ok(Object.isFrozen(level) && Object.isFrozen(level.fixed));
});

test('editing enforces fixed cells, budget, replacement refunds and exact undo', () => {
  const run = createLevel('first-dew'); const before = JSON.stringify(run.board);
  assert.equal(edit(run, { type: 'remove', x: 0, z: 3 }), false);
  assert.equal(edit(run, { type: 'place', x: 1, z: 3, kind: 'straight', rot: 1 }), true);
  assert.equal(run.cost, 1);
  assert.equal(edit(run, { type: 'place', x: 1, z: 3, kind: 'elbow', rot: 0 }), true); assert.equal(run.cost, 1);
  assert.equal(edit(run, { type: 'undo' }), true); assert.equal(run.board[indexOf(1, 3)].kind, 'straight');
  assert.equal(edit(run, { type: 'undo' }), true); assert.equal(JSON.stringify(run.board), before); assert.equal(run.cost, 0);
  assert.equal(edit(run, { type: 'place', x: 1, z: 3, kind: 'bridge', rot: 0 }), false); assert.equal(run.cost, 0);

  const budget = createLevel('first-dew');
  const open = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [0, 1]];
  for (const [x, z] of open.slice(0, 7)) assert.equal(edit(budget, { type: 'place', x, z, kind: 'straight', rot: 0 }), true);
  const inert = JSON.stringify({ board: budget.board, cost: budget.cost, history: budget.history });
  assert.equal(budget.cost, getLevel('first-dew').budget);
  assert.equal(edit(budget, { type: 'place', x: open[7][0], z: open[7][1], kind: 'straight', rot: 0 }), false);
  assert.equal(JSON.stringify({ board: budget.board, cost: budget.cost, history: budget.history }), inert);
  assert.equal(edit(budget, { type: 'place', x: 0, z: 0, kind: 'straight', rot: 0 }), false);
  assert.equal(edit(budget, { type: 'remove', x: 0, z: 0 }), true);
  budget.status = 'failed';
  assert.equal(edit(budget, { type: 'remove', x: 1, z: 0 }), false);
});

test('all six authored solutions finish through actual edit and step simulation', () => {
  const observed = [];
  const solutionCosts = [];
  for (const level of LEVELS) {
    const run = createLevel(level.id); const cost = installSolution(run); assert.equal(run.cost, cost); assert.ok(cost <= level.budget);
    solutionCosts.push(cost);
    runToEnd(run, 80); observed.push({ id: level.id, status: run.status, tick: run.tick, cost, leaks: run.leaks, delivered: summarize(run).delivered });
    assert.equal(run.status, 'won', JSON.stringify(observed.at(-1)));
    assert.equal(run.leaks, 0); assert.equal(summarize(run).delivered, summarize(run).totalRequired);
  }
  assert.deepEqual(solutionCosts, [5, 8, 9, 11, 19, 17]);
});

test('splitter alternates without cloning and crossing bridge keeps masks separate', () => {
  const branch = createLevel('two-canals'); installSolution(branch); runToEnd(branch);
  assert.equal(branch.status, 'won'); assert.equal(branch.spawned, 7); assert.equal(branch.received[indexOf(1, 0)], 2); assert.equal(branch.received[indexOf(5, 0)], 2);
  assert.ok(branch.splitCounts[indexOf(3, 4)] >= 4); assert.equal(Object.values(branch.received).reduce((sum, value) => sum + value, 0), 4);
  const crossing = createLevel('crossing-rain'); installSolution(crossing); runToEnd(crossing);
  assert.equal(crossing.status, 'won'); assert.equal(crossing.received[indexOf(5, 1)], 3); assert.equal(crossing.received[indexOf(0, 3)], 3);
});

test('bridge preserves simultaneous masks and splitter alternates one packet per arrival', () => {
  const bridge = createLevel('crossing-rain');
  assert.equal(edit(bridge, { type: 'place', x: 3, z: 3, kind: 'bridge', rot: 0 }), true);
  assert.equal(start(bridge), true);
  bridge.spawned = getLevel(bridge.levelId).supply;
  bridge.packets = [
    { id: 11, x: 3, z: 2, dir: 2, mask: 1 },
    { id: 12, x: 2, z: 3, dir: 1, mask: 4 }
  ];
  step(bridge, .25); step(bridge, .1);
  assert.deepEqual(bridge.packets.map(({ id, x, z, dir, mask }) => ({ id, x, z, dir, mask })), [
    { id: 11, x: 3, z: 3, dir: 2, mask: 1 },
    { id: 12, x: 3, z: 3, dir: 1, mask: 4 }
  ]);
  assert.equal(bridge.leaks, 0);

  const split = createLevel('two-canals');
  split.board = Array(49).fill(null);
  split.board[indexOf(3, 4)] = { x: 3, z: 4, kind: 'splitter', rot: 0, fixed: false };
  assert.equal(start(split), true);
  split.spawned = getLevel(split.levelId).supply;
  split.packets = [{ id: 1, x: 3, z: 5, dir: 0, mask: 0 }];
  step(split, .25); step(split, .1);
  assert.equal(split.splitCounts[indexOf(3, 4)], 1); assert.equal(split.packets[0].dir, 3);
  split.packets.push({ id: 2, x: 3, z: 5, dir: 0, mask: 0 });
  step(split, .25); step(split, .1);
  assert.equal(split.splitCounts[indexOf(3, 4)], 2);
  assert.equal(split.packets.find((packet) => packet.id === 2).dir, 1);
});

test('flowers OR their fixed mask and sinks reject incorrect colors', () => {
  const tint = createLevel('red-memory');
  tint.board = Array(49).fill(null);
  tint.board[indexOf(1, 1)] = { x: 1, z: 1, kind: 'flower', rot: 1, fixed: true, mask: 1 };
  assert.equal(start(tint), true);
  tint.spawned = getLevel(tint.levelId).supply;
  tint.packets = [{ id: 1, x: 0, z: 1, dir: 1, mask: 2 }];
  step(tint, .25); step(tint, .1);
  assert.equal(tint.packets[0].mask, 3); assert.equal(tint.leaks, 0);

  const sink = createLevel('first-dew');
  sink.board = Array(49).fill(null);
  sink.board[indexOf(1, 1)] = { x: 1, z: 1, kind: 'sink', rot: 3, fixed: true, mask: 1, need: 1 };
  assert.equal(start(sink), true);
  sink.spawned = getLevel(sink.levelId).supply;
  sink.packets = [{ id: 1, x: 0, z: 1, dir: 1, mask: 2 }];
  step(sink, .25); step(sink, .1);
  assert.equal(sink.leaks, 1); assert.deepEqual(sink.received, {});
});

test('a closed pipe loop reaches maxTicks after source exhaustion', () => {
  const loop = createLevel('first-dew');
  loop.board = Array(49).fill(null);
  loop.board[indexOf(2, 2)] = { x: 2, z: 2, kind: 'elbow', rot: 1, fixed: false };
  loop.board[indexOf(3, 2)] = { x: 3, z: 2, kind: 'elbow', rot: 2, fixed: false };
  loop.board[indexOf(3, 3)] = { x: 3, z: 3, kind: 'elbow', rot: 3, fixed: false };
  loop.board[indexOf(2, 3)] = { x: 2, z: 3, kind: 'elbow', rot: 0, fixed: false };
  assert.equal(start(loop), true);
  loop.spawned = getLevel(loop.levelId).supply;
  loop.packets = [{ id: 1, x: 2, z: 2, dir: 1, mask: 0 }];
  for (let i = 0; i < 140 && loop.status === 'running'; i += 1) step(loop, .25);
  assert.equal(loop.status, 'failed'); assert.equal(loop.tick, RULES.maxTicks); assert.equal(loop.leaks, 0);
});

test('wrong ports leak and empty board fails within bounded ticks', () => {
  const wrong = createLevel('first-dew'); assert.equal(edit(wrong, { type: 'place', x: 1, z: 3, kind: 'straight', rot: 0 }), true); runToEnd(wrong, 20); assert.equal(wrong.status, 'failed'); assert.ok(wrong.leaks >= RULES.leakLimit);
  const empty = createLevel('first-dew'); runToEnd(empty, 50); assert.equal(empty.status, 'failed'); assert.ok(empty.tick <= RULES.maxTicks);

  const burst = createLevel('first-dew');
  burst.board = Array(49).fill(null); burst.spawned = getLevel(burst.levelId).supply;
  burst.packets = [1, 2, 3, 4].map((id) => ({ id, x: 2, z: 2, dir: 1, mask: 0 }));
  assert.equal(start(burst), true); burst.spawned = getLevel(burst.levelId).supply;
  burst.packets = [1, 2, 3, 4].map((id) => ({ id, x: 2, z: 2, dir: 1, mask: 0 }));
  step(burst, .25); step(burst, .1);
  assert.equal(burst.status, 'failed'); assert.equal(burst.leaks, RULES.leakLimit);
  assert.equal(burst.events.filter((item) => item.type === 'leak').length, RULES.leakLimit);
});

test('hint observes without editing and restart preserves constructed network', () => {
  const run = createLevel('red-memory'); const board = JSON.stringify(run.board); assert.deepEqual(hint(run), getLevel('red-memory').solution[0]);
  assert.equal(JSON.stringify(run.board), board); assert.equal(run.cost, 0); assert.equal(run.hintsUsed, 1);
  installSolution(run); const network = JSON.stringify(run.board); const cost = run.cost; start(run); step(run, .5); assert.equal(stop(run), true);
  assert.equal(run.status, 'edit'); assert.equal(JSON.stringify(run.board), network); assert.equal(run.cost, cost); assert.equal(run.hintsUsed, 1);
});

test('hint identifies an extra pipe after the authored pieces are complete', () => {
  const run = createLevel('first-dew'); installSolution(run);
  assert.equal(edit(run, { type: 'place', x: 0, z: 0, kind: 'straight', rot: 0 }), true);
  const beforeHints = run.hintsUsed;
  const extra = hint(run);
  assert.deepEqual(extra, { x: 0, z: 0, kind: 'straight', rot: 0, fixed: false, extra: true });
  assert.equal(run.hintsUsed, beforeHints + 1);
  assert.match(run.feedback, /Backspace/);
});

test('failed retry resets runtime but keeps board and terminal won is inert', () => {
  const run = createLevel('first-dew'); installSolution(run); start(run); run.status = 'failed'; run.leaks = 3; const board = JSON.stringify(run.board); assert.equal(start(run), true); assert.equal(run.status, 'running'); assert.equal(run.leaks, 0); assert.equal(JSON.stringify(run.board), board);
  run.status = 'won'; const snapshot = JSON.stringify(run); step(run, .25); assert.equal(JSON.stringify(run), snapshot);
});
