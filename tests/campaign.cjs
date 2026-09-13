const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const crypto = require('node:crypto');
const { root, artifacts, setup, audioEvidence, save } = require('./browser-tools.cjs');
const { snapshot, ready, begin, frames, place } = require('./play-helpers.cjs');

(async () => {
  const { LEVELS } = await import(pathToFileURL(path.join(root, 'src/data.js')).href);
  const env = await setup({}, { args: ['--use-angle=d3d11'] }), { page } = env;
  const report = { bundleSHA256: crypto.createHash('sha256').update(fs.readFileSync(path.join(root, 'game.js'))).digest('hex'), levels: [] };
  try {
    await ready(page, env.url); await begin(page);
    for (const level of LEVELS) {
      assert.equal((await snapshot(page)).run.levelId, level.id);
      for (const tile of level.solution) await place(page, tile);
      assert.equal((await snapshot(page)).run.cost, level.par);
      await page.screenshot({ path: path.join(artifacts, `${level.id}-network.png`) });
      await page.keyboard.press('Enter'); await frames(page, 20);
      await page.screenshot({ path: path.join(artifacts, `${level.id}-flow.png`) });
      await page.waitForFunction(() => ['won','failed'].includes(window.__rain.run?.status), null, { timeout: 45000 });
      const state = await snapshot(page); assert.equal(state.run.status, 'won', `${level.id}: ${state.run.feedback}`);
      report.levels.push({ id: level.id, cost: state.run.cost, elapsed: state.run.elapsed, leaks: state.run.leaks, received: state.run.received, spawned: state.run.spawned });
      console.log(JSON.stringify(report.levels.at(-1))); await page.screenshot({ path: path.join(artifacts, `${level.id}-won.png`) });
      await page.keyboard.press('Enter'); await frames(page, 2);
    }
    assert.equal((await snapshot(page)).screen, 'ending');
    report.audio = await audioEvidence(page); report.records = await page.evaluate(() => window.__rain.records);
    assert.equal(Object.keys(report.records).length, 6); assert.ok(Object.values(report.records).every(record => record.grade === 'S'));
    await page.screenshot({ path: path.join(artifacts, 'ending.png') });
    await page.reload(); await page.waitForFunction(() => window.__rain?.ready); assert.deepEqual(await page.evaluate(() => window.__rain.records), report.records);
    assert.deepEqual(env.errors, []); assert.deepEqual(env.failed, []); assert.deepEqual(env.consoleErrors, []);
    save('campaign-report.json', report); console.log(JSON.stringify(report));
  } finally { await env.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
