// H5 性能验收：模拟中端手机（CPU 4x 降速 + 高 DPR + 大地图 145 怪）
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync('.tmp-h5', { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 393, height: 852, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

  await page.goto('http://127.0.0.1:8123/index.html?perf=1', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.game, { timeout: 20000 });
  await sleep(1200);
  // 模拟中端机 CPU（页面加载完再降速，避免脚本超时）
  const client = await page.createCDPSession();
  await client.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.evaluate(() => {
    const g = window.game;
    g.perf.enabled = true;
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('tutorialOffer').classList.add('hidden');
    g.difficultyIdx = 4; // 困难2：41x35 / 145 怪
    g.hideStartScreen();
    g.initLevel(1);
    g.state = 'PLAYING';
  });
  await sleep(7000);

  const m = await page.evaluate(() => {
    const g = window.game;
    const c = document.getElementById('gameCanvas');
    return {
      fps: Math.round(g.perf.fps),
      updateMs: +g.perf.updateMs.toFixed(2),
      drawMs: +g.perf.drawMs.toFixed(2),
      enemies: g.enemies.length,
      map: g.mapCols + 'x' + g.mapRows,
      canvasPix: c.width + 'x' + c.height,
      canvasCss: c.clientWidth + 'x' + c.clientHeight,
      particles: g.particles.length,
      explosions: g.explosions.length,
    };
  });
  const metrics = await page.metrics();
  m.jsHeapMB = +(metrics.JSHeapUsedSize / 1048576).toFixed(1);
  console.log(JSON.stringify(m, null, 2));
  await page.screenshot({ path: '.tmp-h5/perf-hard2.png' });
  await browser.close();
})();
