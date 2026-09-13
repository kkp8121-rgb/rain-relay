const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { setup, save, artifacts, audioEvidence } = require('./browser-tools.cjs');
const { ready, frames, begin, moveTo, place, snapshot } = require('./play-helpers.cjs');

const results = [];

async function scenario(name, options, body, launchOptions) {
  const result = { name, status: 'passed', errors: [], screenshots: [] };
  let env;
  try {
    env = await setup(options, launchOptions);
    await body(env, result);
    result.pageErrors = env.errors;
    result.consoleErrors = env.consoleErrors;
    result.failedRequests = env.failed;
    assert.deepEqual(env.errors, [], 'page errors');
    assert.deepEqual(env.failed, [], 'failed requests');
    const allowedConsoleErrors = result.allowedConsoleErrors || [];
    const unexpectedConsoleErrors = env.consoleErrors.filter(message => !allowedConsoleErrors.some(pattern => pattern.test(message)));
    assert.deepEqual(unexpectedConsoleErrors, [], 'unexpected console errors');
  } catch (error) {
    result.status = 'failed';
    result.errors.push(error?.stack || String(error));
    if (env?.page) {
      const filename = `interaction-${name}.png`;
      try { await env.page.screenshot({ path: path.join(artifacts, filename), fullPage: true }); result.screenshots.push(filename); } catch (_) {}
    }
  } finally {
    if (env) {
      try { await env.close(); } catch (error) { result.errors.push(`close: ${error.message}`); result.status = 'failed'; }
    }
    results.push(result);
  }
}

async function touchClient(context, page) {
  const client = await context.newCDPSession(page);
  return {
    async tap(x, y) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1, radiusX: 1, radiusY: 1, force: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(50);
    },
    async cancel(x, y) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 2, radiusX: 1, radiusY: 1, force: 1 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
      await page.waitForTimeout(50);
    },
    async close() { await client.detach().catch(() => {}); }
  };
}

async function tapButton(touch, page, selector) {
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box = await page.locator(selector).boundingBox();
  assert.ok(box, `button is visible: ${selector}`);
  await touch.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function project(page, x, z) {
  await frames(page, 2);
  const point = await page.evaluate(({ x, z }) => window.__rain.projectTile(x, z), { x, z });
  assert.ok(point && Number.isFinite(point.x) && Number.isFinite(point.y), `projectTile(${x},${z})`);
  return point;
}

async function startByTouch(env, touch, levelId = null) {
  const { page } = env;
  await page.goto(env.url);
  await page.waitForFunction(() => window.__rain?.ready);
  await tapButton(touch, page, '#title-screen [data-action="start"]');
  await page.waitForFunction(() => window.__rain.screen === 'select');
  if (levelId) await tapButton(touch, page, `#select-screen [data-level-id="${levelId}"]`);
  await tapButton(touch, page, '#select-screen [data-action="begin"]');
  await page.waitForFunction(() => window.__rain.screen === 'play' && window.__rain.run?.status === 'edit');
}

async function controlGeometry(page) {
  return page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const buttons = [...document.querySelectorAll('button')].filter(node => !node.hidden && node.offsetParent && !node.disabled);
    const controls = buttons.map(node => {
      const rect = node.getBoundingClientRect();
      const center = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { selector: node.dataset.action || node.dataset.tool || node.id || node.textContent.trim().slice(0, 20), width: rect.width, height: rect.height, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, centerContained: center === node || node.contains(center) };
    });
    const hudSelectors = ['.play-header', '.board-card', '#cost-value', '#leak-value', '#supply-value', '#quota-list'];
    const hud = hudSelectors.map(selector => { const node = document.querySelector(selector), rect = node?.getBoundingClientRect(); return { selector, exists: !!node, visible: !!node && !!(rect.width && rect.height), left: rect?.left, top: rect?.top, right: rect?.right, bottom: rect?.bottom, scrollWidth: node?.scrollWidth, clientWidth: node?.clientWidth, scrollHeight: node?.scrollHeight, clientHeight: node?.clientHeight }; });
    const quotaRows = [...document.querySelectorAll('#quota-list .quota')].map((row, rowIndex) => {
      const rowRect = row.getBoundingClientRect();
      const children = [...row.querySelectorAll('span,b')].map(node => { const rect = node.getBoundingClientRect(); return { tag: node.tagName, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, clipped: rect.left < rowRect.left || rect.right > rowRect.right || rect.top < rowRect.top || rect.bottom > rowRect.bottom }; });
      const overlaps = children.length > 1 && Math.min(children[0].right, children[1].right) > Math.max(children[0].left, children[1].left) && Math.min(children[0].bottom, children[1].bottom) > Math.max(children[0].top, children[1].top);
      return { rowIndex, left: rowRect.left, top: rowRect.top, right: rowRect.right, bottom: rowRect.bottom, width: rowRect.width, height: rowRect.height, children, overlaps };
    });
    for (let i = 0; i < quotaRows.length; i += 1) for (let j = i + 1; j < quotaRows.length; j += 1) {
      const a = quotaRows[i], b = quotaRows[j];
      const overlap = Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top);
      if (overlap) { quotaRows[i].overlapsRows = true; quotaRows[j].overlapsRows = true; }
    }
    const intersections = [];
    for (let i = 0; i < hud.length; i += 1) for (let j = i + 1; j < hud.length; j += 1) {
      const a = hud[i], b = hud[j];
      if (!a.visible || !b.visible || a.selector === '.board-card' || b.selector === '.board-card' || a.selector === '.play-header' || b.selector === '.play-header') continue;
      if (Math.min(a.right, b.right) > Math.max(a.left, b.left) && Math.min(a.bottom, b.bottom) > Math.max(a.top, b.top)) intersections.push([a.selector, b.selector]);
    }
    return { viewport, controls, hud, intersections, quotaRows };
  });
}

async function mobileFlow(env, result, orientation, levelId = null, screenshotName = null) {
  const { page } = env;
  const touch = await touchClient(env.context, page);
  try {
    await startByTouch(env, touch, levelId);
    const before = await snapshot(page);
    const selectedPoint = await project(page, 1, 3);
    await touch.tap(selectedPoint.x, selectedPoint.y);
    await frames(page, 1);
    let state = await snapshot(page);
    assert.deepEqual(state.selection.cursor, { x: 1, z: 3 });
    assert.equal(state.run.cost, 0, 'touching a tile only selects it');

    await tapButton(touch, page, '#play-screen .touch-dock [data-action="place"]');
    state = await snapshot(page);
    assert.equal(state.run.cost, 1, 'touch place costs one part');
    assert.equal(state.run.board[1 + 3 * 7].kind, 'straight');
    await tapButton(touch, page, '#play-screen .touch-dock [data-action="rotate"]');
    state = await snapshot(page); assert.equal(state.selection.rotation, 2);
    await tapButton(touch, page, '#play-screen .touch-dock [data-action="remove"]');
    state = await snapshot(page); assert.equal(state.run.cost, 0); assert.equal(state.run.board[1 + 3 * 7], null);
    await tapButton(touch, page, '#play-screen .touch-dock [data-action="undo"]');
    state = await snapshot(page); assert.equal(state.run.cost, 1); assert.equal(state.run.board[1 + 3 * 7].kind, 'straight');
    const boardBeforeHint = JSON.stringify(state.run.board);
    await tapButton(touch, page, '#play-screen .touch-dock [data-action="hint"]');
    state = await snapshot(page); assert.equal(state.run.hintsUsed, 1); assert.equal(JSON.stringify(state.run.board), boardBeforeHint);

    const cancelPoint = await project(page, 2, 3);
    const costBeforeCancel = state.run.cost;
    await touch.cancel(cancelPoint.x, cancelPoint.y);
    state = await snapshot(page); assert.equal(state.run.cost, costBeforeCancel, 'pointercancel does not place');
    const fixedPoint = await project(page, 0, 3);
    await touch.tap(fixedPoint.x, fixedPoint.y); await frames(page, 1);
    state = await snapshot(page); assert.deepEqual(state.selection.cursor, { x: 0, z: 3 });
    await tapButton(touch, page, '#play-screen .touch-dock [data-action="place"]');
    state = await snapshot(page); assert.equal(state.run.cost, costBeforeCancel); assert.equal(state.run.board[3 * 7].fixed, true);

    const geometry = await controlGeometry(page);
    assert.ok(geometry.controls.length >= 6, `${orientation}: visible enabled controls`);
    for (const control of geometry.controls) {
      assert.ok(control.width >= 44 && control.height >= 44, `${orientation}:${control.selector} meets touch target`);
      assert.ok(control.left >= 0 && control.top >= 0 && control.right <= geometry.viewport.width && control.bottom <= geometry.viewport.height, `${orientation}:${control.selector} is in viewport`);
      assert.equal(control.centerContained, true, `${orientation}:${control.selector} center is clickable`);
    }
    assert.deepEqual(geometry.intersections, [], `${orientation}: HUD values do not overlap`);
    assert.equal(geometry.quotaRows.length, levelId ? 3 : 1, `${orientation}: expected quota rows`);
    for (const row of geometry.quotaRows) {
      assert.ok(row.width > 0 && row.height > 0, `${orientation}: quota row ${row.rowIndex} is visible`);
      assert.equal(row.overlaps, false, `${orientation}: quota row ${row.rowIndex} label/value do not overlap`);
      assert.notEqual(row.overlapsRows, true, `${orientation}: quota row ${row.rowIndex} does not overlap another row`);
      for (const child of row.children) assert.equal(child.clipped, false, `${orientation}: quota ${row.rowIndex} ${child.tag} is not clipped`);
    }
    for (const item of geometry.hud) if (item.visible) {
      assert.ok(item.left >= 0 && item.top >= 0 && item.right <= geometry.viewport.width && item.bottom <= geometry.viewport.height, `${orientation}:${item.selector} is in viewport`);
      assert.ok(item.scrollWidth <= item.clientWidth + 1 && item.scrollHeight <= item.clientHeight + 1, `${orientation}:${item.selector} is not clipped`);
    }
    const filename = screenshotName || `interaction-${orientation}.png`;
    await page.screenshot({ path: path.join(artifacts, filename), fullPage: true }); result.screenshots.push(filename);
    result.observed = { orientation, beforeCost: before.run.cost, afterCost: state.run.cost, selection: state.selection, geometry };
  } finally { await touch.close(); }
}

async function fixtureStorage(page, settings, records) {
  await page.addInitScript(({ settings, records }) => {
    try {
      if (sessionStorage.getItem('__rain_interaction_fixture') === '1') return;
      localStorage.setItem('rain-settings-v1', settings); localStorage.setItem('rain-records-v1', records);
      sessionStorage.setItem('__rain_interaction_fixture', '1');
    } catch (_) {}
  }, { settings, records });
}

(async () => {
  await scenario('mobile-portrait', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, (env, result) => mobileFlow(env, result, 'portrait'));
  await scenario('mobile-landscape', { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true }, (env, result) => mobileFlow(env, result, 'landscape'));
  await scenario('mobile-three-quotas', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, async (env, result) => {
    const reportPath = path.join(artifacts, 'campaign-report.json');
    assert.equal(fs.existsSync(reportPath), true, 'campaign report is required before interaction test');
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    const priorIds = ['first-dew', 'red-memory', 'sunlight-recipe', 'two-canals', 'crossing-rain'];
    const records = Object.fromEntries(priorIds.map(id => { assert.ok(report.records?.[id], `campaign record ${id}`); return [id, report.records[id]]; }));
    await fixtureStorage(env.page, JSON.stringify({ volume: .24, muted: false }), JSON.stringify(records));
    await mobileFlow(env, result, 'three-quotas', 'rain-without-clouds', 'interaction-three-quotas.png');
  });

  await scenario('desktop-state', {}, async (env, result) => {
    const { page } = env; await ready(page, env.url); await begin(page);
    const open = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [0, 1]];
    for (const [x, z] of open.slice(0, 7)) await place(page, { x, z, kind: 'straight', rot: 0 });
    let state = await snapshot(page); assert.equal(state.run.cost, 7);
    await moveTo(page, 0, 1); await page.keyboard.press('Space'); await frames(page, 1);
    state = await snapshot(page); assert.equal(state.run.cost, 7); assert.equal(state.run.board[7], null, 'desktop budget rejection is inert');
    const board = JSON.stringify(state.run.board);
    await page.locator('#play-screen .edit-dock [data-action="run"]:visible').click();
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.waitForFunction(() => window.__rain.screen === 'pause');
    assert.equal((await snapshot(page)).run.status, 'running', 'blur pauses observation without resetting simulation');
    await page.locator('#pause-screen [data-action="guide"]').click(); await page.waitForFunction(() => window.__rain.screen === 'guide');
    await page.locator('#guide-screen [data-action="back"]').click(); await page.waitForFunction(() => window.__rain.screen === 'pause');
    await page.locator('#pause-screen [data-action="resume"]').click(); await page.waitForFunction(() => window.__rain.screen === 'play');
    await page.locator('#play-screen .edit-dock [data-action="stop"]:visible').click(); await page.waitForFunction(() => window.__rain.run?.status === 'edit');
    state = await snapshot(page); assert.equal(JSON.stringify(state.run.board), board, 'stop preserves constructed network');
    result.observed = { cost: state.run.cost, status: state.run.status, screen: state.screen };
  });

  await scenario('extra-hint-select-and-remove', {}, async (env, result) => {
    const { page } = env; await ready(page, env.url); await begin(page);
    for (const x of [1, 2, 3, 4, 5]) await place(page, { x, z: 3, kind: 'straight', rot: 1 });
    await place(page, { x: 0, z: 0, kind: 'straight', rot: 0 });
    await page.keyboard.press('h'); await frames(page, 1);
    assert.equal((await snapshot(page)).run.hintsUsed, 1, 'extra-pipe hint increments hintsUsed');
    await moveTo(page, 0, 0); await page.keyboard.press('Backspace'); await frames(page, 1);
    assert.equal((await snapshot(page)).run.board[0], null, 'marked extra pipe is removed after selecting its cell');
    result.observed = { hintsUsed: (await snapshot(page)).run.hintsUsed, extraRemoved: true };
  });

  await scenario('storage-invalid', {}, async (env, result) => {
    await fixtureStorage(env.page, '{bad-json', JSON.stringify({ unknown: { cost: 1 }, 'first-dew': { grade: 'S', cost: -1, leaks: 0, hintsUsed: 0, elapsed: 2 } }));
    await ready(env.page, env.url);
    const state = await env.page.evaluate(() => ({ settings: window.__rain.settings, records: window.__rain.records }));
    assert.deepEqual(state.settings, { volume: .24, muted: false }); assert.deepEqual(state.records, {});
    result.observed = state;
  });

  await scenario('storage-valid-prefs', {}, async (env, result) => {
    await fixtureStorage(env.page, JSON.stringify({ volume: 0, muted: true }), JSON.stringify({}));
    await ready(env.page, env.url);
    let settings = await env.page.evaluate(() => window.__rain.settings); assert.deepEqual(settings, { volume: 0, muted: true });
    await begin(env.page); await moveTo(env.page, 1, 3); await env.page.keyboard.press('Space'); await frames(env.page, 2);
    const audio = await audioEvidence(env.page); assert.equal(audio.peak, 0, 'volume zero and mute suppress audio after actual placement');
    await env.page.keyboard.press('m');
    settings = await env.page.evaluate(() => window.__rain.settings); assert.deepEqual(settings, { volume: 0, muted: false });
    await env.page.reload(); await env.page.waitForFunction(() => window.__rain?.ready);
    assert.deepEqual(await env.page.evaluate(() => window.__rain.settings), { volume: 0, muted: false });
    result.observed = { settings: await env.page.evaluate(() => window.__rain.settings), audio };
  });

  await scenario('storage-throws', {}, async (env, result) => {
    await env.page.addInitScript(() => {
      try { Object.defineProperty(window, 'localStorage', { configurable: true, get() { throw new Error('storage blocked'); } }); }
      catch (_) { Storage.prototype.getItem = () => { throw new Error('storage blocked'); }; Storage.prototype.setItem = () => { throw new Error('storage blocked'); }; }
    });
    await env.page.goto(env.url); await env.page.waitForFunction(() => window.__rain);
    await env.page.keyboard.press('Enter'); await env.page.keyboard.press('Enter');
    await env.page.waitForFunction(() => window.__rain.screen === 'play' && window.__rain.run?.status === 'edit');
    await moveTo(env.page, 1, 3); await env.page.keyboard.press('Space'); await frames(env.page, 1);
    result.observed = { screen: await env.page.evaluate(() => window.__rain.screen), status: await env.page.evaluate(() => window.__rain.run.status), cost: await env.page.evaluate(() => window.__rain.run.cost), ready: await env.page.evaluate(() => window.__rain.ready) };
  });

  await scenario('no-audio', {}, async (env, result) => {
    await env.page.addInitScript(() => { window.AudioContext = undefined; window.webkitAudioContext = undefined; });
    await ready(env.page, env.url); await begin(env.page);
    await env.page.locator('#play-screen .edit-dock [data-action="run"]:visible').click();
    await env.page.waitForFunction(() => window.__rain.run?.status === 'running');
    await env.page.locator('#play-screen .edit-dock [data-action="stop"]:visible').click();
    result.observed = { screen: await env.page.evaluate(() => window.__rain.screen), status: await env.page.evaluate(() => window.__rain.run.status) };
  });

  await scenario('no-webgl', {}, async (env, result) => {
    await env.page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...args) { if (/webgl/i.test(kind)) return null; return getContext.call(this, kind, ...args); };
    });
    await env.page.goto(env.url); await env.page.waitForFunction(() => window.__rain);
    await env.page.waitForSelector('#error-banner:not([hidden])');
    assert.equal(await env.page.locator('#title-screen [data-action="start"]').isDisabled(), true);
    await env.page.keyboard.press('Enter'); await env.page.waitForTimeout(100); assert.equal(await env.page.evaluate(() => window.__rain.screen), 'title');
    result.allowedConsoleErrors = [/THREE\.WebGLRenderer.*Error creating WebGL context/i];
    result.observed = { ready: await env.page.evaluate(() => window.__rain.ready), errorVisible: await env.page.locator('#error-banner').isVisible() };
  });

  save('interaction-report.json', { generatedAt: new Date().toISOString(), results });
  const failed = results.filter(item => item.status !== 'passed');
  if (failed.length) { console.error(JSON.stringify({ failed }, null, 2)); process.exitCode = 1; }
  else console.log(JSON.stringify({ passed: results.length, report: path.join(artifacts, 'interaction-report.json') }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
