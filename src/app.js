import { LEVELS, RULES, PIECES, COLORS, getLevel, ports } from './data.js';
import { createLevel, edit, start, stop, step, hint, summarize } from './game.js';
import { createScene } from './scene.js';
import { createAudio } from './audio.js';

(() => {
  'use strict';
  const shell = document.querySelector('.app-shell');
  const screens = ['title', 'select', 'play', 'pause', 'guide', 'won', 'failed', 'ending'];
  const tools = ['straight', 'elbow', 'splitter', 'bridge'];
  const directions = ['북쪽', '동쪽', '남쪽', '서쪽'];
  const keyActions = new Map([['w', 'up'], ['arrowup', 'up'], ['a', 'left'], ['arrowleft', 'left'], ['s', 'down'], ['arrowdown', 'down'], ['d', 'right'], ['arrowright', 'right']]);
  const defaults = { volume: .24, muted: false };
  let settings = { ...defaults }, records = {}, screen = 'title', previousScreen = 'title', guideReturn = 'title';
  let selectedLevel = LEVELS[0]?.id || null, run = null, scene = null, audio = null, sceneError = null;
  let cursor = { x: 1, z: 3 }, tool = 'straight', rotation = 1;
  let accumulator = 0, lastFrame = performance.now(), hintGhost = null, feedback = '', feedbackUntil = 0, pointerStart = new Map(), eventQueue = [];

  const storage = () => { try { return window.localStorage; } catch (_) { return null; } };
  const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
  const copy = value => { try { return JSON.parse(JSON.stringify(value)); } catch (_) { return null; } };
  const levelIds = () => LEVELS.map(level => level.id);
  const level = id => getLevel(id) || LEVELS.find(item => item.id === id) || LEVELS[0];
  const toolName = kind => PIECES[kind].name;
  const modeCost = kind => PIECES[kind].cost;
  const gradeFor = value => { const par = level(value.levelId)?.par ?? Infinity; if (value.hintsUsed === 0 && value.cost <= par) return 'S'; if (value.hintsUsed === 0 && value.cost <= par + 3) return 'A'; return 'B'; };
  const portraitPosition = index => index === 0 ? '0% 0%' : index === 1 ? '100% 0%' : index === 2 ? '0% 100%' : '100% 100%';
  const colorName = mask => COLORS[mask].name;
  const orientationLabel = (kind, rot) => { const values = ports(kind, rot); const names = values.map(value => directions[value] || value); return kind === 'splitter' ? `입력·${names[0] || '포트'} / 출력·${names.slice(1).join('·') || '포트'}` : `포트·${names.join('·') || directions[rot % 4]}`; };
  settings = readSettings(); records = readRecords();

  function readSettings() {
    try {
      const value = JSON.parse(storage()?.getItem('rain-settings-v1'));
      if (value && finite(value.volume, 0, 1) && typeof value.muted === 'boolean') return { volume: value.volume, muted: value.muted };
    } catch (_) { /* storage is optional */ }
    return { ...defaults };
  }
  function saveSettings() { try { storage()?.setItem('rain-settings-v1', JSON.stringify(settings)); } catch (_) { /* storage is optional */ } }
  function readRecords() {
    const clean = {};
    let parsed;
    try { parsed = JSON.parse(storage()?.getItem('rain-records-v1')); } catch (_) { return clean; }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return clean;
    for (const item of LEVELS) {
      const value = parsed[item.id];
      if (!value || typeof value !== 'object' || value.status === 'failed') continue;
      if (!Number.isInteger(value.cost) || value.cost < 0 || value.cost > item.budget || !Number.isInteger(value.leaks) || value.leaks < 0 || value.leaks > 2 || !Number.isInteger(value.hintsUsed) || value.hintsUsed < 0 || !finite(value.elapsed, 0.001, 1000)) continue;
      const normalized = { levelId: item.id, cost: value.cost, leaks: value.leaks, elapsed: value.elapsed, hintsUsed: value.hintsUsed, grade: value.grade };
      if (normalized.grade === gradeFor(normalized)) clean[item.id] = normalized;
    }
    return clean;
  }
  function saveRecords() { try { storage()?.setItem('rain-records-v1', JSON.stringify(records)); } catch (_) { /* storage is optional */ } }
  function unlocked(id) { const index = levelIds().indexOf(id); return index <= 0 || !!records[levelIds()[index - 1]]; }
  function tell(text, seconds = 3) { feedback = text || ''; feedbackUntil = performance.now() + seconds * 1000; renderPlay(); }
  function clearHeld() { pointerStart.clear(); }
  function queueEvents(events) { if (Array.isArray(events) && events.length) eventQueue.push(...events); }
  function setScreen(next) {
    if (!screens.includes(next)) return;
    if (next === 'pause' && screen === 'play') previousScreen = 'play';
    screen = next; shell.dataset.screen = next; if (next !== 'play') eventQueue.length = 0; clearHeld();
    for (const id of screens) { const node = document.getElementById(`${id}-screen`); if (node) { node.hidden = id !== next; node.setAttribute('aria-hidden', String(id !== next)); } }
    if (next === 'play') { audio?.resume?.(); scene?.resize?.(); }
    else if (next === 'won' || next === 'failed') audio?.stop?.();
    else audio?.pause?.();
    render();
  }
  function pausePlay() { if (!run || screen !== 'play') return; previousScreen = 'play'; setScreen('pause'); }
  function renderTitle() { const button = document.getElementById('continue-button'); button.disabled = !levelIds().some(id => records[id]) || !!sceneError; document.querySelector('#title-screen [data-action="start"]').disabled = !!sceneError; }
  function renderSelect() {
    const list = document.getElementById('level-list'); list.replaceChildren();
    for (const item of LEVELS) {
      const record = records[item.id], button = document.createElement('button'), portrait = document.createElement('i');
      button.className = `level-card ${item.id === selectedLevel ? 'selected' : ''}`; button.dataset.levelId = item.id; button.disabled = !unlocked(item.id);
      portrait.className = 'route-portrait'; portrait.style.backgroundPosition = portraitPosition(item.portraitIndex ?? 1); button.append(portrait);
      const title = document.createElement('strong'); title.textContent = item.title; const owner = document.createElement('small'); owner.textContent = `${item.owner} · ${item.budget} 부품`; const status = document.createElement('em'); status.textContent = record ? `${record.grade} · ${record.cost}개` : (button.disabled ? '잠김' : '미기록'); button.append(title, owner, status); list.append(button);
    }
    document.getElementById('volume-range').value = settings.volume; document.querySelector('#select-screen [data-action="mute"]').textContent = settings.muted ? '소리 켜기' : '소리 끄기'; document.querySelector('#select-screen [data-action="begin"]').disabled = !!sceneError;
  }
  function renderQuota(item) {
    const list = document.getElementById('quota-list'); list.replaceChildren();
    for (const fixed of item.fixed || []) if (fixed.kind === 'sink') { const row = document.createElement('div'); row.className = 'quota'; const label = document.createElement('span'); label.textContent = `${colorName(fixed.mask)} 수신`; const count = document.createElement('b'); const received = run?.received?.[fixed.z * RULES.gridSize + fixed.x] || 0; count.textContent = `${Math.min(received, fixed.need || 0)} / ${fixed.need || 0}`; row.append(label, count); list.append(row); }
  }
  function renderToolLabels() { document.querySelectorAll('[data-tool]').forEach(node => { const item = PIECES[node.dataset.tool]; node.querySelector('span').textContent = item.name; node.querySelector('small').textContent = `비용 ${modeCost(node.dataset.tool)}`; }); }
  function syncRunButtons() { const running = run?.status === 'running'; document.querySelectorAll('[data-action="run"]').forEach(node => { node.style.display = running ? 'none' : ''; }); document.querySelectorAll('[data-action="stop"]').forEach(node => { node.style.display = running ? 'block' : 'none'; }); }
  let lastPlaySignature = '';
  function renderPlay() {
    if (!run) return;
    const activeFeedback = feedback && performance.now() < feedbackUntil ? feedback : '';
    const signature = JSON.stringify([run.levelId, run.status, run.cost, run.tick, run.spawned, run.leaks, run.received, cursor, tool, rotation, activeFeedback]);
    if (signature === lastPlaySignature) return;
    lastPlaySignature = signature;
    const item = level(run.levelId), board = run.board || [], placedCost = Number(run.cost || board.reduce((sum, cell) => sum + (cell && !cell.fixed ? modeCost(cell.kind) : 0), 0));
    document.getElementById('level-title').textContent = item.title; document.getElementById('level-intro').textContent = item.intro || ''; document.getElementById('owner-name').textContent = `${item.owner} · ${item.ownerAge || ''}`; document.getElementById('owner-story').textContent = item.intro || ''; document.getElementById('portrait').style.backgroundPosition = portraitPosition(item.portraitIndex ?? 1);
    document.getElementById('cost-value').textContent = `${placedCost} / ${item.budget}`; document.getElementById('leak-value').textContent = `${run.leaks || 0} / 3`; document.getElementById('supply-value').textContent = `${Math.max(0, (item.supply || 0) - (run.spawned || 0))}`; document.getElementById('tick-value').textContent = `${run.tick || 0}`; document.getElementById('phase-label').textContent = run.status === 'running' ? '관찰 중' : run.status === 'failed' ? '흐름 중단' : '편집';
    syncRunButtons();
    for (const action of ['place', 'remove', 'undo', 'hint', 'rotate']) {
      document.querySelectorAll(`[data-action="${action}"]`).forEach(node => { node.disabled = run.status !== 'edit'; });
    }
    renderQuota(item); const readout = document.getElementById('cursor-readout'); readout.textContent = `칸 ${cursor.x + 1}, ${cursor.z + 1} · ${toolName(tool)} · ${orientationLabel(tool, rotation)}`;
    document.getElementById('play-feedback').textContent = feedback && performance.now() < feedbackUntil ? feedback : ''; document.getElementById('context-tip').textContent = run.status === 'edit' ? 'WASD/방향키로 칸을 고르고 1–4로 부품을 선택하십시오. Space로 놓고 Enter로 물을 흘립니다.' : run.status === 'running' ? '물이 스스로 흐릅니다. 누수 위치를 살피고, Enter로 편집으로 돌아가십시오.' : '흐름이 멈췄습니다. Enter 또는 편집으로 돌아가 배치를 고치십시오.';
    const unlockedTools = run.unlockedTools || item.unlockedTools;
    document.querySelectorAll('[data-tool]').forEach(node => { node.classList.toggle('selected', node.dataset.tool === tool); node.disabled = run.status !== 'edit' || !unlockedTools.includes(node.dataset.tool); });
  }
  function renderResult() {
    if (!run) return; const summary = summarize(run) || run, item = level(run.levelId); if (screen === 'won') { document.getElementById('won-title').textContent = `${item.title}에 물이 닿았습니다`; document.getElementById('won-copy').textContent = item.outro || '끊어진 물길이 다시 이어졌습니다.'; document.getElementById('won-stats').textContent = `누수 ${summary.leaks} · 비용 ${summary.cost}/${item.budget} · 시간 ${Number(summary.elapsed || 0).toFixed(1)}초 · 등급 ${summary.grade || '—'}`; document.querySelector('#won-screen [data-action="next"]').textContent = levelIds().indexOf(run.levelId) === levelIds().length - 1 ? '결말 보기' : '다음 정원'; } else document.getElementById('failed-stats').textContent = `누수 ${summary.leaks || run.leaks || 0}/3 · 사용 부품 ${summary.cost ?? run.cost ?? 0}/${item.budget}`; }
  function renderEnding() { const completed = levelIds().filter(id => records[id]); const gradeText = completed.map(id => `${level(id).title} ${records[id].grade}`).join(' · '); document.getElementById('ending-stats').textContent = `완료한 정원 ${completed.length} / ${LEVELS.length}${gradeText ? ` · ${gradeText}` : ''}`; }
  function render() { if (screen === 'title') renderTitle(); else if (screen === 'select') renderSelect(); else if (screen === 'play') renderPlay(); else if (screen === 'won' || screen === 'failed') renderResult(); else if (screen === 'ending') renderEnding(); }
  function begin(id = selectedLevel) { if (sceneError) return; selectedLevel = id; run = createLevel(selectedLevel); cursor = { x: 1, z: 3 }; tool = (run.unlockedTools || level(id).unlockedTools)[0]; rotation = 1; hintGhost = null; feedback = ''; accumulator = 0; audio?.stop?.(); try { audio?.unlock?.(); audio?.start?.(); } catch (error) { console.error(error); tell('소리 없이 계속합니다.'); } setScreen('play'); }
  function continueCampaign() { selectedLevel = levelIds().find(id => unlocked(id) && !records[id]) || levelIds()[levelIds().length - 1]; setScreen('select'); }
  function persistWin() { const summary = summarize(run); if (!summary || summary.status !== 'won') return; const prior = records[run.levelId]; const rank = { S: 3, A: 2, B: 1 }, better = !prior || rank[summary.grade] > rank[prior.grade] || (rank[summary.grade] === rank[prior.grade] && (summary.cost < prior.cost || (summary.cost === prior.cost && (summary.leaks < prior.leaks || (summary.leaks === prior.leaks && summary.elapsed < prior.elapsed))))); if (better) { records[run.levelId] = { levelId: run.levelId, grade: summary.grade, cost: summary.cost, leaks: summary.leaks, elapsed: summary.elapsed, hintsUsed: summary.hintsUsed }; saveRecords(); } }
  function processEvents(events) {
    let lastLeak;
    for (const event of events) {
      if (event.type === 'leak') lastLeak = event;
      if (event.text && event.type !== 'flow') tell(event.text, event.type === 'leak' ? 2 : 3);
      if (event.type === 'win') { persistWin(); setScreen('won'); audio?.play?.(event); }
      else if (event.type === 'fail') {
        const location = lastLeak && lastLeak.x >= 0 && lastLeak.x < RULES.gridSize && lastLeak.z >= 0 && lastLeak.z < RULES.gridSize;
        if (location) cursor = { x: lastLeak.x, z: lastLeak.z };
        document.getElementById('failed-copy').textContent = location ? `${cursor.x + 1}, ${cursor.z + 1}칸에서 물길이 끊겼습니다. ${lastLeak.text || '빈 칸이나 연결 방향을 확인하세요.'}` : event.text || run.feedback;
        setScreen('failed'); audio?.play?.(event);
      } else if (event.type !== 'flow') audio?.play?.(event);
    }
  }
  function placeAt(x = cursor.x, z = cursor.z) {
    if (!run || screen !== 'play' || run.status !== 'edit') return;
    const accepted = edit(run, { type: 'place', x, z, kind: tool, rot: rotation });
    if (accepted) {
      hintGhost = null;
      queueEvents([{ type: 'place', x, z, text: `${toolName(tool)}을 놓았습니다. ${orientationLabel(tool, rotation)}` }]);
      renderPlay();
    } else {
      const existing = run.board[z * RULES.gridSize + x];
      if (existing?.fixed) tell('꽃과 수원, 바위는 옮길 수 없습니다. 빈 칸을 연결하세요.');
      else if (run.cost - (existing ? modeCost(existing.kind) : 0) + modeCost(tool) > level(run.levelId).budget) tell('부품 예산이 부족합니다. 사용하지 않는 관을 회수하세요.');
    }
  }
  function removeAt() { if (!run || run.status !== 'edit') return; if (edit(run, { type: 'remove', x: cursor.x, z: cursor.z })) { hintGhost = null; queueEvents([{ type: 'remove', x: cursor.x, z: cursor.z, text: '선택한 칸을 비웠습니다.' }]); renderPlay(); } }
  function undo() { if (run?.status === 'edit' && edit(run, { type: 'undo' })) { hintGhost = null; queueEvents([{ type: 'undo', x: cursor.x, z: cursor.z, text: '이전 배치로 되돌렸습니다.' }]); renderPlay(); } }
  function showHint() { if (!run || !['edit', 'failed'].includes(run.status)) return; const result = hint(run); if (result && Number.isInteger(result.x)) { hintGhost = result; const text = result.extra ? `여분 관이 ${result.x + 1}, ${result.z + 1}칸에 있습니다. 표시된 칸을 선택한 뒤 제거/Backspace로 지우십시오.` : `힌트: ${result.x + 1}, ${result.z + 1}칸에 ${toolName(result.kind)}이 필요합니다.`; queueEvents([{ type: 'hint', x: result.x, z: result.z, text }]); } else queueEvents([{ type: 'hint', text: '모든 부품이 맞습니다. 실행을 시작해 물길을 확인하십시오.' }]); renderPlay(); }
  function moveCursor(dx, dz) { if (!run || run.status !== 'edit') return; cursor.x = Math.max(0, Math.min(RULES.gridSize - 1, cursor.x + dx)); cursor.z = Math.max(0, Math.min(RULES.gridSize - 1, cursor.z + dz)); renderPlay(); }
  function frame(now) { const dt = Math.min(RULES.maxDt || .05, Math.max(0, (now - lastFrame) / 1000)); lastFrame = now; let events = eventQueue.splice(0); if (screen === 'play' && run?.status === 'running') { accumulator += dt; let loops = 0; while (accumulator >= 1 / 60 && loops < 8) { const result = step(run, 1 / 60) || []; if (Array.isArray(result)) events.push(...result); accumulator -= 1 / 60; loops++; } if (events.length) processEvents(events); audio?.update?.(run, dt); } else { accumulator = 0; if (events.length) processEvents(events); } scene?.update?.(run, screen === 'play' ? dt : 0, { screen, levelId: run?.levelId || selectedLevel, cursor, tool, rotation, hint: hintGhost, events }); if (screen === 'play') { renderPlay(); renderToolLabels(); syncRunButtons(); } requestAnimationFrame(frame); }
  function keydown(event) {
    const key = event.key.toLowerCase(), form = ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName);
    if (key === 'm' && !event.repeat && !form) { settings.muted = !settings.muted; saveSettings(); audio?.setMuted?.(settings.muted); render(); return; }
    if (screen === 'play' && run) {
      if (keyActions.has(key) && run.status === 'edit') { const action = keyActions.get(key); moveCursor(action === 'left' ? -1 : action === 'right' ? 1 : 0, action === 'up' ? -1 : action === 'down' ? 1 : 0); event.preventDefault(); return; }
      if (!event.repeat && /^[1-4]$/.test(key) && run.status === 'edit') { const candidate = tools[Number(key) - 1]; if ((run.unlockedTools || level(run.levelId).unlockedTools).includes(candidate)) { tool = candidate; renderPlay(); } event.preventDefault(); return; }
      if (!event.repeat && key === 'r' && run.status === 'edit') { rotation = (rotation + 1) % 4; renderPlay(); event.preventDefault(); return; }
      if (!event.repeat && key === ' ' && run.status === 'edit') { placeAt(); event.preventDefault(); return; }
      if (!event.repeat && key === 'backspace' && run.status === 'edit') { removeAt(); event.preventDefault(); return; }
      if (!event.repeat && key === 'z' && run.status === 'edit') { undo(); event.preventDefault(); return; }
      if (!event.repeat && key === 'h' && ['edit', 'failed'].includes(run.status)) { showHint(); event.preventDefault(); return; }
      if (!event.repeat && key === 'escape') { pausePlay(); event.preventDefault(); return; }
      if (!event.repeat && key === 'enter') { if (run.status === 'running') { stop(run); queueEvents([{ type: 'stop', text: '편집으로 돌아왔습니다.' }]); } else if (run.status === 'failed') returnToEdit(); else if (run.status === 'edit') { if (start(run)) queueEvents([{ type: 'start', text: '물이 흐르기 시작했습니다.' }]); } renderPlay(); event.preventDefault(); return; }
    }
    if (!event.repeat && key === 'escape') { if (screen === 'select') setScreen('title'); else if (screen === 'guide') setScreen(guideReturn); else if (screen === 'pause') setScreen(previousScreen === 'play' && run ? 'play' : 'title'); event.preventDefault(); return; }
    if (!event.repeat && key === 'enter') { if (screen === 'title' && !sceneError) setScreen('select'); else if (screen === 'select') begin(); else if (screen === 'won') nextLevel(); else if (screen === 'ending') setScreen('title'); event.preventDefault(); }
  }
  function nextLevel() { const index = levelIds().indexOf(run?.levelId); if (index >= 0 && index < LEVELS.length - 1) begin(levelIds()[index + 1]); else { run = null; setScreen('ending'); } }
  function returnToEdit() { if (!run) return; if (run.status === 'failed' || run.status === 'running') stop(run); setScreen('play'); renderPlay(); }
  function navigateSelect(event) { if (screen !== 'select' || event.repeat || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) return; if (!['arrowleft', 'arrowup', 'arrowright', 'arrowdown'].includes(event.key.toLowerCase())) return; const list = levelIds().filter(unlocked), index = Math.max(0, list.indexOf(selectedLevel)), direction = ['arrowleft', 'arrowup'].includes(event.key.toLowerCase()) ? -1 : 1; if (list.length) { selectedLevel = list[(index + direction + list.length) % list.length]; renderSelect(); } event.preventDefault(); }
  function handleFailedKey(event) { if (!event.repeat && screen === 'failed' && event.key.toLowerCase() === 'enter') { returnToEdit(); event.preventDefault(); } }
  function pointer(event) {
    if (event.type === 'pointerdown' && screen === 'play' && run?.status === 'edit' && event.target.closest?.('#world')) { pointerStart.set(event.pointerId, { x: event.clientX, y: event.clientY, type: event.pointerType }); event.target.setPointerCapture?.(event.pointerId); event.preventDefault(); return; }
    if (event.type === 'pointerup' && pointerStart.has(event.pointerId)) { const startPoint = pointerStart.get(event.pointerId); pointerStart.delete(event.pointerId); if (screen !== 'play' || run?.status !== 'edit') return; const picked = scene?.pick?.(event.clientX, event.clientY); if (picked) { cursor = { x: picked.x, z: picked.z }; if (startPoint.type !== 'touch' && Math.hypot(event.clientX - startPoint.x, event.clientY - startPoint.y) < 16) placeAt(cursor.x, cursor.z); renderPlay(); } event.preventDefault(); }
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') pointerStart.delete(event.pointerId);
  }
  function click(event) {
    const levelButton = event.target.closest?.('[data-level-id]'); if (levelButton && !levelButton.disabled) { selectedLevel = levelButton.dataset.levelId; renderSelect(); return; }
    const toolButton = event.target.closest?.('[data-tool]'); if (toolButton && !toolButton.disabled) { tool = toolButton.dataset.tool; renderPlay(); return; }
    const button = event.target.closest?.('[data-action]'); if (!button || button.disabled) return; const action = button.dataset.action;
    if (action === 'start') setScreen('select'); else if (action === 'continue') continueCampaign(); else if (action === 'begin') begin(); else if (action === 'next') nextLevel(); else if (action === 'retry') returnToEdit(); else if (action === 'resume') setScreen(previousScreen === 'play' && run ? 'play' : 'title'); else if (action === 'pause') pausePlay(); else if (action === 'guide') { guideReturn = screen; setScreen('guide'); } else if (action === 'back') setScreen(screen === 'guide' ? guideReturn : ['pause', 'won', 'failed'].includes(screen) ? 'select' : 'title'); else if (action === 'run' && run?.status === 'edit') { if (start(run)) queueEvents([{ type: 'start', text: '물이 흐르기 시작했습니다.' }]); renderPlay(); } else if (action === 'stop' && run?.status === 'running') { stop(run); queueEvents([{ type: 'stop', text: '편집으로 돌아왔습니다.' }]); renderPlay(); } else if (action === 'rotate' && run?.status === 'edit') { rotation = (rotation + 1) % 4; renderPlay(); } else if (action === 'place') placeAt(); else if (action === 'remove') removeAt(); else if (action === 'undo') undo(); else if (action === 'hint') showHint(); else if (action === 'mute') { settings.muted = !settings.muted; saveSettings(); audio?.setMuted?.(settings.muted); render(); }
  }
  function boot() {
    try { scene = createScene(document.getElementById('world')); scene.resize?.(); } catch (error) { sceneError = error; console.error(error); const banner = document.getElementById('error-banner'); banner.hidden = false; banner.textContent = '3D 정원을 초기화하지 못했습니다. 그래픽 가속을 확인해 주십시오.'; }
    try { audio = createAudio(); audio.setVolume?.(settings.volume); audio.setMuted?.(settings.muted); } catch (error) { console.error(error); audio = null; }
    document.getElementById('volume-range').addEventListener('input', event => { settings.volume = Math.max(0, Math.min(1, Number(event.target.value) || 0)); saveSettings(); audio?.setVolume?.(settings.volume); });
    document.addEventListener('keydown', keydown); document.addEventListener('keydown', navigateSelect); document.addEventListener('keydown', handleFailedKey); document.addEventListener('click', click); document.addEventListener('pointerdown', pointer, { passive: false }); document.addEventListener('pointerup', pointer, { passive: false }); document.addEventListener('pointercancel', pointer, { passive: false }); document.addEventListener('lostpointercapture', pointer, { passive: false });
    window.addEventListener('blur', () => { clearHeld(); if (screen === 'play' && run && run.status === 'running') pausePlay(); }); document.addEventListener('visibilitychange', () => { if (document.hidden) { clearHeld(); if (screen === 'play' && run && run.status === 'running') pausePlay(); } }); window.addEventListener('resize', () => scene?.resize?.());
    Object.defineProperty(window, '__rain', { configurable: false, enumerable: true, get: () => ({ get ready() { return !sceneError; }, get screen() { return screen; }, get run() { return copy(run); }, get settings() { return copy(settings); }, get records() { return copy(records); }, get selection() { return { levelId: selectedLevel, cursor: copy(cursor), tool, rotation }; }, get sceneStats() { return copy(scene?.stats || {}); }, projectTile(x, z) { return copy(scene?.project?.(x, z)); } }) });
    render(); requestAnimationFrame(frame);
  }
  boot();
})();
