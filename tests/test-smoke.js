const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const JS_FILES = [
    'js/rng.js', 'js/pure.js', 'js/tutorial-core.js', 'js/config.js',
    'js/audio.js', 'js/save.js', 'js/ui.js', 'js/render.js',
    'js/enemy-skills.js', 'js/tutorial.js', 'js/game.js'
];

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
        'topDiffSelect', 'btnSound', 'btnPause', 'btnRestart',
        'confirmModal', 'confirmTitle', 'confirmDesc', 'confirmCancelBtn', 'confirmOkBtn',
        'shopNotice', 'megaLabel', 'feverLabel'
    ];
    for (const id of requiredIds) {
        it(`#${id} 存在`, () => {
            assert.ok(html.includes(`id="${id}"`), `index.html 缺少 id="${id}"`);
        });
    }
});

describe('冒烟：JS 引用的 DOM ID 在 HTML 中存在', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const js = JS_FILES.map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
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

describe('防回归：敌人循环内数组被替换（新手复活清怪）不得崩溃', () => {
    it('updateEnemies 循环对 undefined 敌人有防御', () => {
        const src = fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
        const loopStart = src.indexOf('updateEnemies(dtScale)');
        assert.ok(loopStart > 0, '找不到 updateEnemies');
        // damagePlayer → 新手复活 clearEnemiesNearPlayer() 会整体替换 this.enemies，
        // 旧下标继续取值会得到 undefined（game.js:3370 animPhase 崩溃），必须防御
        const loopBody = src.slice(loopStart, loopStart + 1200);
        assert.ok(loopBody.includes('if (!e) continue;'), 'updateEnemies 缺少对 undefined 敌人的防御');
    });
});

describe('防回归：炸弹链式引爆与主循环健壮性', () => {
    const src = () => fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');

    it('updateBombsAndExplosions 对链式引爆后的失效下标有防御', () => {
        const code = src();
        const start = code.indexOf('updateBombsAndExplosions(dtScale) {');
        assert.ok(start > 0, '找不到 updateBombsAndExplosions');
        const body = code.slice(start, start + 4000);
        // detonateBomb 会一次移除多颗炸弹（冰冻弹被普通弹波及），旧下标可能 undefined
        assert.ok(body.includes('if (!b) continue;'), '缺少对 undefined 炸弹的防御');
        assert.ok(body.includes('i = Math.min(i, this.bombs.length);'), '链式引爆后未夹紧下标');
    });

    it('主循环 loop 用 try/finally 保证 rAF 不断链（单帧异常不卡死）', () => {
        const code = src();
        const start = code.indexOf('loop(timestamp) {');
        assert.ok(start > 0, '找不到 loop');
        const body = code.slice(start, start + 3200);
        assert.ok(body.includes('try {'), 'loop 缺少 try（单帧异常会让 rAF 断链，游戏永久卡死）');
        assert.ok(/finally\s*\{[\s\S]*requestAnimationFrame/.test(body), 'rAF 必须放在 finally 中');
    });

    it('FEVER 不再弹出遮挡面板的 FEVER TIME 提示条', () => {
        const code = src();
        assert.ok(!code.includes("showComboToast(' FEVER TIME!'"), 'FEVER TIME 中央提示条会遮挡面板，应移除');
    });

    it('MEGA BOMB 与超必杀就绪不再弹出遮挡棋盘面板的提示条', () => {
        const code = src();
        assert.ok(!code.includes("showComboToast(' MEGA BOMB!'"), 'MEGA BOMB 棋盘内提示条会遮挡面板，应移除');
        assert.ok(!code.includes("showComboToast(' 超必杀就绪!'"), '超必杀就绪棋盘内提示条会遮挡面板，应移除');
    });

    it('comboMeter 浮标不在棋盘中心移动区域弹出遮挡视野', () => {
        const code = src();
        const start = code.indexOf('updateComboMeter() {');
        assert.ok(start > 0, '找不到 updateComboMeter');
        const body = code.slice(start, start + 350);
        assert.ok(!body.includes("el.classList.remove('hidden')"), 'comboMeter 仍会在棋盘内显示，应隐藏');
    });

    it('关卡开场横幅贴顶展示（不在棋盘第2-4行活动区居中遮挡视野）', () => {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(!html.includes('top-[18%]'), 'levelBanner 仍位于 top-[18%] 棋盘活动格内遮挡走位');
        assert.ok(html.includes('top-1.5') || html.includes('top-2'), 'levelBanner 未贴顶放置于外墙位置');
    });

    it('小地图在 13x11 全景地图（含中等模式）下不绘制，且禁止跳帧绘制防频闪', () => {
        const code = src();
        const start = code.indexOf('drawMinimap() {');
        assert.ok(start > 0, '找不到 drawMinimap');
        const body = code.slice(start, start + 300);
        assert.ok(body.includes('this.mapCols <= 13'), '缺少对 13x11 单屏地图的拦截');
        assert.ok(!body.includes('this.difficultyIdx < 2'), '仍包含导致中等模式误显小地图的错误条件');
        assert.ok(!code.includes('this._minimapTick % 6'), '仍存在每 6 帧跳绘导致的频闪逻辑');
    });
});

describe('防回归：穿墙时间结束仍在木块内不得卡死', () => {
    const src = () => fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');

    it('isTileSolidForPlayer 计入 ghostExiting 允许玩家脱离木块', () => {
        const code = src();
        const start = code.indexOf('isTileSolidForPlayer(col, row, playerCol, playerRow) {');
        assert.ok(start > 0, '找不到 isTileSolidForPlayer');
        const body = code.slice(start, start + 600);
        assert.ok(body.includes('ghostExiting'), 'isTileSolidForPlayer 缺少 ghostExiting 判断');
    });

    it('updatePlayer 在穿墙结束且玩家仍处于木块内时启动脱离保护与兜底挤出', () => {
        const code = src();
        const start = code.indexOf('updatePlayer(dtScale) {');
        assert.ok(start > 0, '找不到 updatePlayer');
        const body = code.slice(start, start + 3000);
        assert.ok(body.includes('this.isPlayerInCrate'), 'updatePlayer 缺少木块重叠检测');
        assert.ok(body.includes('this.ejectPlayerFromCrate()'), 'updatePlayer 缺少超时兜底挤出');
        assert.ok(body.includes('ghostExiting = false'), '脱离木块后未解除脱离状态');
    });

    it('resetPlayerStats 初始化 ghostExiting 与 ghostExitGrace 字段', () => {
        const code = src();
        const start = code.indexOf('resetPlayerStats() {');
        assert.ok(start > 0, '找不到 resetPlayerStats');
        const body = code.slice(start, start + 600);
        assert.ok(body.includes('ghostExiting: false'), 'resetPlayerStats 缺少 ghostExiting 字段');
        assert.ok(body.includes('ghostExitGrace: 0'), 'resetPlayerStats 缺少 ghostExitGrace 字段');
    });
});

describe('防回归：game-dev-skills 游戏手感与系统优化（Game-Feel / Input-Systems / Audio-Design）', () => {
    const src = () => fs.readFileSync(path.join(ROOT, 'js/game.js'), 'utf8');
    const audioSrc = () => fs.readFileSync(path.join(ROOT, 'js/audio.js'), 'utf8');

    it('Game-Feel: 震屏采用二次方平滑创伤衰减模型（Trauma-based screen shake）', () => {
        const code = src();
        assert.ok(code.includes('this.trauma = Math.min(1.0'), 'addShake 缺少创伤累加');
        assert.ok(code.includes('this.trauma * this.trauma'), 'draw 缺少二次方震屏衰减计算');
    });

    it('Game-Feel: 关键打击与大招触发 Hit-Stop 顿帧强化打击感', () => {
        const code = src();
        assert.ok(code.includes('triggerHitStop'), '缺少 triggerHitStop 方法');
        assert.ok(code.includes('this.triggerHitStop(4);'), '受创未接入顿帧');
        assert.ok(code.includes('this.triggerHitStop(5);'), '全屏大招未接入顿帧');
        assert.ok(code.includes('if (this.hitStopFrames > 0)'), '主循环缺少 hitStop 冻结判断');
    });

    it('Game-Feel: 角色放炸弹与拾取道具具备 Squash & Stretch 弹性变形', () => {
        const code = src();
        assert.ok(code.includes('this.playerSquash = 0.25;'), '放炸弹缺少压扁弹性反馈');
        assert.ok(code.includes('this.playerSquash = -0.22;'), '拾取道具缺少拉伸弹性反馈');
        assert.ok(code.includes('actionSquash'), 'drawPlayer 缺少 squash 缩放应用');
    });

    it('Input-Systems: 放炸弹包含输入缓冲（Input Buffering），防止卡后摇丢键', () => {
        const code = src();
        assert.ok(code.includes('this.bombBufferTimer = 7;'), '炸弹上限或CD时缺少输入缓冲标记');
        assert.ok(code.includes('if (this.bombBufferTimer > 0)'), 'updatePlayer 缺少输入缓冲消耗逻辑');
    });

    it('Audio-Design: 核心音效支持随机微音调变化（Pitch Variation），消除机械重复感', () => {
        const code = audioSrc();
        assert.ok(code.includes('opts.pitchVary'), 'playNotes 缺少 pitchVary 支持');
        assert.ok(code.includes('playPlaceBomb') && code.includes('0.95 + Math.random() * 0.1'), '放炸弹缺少微随机音调');
        assert.ok(code.includes('playExplosion') && code.includes('0.94 + Math.random() * 0.12'), '爆炸音效缺少随机微颤');
    });
});


describe('冒烟：逻辑布阵独立玩法', () => {
    const html = fs.readFileSync(path.join(ROOT, 'logic-mode.html'), 'utf8');

    it('首页提供逻辑布阵入口', () => {
        const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
        assert.ok(index.includes('href="logic-mode.html"'), '首页缺少逻辑布阵入口');
    });

    it('页面自包含、不依赖运行时 CDN', () => {
        assert.ok(!html.includes('cdn.tailwindcss.com'), '逻辑布阵仍依赖 Tailwind CDN');
        assert.ok(!html.includes('<script src="http'), '逻辑布阵加载了外部脚本');
    });

    it('未锁定页面缩放（无障碍）', () => {
        assert.ok(!html.includes('user-scalable=no'), '逻辑布阵仍禁用页面缩放');
        assert.ok(!html.includes('maximum-scale=1.0'), '逻辑布阵仍锁定最大缩放');
    });

    it('提供返回主线入口', () => {
        assert.ok(html.includes('href="index.html"'), '逻辑布阵缺少返回首页链接');
    });
});

describe('冒烟：上线可用性', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    const logic = fs.readFileSync(path.join(ROOT, 'logic-mode.html'), 'utf8');

    it('主要弹层具备 dialog 语义与标题关联', () => {
        for (const [id, label] of [
            ['tutorialOffer', 'tutorialOfferTitle'],
            ['diffSheet', 'diffSheetTitle'],
            ['helpModal', 'helpModalTitle'],
            ['careerPop', 'careerPopTitle'],
            ['shopModal', 'shopTitle']
        ]) {
            assert.ok(html.includes(`id="${id}"`) && html.includes('aria-modal="true"'), `${id} 缺少 aria-modal`);
            assert.ok(html.includes(`aria-labelledby="${label}"`), `${id} 缺少 aria-labelledby`);
        }
    });

    it('移动端顶栏热区与商店滚动留白已生效', () => {
        assert.ok(css.includes(".header-util-btn { width: 36px; height: 36px; }"), '超窄屏热区未提升到 36px');
        assert.ok(css.includes('width: 40px;'), '移动端热区未提升到 40px');
        assert.ok(/#shopItems\s*\{[^}]*padding-bottom:\s*14px/.test(css), '商店缺少底部滚动留白');
    });

    it('逻辑布阵接入主站字体并适配矮屏', () => {
        // 字体改为自托管（移除 Google Fonts 外链，见 CHANGELOG 第八轮），
        // 断言同步为"引用本地 woff2 并声明 @font-face"。
        assert.ok(logic.includes('@font-face'), '逻辑布阵缺少 @font-face 声明');
        assert.ok(logic.includes('assets/fonts/fredoka-latin.woff2'), '逻辑布阵未引用自托管字体');
        assert.ok(!/fonts\.googleapis\.com/.test(logic.replace(/\/\*[\s\S]*?\*\//g, '')), '逻辑布阵不应再依赖 fonts.googleapis.com');
        assert.ok(logic.includes('@media (max-height: 880px)'), '逻辑布阵缺少矮屏适配');
    });

    it('主页面不依赖境外字体 CDN', () => {
        const htmlNoComment = html.replace(/<!--[\s\S]*?-->/g, '');
        assert.ok(!/fonts\.googleapis\.com|fonts\.gstatic\.com/.test(htmlNoComment), 'index.html 仍引用 Google Fonts');
        assert.ok(htmlNoComment.includes('assets/fonts/fredoka-latin.woff2'), 'index.html 未预加载自托管字体');
        assert.ok(css.includes('@font-face'), 'style.css 缺少 @font-face');
        assert.ok(css.includes('assets/fonts/fredoka-latin.woff2'), 'style.css 未引用自托管字体文件');
    });
});
