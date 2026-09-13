const assert = require('node:assert/strict');
const snapshot = page => page.evaluate(() => ({ screen: window.__rain.screen, run: window.__rain.run, selection: window.__rain.selection, scene: window.__rain.sceneStats }));
async function ready(page, url) { await page.goto(url); await page.waitForFunction(() => window.__rain?.ready); }
async function frames(page, count = 1) {
  await page.evaluate(count => new Promise(resolve => { function frame() { if (--count <= 0) resolve(); else requestAnimationFrame(frame); } requestAnimationFrame(frame); }), count);
  return snapshot(page);
}
async function begin(page) {
  await page.keyboard.press('Enter');
  if ((await snapshot(page)).screen === 'select') await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__rain.screen === 'play' && window.__rain.run?.status === 'edit');
}
async function moveTo(page, x, z) {
  let state = await snapshot(page), cursor = state.selection.cursor;
  assert.ok(cursor && Number.isInteger(cursor.x) && Number.isInteger(cursor.z));
  for (let attempts = 0; (cursor.x !== x || cursor.z !== z) && attempts < 32; attempts++) {
    const key = cursor.x < x ? 'd' : cursor.x > x ? 'a' : cursor.z < z ? 's' : 'w';
    await page.keyboard.press(key); state = await frames(page, 1); cursor = state.selection.cursor;
  }
  assert.deepEqual(cursor, {x,z}, 'keyboard navigation reaches the requested cell');
  return state;
}
async function place(page, tile) {
  await moveTo(page, tile.x, tile.z);
  await page.keyboard.press(String(['straight','elbow','splitter','bridge'].indexOf(tile.kind) + 1));
  let selection = (await snapshot(page)).selection;
  for (let tries = 0; selection.rotation !== tile.rot && tries < 4; tries++) { await page.keyboard.press('r'); selection = (await snapshot(page)).selection; }
  assert.equal(selection.rotation, tile.rot);
  await page.keyboard.press('Space');
  const state = await frames(page, 1), actual = state.run.board[tile.z * 7 + tile.x];
  assert.ok(actual && actual.kind === tile.kind && actual.rot === tile.rot, `placement at ${tile.x},${tile.z}: ${JSON.stringify(actual)}`);
  return state;
}
module.exports = { snapshot, ready, frames, begin, moveTo, place };
