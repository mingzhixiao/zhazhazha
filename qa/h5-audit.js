// H5 移动端适配体检：多机型 × (首页 / 关卡页 / 横屏)
// 输出：尺寸、布局指标、可点区域尺寸、溢出/遮挡、控制台错误
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const DEVICES = [
  { name: 'se-375x667', w: 375, h: 667, dpr: 2 },
  { name: 'small-320x568', w: 320, h: 568, dpr: 2 },
  { name: 'android-360x640', w: 360, h: 640, dpr: 3 },
  { name: 'android-360x800', w: 360, h: 800, dpr: 3 },
  { name: 'ip14-393x852', w: 393, h: 852, dpr: 3 },
  { name: 'plus-430x932', w: 430, h: 932, dpr: 3 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const out = process.argv[2] || '.tmp-h5';
  fs.mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const report = {};

  for (const d of DEVICES) {
    const page = await browser.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !/vibrate|AudioContext/i.test(m.text())) errs.push('CONSOLE ' + m.text().slice(0, 120));
    });
    await page.setViewport({ width: d.w, height: d.h, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle2' });
    await sleep(900);
    await page.screenshot({ path: `${out}/${d.name}-home.png` });

    const home = await page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const cs = getComputedStyle(document.documentElement);
      return {
        appH: cs.getPropertyValue('--app-h').trim(),
        innerH: window.innerHeight,
        scrollH: document.documentElement.scrollHeight,
        overflowY: document.documentElement.scrollHeight - window.innerHeight,
        title: box('.start-title'),
        hero: box('#heroCanvas'),
        startBtn: box('#startGameBtn'),
        diffPill: box('#startDiffPill'),
        bestLine: box('#startBestLine'),
        topIcons: box('.start-top'),
        logicBtn: box('#startLogicBtn'),
      };
    });

    // 进入关卡
    await page.evaluate(() => document.getElementById('startGameBtn').click());
    await sleep(350);
    await page.evaluate(() => { const b = document.getElementById('tutorialSkipOfferBtn'); if (b) b.click(); });
    await sleep(1900);
    await page.screenshot({ path: `${out}/${d.name}-level.png` });

    const level = await page.evaluate(() => {
      const box = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
      };
      const vis = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return 'missing';
        const s = getComputedStyle(el);
        return s.display === 'none' || s.visibility === 'hidden' ? 'hidden' : 'shown';
      };
      const c = document.getElementById('gameCanvas');
      const g = window.game;
      // 找出所有超出视口的元素（可点交互元素）
      const overflow = [];
      document.querySelectorAll('button').forEach((b) => {
        const r = b.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) return;
        if (r.bottom > window.innerHeight + 1 || r.right > window.innerWidth + 1 || r.left < -1 || r.top < -1) {
          overflow.push(`${b.id || b.className.slice(0, 20)} bottom=${Math.round(r.bottom)}/${window.innerHeight}`);
        }
      });
      return {
        header: box('#topHeader'),
        stage: box('#stageArea'),
        footer: box('#bottomFooter'),
        canvasCss: [c.clientWidth, c.clientHeight],
        canvasPix: [c.width, c.height],
        joystick: vis('#joystickContainer'),
        joystickBox: box('#joystickZone'),
        dpad: vis('#dpadContainer'),
        placeBomb: box('#btnPlaceBomb'),
        detonate: box('#btnDetonateRemote'),
        mega: box('#btnMegaBomb'),
        hud: box('#hudBar') || box('#topHeader'),
        mapCols: g ? g.mapCols : null,
        overflow,
      };
    });

    // 横屏
    await page.setViewport({ width: d.h, height: d.w, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    await sleep(900);
    await page.screenshot({ path: `${out}/${d.name}-landscape.png` });
    const landscape = await page.evaluate(() => {
      const c = document.getElementById('gameCanvas');
      return { canvasCss: [c.clientWidth, c.clientHeight], canvasPix: [c.width, c.height], innerH: window.innerHeight };
    });

    report[d.name] = { dpr: d.dpr, home, level, landscape, errs };
    await page.close();
  }

  console.log(JSON.stringify(report, null, 2));
  await browser.close();
})();
