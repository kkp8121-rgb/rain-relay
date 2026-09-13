const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { root, artifacts, setup, audioEvidence, save } = require('./browser-tools.cjs');
const { snapshot, ready, frames, begin, place } = require('./play-helpers.cjs');

(async () => {
  const results = [];
  for (const location of ['file', 'subpath']) {
    const env = await setup();
    try {
      const p = env.page; await ready(p, location === 'file' ? pathToFileURL(path.join(root, 'index.html')).href : env.url);
      await p.screenshot({ path: path.join(artifacts, `${location}-title.png`) }); await begin(p);
      const initial = await snapshot(p); assert.equal(initial.run.cost, 0);
      await place(p, {x:1,z:3,kind:'straight',rot:1}); assert.equal((await snapshot(p)).run.cost, 1);
      await p.keyboard.press('z'); assert.equal((await snapshot(p)).run.cost, 0);
      await place(p, {x:1,z:3,kind:'straight',rot:1});
      await p.evaluate(() => { const copy = window.__rain.run; copy.cost = 9999; copy.board[22] = null; });
      assert.equal((await snapshot(p)).run.cost, 1); assert.ok((await snapshot(p)).run.board[22]);
      await p.screenshot({ path: path.join(artifacts, `${location}-edit.png`) });
      await p.keyboard.press('Enter'); await frames(p, 10); assert.equal((await snapshot(p)).run.status, 'running');
      await p.keyboard.press('Escape'); const frozen = JSON.stringify((await snapshot(p)).run); await frames(p, 8); assert.equal(JSON.stringify((await snapshot(p)).run), frozen);
      await p.locator('#pause-screen [data-action="guide"]').click(); await p.locator('#guide-screen [data-action="back"]').click(); assert.equal((await snapshot(p)).screen, 'pause');
      assert.ok((await audioEvidence(p)).states.every(state => state === 'suspended'));
      await p.keyboard.press('Escape'); await frames(p, 12); const audio = await audioEvidence(p); assert.ok(audio.peak > .0001);
      await p.keyboard.press('m'); await frames(p, 15); await p.evaluate(() => { window.__audioEvidence.peak = 0; }); await frames(p, 12); const muted = (await audioEvidence(p)).peak; assert.ok(muted < .00001);
      await p.waitForFunction(() => window.__rain.run?.status === 'failed'); const failed = (await snapshot(p)).run;
      assert.equal(failed.leaks, 3); await p.keyboard.press('Enter'); await frames(p, 2); assert.equal((await snapshot(p)).run.status, 'edit'); assert.equal((await snapshot(p)).run.cost, 1);
      await p.keyboard.press('h'); assert.equal((await snapshot(p)).run.hintsUsed, 1); assert.equal((await snapshot(p)).run.cost, 1);
      const images = await p.evaluate(() => Promise.all(['assets/key-art.webp', 'assets/portraits.webp'].map(src => new Promise((resolve, reject) => {
        const img = new Image(); img.onload = () => resolve({ src, width: img.naturalWidth, height: img.naturalHeight }); img.onerror = () => reject(new Error(src)); img.src = src;
      }))));
      assert.deepEqual(images.map(img => [img.width, img.height]), [[1536,1024],[1254,1254]]);
      const expectedOrigin = new URL(p.url()).origin;
      const external = env.requests.filter(url => !url.startsWith('data:') && new URL(url).origin !== expectedOrigin);
      assert.deepEqual(external, []);
      assert.deepEqual(env.errors, []); assert.deepEqual(env.failed, []); assert.deepEqual(env.consoleErrors, []);
      results.push({ location, url: p.url(), failedAt: failed.elapsed, leaks: failed.leaks, audio, muted, images, external, scene: (await snapshot(p)).scene });
    } finally { await env.close(); }
  }
  save('browser-report.json', { generatedAt: new Date().toISOString(), results }); console.log(JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
