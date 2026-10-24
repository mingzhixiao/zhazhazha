// H5 适配回归验证：竖屏角落角色、爆炸、大地图、横屏、逻辑布阵
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function newPage(browser, w, h, dpr) {
  const p = await browser.newPage();
  await p.setViewport({ width: w, height: h, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  return p;
}

async function enterGame(p, diff = 0) {
  await p.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle2' });
  await p.evaluate((d) => {
    if (d !== 0) document.getElementById('startDiffPill').click();
  }, diff);
  await sleep(300);
  if (diff !== 0) {
    await p.evaluate((d) => {
      const b = document.querySelector(`#sheetDiffList button[data-diff="${d}"]`);
      if (b) b.click();
    }, diff);
    await sleep(400);
  }
  await p.evaluate(() => document.getElementById('startGameBtn').click());
  await sleep(400);
  await p.evaluate(() => { const b = document.getElementById('tutorialSkipOfferBtn'); if (b) b.click(); });
  await sleep(1800);
}

fs.mkdirSync('.tmp-h5', { recursive: true });

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  const out = {};
  const errs = [];

  // 1. 竖屏：把玩家放到右上角可玩格，检查是否被裁
  {
    const p = await newPage(browser, 393, 852, 3);
    p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    await enterGame(p);
    await p.evaluate(() => {
      const g = window.game;
      g.player.x = (g.mapCols - 2.5) * 60;
      g.player.y = (1.5) * 60;
      g.player.invincibleTimer = 99999;
    });
    await sleep(600);
    await p.screenshot({ path: '.tmp-h5/v1-corner.png' });
    out.corner = await p.evaluate(() => {
      const g = window.game;
      const c = document.getElementById('gameCanvas');
      const b = c.getBoundingClientRect();
      const w = document.getElementById('canvasWrapper').getBoundingClientRect();
      const zoom = c.width / (13 * 60);
      const px = ((g.player.x) * (b.width / c.width));
      return {
        playerScreenX: Math.round(b.left + px),
        wrapperLeft: Math.round(w.left),
        wrapperRight: Math.round(w.right),
        crop: document.body.classList.contains('board-crop'),
        canvasPix: c.width + 'x' + c.height,
      };
    });

    // 2. 爆炸：在玩家旁边放弹
    await p.evaluate(() => window.game.placeBomb());
    for (let i = 0; i < 60; i++) {
      const n = await p.evaluate(() => window.game.explosions.length);
      if (n > 0) break;
      await sleep(50);
    }
    await sleep(80);
    await p.screenshot({ path: '.tmp-h5/v2-boom.png' });
    out.boom = await p.evaluate(() => ({ explosions: window.game.explosions.length }));

    // 3. 大地图（困难2）：不应加 board-crop
    await p.evaluate(() => {
      const g = window.game;
      g.difficultyIdx = 4;
      g.hideStartScreen();
      g.initLevel(1);
      g.state = 'PLAYING';
    });
    await sleep(1200);
    await p.screenshot({ path: '.tmp-h5/v3-hard2.png' });
    out.hard2 = await p.evaluate(() => ({
      crop: document.body.classList.contains('board-crop'),
      map: window.game.mapCols + 'x' + window.game.mapRows,
      canvasPix: document.getElementById('gameCanvas').width + 'x' + document.getElementById('gameCanvas').height,
    }));
    await p.close();
  }

  // 4. 横屏 moba
  {
    const p = await newPage(browser, 852, 393, 3);
    p.on('pageerror', (e) => errs.push('PAGEERROR(land) ' + e.message));
    await enterGame(p);
    await sleep(800);
    await p.screenshot({ path: '.tmp-h5/v4-landscape.png' });
    out.landscape = await p.evaluate(() => ({
      moba: document.body.classList.contains('moba-mode'),
      crop: document.body.classList.contains('board-crop'),
      canvas: document.getElementById('gameCanvas').clientWidth + 'x' + document.getElementById('gameCanvas').clientHeight,
      stageBg: getComputedStyle(document.getElementById('stageArea')).backgroundImage.slice(0, 30),
    }));
    await p.close();
  }

  // 5. 320 小屏
  {
    const p = await newPage(browser, 320, 568, 2);
    p.on('pageerror', (e) => errs.push('PAGEERROR(320) ' + e.message));
    await enterGame(p);
    await p.screenshot({ path: '.tmp-h5/v5-320.png' });
    out.small = await p.evaluate(() => {
      const c = document.getElementById('gameCanvas');
      const hud = document.getElementById('hudGrid');
      const cells = [...hud.children].map((e) => Math.round(e.getBoundingClientRect().top));
      return {
        crop: document.body.classList.contains('board-crop'),
        canvasCss: c.clientWidth + 'x' + c.clientHeight,
        hudRows: new Set(cells).size,
        bombBtn: Math.round(document.getElementById('btnPlaceBomb').getBoundingClientRect().width),
        overflow: [...document.querySelectorAll('button')].filter((b) => {
          const r = b.getBoundingClientRect();
          return r.width > 0 && (r.bottom > innerHeight + 1 || r.right > innerWidth + 1);
        }).length,
      };
    });
    await p.close();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log('ERRORS:', errs.length ? errs : 'none');
  await browser.close();
})();
