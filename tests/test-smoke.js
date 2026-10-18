const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const JS_FILES = ['js/rng.js', 'js/pure.js', 'js/config.js', 'js/audio.js', 'js/save.js', 'js/game.js'];

describe('冒烟：语法', () => {
    for (const f of JS_FILES) {
        it(`${f} 语法通过`, () => {
            execSync(`node --check ${path.join(ROOT, f)}`, { stdio: 'pipe' });
        });
    }
});

describe('冒烟：HTML 关键 ID 齐全', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const requiredIds = [
        'startScreen', 'startGameBtn', 'startDiffPill', 'startDiffName',
        'diffSheet', 'helpModal', 'careerPop', 'heroCanvas',
        'gameCanvas', 'overlayModal', 'modalActionBtn', 'shopModal',
        'joystickZone', 'btnPlaceBomb', 'btnDetonateRemote', 'btnMegaBomb',
        'topDiffSelect', 'btnSound', 'btnPause', 'btnRestart'
    ];
    for (const id of requiredIds) {
        it(`#${id} 存在`, () => {
            assert.ok(html.includes(`id="${id}"`), `index.html 缺少 id="${id}"`);
        });
    }
});

describe('冒烟：JS 引用的 DOM ID 在 HTML 中存在', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const js = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
    const ids = new Set([...js.matchAll(/getElementById\('([^']+)'\)/g)].map(m => m[1]));
    // 动态创建的 ID（document.createElement），不要求在 HTML 中预置
    const dynamicIds = new Set(['perfPanel']);
    const missing = [...ids].filter(id => !dynamicIds.has(id) && !html.includes(`id="${id}"`));
    it('无悬空 ID 引用', () => {
        assert.deepEqual(missing, [], `悬空 ID: ${missing.join(', ')}`);
    });
});

describe('冒烟：源码零 emoji', () => {
    const emojiRe = /[🀀-🫏☀-➿⬀-⯿]/u;
    for (const f of [...JS_FILES, 'index.html', 'css/style.css']) {
        it(`${f} 无 emoji`, () => {
            const content = fs.readFileSync(path.join(ROOT, f), 'utf8');
            assert.ok(!emojiRe.test(content), `${f} 发现 emoji`);
        });
    }
});

describe('冒烟：无运行时 CDN 硬依赖', () => {
    it('不加载 cdn.tailwindcss.com', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(!html.includes('cdn.tailwindcss.com'), '仍在用 Tailwind CDN');
    });
    it('引用构建后的 tailwind-built.css', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(html.includes('css/tailwind-built.css'), '缺少构建 CSS 引用');
        assert.ok(fs.existsSync(path.join(ROOT, 'css/tailwind-built.css')), '构建产物不存在');
    });
});

describe('冒烟：脚本加载顺序', () => {
    it('rng.js / pure.js 在 game.js 之前加载', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        const order = ['js/rng.js', 'js/pure.js', 'js/config.js', 'js/game.js']
            .map(s => html.indexOf(`src="${s}"`));
        assert.ok(order.every(i => i !== -1), '脚本标签缺失');
        assert.ok(order[0] < order[1] && order[1] < order[2] && order[2] < order[3], '脚本顺序错误');
    });
});
