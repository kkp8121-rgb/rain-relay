const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { root, artifacts, setup, audioEvidence, save } = require('./browser-tools.cjs');
const { ready, snapshot, frames, place } = require('./play-helpers.cjs');

(async () => {
  const { LEVELS } = await import(pathToFileURL(path.join(root, 'src/data.js')).href);
  const records = JSON.parse(fs.readFileSync(path.join(artifacts, 'campaign-report.json'))).records;
  const results = [];
  for (const mode of [{ name: 'software', angle: 'swiftshader', throttle: 1 }, { name: 'software-4x', angle: 'swiftshader', throttle: 4 }, { name: 'hardware', angle: 'd3d11', throttle: 1 }]) {
    const env = await setup({}, { args: [`--use-angle=${mode.angle}`] });
    try {
      const p = env.page;
      await p.addInitScript(records => localStorage.setItem('rain-records-v1', JSON.stringify(records)), records);
      await ready(p, env.url); await p.keyboard.press('Enter');
      await p.locator(`[data-level-id="${LEVELS[5].id}"]`).click();
      await p.locator('[data-action="begin"]').click();
      for (const tile of LEVELS[5].solution) await place(p, tile);
      assert.equal((await snapshot(p)).run.cost, LEVELS[5].par);
      const cdp = await env.context.newCDPSession(p);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: mode.throttle });
      await p.keyboard.press('Enter'); await frames(p, 30);
      await p.evaluate(() => { window.__audioEvidence.frames = []; });
      await frames(p, 300);
      const evidence = await audioEvidence(p), state = await snapshot(p);
      assert.ok(evidence.frames >= 90 && evidence.averageMs > 0 && evidence.p95Ms > 0);
      const session = await env.browser.newBrowserCDPSession();
      const { gpu } = await session.send('SystemInfo.getInfo');
      const renderer = gpu.auxAttributes?.glRenderer || gpu.devices.map(device => device.deviceString).join(', ');
      assert.equal(state.scene.software, mode.name !== 'hardware');
      await p.screenshot({ path: path.join(artifacts, `performance-${mode.name}.png`) });
      assert.deepEqual(env.errors, []); assert.deepEqual(env.failed, []); assert.deepEqual(env.consoleErrors, []);
      results.push({ mode: mode.name, throttle: mode.throttle, renderer, scene: state.scene, evidence });
      console.log(JSON.stringify(results.at(-1)));
    } finally { await env.close(); }
  }
  save('performance-report.json', { generatedAt: new Date().toISOString(), results });
})().catch(error => { console.error(error); process.exitCode = 1; });
