import { DIRECTIONS, getLevel, indexOf, PIECES, ports, RULES } from './data.js';

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const validInt = (value) => Number.isInteger(value);
const copy = (value) => JSON.parse(JSON.stringify(value));
const opposite = (dir) => (dir + 2) % 4;
const tileAt = (run, x, z) => run.board[indexOf(x, z)];
const costOf = (kind) => PIECES[kind]?.cost ?? 0;

function makeFixedBoard(level) {
  const board = Array(RULES.gridSize * RULES.gridSize).fill(null);
  for (const tile of level.fixed) board[indexOf(tile.x, tile.z)] = { ...tile };
  return board;
}

function event(run, type, fields = {}, text = '') {
  const item = { type, ...fields };
  if (text) { item.text = text; run.feedback = text; }
  run.events.push(item);
}

function clearRuntime(run) {
  run.elapsed = 0; run.tick = 0; run.clock = 0; run.packets = []; run.spawned = 0; run.leaks = 0;
  run.received = {}; run.splitCounts = {}; run._nextPacket = 1;
}

export function createLevel(levelId = 'first-dew') {
  const level = getLevel(levelId);
  if (!level) throw new RangeError(`unknown level: ${levelId}`);
  return {
    levelId, status: 'edit', board: makeFixedBoard(level), cost: 0, elapsed: 0, tick: 0, clock: 0,
    packets: [], spawned: 0, leaks: 0, received: {}, splitCounts: {}, hintsUsed: 0, history: [], events: [],
    feedback: '부품을 놓고 Enter로 물길을 시험하십시오.', _nextPacket: 1
  };
}

function snapshot(run) { return { board: copy(run.board), cost: run.cost }; }
function coordinates(action) { return validInt(action?.x) && validInt(action?.z) && indexOf(action.x, action.z) >= 0; }

export function edit(run, action = {}) {
  if (!run || run.status !== 'edit') return false;
  const level = getLevel(run.levelId); if (!level) return false;
  const index = coordinates(action) ? indexOf(action.x, action.z) : -1;
  if (action.type === 'undo') {
    const previous = run.history.pop(); if (!previous) return false;
    run.board = previous.board; run.cost = previous.cost; run.events = [];
    event(run, 'undo', {}, '직전 배치를 되돌렸습니다.'); return true;
  }
  if (index < 0) return false;
  const current = run.board[index];
  if (action.type === 'remove') {
    if (!current || current.fixed) return false;
    run.history.push(snapshot(run)); run.board[index] = null; run.cost -= costOf(current.kind); run.events = [];
    event(run, 'remove', { x: action.x, z: action.z }, '부품을 회수했습니다.'); return true;
  }
  if (action.type !== 'place') return false;
  const kind = action.kind; const rot = action.rot;
  if (!PIECES[kind] || !level.unlockedTools.includes(kind) || !validInt(rot) || rot < 0 || rot > 3 || current?.fixed) return false;
  if (current && current.kind === kind && current.rot === rot) return false;
  const nextCost = run.cost - (current ? costOf(current.kind) : 0) + costOf(kind);
  if (nextCost > level.budget) return false;
  run.history.push(snapshot(run)); run.board[index] = { x: action.x, z: action.z, kind, rot, fixed: false }; run.cost = nextCost; run.events = [];
  event(run, 'build', { x: action.x, z: action.z }, `${PIECES[kind].name}을 배치했습니다.`); return true;
}

export function start(run) {
  if (!run || !['edit', 'failed'].includes(run.status)) return false;
  clearRuntime(run); run.status = 'running'; run.events = []; event(run, 'start', {}, '물길을 시험합니다.'); return true;
}

export function stop(run) {
  if (!run || !['running', 'failed'].includes(run.status)) return false;
  clearRuntime(run); run.status = 'edit'; run.events = []; event(run, 'stop', {}, '편집 모드로 돌아왔습니다.'); return true;
}

function requirementTotal(level) { return level.requirements.reduce((sum, item) => sum + item.need, 0); }
function delivered(run) { return Object.values(run.received).reduce((sum, value) => sum + value, 0); }
function requirementsDone(run, level) { return level.requirements.every((item) => (run.received[indexOf(item.x, item.z)] || 0) >= item.need); }

export function hint(run) {
  if (!run || !['edit', 'failed'].includes(run.status)) return null;
  const level = getLevel(run.levelId); if (!level) return null;
  const missing = level.solution.find((item) => {
    const existing = run.board[indexOf(item.x, item.z)];
    return !existing || existing.fixed || existing.kind !== item.kind || existing.rot !== item.rot;
  });
  run.events = [];
  if (missing) { run.hintsUsed += 1; event(run, 'hint', { x: missing.x, z: missing.z }, '다음 물길 조각의 위치를 표시했습니다.'); return { ...missing }; }
  const solutionKeys = new Set(level.solution.map((item) => `${item.x},${item.z}`));
  const extra = run.board.find((item) => item && !item.fixed && !solutionKeys.has(`${item.x},${item.z}`));
  if (extra) { run.hintsUsed += 1; event(run, 'hint', { x: extra.x, z: extra.z }, `여분 관이 ${extra.x + 1}, ${extra.z + 1}칸에 있습니다. Backspace로 제거하십시오.`); return { ...extra, extra: true }; }
  event(run, 'hint', {}, '모든 해답 조각이 맞습니다. 수집기의 연결을 확인하십시오.'); return null;
}

function leak(run, x, z, mask, text) {
  run.leaks += 1; event(run, 'leak', { x, z, mask }, text || '물방울이 새어 나갔습니다.');
}

function routeThrough(tile, incomingPort, run, tileIndex) {
  if (!tile) return null;
  if (tile.kind === 'source' || tile.kind === 'rock') return null;
  if (tile.kind === 'sink') return incomingPort === tile.rot ? { sink: true } : null;
  if (tile.kind === 'flower') return incomingPort === opposite(tile.rot) ? { dir: tile.rot, tint: tile.mask ?? 0 } : null;
  if (tile.kind === 'bridge') return ports('bridge', tile.rot).includes(incomingPort) ? { dir: opposite(incomingPort) } : null;
  if (tile.kind === 'splitter') {
    if (incomingPort !== opposite(tile.rot)) return null;
    const count = run.splitCounts[tileIndex] || 0; run.splitCounts[tileIndex] = count + 1;
    const outputs = ports('splitter', tile.rot).slice(1); return { dir: outputs[count % outputs.length] };
  }
  const tilePorts = ports(tile.kind, tile.rot); if (!tilePorts.includes(incomingPort)) return null;
  const output = tilePorts.find((port) => port !== incomingPort); return output == null ? null : { dir: output };
}

function processPacket(run, packet, level, nextPackets) {
  const [dx, dz] = DIRECTIONS[packet.dir]; const x = packet.x + dx, z = packet.z + dz;
  if (indexOf(x, z) < 0) { leak(run, x, z, packet.mask); return; }
  const tile = tileAt(run, x, z); if (!tile) { leak(run, x, z, packet.mask); return; }
  const incomingPort = opposite(packet.dir); const tileIndex = indexOf(x, z);
  if (tile.kind === 'sink') {
    const requirement = level.requirements.find((item) => item.x === x && item.z === z);
    if (incomingPort !== tile.rot || packet.mask !== tile.mask) { leak(run, x, z, packet.mask, '수집기가 다른 빛을 거부했습니다.'); return; }
    const current = run.received[tileIndex] || 0;
    if (current < (requirement?.need ?? tile.need ?? 0)) { run.received[tileIndex] = current + 1; event(run, 'receive', { x, z, mask: packet.mask }, '수집기가 물방울을 받았습니다.'); }
    return;
  }
  const result = routeThrough(tile, incomingPort, run, tileIndex);
  if (!result) { leak(run, x, z, packet.mask, '포트가 맞지 않아 물방울이 샜습니다.'); return; }
  if (result.tint != null) { packet.mask |= result.tint; event(run, 'tint', { x, z, mask: packet.mask }, '꽃의 빛이 물방울에 더해졌습니다.'); }
  packet.x = x; packet.z = z; packet.dir = result.dir; nextPackets.push(packet);
  event(run, 'flow', { x, z, mask: packet.mask });
}

function processTick(run) {
  const level = getLevel(run.levelId); const nextPackets = [];
  run.tick += 1;
  for (const packet of run.packets.slice().sort((a, b) => a.id - b.id)) {
    if (run.leaks >= RULES.leakLimit) break;
    processPacket(run, packet, level, nextPackets);
  }
  run.packets = nextPackets;
  if (run.leaks >= RULES.leakLimit) { run.status = 'failed'; event(run, 'fail', {}, '누수가 세 번 발생했습니다. 물길을 고쳐 보십시오.'); return; }
  if (requirementsDone(run, level)) { run.status = 'won'; event(run, 'win', {}, '모든 수집기 목표를 채웠습니다.'); return; }
  if ((run.tick - 1) % RULES.sourceIntervalTicks === 0 && run.spawned < level.supply) {
    const source = level.fixed.find((tile) => tile.kind === 'source');
    run.packets.push({ id: run._nextPacket++, x: source.x, z: source.z, dir: source.rot, mask: 0 }); run.spawned += 1;
  }
  if (run.spawned >= level.supply && run.packets.length === 0) { run.status = 'failed'; event(run, 'fail', {}, '물이 모두 흘렀지만 수집기가 채워지지 않았습니다.'); return; }
  if (run.tick >= RULES.maxTicks) { run.status = 'failed'; event(run, 'fail', {}, '물길 시험 시간이 끝났습니다.'); }
}

export function step(run, dt = 0) {
  if (!run || run.status !== 'running') return [];
  const duration = clamp(Number.isFinite(dt) ? dt : 0, 0, .25); run.events = [];
  if (duration <= 0) return run.events;
  run.elapsed += duration; run.clock += duration;
  while (run.clock >= RULES.tickSeconds && run.status === 'running') { run.clock -= RULES.tickSeconds; processTick(run); }
  return run.events;
}

export function summarize(run) {
  const level = run ? getLevel(run.levelId) : null;
  return { levelId: run?.levelId, status: run?.status, cost: run?.cost ?? 0, leaks: run?.leaks ?? 0, elapsed: run?.elapsed ?? 0, hintsUsed: run?.hintsUsed ?? 0, delivered: run ? delivered(run) : 0, totalRequired: level ? requirementTotal(level) : 0, grade: run?.status !== 'won' ? null : run.hintsUsed === 0 && run.cost <= (level?.par ?? 0) ? 'S' : run.hintsUsed === 0 && run.cost <= (level?.par ?? 0) + 3 ? 'A' : 'B' };
}
