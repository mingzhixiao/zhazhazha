        function drawRoundRect(ctx, x, y, w, h, r) {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        /**
         * ============================================================================
         * 4. 游戏核心引擎类
         * ============================================================================
         */
        class ChibiBombermanGame {
            static LEVEL_THEMES = [
                { name: '青青草原', light: '#a3e635', dark: '#84cc16', deco: '#65a30d', glow: 'rgba(163, 230, 53, 0.35)' },
                { name: '金色沙漠', light: '#fde68a', dark: '#fcd34d', deco: '#d97706', glow: 'rgba(253, 230, 138, 0.35)' },
                { name: '冰封雪原', light: '#bae6fd', dark: '#7dd3fc', deco: '#0284c7', glow: 'rgba(186, 230, 253, 0.35)' },
                { name: '烈焰火山', light: '#6d28d9', dark: '#5b21b6', deco: '#c4b5fd', glow: 'rgba(139, 92, 246, 0.35)' }
            ];

            constructor() {
                this.canvas = document.getElementById('gameCanvas');
                this.ctx = this.canvas.getContext('2d');
                this.sound = new SoundSystem();
                this.save = new SaveSystem();

                this.state = 'MENU';
                this.noviceFailStreak = 0; // 新手档连败计数
                this.difficultyIdx = 0;
                this.mapCols = 13;
                this.mapRows = 11;
                this.camera = { x: 0, y: 0 };

                this.level = 1;
                this.score = 0;
                this.globalTime = 0;
                this.screenFlashTimer = 0;
                this.vineGrowthTimer = 0;

                this.shakeAmt = 0;
                this.hitFlash = 0;

                this.feverGauge = 0;
                this.feverTimer = 0;
                this.megaCharge = 0;
                this.megaFlashTimer = 0;

                this.coins = 0;
                this.goldenQuota = GOLDEN_QUOTA_BASE;
                this.nextGoldenAt = 0;
                this.goldenSpawned = false;
                this.goldenCrate = null;

                this.levelStartTime = 0;
                this.levelElapsed = 0;
                this.anyItemSpawned = false;

                this.comboChain = 0;
                this.comboTimer = 0;
                this.bestChain = 0;

                this.dangerLevel = 0;
                this.dangerRingEl = document.getElementById('dangerRing');

                this.controlMode = 'JOYSTICK';
                this.keys = {};
                this.touchDir = null;
                this.joystickVector = { x: 0, y: 0 };
                this.joystickPointerId = null;
                this.dpadPointerId = null;
                // 移动平滑：输入抖动过滤 + 加速/减速混合
                this.smoothDir = { x: 0, y: 0 };
                this.moveBlend = 0;
                this._hudTick = 0;

                this.grid = [];
                this.bombs = [];
                this.explosions = [];
                this.powerups = [];
                this.enemies = [];
                this.particles = [];
                this.floatingTexts = [];
                this.rainbowBolts = [];
                this.portal = null;

                this.player = null;
                this.resetPlayerStats();

                this.setupResponsiveCanvas();
                this.setupViewportHeight();
                this.setupFullscreen();
                this.setupMobaMode();
                this.setupRotateMode();
                this.bindEvents();
                this.initLevel(1);
                this.drawStaticIcons();
                this.showStartScreen();

                // 切后台自动暂停：回来时不再因时间差瞬死
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden && this.state === 'PLAYING') {
                        this.togglePause();
                    }
                });
                // 窗口失焦同样清空输入，避免按键/触控粘连
                window.addEventListener('blur', () => {
                    this.joystickVector = { x: 0, y: 0 };
                    this.touchDir = null;
                    this.joystickPointerId = null;
                    this.keys = {};
                });

                this.lastFrameTime = performance.now();
                requestAnimationFrame((t) => this.loop(t));
            }

            // 绘制页面上的静态矢量图标（帮助图鉴、商店徽章等）
            drawStaticIcons() {
                document.querySelectorAll('.guide-icon').forEach(cv => {
                    const bctx = cv.getContext('2d');
                    bctx.clearRect(0, 0, cv.width, cv.height);
                    const s = Math.min(cv.width, cv.height);
                    this.drawIcon(cv.dataset.icon, cv.width / 2, cv.height / 2, s * 0.92, bctx);
                });
            }

            setupViewportHeight() {
                const apply = () => {
                    // visualViewport 高度为真实可视区域（含工具栏/软键盘场景）；
                    // 有它就优先用它，避免 Math.max 把工具栏占用的区域重新算进来
                    let h;
                    if (window.visualViewport && window.visualViewport.height) {
                        h = window.visualViewport.height;
                    } else {
                        h = window.innerHeight || document.documentElement.clientHeight;
                    }
                    document.documentElement.style.setProperty('--app-h', `${Math.round(h)}px`);
                };

                apply();
                window.addEventListener('resize', apply);
                window.addEventListener('orientationchange', () => {
                    apply();
                    setTimeout(apply, 120);
                    setTimeout(apply, 400);
                });
                if (window.visualViewport) {
                    window.visualViewport.addEventListener('resize', apply);
                    window.visualViewport.addEventListener('scroll', apply);
                }
                window.addEventListener('touchstart', function once() {
                    apply();
                    window.removeEventListener('touchstart', once);
                }, { passive: true });
            }

            setupFullscreen() {
                this.fsSupported = !!(document.documentElement.requestFullscreen ||
                                      document.documentElement.webkitRequestFullscreen);

                const onChange = () => {
                    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
                    document.body.classList.toggle('is-fullscreen', isFs);
                    const btn = document.getElementById('btnFullscreen');
                    if (btn) {
                        btn.classList.toggle('fs-on', isFs);
                        btn.title = isFs ? '退出全屏 (F / Esc)' : '全屏游戏 (F)';
                    }
                    setTimeout(() => this.refreshLayout(), 120);
                    setTimeout(() => this.refreshLayout(), 420);
                };

                document.addEventListener('fullscreenchange', onChange);
                document.addEventListener('webkitfullscreenchange', onChange);

                const btn = document.getElementById('btnFullscreen');
                if (btn) {
                    btn.addEventListener('click', () => {
                        this.sound.init();
                        this.sound.playClick();
                        this.toggleFullscreen();
                    });
                }

                this.syncFullscreenButtonVisibility();
                window.addEventListener('resize', () => this.syncFullscreenButtonVisibility());
            }

            syncFullscreenButtonVisibility() {
                const btn = document.getElementById('btnFullscreen');
                if (!btn) return;
                const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
                if (isTouch && !this.fsSupported) {
                    btn.classList.add('hidden');
                } else {
                    btn.classList.remove('hidden');
                }
            }

            toggleFullscreen() {
                const doc = document;
                const el = doc.documentElement;
                const isFs = !!(doc.fullscreenElement || doc.webkitFullscreenElement);

                if (!isFs) {
                    const req = el.requestFullscreen || el.webkitRequestFullscreen;
                    if (req) {
                        try {
                            const p = req.call(el, { navigationUI: 'hide' });
                            if (p && p.catch) p.catch(() => this.tryScreenOrientationLock());
                        } catch (e) {
                            this.tryScreenOrientationLock();
                        }
                    } else {
                        this.addFloatingText(this.player.x, this.player.y - 40, '当前浏览器不支持全屏', '#f59e0b', 16);
                    }
                } else {
                    const exit = doc.exitFullscreen || doc.webkitExitFullscreen;
                    if (exit) { try { exit.call(doc); } catch (e) {} }
                }
            }

            tryScreenOrientationLock() {
                try {
                    if (screen.orientation && screen.orientation.lock) {
                        screen.orientation.lock('landscape').catch(() => {});
                    }
                } catch (e) {}
            }

            setupRotateMode() {
                const btn = document.getElementById('btnRotate');
                if (!btn) return;

                const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
                if (!isTouch) {
                    btn.classList.add('hidden');
                }

                btn.addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();
                    this.sound.vibrate(20);
                    this.toggleRotateMode();
                });

                window.addEventListener('orientationchange', () => {
                    setTimeout(() => {
                        if (this.rotateMode && window.matchMedia) {
                            const realLandscape = window.matchMedia('(orientation: landscape)').matches;
                            if (realLandscape) {
                                this.setRotateMode(false);
                            }
                        }
                        this.refreshLayout();
                    }, 150);
                });
            }

            get rotateMode() {
                return document.body.classList.contains('rotate-mode');
            }

            toggleRotateMode() {
                this.setRotateMode(!this.rotateMode);
            }

            setRotateMode(on) {
                document.body.classList.toggle('rotate-mode', on);
                const btn = document.getElementById('btnRotate');
                if (btn) {
                    btn.classList.toggle('rot-on', on);
                    btn.title = on ? '退出横屏模式' : '横屏模式：旋转画面，手机竖握即可 MOBA 操作';
                }

                if (on) {
                    const doc = document;
                    if (!doc.fullscreenElement && !doc.webkitFullscreenElement) {
                        const req = doc.documentElement.requestFullscreen || doc.documentElement.webkitRequestFullscreen;
                        if (req) {
                            try {
                                const p = req.call(doc.documentElement, { navigationUI: 'hide' });
                                if (p && p.catch) p.catch(() => this.tryScreenOrientationLock());
                            } catch (e) {}
                        }
                    } else {
                        this.tryScreenOrientationLock();
                    }
                }

                this.refreshLayout();
                setTimeout(() => this.refreshLayout(), 150);
                setTimeout(() => this.refreshLayout(), 450);
            }

            setupMobaMode() {
                const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

                this.applyMobaMode = () => {
                    const isFs = document.body.classList.contains('is-fullscreen');
                    const rotated = document.body.classList.contains('rotate-mode');
                    const landscape = window.matchMedia
                        ? window.matchMedia('(orientation: landscape)').matches
                        : (window.innerWidth > window.innerHeight);

                    if (rotated && landscape) {
                        document.body.classList.remove('rotate-mode');
                        const btn = document.getElementById('btnRotate');
                        if (btn) {
                            btn.classList.remove('rot-on');
                            btn.title = '横屏模式：旋转画面，手机竖握即可 MOBA 操作';
                        }
                        this.refreshLayout();
                        return;
                    }
                    const shortSide = Math.min(window.innerWidth, window.innerHeight);
                    const moba = isTouch && (isFs || rotated || (landscape && shortSide <= 620));

                    document.body.classList.toggle('moba-mode', moba);
                    document.body.classList.toggle('moba-bigmap', moba && this.mapCols > 13);
                    this.isMobaMode = moba;
                    if (this._updateCanvasSize) this._updateCanvasSize();
                };

                this.applyMobaMode();
                window.addEventListener('resize', () => this.applyMobaMode());
                window.addEventListener('orientationchange', () => {
                    setTimeout(() => this.applyMobaMode(), 120);
                    setTimeout(() => this.applyMobaMode(), 400);
                });
                if (window.matchMedia) {
                    try {
                        window.matchMedia('(orientation: landscape)')
                            .addEventListener('change', () => this.applyMobaMode());
                    } catch (e) {}
                }
            }

            updateMobaHud() {
                if (!this.isMobaMode) return;

                const set = (id, v) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = v;
                };
                const setW = (id, pct) => {
                    const el = document.getElementById(id);
                    if (el) el.style.width = `${Math.max(0, Math.min(100, pct))}%`;
                };

                const maxB = this.feverTimer > 0 ? 8 : this.playerStats.maxBombs;
                const rng = this.feverTimer > 0 ? Math.max(this.playerStats.bombRange, 6) : this.playerStats.bombRange;

                set('mobaLives', this.playerStats.hasShield ? `${this.playerStats.lives}(盾)` : this.playerStats.lives);
                set('mobaCoins', this.coins);
                set('mobaLevel', this.level);
                set('mobaBombs', `${Math.max(0, maxB - this.bombs.length)}/${maxB}`);
                set('mobaRange', rng);
                set('mobaScore', this.score);
                set('mobaFoes', this.enemies.length);
                set('mobaGoal', this.enemies.length > 0 ? '歼灭敌军' : '进传送门');

                if (this.feverTimer > 0) {
                    setW('mobaFeverBar', (this.feverTimer / 480) * 100);
                } else {
                    setW('mobaFeverBar', this.feverGauge);
                }
                setW('mobaMegaBar', (this.megaCharge / MEGA_COST) * 100);

                const buffsEl = document.getElementById('mobaBuffs');
                if (buffsEl) {
                    let html = '';
                    if (this.playerStats.hasRemote) html += '<div class="moba-buff">遥控</div>';
                    if (this.playerStats.ghostTimer > 0) html += `<div class="moba-buff">穿墙${Math.ceil(this.playerStats.ghostTimer / 60)}s</div>`;
                    if (this.playerStats.flameVestTimer > 0) html += `<div class="moba-buff">防炸${Math.ceil(this.playerStats.flameVestTimer / 60)}s</div>`;
                    if (this.feverTimer > 0) html += '<div class="moba-buff">狂暴</div>';
                    if (this.megaCharge >= MEGA_COST) html += '<div class="moba-buff">必杀</div>';
                    if (buffsEl.innerHTML !== html) buffsEl.innerHTML = html;
                }

                this.drawMobaMinimap();
            }

            drawMobaMinimap() {
                const cv = document.getElementById('mobaMinimap');
                if (!cv || !document.body.classList.contains('moba-bigmap')) return;
                const ctx = cv.getContext('2d');
                const W = cv.width, H = cv.height;
                const scale = Math.min((W - 6) / this.mapCols, (H - 6) / this.mapRows);
                const mw = this.mapCols * scale, mh = this.mapRows * scale;
                const ox = (W - mw) / 2, oy = (H - mh) / 2;

                ctx.clearRect(0, 0, W, H);

                for (let r = 0; r < this.mapRows; r++) {
                    for (let c = 0; c < this.mapCols; c++) {
                        const t = this.grid[r] && this.grid[r][c];
                        if (t === TILE.WALL) ctx.fillStyle = 'rgba(148,163,184,0.85)';
                        else if (t === TILE.CRATE) ctx.fillStyle = 'rgba(245,158,11,0.75)';
                        else if (t === TILE.FROST_CRATE) ctx.fillStyle = 'rgba(56,189,248,0.75)';
                        else if (t === TILE.VINE) ctx.fillStyle = 'rgba(34,197,94,0.75)';
                        else continue;
                        ctx.fillRect(ox + c * scale, oy + r * scale, Math.max(1, scale), Math.max(1, scale));
                    }
                }

                if (this.portal && this.portal.revealed) {
                    ctx.fillStyle = '#e879f9';
                    ctx.fillRect(ox + this.portal.col * scale - 1, oy + this.portal.row * scale - 1, scale + 2, scale + 2);
                }

                ctx.fillStyle = '#fb7185';
                this.enemies.forEach(e => {
                    const ec = (e.x / TILE_SIZE) * scale + ox;
                    const er = (e.y / TILE_SIZE) * scale + oy;
                    ctx.beginPath();
                    ctx.arc(ec, er, 1.6, 0, Math.PI * 2);
                    ctx.fill();
                });

                const pc = (this.player.x / TILE_SIZE) * scale + ox;
                const pr = (this.player.y / TILE_SIZE) * scale + oy;
                ctx.fillStyle = '#4ade80';
                ctx.beginPath();
                ctx.arc(pc, pr, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = 'rgba(74,222,128,0.9)';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.arc(pc, pr, 5.5, 0, Math.PI * 2);
                ctx.stroke();

                ctx.strokeStyle = 'rgba(253,224,71,0.75)';
                ctx.lineWidth = 1;
                ctx.strokeRect(
                    ox + (this.camera.x / TILE_SIZE) * scale,
                    oy + (this.camera.y / TILE_SIZE) * scale,
                    (this.canvas.width / TILE_SIZE) * scale,
                    (this.canvas.height / TILE_SIZE) * scale
                );
            }

            refreshLayout() {
                if (this._updateCanvasSize) this._updateCanvasSize();
                if (this.applyMobaMode) this.applyMobaMode();
                window.dispatchEvent(new Event('resize'));
            }

            setupResponsiveCanvas() {
                const stageArea = document.getElementById('stageArea');
                const wrapper = document.getElementById('canvasWrapper');
                const aspect = VIEW_COLS / VIEW_ROWS;

                const updateCanvasSize = () => {
                    const rotated = document.body.classList.contains('rotate-mode');
                    const rect = stageArea.getBoundingClientRect();
                    const stageW = rotated ? stageArea.offsetWidth : rect.width;
                    const stageH = rotated ? stageArea.offsetHeight : rect.height;
                    const isFs = document.body.classList.contains('is-fullscreen');
                    const isMoba = document.body.classList.contains('moba-mode');
                    const pad = isFs || isMoba ? 2 : 4;
                    const availW = Math.max(200, stageW - pad);
                    const availH = Math.max(160, stageH - pad);

                    let targetW, targetH;

                    if (isMoba) {
                        // MOBA 模式下保持纵横比，居中显示
                        targetW = availW;
                        targetH = targetW / aspect;
                        if (targetH > availH) {
                            targetH = availH;
                            targetW = targetH * aspect;
                        }
                    } else {
                        targetW = availW;
                        targetH = targetW / aspect;
                        if (targetH > availH) {
                            targetH = availH;
                            targetW = targetH * aspect;
                        }
                    }

                    wrapper.style.width = `${Math.floor(targetW)}px`;
                    wrapper.style.height = `${Math.floor(targetH)}px`;

                    if (isMoba) {
                        const dpr = Math.min(2, window.devicePixelRatio || 1);
                        const pixW = Math.round(targetW * dpr);
                        const pixH = Math.round(targetH * dpr);
                        if (this.canvas.width !== pixW || this.canvas.height !== pixH) {
                            this.canvas.width = pixW;
                            this.canvas.height = pixH;
                        }
                    } else if (this.canvas.width !== 780 || this.canvas.height !== 660) {
                        this.canvas.width = 780;
                        this.canvas.height = 660;
                    }
                };

                this._updateCanvasSize = updateCanvasSize;
                const ro = new ResizeObserver(updateCanvasSize);
                ro.observe(stageArea);
                ro.observe(document.body);
                window.addEventListener('orientationchange', () => {
                    setTimeout(updateCanvasSize, 100);
                    setTimeout(updateCanvasSize, 350);
                });
                updateCanvasSize();
            }

            resetPlayerStats() {
                const up = (this.save && this.save.data && this.save.data.upgrades) || {};
                this.playerStats = {
                    lives: 3 + (up.lives || 0),
                    maxBombs: 1 + (up.bombCap || 0),
                    bombRange: 1 + (up.fireRange || 0),
                    speed: 3.1 + (up.speed || 0) * 0.25,
                    hasShield: (up.startShield || 0) > 0,
                    hasRemote: false,
                    ghostTimer: 0,
                    flameVestTimer: 0
                };
                this.feverGauge = 0;
                this.feverTimer = 0;
                this.megaCharge = 0;
                this.megaFlashTimer = 0;
                this.comboChain = 0;
                this.comboTimer = 0;
                this.bestChain = 0;
                this.shakeAmt = 0;
                this.hitFlash = 0;
            }

            setDifficulty(idx) {
                this.difficultyIdx = idx;
                const sel = document.getElementById('topDiffSelect');
                if (sel) sel.value = String(idx);
                // 底部 sheet 高亮
                document.querySelectorAll('.sheet-diff-btn').forEach(btn => {
                    btn.classList.toggle('active', Number(btn.getAttribute('data-diff')) === idx);
                });
                // 首页难度 pill 文案
                const names = ['新手 · 8怪', '简单 · 14怪', '中等 · 20精英', '困难1 · 68怪', '困难2 · 145怪'];
                const pill = document.getElementById('startDiffName');
                if (pill) pill.textContent = names[idx] || names[0];
            }

            initLevel(levelNum) {
                const diffCfg = DIFFICULTY_TIERS[this.difficultyIdx];
                this.level = levelNum;
                this._theme = this.getLevelTheme();
                this.mapCols = diffCfg.cols;
                this.mapRows = diffCfg.rows;

                this.resetPlayerStats();

                this.grid = [];
                this.bombs = [];
                this.explosions = [];
                this.powerups = [];
                this.enemies = [];
                this.particles = [];
                this.floatingTexts = [];
                this.rainbowBolts = [];
                this.portal = null;
                this.screenFlashTimer = 0;
                this.vineGrowthTimer = 0;
                // 新关卡重置移动平滑状态，避免残留输入
                this.smoothDir = { x: 0, y: 0 };
                this.moveBlend = 0;
                this.joystickVector = { x: 0, y: 0 };
                this.touchDir = null;

                this.levelElapsed = 0;
                this.levelStartTime = this.globalTime;
                this.anyItemSpawned = false;
                this.comboChain = 0;
                this.comboTimer = 0;
                this.goldenSpawned = false;
                this.goldenCrate = null;
                this.goldenQuota = GOLDEN_QUOTA_BASE + (levelNum - 1) * 25;
                this.nextGoldenAt = this.goldenQuota;
                this.hideComboToast();
                this.updateComboMeter();
                this.showLevelBanner();

                if (this.difficultyIdx === 0 && levelNum === 1) {
                    this.playerStats.flameVestTimer = diffCfg.noviceVestFrames || 900;
                }

                const crateSlots = [];

                for (let r = 0; r < this.mapRows; r++) {
                    this.grid[r] = [];
                    for (let c = 0; c < this.mapCols; c++) {
                        if (r === 0 || r === this.mapRows - 1 || c === 0 || c === this.mapCols - 1) {
                            this.grid[r][c] = TILE.WALL;
                        } else if (r % 2 === 0 && c % 2 === 0) {
                            this.grid[r][c] = TILE.WALL;
                        } else {
                            const isSpawnZone = (r <= 2 && c <= 2);
                            if (!isSpawnZone && Math.random() < diffCfg.crateDensity) {
                                this.grid[r][c] = Math.random() < diffCfg.frostChance ? TILE.FROST_CRATE : TILE.CRATE;
                                crateSlots.push({ c, r });
                            } else {
                                this.grid[r][c] = TILE.EMPTY;
                            }
                        }
                    }
                }

                if (crateSlots.length === 0) {
                    this.grid[this.mapRows - 2][this.mapCols - 2] = TILE.CRATE;
                    crateSlots.push({ c: this.mapCols - 2, r: this.mapRows - 2 });
                }

                // 新手第 1 关不生成藤蔓，避免刚学移动就被减速干扰
                const vineTarget = (this.difficultyIdx === 0 && levelNum === 1) ? 0 : diffCfg.initialVines;
                let vinesPlaced = 0;
                for (let tries = 0; tries < 250 && vinesPlaced < vineTarget; tries++) {
                    const rc = 1 + Math.floor(Math.random() * (this.mapCols - 2));
                    const rr = 1 + Math.floor(Math.random() * (this.mapRows - 2));
                    if (this.grid[rr][rc] === TILE.EMPTY && (rc + rr > 5)) {
                        this.grid[rr][rc] = TILE.VINE;
                        vinesPlaced++;
                    }
                }

                const idx = Math.floor(Math.random() * crateSlots.length);
                const slot = crateSlots[idx];
                this.portal = {
                    col: slot.c,
                    row: slot.r,
                    revealed: false,
                    active: false,
                    lockedHintCooldown: 0
                };

                const otherSlots = crateSlots.filter(s => !(s.c === slot.c && s.r === slot.r));
                if (otherSlots.length > 0) {
                    const gSlot = otherSlots[Math.floor(Math.random() * otherSlots.length)];
                    this.goldenCrate = {
                        col: gSlot.c,
                        row: gSlot.r,
                        amount: 25 + Math.floor(Math.random() * 26) + (levelNum - 1) * 5
                    };
                }

                this.player = {
                    x: 1.5 * TILE_SIZE,
                    y: 1.5 * TILE_SIZE,
                    radius: 20,
                    dir: 'DOWN',
                    isMoving: false,
                    walkCycle: 0,
                    invincibleTimer: 0,
                    blinkTimer: 0,
                    isBlinking: false
                };

                this.spawnEnemies(levelNum, diffCfg);
                this.updateCamera(1, true);
                this.updateHUD();
            }

            createSingleEnemyAt(col, row, diffCfg, forceAngry = false) {
                const SPECIALISTS = ['SALAMANDER', 'TORTOISE', 'AZUREBIRD', 'WHITETIGER'];

                const baseSpeedMap = {
                    'SLIME': 1.25,
                    'MUSHROOM': 1.65,
                    'GHOST': 1.45,
                    'IRON_SNAIL': 1.18,
                    'GOLD_SLIME': 1.55,
                    'SALAMANDER': 1.30,
                    'TORTOISE': 0.98,
                    'AZUREBIRD': 1.72,
                    'WHITETIGER': 1.12
                };
                const hpMap = {
                    'SLIME': 1,
                    'MUSHROOM': 1,
                    'GHOST': 1,
                    'IRON_SNAIL': 2,
                    'GOLD_SLIME': 3,
                    'SALAMANDER': 2,
                    'TORTOISE': 3,
                    'AZUREBIRD': 2,
                    'WHITETIGER': 2
                };

                let type = 'SLIME';
                const rand = Math.random();

                // 新手保护：前 N 关特化怪不随机出现（逐步引入）
                let specRatio = diffCfg.specialistRatio;
                if (this.difficultyIdx === 0 && this.level <= (diffCfg.noviceGraceLevels || 0)) {
                    specRatio = 0;
                }
                if (rand < specRatio) {
                    type = SPECIALISTS[Math.floor(Math.random() * SPECIALISTS.length)];
                } else if (rand < diffCfg.specialistRatio + diffCfg.eliteRatio ||
                           (forceAngry && Math.random() < 0.55)) {
                    type = Math.random() < 0.45 ? 'GOLD_SLIME' : 'IRON_SNAIL';
                } else {
                    const basicPool = ['SLIME', 'MUSHROOM', 'GHOST'];
                    type = basicPool[Math.floor(Math.random() * basicPool.length)];
                }

                if (forceAngry && SPECIALISTS.includes(type) && Math.random() < 0.65) {
                    type = Math.random() < 0.5 ? 'SLIME' : 'MUSHROOM';
                }

                const hp = hpMap[type];
                const spd = Math.min((baseSpeedMap[type] + (this.level - 1) * 0.06) * diffCfg.speedMult, 3.2);

                return {
                    x: (col + 0.5) * TILE_SIZE,
                    y: (row + 0.5) * TILE_SIZE,
                    type: type,
                    hp: hp,
                    maxHp: hp,
                    speed: spd,
                    dir: ['UP', 'DOWN', 'LEFT', 'RIGHT'][Math.floor(Math.random() * 4)],
                    animPhase: Math.random() * Math.PI * 2,
                    hurtTimer: forceAngry ? 38 : 0,
                    enrageTimer: forceAngry ? 220 : 0,
                    skillCd: 60 + Math.floor(Math.random() * 90),
                    skillAnim: 0,
                    windUp: 0,
                    windUpMax: 0,
                    fireCells: null,
                    lastTarget: null,
                    swapCd: 0,
                    feedCount: 0,
                    fireImmuneTimer: 0,
                    waterGuard: 0
                };
            }

            isSpecialist(type) {
                return type === 'SALAMANDER' || type === 'TORTOISE' ||
                       type === 'AZUREBIRD' || type === 'WHITETIGER';
            }

            cellHasFlame(col, row) {
                for (const exp of this.explosions) {
                    if (exp.timer <= exp.maxTimer * 0.2) continue;
                    if (exp.cells.some(c => c.col === col && c.row === row)) return true;
                }
                return false;
            }

            spawnEnemies(levelNum, diffCfg) {
                const targetCount = GamePure.calcEnemyCount(diffCfg, levelNum);
                const emptySpots = [];

                for (let r = 1; r < this.mapRows - 1; r++) {
                    for (let c = 1; c < this.mapCols - 1; c++) {
                        if (this.grid[r][c] === TILE.EMPTY && (r + c > 4)) {
                            emptySpots.push({ c, r });
                        }
                    }
                }

                // 可注入随机 + 无重复取点（空地不足时不再取模重叠，直接按可用数生成）
                const spots = GamePure.pickSpawnSpots(emptySpots, targetCount, () => RNG.random());
                for (const spot of spots) {
                    this.enemies.push(this.createSingleEnemyAt(spot.c, spot.r, diffCfg, false));
                }
            }

            spawnMonstersFromDestroyedPowerup(item) {
                const diffCfg = DIFFICULTY_TIERS[this.difficultyIdx];
                const isNovice = this.difficultyIdx === 0;

                // 新手保护：第 1 关只警告不刷怪；后续关最多 1 只普通怪
                if (isNovice && this.level <= (diffCfg.noviceNoPunishLevel || 0)) {
                    this.sound.playItemCurseSpawn();
                    this.showToast('小心！炸毁道具会引来怪物！', 'angry');
                    return;
                }
                let spawnCount = diffCfg.itemBombSpawnCount || 2;
                if (isNovice) {
                    spawnCount = Math.min(spawnCount, diffCfg.novicePunishCap || 1);
                    this.showToast('警告！道具被炸，出现 1 只怪物！', 'angry');
                }
                const cx = (item.col + 0.5) * TILE_SIZE;
                const cy = (item.row + 0.5) * TILE_SIZE;

                this.sound.playItemCurseSpawn();
                if (!isNovice) {
                    this.showToast(`道具被炸! 涌出 ${spawnCount} 只恶怪!`, 'angry');
                }
                this.addShake(5);

                for (let i = 0; i < 20; i++) {
                    const angle = (Math.PI * 2 * i) / 20;
                    const spd = 2 + Math.random() * 4.5;
                    this.particles.push({
                        x: cx,
                        y: cy,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        radius: 5 + Math.random() * 4,
                        color: ['#9333ea', '#e11d48', '#facc15', '#38bdf8'][i % 4],
                        life: 32,
                        maxLife: 32
                    });
                }

                for (let k = 0; k < spawnCount; k++) {
                    // 新手档生成普通怪（非愤怒），降低惩罚强度
                    const newEnemy = this.createSingleEnemyAt(item.col, item.row, diffCfg, !isNovice);
                    newEnemy.dir = ['UP', 'DOWN', 'LEFT', 'RIGHT'][k % 4];
                    this.enemies.push(newEnemy);
                }

                if (this.portal && this.portal.active) {
                    this.portal.active = false;
                    this.showToast('新怪物出现！传送门重新封印！', 'lock');
                }

                this.updateHUD();
            }

            findBFSDirection(startCol, startRow, targetCol, targetRow, maxRange, canPassCrate) {
                const manhattan = Math.abs(startCol - targetCol) + Math.abs(startRow - targetRow);
                if (manhattan === 0 || manhattan > maxRange) return null;

                const queue = [{ c: startCol, r: startRow, firstDir: null, dist: 0 }];
                const visited = new Set([`${startCol},${startRow}`]);
                const dirs = [
                    { name: 'UP', dc: 0, dr: -1 },
                    { name: 'DOWN', dc: 0, dr: 1 },
                    { name: 'LEFT', dc: -1, dr: 0 },
                    { name: 'RIGHT', dc: 1, dr: 0 }
                ];

                while (queue.length > 0) {
                    const cur = queue.shift();
                    if (cur.c === targetCol && cur.r === targetRow) return cur.firstDir;
                    if (cur.dist >= maxRange) continue;

                    for (const d of dirs) {
                        const nc = cur.c + d.dc;
                        const nr = cur.r + d.dr;
                        const key = `${nc},${nr}`;
                        if (nc <= 0 || nc >= this.mapCols - 1 || nr <= 0 || nr >= this.mapRows - 1) continue;
                        if (visited.has(key)) continue;

                        const tile = this.grid[nr][nc];
                        if (tile === TILE.WALL) continue;
                        if ((tile === TILE.CRATE || tile === TILE.FROST_CRATE) && !canPassCrate) continue;
                        if (this.bombs.some(b => b.col === nc && b.row === nr)) continue;

                        visited.add(key);
                        queue.push({
                            c: nc,
                            r: nr,
                            firstDir: cur.firstDir || d.name,
                            dist: cur.dist + 1
                        });
                    }
                }
                return null;
            }

            bindEvents() {
                window.addEventListener('contextmenu', (e) => e.preventDefault());
                document.addEventListener('gesturestart', (e) => e.preventDefault());

                window.addEventListener('keydown', (e) => {
                    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
                        e.preventDefault();
                    }
                    this.keys[e.code] = true;

                    if (e.code === 'Space' || e.code === 'KeyJ' || e.code === 'Enter') {
                        if (this.state === 'PLAYING') this.placeBomb();
                    }
                    if (e.code === 'KeyK' || e.code === 'KeyE') {
                        if (this.state === 'PLAYING') this.detonateAllRemoteBombs();
                    }
                    if (e.code === 'KeyL' || e.code === 'KeyU') {
                        if (this.state === 'PLAYING') this.triggerMegaBomb();
                    }
                    if (e.code === 'KeyP') this.togglePause();
                    if (e.code === 'KeyF') this.toggleFullscreen();
                });

                window.addEventListener('keyup', (e) => {
                    this.keys[e.code] = false;
                });

                document.querySelectorAll('.sheet-diff-btn').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.sound.init();
                        this.sound.playClick();
                        const idx = Number(btn.getAttribute('data-diff'));
                        this.setDifficulty(idx);
                        this.score = 0;
                        this.coins = 0;
                        this.initLevel(1);
                        this.hideDiffSheet();
                    });
                });

                document.getElementById('topDiffSelect').addEventListener('change', (e) => {
                    this.sound.init();
                    this.sound.playClick();
                    const idx = Number(e.target.value);
                    this.setDifficulty(idx);
                    this.score = 0;
                    this.coins = 0;
                    this.initLevel(1);
                    this.state = 'PLAYING';
                    this.hideModal();
                    this.hideShop();
                });

                // 1. 虚拟摇杆（零延迟即时响应、全向模拟向量、大触控捕捉区）
                const joystickContainer = document.getElementById('joystickContainer');
                const joystickZone = document.getElementById('joystickZone');
                const joystickKnob = document.getElementById('joystickKnob');
                const joystickDirLabel = document.getElementById('joystickDirLabel');
                const dirSymbols = { 'UP': '▲', 'DOWN': '▼', 'LEFT': '◀', 'RIGHT': '▶' };

                const updateJoystickByPoint = (clientX, clientY) => {
                    const rect = joystickZone.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;
                    const maxRadius = rect.width * 0.42;

                    const dx = clientX - centerX;
                    const dy = clientY - centerY;
                    const dist = Math.hypot(dx, dy);
                    const deadZone = 6;

                    if (dist < deadZone) {
                        this.touchDir = null;
                        this.joystickVector = { x: 0, y: 0 };
                        joystickKnob.style.transform = `translate(-50%, -50%)`;
                        joystickDirLabel.textContent = '·';
                        return;
                    }

                    const clampedDist = Math.min(dist, maxRadius);
                    const angle = Math.atan2(dy, dx);
                    // 物理（屏幕）坐标系单位向量
                    let vx = Math.cos(angle);
                    let vy = Math.sin(angle);
                    if (document.body.classList.contains('rotate-mode')) {
                        // 横屏旋转模式：页面顺时针转了 90°，把物理向量转回游戏世界坐标
                        // （与手势输入的补偿一致：gx = sy, gy = -sx）
                        const rx = vy, ry = -vx;
                        vx = rx; vy = ry;
                    }
                    // 摇杆头画在游戏坐标系里，旋转后正好落在手指的物理位置上
                    const knobX = vx * clampedDist;
                    const knobY = vy * clampedDist;
                    joystickKnob.style.transform = `translate(calc(-50% + ${knobX.toFixed(1)}px), calc(-50% + ${knobY.toFixed(1)}px))`;

                    const strength = Math.min(1, (clampedDist - deadZone) / (maxRadius - deadZone));
                    // 响应曲线：小幅度推动也更跟手（0.75 次方曲线）
                    const curved = Math.pow(strength, 0.75);
                    this.joystickVector = { x: vx * curved, y: vy * curved };

                    if (Math.abs(vx) > Math.abs(vy)) {
                        this.touchDir = vx > 0 ? 'RIGHT' : 'LEFT';
                    } else {
                        this.touchDir = vy > 0 ? 'DOWN' : 'UP';
                    }
                    joystickDirLabel.textContent = dirSymbols[this.touchDir] || '·';
                };

                const resetJoystick = () => {
                    this.joystickPointerId = null;
                    this.touchDir = null;
                    this.joystickVector = { x: 0, y: 0 };
                    joystickKnob.style.transition = 'transform 0.12s ease-out';
                    joystickKnob.style.transform = `translate(-50%, -50%)`;
                    joystickDirLabel.textContent = '·';
                };

                const handleJoystickDown = (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // zone 的 pointerdown 会冒泡到 container，加此防止重复触发
                    this.sound.init();
                    this.joystickPointerId = e.pointerId;
                    try { joystickZone.setPointerCapture(e.pointerId); } catch (err) {}
                    joystickKnob.style.transition = 'none';
                    updateJoystickByPoint(e.clientX, e.clientY);
                };

                joystickZone.addEventListener('pointerdown', handleJoystickDown);
                if (joystickContainer) {
                    joystickContainer.addEventListener('pointerdown', handleJoystickDown);
                }

                joystickZone.addEventListener('pointermove', (e) => {
                    if (e.pointerId !== this.joystickPointerId) return;
                    e.preventDefault();
                    updateJoystickByPoint(e.clientX, e.clientY);
                });
                if (joystickContainer) {
                    joystickContainer.addEventListener('pointermove', (e) => {
                        if (e.pointerId !== this.joystickPointerId) return;
                        e.preventDefault();
                        updateJoystickByPoint(e.clientX, e.clientY);
                    });
                }

                const handleJoystickUp = (e) => {
                    if (e.pointerId === this.joystickPointerId) resetJoystick();
                };
                joystickZone.addEventListener('pointerup', handleJoystickUp);
                joystickZone.addEventListener('pointercancel', handleJoystickUp);
                joystickZone.addEventListener('lostpointercapture', handleJoystickUp);
                if (joystickContainer) {
                    joystickContainer.addEventListener('pointerup', handleJoystickUp);
                    joystickContainer.addEventListener('pointercancel', handleJoystickUp);
                }

                // 2. 十字键
                const dpadContainer = document.getElementById('dpadContainer');
                const dpadBtns = document.querySelectorAll('.dpad-btn');

                const updateDpadFromPoint = (clientX, clientY) => {
                    const rect = dpadContainer.getBoundingClientRect();
                    const cx = rect.left + rect.width / 2;
                    const cy = rect.top + rect.height / 2;
                    const dx = clientX - cx;
                    const dy = clientY - cy;

                    if (Math.hypot(dx, dy) < 10) return;

                    // 横屏旋转模式：物理坐标 → 游戏世界坐标
                    let gx = dx, gy = dy;
                    if (document.body.classList.contains('rotate-mode')) {
                        gx = dy; gy = -dx;
                    }
                    let newDir = null;
                    if (Math.abs(gx) > Math.abs(gy)) {
                        newDir = gx > 0 ? 'RIGHT' : 'LEFT';
                    } else {
                        newDir = gy > 0 ? 'DOWN' : 'UP';
                    }

                    this.touchDir = newDir;
                    dpadBtns.forEach(btn => {
                        if (btn.getAttribute('data-dir') === newDir) {
                            btn.classList.add('active-touch');
                        } else {
                            btn.classList.remove('active-touch');
                        }
                    });
                };

                const resetDpad = () => {
                    this.dpadPointerId = null;
                    this.touchDir = null;
                    dpadBtns.forEach(btn => btn.classList.remove('active-touch'));
                };

                dpadContainer.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    this.sound.init();
                    this.sound.playClick();
                    this.dpadPointerId = e.pointerId;
                    dpadContainer.setPointerCapture(e.pointerId);
                    updateDpadFromPoint(e.clientX, e.clientY);
                });

                dpadContainer.addEventListener('pointermove', (e) => {
                    if (e.pointerId !== this.dpadPointerId) return;
                    e.preventDefault();
                    updateDpadFromPoint(e.clientX, e.clientY);
                });

                dpadContainer.addEventListener('pointerup', (e) => {
                    if (e.pointerId === this.dpadPointerId) resetDpad();
                });
                dpadContainer.addEventListener('pointercancel', (e) => {
                    if (e.pointerId === this.dpadPointerId) resetDpad();
                });

                // 3. 放炸弹按钮
                const btnPlaceBomb = document.getElementById('btnPlaceBomb');
                btnPlaceBomb.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    this.sound.init();
                    btnPlaceBomb.classList.add('active-touch');
                    if (this.state === 'PLAYING') this.placeBomb();
                });
                const clearBombBtnState = () => btnPlaceBomb.classList.remove('active-touch');
                btnPlaceBomb.addEventListener('pointerup', clearBombBtnState);
                btnPlaceBomb.addEventListener('pointercancel', clearBombBtnState);
                btnPlaceBomb.addEventListener('pointerleave', clearBombBtnState);

                // 4. 引爆按钮
                const btnDetonateRemote = document.getElementById('btnDetonateRemote');
                btnDetonateRemote.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    this.sound.init();
                    btnDetonateRemote.classList.add('active-touch');
                    if (this.state === 'PLAYING') this.detonateAllRemoteBombs();
                });
                const clearDetonateBtnState = () => btnDetonateRemote.classList.remove('active-touch');
                btnDetonateRemote.addEventListener('pointerup', clearDetonateBtnState);
                btnDetonateRemote.addEventListener('pointercancel', clearDetonateBtnState);
                btnDetonateRemote.addEventListener('pointerleave', clearDetonateBtnState);

                // 5. 超必杀按钮
                const btnMegaBomb = document.getElementById('btnMegaBomb');
                btnMegaBomb.addEventListener('pointerdown', (e) => {
                    e.preventDefault();
                    this.sound.init();
                    btnMegaBomb.classList.add('active-touch');
                    if (this.state === 'PLAYING') this.triggerMegaBomb();
                });
                const clearMegaBtnState = () => btnMegaBomb.classList.remove('active-touch');
                btnMegaBomb.addEventListener('pointerup', clearMegaBtnState);
                btnMegaBomb.addEventListener('pointercancel', clearMegaBtnState);
                btnMegaBomb.addEventListener('pointerleave', clearMegaBtnState);

                // 6. 棋盘手势
                const canvasWrapper = document.getElementById('canvasWrapper');
                this.gesture = { id: null, startX: 0, startY: 0, moved: false, startTime: 0 };

                const gestureMove = (clientX, clientY) => {
                    const g = this.gesture;
                    let dx = clientX - g.startX;
                    let dy = clientY - g.startY;
                    if (document.body.classList.contains('rotate-mode')) {
                        const rx = dy, ry = -dx;
                        dx = rx; dy = ry;
                    }
                    const dead = 14;
                    if (Math.hypot(dx, dy) < dead) {
                        this.touchDir = null;
                        return;
                    }
                    g.moved = true;
                    this.touchDir = Math.abs(dx) > Math.abs(dy)
                        ? (dx > 0 ? 'RIGHT' : 'LEFT')
                        : (dy > 0 ? 'DOWN' : 'UP');
                };

                const gestureEnd = () => {
                    this.gesture = { id: null, startX: 0, startY: 0, moved: false, startTime: 0 };
                    this.touchDir = null;
                };

                canvasWrapper.addEventListener('pointerdown', (e) => {
                    if (!e.isPrimary) return;
                    if (e.pointerType === 'mouse') return;
                    if (this.state !== 'PLAYING') return;
                    e.preventDefault();
                    this.sound.init();
                    this.gesture = {
                        id: e.pointerId,
                        startX: e.clientX,
                        startY: e.clientY,
                        moved: false,
                        startTime: performance.now()
                    };
                    try { canvasWrapper.setPointerCapture(e.pointerId); } catch (err) {}
                }, { passive: false });

                canvasWrapper.addEventListener('pointermove', (e) => {
                    if (this.gesture.id === null || e.pointerId !== this.gesture.id) return;
                    e.preventDefault();
                    gestureMove(e.clientX, e.clientY);
                }, { passive: false });

                const onGestureUp = (e) => {
                    if (this.gesture.id === null || e.pointerId !== this.gesture.id) return;
                    const quick = performance.now() - this.gesture.startTime < 220;
                    if (!this.gesture.moved && quick && this.state === 'PLAYING') {
                        this.placeBomb();
                    }
                    gestureEnd();
                };
                canvasWrapper.addEventListener('pointerup', onGestureUp);
                canvasWrapper.addEventListener('pointercancel', (e) => {
                    if (this.gesture.id === e.pointerId) gestureEnd();
                });

                let lastTapAt = 0;
                canvasWrapper.addEventListener('pointerup', (e) => {
                    if (e.pointerType === 'mouse') return;
                    const now = performance.now();
                    if (now - lastTapAt < 300 && this.playerStats.hasRemote && this.state === 'PLAYING') {
                        this.detonateAllRemoteBombs();
                        lastTapAt = 0;
                    } else {
                        lastTapAt = now;
                    }
                });

                window.addEventListener('orientationchange', () => {
                    setTimeout(() => this.refreshLayout(), 150);
                    setTimeout(() => this.refreshLayout(), 450);
                });

                // 7. 控制模式切换
                document.getElementById('btnControlMode').addEventListener('click', () => {
                    this.sound.vibrate(15);
                    const modes = ['JOYSTICK', 'DPAD', 'GESTURE'];
                    const idx = modes.indexOf(this.controlMode);
                    this.controlMode = modes[(idx + 1) % modes.length];
                    this.applyControlMode();
                    this.touchDir = null;
                });

                document.getElementById('btnSound').addEventListener('click', () => {
                    const on = this.sound.toggle();
                    const iconCanvas = document.getElementById('soundIconCanvas');
                    if (iconCanvas) {
                        iconCanvas.dataset.icon = on ? 'speaker' : 'speakerOff';
                        const bctx = iconCanvas.getContext('2d');
                        bctx.clearRect(0, 0, 16, 16);
                        this.drawIcon(on ? 'speaker' : 'speakerOff', 8, 8, 14, bctx);
                    }
                    document.getElementById('soundText').textContent = on ? '音效' : '静音';
                });

                document.getElementById('btnPause').addEventListener('click', () => {
                    this.sound.playClick();
                    this.togglePause();
                });

                document.getElementById('btnRestart').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();
                    this.score = 0;
                    this.coins = 0;
                    this.initLevel(1);
                    this.state = 'PLAYING';
                    this.hideModal();
                    this.hideShop();
                });

                // 主按钮：菜单开始 / 结算重开 / 暂停继续 / 关卡通关 → 进商店
                document.getElementById('modalActionBtn').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();

                    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
                    const portrait = window.innerHeight > window.innerWidth;
                    if (isTouch && portrait && !this.rotateMode && !this._rotateSuggested) {
                        this._rotateSuggested = true;
                        this.setRotateMode(true);
                    }

                    if (this.state === 'MENU' || this.state === 'GAME_OVER') {
                        if (this.state === 'GAME_OVER') {
                            this.score = 0;
                            this.coins = 0;
                            this.initLevel(1);
                        }
                        this.state = 'PLAYING';
                        this.hideModal();
                    } else if (this.state === 'LEVEL_CLEAR') {
                        this.state = 'SHOP';
                        this.hideModal();
                        this.showShop();
                    } else if (this.state === 'PAUSED') {
                        this.state = 'PLAYING';
                        this.hideModal();
                    }
                });

                // ===== 首页按钮 =====
                document.getElementById('startGameBtn').addEventListener('click', () => {
                    this.startGameFromMenu();
                });
                document.getElementById('startDiffPill').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();
                    this.showDiffSheet();
                });
                document.getElementById('diffSheetBackdrop').addEventListener('click', () => {
                    this.hideDiffSheet();
                });
                document.getElementById('startHelpBtn').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();
                    this.showHelpModal();
                });
                document.getElementById('helpCloseBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.hideHelpModal();
                });
                document.getElementById('helpBackdrop').addEventListener('click', () => {
                    this.hideHelpModal();
                });
                document.getElementById('startCareerBtn').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();
                    this.showCareerPop();
                });
                document.getElementById('careerCloseBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.hideCareerPop();
                });
                document.getElementById('careerBackdrop').addEventListener('click', () => {
                    this.hideCareerPop();
                });
                document.getElementById('startSoundBtn').addEventListener('click', () => {
                    this.sound.init();
                    const on = this.sound.toggle();
                    this.syncStartSoundIcon();
                    // 同步顶部栏音效图标
                    const iconCanvas = document.getElementById('soundIconCanvas');
                    if (iconCanvas) {
                        const cctx = iconCanvas.getContext('2d');
                        cctx.clearRect(0, 0, 16, 16);
                        this.drawIcon(on ? 'speaker' : 'speakerOff', 8, 8, 14, cctx);
                    }
                    const st = document.getElementById('soundText');
                    if (st) st.textContent = on ? '音效' : '静音';
                });

                // ===== 新手教学按钮 =====
                document.getElementById('tutorialStartBtn').addEventListener('click', () => {
                    this.sound.init();
                    this.startTutorial();
                });
                document.getElementById('tutorialSkipOfferBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.hideTutorialOffer();
                    this.markTutorialDone(); // 选了"直接开始"就不再邀请
                    this.startGameFromMenu();
                });
                document.getElementById('tutorialSkipBtn').addEventListener('click', () => {
                    this.skipTutorial();
                });
                document.getElementById('tutorialReplayBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.hideHelpModal();
                    this._tutorialOffered = true; // 避免重复弹邀请
                    this.startTutorial();
                });

                // 商店继续按钮
                document.getElementById('shopContinueBtn').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();
                    this.hideShop();
                    this.initLevel(this.level + 1);
                    this.state = 'PLAYING';
                });

                this.applyControlMode();
                this.updateCareerPanel();
            }

            applyControlMode() {
                const joyEl = document.getElementById('joystickContainer');
                const dpadEl = document.getElementById('dpadContainer');
                const modeText = document.getElementById('controlModeText');
                const modeIcon = document.getElementById('controlModeIcon');
                const hint = document.getElementById('gestureHint');

                const show = (el, on) => {
                    if (!el) return;
                    el.classList.toggle('hidden', !on);
                    if (el === dpadEl) el.classList.toggle('grid', on);
                };

                if (this.controlMode === 'JOYSTICK') {
                    show(joyEl, true);
                    show(dpadEl, false);
                    if (modeText) modeText.textContent = '摇杆';
                    if (modeIcon) modeIcon.textContent = '摇杆';
                } else if (this.controlMode === 'DPAD') {
                    show(joyEl, false);
                    show(dpadEl, true);
                    if (modeText) modeText.textContent = '十字键';
                    if (modeIcon) modeIcon.textContent = '手势';
                } else {
                    show(joyEl, false);
                    show(dpadEl, false);
                    if (modeText) modeText.textContent = '手势';
                    if (modeIcon) modeIcon.textContent = '手势';
                }
                if (hint) hint.classList.toggle('hidden', this.controlMode !== 'GESTURE');
            }

            togglePause() {
                if (this.state === 'PLAYING') {
                    this.state = 'PAUSED';
                    this.showModal('游戏已暂停', '喝口奶茶休息一下，随时切换难度或继续炸翻全场！', '继续游戏', '');
                } else if (this.state === 'PAUSED') {
                    this.state = 'PLAYING';
                    this.hideModal();
                }
            }

            showModal(title, desc, btnText, badgeIcon = 'bomb') {
                document.getElementById('modalTitle').textContent = title;
                document.getElementById('modalDesc').innerHTML = desc;
                document.getElementById('modalActionBtn').textContent = btnText;
                // 徽章用矢量图标绘制
                const badgeCanvas = document.getElementById('modalBadgeCanvas');
                if (badgeCanvas) {
                    const bctx = badgeCanvas.getContext('2d');
                    bctx.clearRect(0, 0, 44, 44);
                    if (badgeIcon) {
                        this.drawIcon(badgeIcon, 22, 22, 36, bctx);
                    }
                }
                document.getElementById('overlayModal').classList.remove('hidden');
            }

            hideModal() {
                document.getElementById('overlayModal').classList.add('hidden');
            }

            // ============ 新手交互式教学 ============
            tutorialDone() {
                try {
                    return localStorage.getItem('zhazhazha_tutorial_v1') === 'done';
                } catch (e) {
                    return true; // 存储不可用时不打扰，直接视为已完成
                }
            }

            markTutorialDone() {
                try {
                    localStorage.setItem('zhazhazha_tutorial_v1', 'done');
                } catch (e) {}
            }

            showTutorialOffer() {
                document.getElementById('tutorialOffer').classList.remove('hidden');
            }

            hideTutorialOffer() {
                document.getElementById('tutorialOffer').classList.add('hidden');
            }

            startTutorial() {
                this.hideTutorialOffer();
                this.hideStartScreen();
                // 全新第 1 关作为教学沙盒
                this.score = 0;
                this.coins = 0;
                this.initLevel(1);
                this.enemies = [];
                this.powerups = [];
                this.bombs = [];
                // 教学保护：不会被自己的炸弹炸死
                this.playerStats.flameVestTimer = 999999;
                this.tutorial = {
                    active: true,
                    step: 0,
                    target: null,      // {c, r} 目标格
                    bombWasPlaced: false,
                    powerupCount: 0,
                    wasHit: false
                };
                document.getElementById('tutorialHud').classList.remove('hidden');
                this.state = 'PLAYING';
                this.setupTutorialStep(0);
                this.sound.playLevelStart();
            }

            tutorialSteps() {
                const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
                const moveHint = isTouch ? '拖动左侧摇杆' : '用 WASD / 方向键';
                const bombHint = isTouch ? '点击右下角"放炸弹"按钮' : '按空格 / J';
                return [
                    { text: `${moveHint}，移动到发光绿圈里` },
                    { text: `${bombHint}，放下一颗炸弹` },
                    { text: `快离开红色爆炸范围！等炸弹炸完` },
                    { text: `走到发光道具上拾取它` },
                    { text: `放炸弹击败那只史莱姆（它不会动）` },
                    { text: `进入发光的传送门，完成教学！` }
                ];
            }

            setupTutorialStep(step) {
                const t = this.tutorial;
                t.step = step;
                t.target = null;
                t.bombWasPlaced = false;
                t.wasHit = false;
                document.getElementById('btnPlaceBomb').classList.remove('tutorial-highlight');

                const steps = this.tutorialSteps();
                document.getElementById('tutorialStepLabel').textContent = `${step + 1}/6`;
                document.getElementById('tutorialText').textContent = steps[step].text;

                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);

                if (step === 0) {
                    // 目标：玩家右侧 3 格（找空地）
                    t.target = this.findTutorialEmpty(pCol + 3, pRow);
                } else if (step === 1) {
                    document.getElementById('btnPlaceBomb').classList.add('tutorial-highlight');
                } else if (step === 3) {
                    // 放一个炸弹容量道具在玩家附近
                    const spot = this.findTutorialEmpty(pCol + 2, pRow + 1);
                    if (spot) {
                        this.powerups.push({
                            col: spot.c, row: spot.r, type: 'BOMB_UP',
                            floatPhase: 0, spawnProtect: 0
                        });
                        t.target = spot;
                        t.powerupCount = this.powerups.length;
                    }
                } else if (step === 4) {
                    // 放一只不会动的史莱姆
                    const spot = this.findTutorialEmpty(pCol + 3, pRow);
                    if (spot) {
                        const e = this.createSingleEnemyAt(spot.c, spot.r, DIFFICULTY_TIERS[0], false);
                        e.hp = 1; e.maxHp = 1;
                        e.tutorialFrozen = true;
                        this.enemies.push(e);
                        t.target = spot;
                    }
                } else if (step === 5) {
                    // 传送门设为已激活
                    if (this.portal) {
                        this.portal.revealed = true;
                        this.portal.active = true;
                        t.target = { c: this.portal.col, r: this.portal.row };
                    } else {
                        t.target = this.findTutorialEmpty(pCol + 2, pRow);
                    }
                    this.showToast('传送门已开启！', 'swirl');
                }
                this.sound.playClick();
            }

            findTutorialEmpty(c, r) {
                // 找最近的空地（优先目标格本身）
                for (let rad = 0; rad < 6; rad++) {
                    for (let dr = -rad; dr <= rad; dr++) {
                        for (let dc = -rad; dc <= rad; dc++) {
                            if (Math.max(Math.abs(dc), Math.abs(dr)) !== rad) continue;
                            const cc = c + dc, rr = r + dr;
                            if (rr > 0 && rr < this.mapRows - 1 && cc > 0 && cc < this.mapCols - 1 &&
                                this.grid[rr][cc] === TILE.EMPTY) {
                                return { c: cc, r: rr };
                            }
                        }
                    }
                }
                return null;
            }

            updateTutorial() {
                const t = this.tutorial;
                if (!t || !t.active) return;
                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);
                const atTarget = (t.target && pCol === t.target.c && pRow === t.target.r);

                if (t.step === 0 && atTarget) {
                    this.tutorialNext('移动得很好！');
                } else if (t.step === 1 && this.bombs.length > 0) {
                    t.bombWasPlaced = true;
                    this.tutorialNext('放弹成功！');
                } else if (t.step === 2 && t.bombWasPlaced && this.bombs.length === 0) {
                    // 炸弹炸完了，根据是否被炸到给反馈（有保护不会真死）
                    this.tutorialNext(t.wasHit ? '被炸到了！还好有保护——记住要跑出红圈' : '完美躲避！');
                } else if (t.step === 3 && this.powerups.length < t.powerupCount) {
                    this.tutorialNext('拾取成功！注意：炸到道具会引来怪物');
                } else if (t.step === 4 && this.enemies.length === 0) {
                    this.tutorialNext('击败！炸弹是十字范围的');
                } else if (t.step === 5 && atTarget) {
                    this.endTutorial(true);
                }
            }

            tutorialNext(msg) {
                if (msg) this.showToast(msg, 'star');
                this.sound.playPowerup();
                const next = this.tutorial.step + 1;
                if (next >= 6) {
                    this.endTutorial(true);
                } else {
                    this.setupTutorialStep(next);
                }
            }

            endTutorial(completed) {
                const t = this.tutorial;
                if (t) t.active = false;
                document.getElementById('tutorialHud').classList.add('hidden');
                document.getElementById('btnPlaceBomb').classList.remove('tutorial-highlight');
                // 清理教学残留
                this.enemies = this.enemies.filter(e => !e.tutorialFrozen);
                if (completed) {
                    this.markTutorialDone();
                    this.showToast('教学完成！开始真正的冒险吧', 'trophy', 2200);
                    this.sound.playWin();
                }
                // 重新开一局干净的第 1 关
                this.score = 0;
                this.coins = 0;
                this.initLevel(1);
                this.state = 'PLAYING';
            }

            skipTutorial() {
                this.sound.playClick();
                this.endTutorial(false);
            }

            // 教学目标标记：发光绿圈 / 传送门高亮
            drawTutorialMarkers() {
                const t = this.tutorial;
                if (!t || !t.active || !t.target) return;
                const ctx = this.ctx;
                const x = (t.target.c + 0.5) * TILE_SIZE;
                const y = (t.target.r + 0.5) * TILE_SIZE;
                const pulse = 1 + Math.sin(performance.now() / 300) * 0.12;
                ctx.save();
                ctx.strokeStyle = t.step === 5 ? '#22d3ee' : '#22c55e';
                ctx.lineWidth = 5;
                ctx.globalAlpha = 0.9;
                ctx.beginPath();
                ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
                ctx.stroke();
                ctx.globalAlpha = 0.25;
                ctx.fillStyle = t.step === 5 ? '#22d3ee' : '#22c55e';
                ctx.beginPath();
                ctx.arc(x, y, 26 * pulse, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }


            // ============ 首页：底部锚点 + 中部舞台 ============
            showStartScreen() {
                this.state = 'MENU';
                this.hideModal();
                this.hideShop();
                document.getElementById('startScreen').classList.remove('hidden');
                this.updateCareerPanel();
                this.setDifficulty(this.difficultyIdx || 0);
                this.syncStartSoundIcon();
            }

            hideStartScreen() {
                document.getElementById('startScreen').classList.add('hidden');
            }

            showDiffSheet() {
                document.getElementById('diffSheet').classList.remove('hidden');
            }

            hideDiffSheet() {
                document.getElementById('diffSheet').classList.add('hidden');
            }

            showHelpModal() {
                document.getElementById('helpModal').classList.remove('hidden');
            }

            hideHelpModal() {
                document.getElementById('helpModal').classList.add('hidden');
            }

            showCareerPop() {
                this.updateCareerPanel();
                document.getElementById('careerPop').classList.remove('hidden');
            }

            hideCareerPop() {
                document.getElementById('careerPop').classList.add('hidden');
            }

            syncStartSoundIcon() {
                const cv = document.getElementById('startSoundIcon');
                if (cv && this.drawIcon) {
                    const cctx = cv.getContext('2d');
                    cctx.clearRect(0, 0, 22, 22);
                    this.drawIcon(this.sound.enabled ? 'speaker' : 'speakerOff', 11, 11, 18, cctx);
                }
            }

            startGameFromMenu() {
                this.sound.init();
                this.sound.playClick();
                // 首次游玩：先邀请新手教学
                if (!this.tutorialDone() && !this._tutorialOffered) {
                    this._tutorialOffered = true;
                    this.showTutorialOffer();
                    return;
                }
                const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
                const portrait = window.innerHeight > window.innerWidth;
                if (isTouch && portrait && !this.rotateMode && !this._rotateSuggested) {
                    this._rotateSuggested = true;
                    this.setRotateMode(true);
                }
                this.hideStartScreen();
                this.hideDiffSheet();
                this.state = 'PLAYING';
            }

            // 主角立绘：首页中部舞台，大号炸弹人 + 呼吸浮动 + 眨眼
            drawHero() {
                const cv = document.getElementById('heroCanvas');
                if (!cv) return;
                const hctx = cv.getContext('2d');
                const W = cv.width, H = cv.height;
                hctx.clearRect(0, 0, W, H);

                const t = performance.now() / 1000;
                const bob = Math.sin(t * 2.2) * 6;
                const breath = 1 + Math.sin(t * 3.1) * 0.025;
                const blink = (t % 3.7) < 0.12;

                hctx.save();
                hctx.translate(W / 2, H / 2 + bob);
                hctx.scale(3.1 * breath, 3.1 * (2 - breath));

                // 阴影
                hctx.fillStyle = 'rgba(20, 60, 40, 0.18)';
                hctx.beginPath();
                hctx.ellipse(0, 24 - bob * 0.3, 20, 7, 0, 0, Math.PI * 2);
                hctx.fill();

                // 脚
                hctx.fillStyle = '#f43f5e';
                hctx.beginPath();
                hctx.arc(-8, 20, 6, 0, Math.PI * 2);
                hctx.arc(8, 20, 6, 0, Math.PI * 2);
                hctx.fill();

                // 腰带
                hctx.fillStyle = '#2563eb';
                drawRoundRect(hctx, -13, 6, 26, 13, 6);
                hctx.fill();
                hctx.fillStyle = '#facc15';
                hctx.fillRect(-12, 12, 24, 3.5);

                // 手
                hctx.fillStyle = '#f43f5e';
                hctx.beginPath();
                hctx.arc(-17, 10, 5, 0, Math.PI * 2);
                hctx.arc(17, 10, 5, 0, Math.PI * 2);
                hctx.fill();

                // 天线
                hctx.strokeStyle = '#ffffff';
                hctx.lineWidth = 3.5;
                hctx.beginPath();
                hctx.moveTo(0, -20);
                hctx.lineTo(0, -28);
                hctx.stroke();
                hctx.fillStyle = '#ec4899';
                hctx.beginPath();
                hctx.arc(0, -31, 6, 0, Math.PI * 2);
                hctx.fill();
                hctx.fillStyle = 'rgba(255,255,255,0.55)';
                hctx.beginPath();
                hctx.arc(-2, -33, 2, 0, Math.PI * 2);
                hctx.fill();

                // 身体
                hctx.fillStyle = '#ffffff';
                drawRoundRect(hctx, -21, -22, 42, 30, 15);
                hctx.fill();
                hctx.strokeStyle = '#cbd5e1';
                hctx.lineWidth = 2;
                hctx.stroke();

                // 脸
                hctx.fillStyle = '#fed7aa';
                drawRoundRect(hctx, -14, -14, 28, 17, 8);
                hctx.fill();

                hctx.fillStyle = '#0f172a';
                if (blink) {
                    hctx.lineWidth = 2.4;
                    hctx.strokeStyle = '#0f172a';
                    hctx.beginPath();
                    hctx.moveTo(-9, -5); hctx.lineTo(-4, -5);
                    hctx.moveTo(4, -5); hctx.lineTo(9, -5);
                    hctx.stroke();
                } else {
                    hctx.beginPath();
                    hctx.ellipse(-6.5, -5.5, 2.6, 4.6, 0, 0, Math.PI * 2);
                    hctx.ellipse(6.5, -5.5, 2.6, 4.6, 0, 0, Math.PI * 2);
                    hctx.fill();
                    hctx.fillStyle = '#ffffff';
                    hctx.beginPath();
                    hctx.arc(-7.2, -7.4, 1.1, 0, Math.PI * 2);
                    hctx.arc(5.8, -7.4, 1.1, 0, Math.PI * 2);
                    hctx.fill();
                }
                // 腮红
                hctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
                hctx.beginPath();
                hctx.arc(-11, -2, 3, 0, Math.PI * 2);
                hctx.arc(11, -2, 3, 0, Math.PI * 2);
                hctx.fill();

                hctx.restore();
            }

            showShop() {
                this.renderShop();
                document.getElementById('shopModal').classList.remove('hidden');
            }

            hideShop() {
                document.getElementById('shopModal').classList.add('hidden');
            }

            renderShop() {
                const container = document.getElementById('shopItems');
                if (!container) return;
                const up = this.save.data.upgrades;
                let html = '';

                for (const item of SHOP_ITEMS) {
                    const lvl = up[item.key] || 0;
                    const cost = getUpgradeCost(item, lvl);
                    const maxed = cost === null;
                    const canBuy = !maxed && this.coins >= cost;

                    const cls = maxed
                        ? 'shop-item maxed'
                        : (canBuy ? 'shop-item buyable candy-btn' : 'shop-item');
                    const costLabel = maxed
                        ? '<span class="text-[11px] font-black text-emerald-500">已满级</span>'
                        : `<span class="text-[11px] font-black ${canBuy ? 'text-yellow-600' : 'text-slate-400'}">${cost} 金币</span>`;

                    html += `
                        <button data-key="${item.key}" class="${cls}" ${canBuy ? '' : 'disabled'}>
                            <span class="w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center border-2 border-white shadow"><canvas class="shop-icon" data-icon="${item.icon}" width="30" height="30"></canvas></span>
                            <span class="flex-1 min-w-0 text-left">
                                <span class="block text-xs font-black text-slate-800 flex items-center gap-1">
                                    ${item.name}
                                    <span class="text-[9px] font-bold text-slate-400">Lv.${lvl}/${item.max}</span>
                                </span>
                                <span class="block text-[10px] text-slate-500 font-bold truncate">${item.desc}</span>
                            </span>
                            ${costLabel}
                        </button>
                    `;
                }

                container.innerHTML = html;
                // 绘制商店矢量图标
                container.querySelectorAll('.shop-icon').forEach(cv => {
                    const bctx = cv.getContext('2d');
                    bctx.clearRect(0, 0, 30, 30);
                    this.drawIcon(cv.dataset.icon, 15, 15, 24, bctx);
                });

                container.querySelectorAll('.shop-item').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.sound.playClick();
                        if (btn.disabled) return;
                        const key = btn.getAttribute('data-key');
                        this.buyUpgrade(key);
                    });
                });

                document.getElementById('shopCoins').textContent = this.coins;
                document.getElementById('shopContinueBtn').textContent = `进入第 ${this.level + 1} 关`;
            }

            buyUpgrade(key) {
                const item = SHOP_ITEMS.find(i => i.key === key);
                if (!item) return;

                const up = this.save.data.upgrades;
                const lvl = up[key] || 0;
                const cost = getUpgradeCost(item, lvl);

                if (cost === null || this.coins < cost) {
                    this.sound.playPortalLocked();
                    return;
                }

                this.coins -= cost;
                up[key] = lvl + 1;
                this.save.save();

                this.sound.playPurchase();
                this.renderShop();
            }

            updateCareerPanel() {
                const d = this.save.data;
                const set = (id, v) => {
                    const el = document.getElementById(id);
                    if (el) el.textContent = v;
                };
                set('careerBest2', d.bestScore.toLocaleString());
                set('careerKills2', d.totalKills.toLocaleString());
                set('careerLevels2', d.totalLevelsCleared);
            }

            updateHUD() {
                const maxB = this.feverTimer > 0 ? 8 : this.playerStats.maxBombs;
                const rng = this.feverTimer > 0 ? Math.max(this.playerStats.bombRange, 6) : this.playerStats.bombRange;

                document.getElementById('hudLevel').textContent = this.level;
                document.getElementById('hudScore').textContent = this.score;
                document.getElementById('hudCoins').textContent = this.coins > 0 ? `${this.coins}` : 0;
                document.getElementById('hudLives').textContent = this.playerStats.hasShield
                    ? `${this.playerStats.lives}(盾)`
                    : this.playerStats.lives;
                document.getElementById('hudBombs').textContent = `${Math.max(0, maxB - this.bombs.length)}/${maxB}`;
                document.getElementById('hudRange').textContent = rng;
                document.getElementById('hudEnemies').textContent = this.enemies.length;

                const feverBar = document.getElementById('hudFeverBar');
                const feverLabel = document.getElementById('feverLabel');
                if (this.feverTimer > 0) {
                    const pct = Math.min(100, (this.feverTimer / 480) * 100);
                    feverBar.style.width = `${pct}%`;
                    feverLabel.textContent = '狂暴中!';
                } else {
                    feverBar.style.width = `${Math.min(100, this.feverGauge)}%`;
                    feverLabel.textContent = '狂暴';
                }

                const megaBar = document.getElementById('hudMegaBar');
                const megaReady = this.megaCharge >= MEGA_COST;
                megaBar.style.width = megaReady ? '100%' : `${Math.min(100, (this.megaCharge / MEGA_COST) * 100)}%`;

                const btnMega = document.getElementById('btnMegaBomb');
                const megaBtnLabel = document.getElementById('megaBtnLabel');
                if (megaReady) {
                    btnMega.classList.remove('hidden');
                    btnMega.classList.add('flex', 'mega-glow');
                    megaBtnLabel.textContent = '必杀(L)';
                } else {
                    btnMega.classList.add('hidden');
                    btnMega.classList.remove('flex', 'mega-glow');
                }

                let buffs = '';
                if (this.playerStats.hasRemote) buffs += '遥控 ';
                if (this.playerStats.ghostTimer > 0) buffs += `穿墙${Math.ceil(this.playerStats.ghostTimer / 60)}s `;
                if (this.playerStats.flameVestTimer > 0) buffs += `防炸${Math.ceil(this.playerStats.flameVestTimer / 60)}s `;
                if (megaReady) buffs += '必杀!';
                document.getElementById('buffIcons').textContent = buffs;

                const mobileHint = document.getElementById('mobileBuffHint');
                if (mobileHint) {
                    mobileHint.textContent = megaReady ? '超必杀就绪! 按 L 引爆!' : (buffs ? `当前增益: ${buffs}` : '别炸毁道具(会爆怪)!');
                }

                const btnDetonate = document.getElementById('btnDetonateRemote');
                if (this.playerStats.hasRemote) {
                    btnDetonate.classList.remove('hidden');
                    btnDetonate.classList.add('flex');
                } else {
                    btnDetonate.classList.add('hidden');
                    btnDetonate.classList.remove('flex');
                }

                const questBanner = document.getElementById('questBanner');
                if (this.enemies.length > 0) {
                    questBanner.textContent = `消灭剩余怪物 (${this.enemies.length}) 以激活传送门！`;
                    questBanner.className = 'flex-1 max-w-[320px] mx-1 px-2 py-1 rounded-xl bg-amber-100/90 border-2 border-amber-300 text-amber-900 font-black text-[10px] sm:text-xs text-center truncate shadow-inner transition-colors duration-300';
                } else {
                    if (this.portal && this.portal.revealed) {
                        questBanner.textContent = '传送门已开启！快进去吧！';
                    } else {
                        questBanner.textContent = '传送门已解封！炸开木箱找到它并进入！';
                    }
                    questBanner.className = 'flex-1 max-w-[320px] mx-1 px-2 py-1 rounded-xl bg-emerald-100 border-2 border-emerald-400 text-emerald-800 font-black text-[10px] sm:text-xs text-center truncate shadow-sm quest-active transition-colors duration-300';
                }

                this.updateMobaHud();
            }

            showComboToast(text, sub, color = '#ec4899') {
                const toast = document.getElementById('comboToast');
                const tText = document.getElementById('comboToastText');
                const tSub = document.getElementById('comboToastSub');
                if (!toast) return;

                tText.textContent = text;
                tText.style.color = color;
                tSub.textContent = sub || '';
                toast.classList.remove('hidden');
                const inner = tText.parentElement;
                inner.classList.remove('combo-pop');
                void inner.offsetWidth;
                inner.classList.add('combo-pop');

                clearTimeout(this._toastTimer);
                this._toastTimer = setTimeout(() => this.hideComboToast(), 1300);
            }

            hideComboToast() {
                const toast = document.getElementById('comboToast');
                if (toast) toast.classList.add('hidden');
            }

            getScoreMult() {
                if (this.comboChain < 2) return 1;
                return Math.min(2.5, 1 + (this.comboChain - 1) * 0.12);
            }

            updateComboMeter() {
                const el = document.getElementById('comboMeter');
                const txt = document.getElementById('comboMeterText');
                if (!el || !txt) return;

                if (this.comboChain >= 3 && this.comboTimer > 0) {
                    const mult = this.getScoreMult();
                    txt.textContent = `COMBO ×${this.comboChain} · 得分 ×${mult.toFixed(1)}`;
                    el.classList.remove('hidden');
                    el.style.animation = 'none';
                    void el.offsetWidth;
                    el.style.animation = 'multPop 0.3s cubic-bezier(0.34,1.56,0.64,1)';
                } else {
                    el.classList.add('hidden');
                }
            }

            registerKillForCombo() {
                this.comboChain++;
                this.comboTimer = 110;
                if (this.comboChain > this.bestChain) this.bestChain = this.comboChain;

                let label = null, color = '#0ea5e9';
                if (this.comboChain >= 9) { label = `ULTRA COMBO x${this.comboChain}!!`; color = '#d946ef'; }
                else if (this.comboChain >= 7) { label = `SUPER! x${this.comboChain}`; color = '#ec4899'; }
                else if (this.comboChain >= 5) { label = `COMBO x${this.comboChain}!`; color = '#f59e0b'; }
                else if (this.comboChain >= 3) { label = `NICE! x${this.comboChain}`; color = '#10b981'; }

                if (label) {
                    this.sound.playComboChain(this.comboChain);
                    const bonus = Math.min(2000, this.comboChain * 40);
                    this.score += bonus;
                    this.showComboToast(label, `连杀奖励 +${bonus} · 得分 ×${this.getScoreMult().toFixed(1)}`, color);
                }
                this.updateComboMeter();
            }

            registerCoin(amount, x, y, silent = false) {
                if (amount <= 0) return;
                this.coins += amount;
                this.save.data.totalCoinsEarned += amount;

                if (!silent) {
                    this.sound.playCoin();
                    this.addFloatingText(x, y, `+${amount} 金币`, '#eab308', 16);
                }

                if (!this.goldenSpawned && this.coins >= this.nextGoldenAt) {
                    this.spawnGoldenBag();
                }
                this.updateHUD();
            }

            spawnGoldenBag() {
                const spots = [];
                for (let r = 1; r < this.mapRows - 1; r++) {
                    for (let c = 1; c < this.mapCols - 1; c++) {
                        if (this.grid[r][c] === TILE.EMPTY) spots.push({ c, r });
                    }
                }
                if (spots.length === 0) return;

                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);
                const farSpots = spots.filter(s => (Math.abs(s.c - pCol) + Math.abs(s.r - pRow)) > 3);
                const pool = farSpots.length > 0 ? farSpots : spots;
                const spot = pool[Math.floor(Math.random() * pool.length)];

                this.goldenSpawned = true;
                this.powerups.push({
                    col: spot.c,
                    row: spot.r,
                    type: 'GOLDEN_BAG',
                    floatPhase: Math.random() * Math.PI * 2,
                    spawnProtect: 60,
                    amount: 60 + this.level * 15
                });
                this.anyItemSpawned = true;

                this.sound.playNotify();
                this.showToast('金币达标！木箱里翻出金袋！', 'coin');
            }

            updateDangerState(dtScale) {
                let near = 0;
                for (let i = 0; i < this.enemies.length; i++) {
                    const e = this.enemies[i];
                    if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < TILE_SIZE * 3.4) near++;
                }

                this.dangerLevel = near;
                if (this.dangerRingEl) {
                    if (near > 0 && this.state === 'PLAYING') {
                        this.dangerRingEl.classList.remove('hidden');
                        this.dangerRingEl.style.animationDuration = `${Math.max(0.42, 1.15 - near * 0.09)}s`;
                    } else {
                        this.dangerRingEl.classList.add('hidden');
                    }
                }
                return near;
            }

            addShake(mag) {
                this.shakeAmt = Math.max(this.shakeAmt, mag);
            }

            triggerMegaBomb() {
                if (this.megaCharge < MEGA_COST) {
                    if (this.state === 'PLAYING') {
                        this.showToast(`魔力不足 (${this.megaCharge}/${MEGA_COST})`, 'star', 1200);
                    }
                    return false;
                }
                if (this.state !== 'PLAYING') return false;

                this.megaCharge -= MEGA_COST;
                this.screenFlashTimer = 30;
                this.megaFlashTimer = 34;
                this.sound.playMegaBomb();
                this.sound.vibrate([80, 50, 120]);
                this.addShake(18);

                const centerCol = Math.floor(this.player.x / TILE_SIZE);
                const centerRow = Math.floor(this.player.y / TILE_SIZE);
                const stats = { obstacles: 0, enemies: 0 };
                const killedCells = [];

                for (let dr = -MEGA_RADIUS; dr <= MEGA_RADIUS; dr++) {
                    for (let dc = -MEGA_RADIUS; dc <= MEGA_RADIUS; dc++) {
                        const c = centerCol + dc;
                        const r = centerRow + dr;
                        if (r <= 0 || r >= this.mapRows - 1 || c <= 0 || c >= this.mapCols - 1) continue;
                        if (Math.abs(dr) + Math.abs(dc) > MEGA_RADIUS + 2) continue;

                        const tile = this.grid[r][c];
                        if (tile === TILE.WALL) continue;

                        const bIdx = this.bombs.findIndex(b => b.col === c && b.row === r);
                        if (bIdx !== -1) this.detonateBomb(bIdx, stats);

                        if (tile === TILE.FROST_CRATE) {
                            this.crackFrostCrate(c, r);
                            this.destroyCrate(c, r);
                            stats.obstacles++;
                        } else if (tile === TILE.CRATE) {
                            this.destroyCrate(c, r);
                            stats.obstacles++;
                        } else if (tile === TILE.VINE) {
                            this.destroyVine(c, r);
                            stats.obstacles++;
                        }

                        const itemIdx = this.powerups.findIndex(pw => pw.col === c && pw.row === r && pw.type !== 'GOLDEN_BAG');
                        if (itemIdx !== -1) {
                            const destroyed = this.powerups.splice(itemIdx, 1)[0];
                            this.spawnMonstersFromDestroyedPowerup(destroyed);
                        }

                        killedCells.push({ col: c, row: r });
                    }
                }

                killedCells.forEach(cell => {
                    const cx = (cell.col + 0.5) * TILE_SIZE;
                    const cy = (cell.row + 0.5) * TILE_SIZE;
                    for (let i = 0; i < 4; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const spd = 2 + Math.random() * 6;
                        this.particles.push({
                            x: cx,
                            y: cy,
                            vx: Math.cos(angle) * spd,
                            vy: Math.sin(angle) * spd,
                            radius: 5 + Math.random() * 6,
                            color: ['#f472b6', '#c084fc', '#facc15', '#38bdf8', '#ffffff'][Math.floor(Math.random() * 5)],
                            life: 34 + Math.random() * 16,
                            maxLife: 50
                        });
                    }
                });

                for (let j = this.enemies.length - 1; j >= 0; j--) {
                    const e = this.enemies[j];
                    const ec = Math.floor(e.x / TILE_SIZE);
                    const er = Math.floor(e.y / TILE_SIZE);
                    if (Math.abs(ec - centerCol) <= MEGA_RADIUS + 1 && Math.abs(er - centerRow) <= MEGA_RADIUS + 1) {
                        e.hurtTimer = 0;
                        const killed = this.damageEnemy(j, 3);
                        if (killed) stats.enemies++;
                    }
                }

                for (let i = 0; i < 46; i++) {
                    const angle = (Math.PI * 2 * i) / 46;
                    this.particles.push({
                        x: this.player.x,
                        y: this.player.y,
                        vx: Math.cos(angle) * 9,
                        vy: Math.sin(angle) * 9,
                        radius: 7,
                        color: ['#fde047', '#f472b6', '#c084fc'][i % 3],
                        life: 30,
                        maxLife: 30
                    });
                }

                this.showToast('超必杀 · 全屏巨爆！', 'star', 2000);
                this.showComboToast(' MEGA BOMB!', `魔力 -${MEGA_COST}`, '#d946ef');
                this.evaluateMatch3Combo(stats);
                this.updateHUD();
                return true;
            }

            getInputVector() {
                let kx = 0, ky = 0;
                if (this.keys['ArrowLeft'] || this.keys['KeyA']) kx -= 1;
                if (this.keys['ArrowRight'] || this.keys['KeyD']) kx += 1;
                if (this.keys['ArrowUp'] || this.keys['KeyW']) ky -= 1;
                if (this.keys['ArrowDown'] || this.keys['KeyS']) ky += 1;

                if (kx !== 0 && ky !== 0) {
                    const invLen = 1 / Math.SQRT2;
                    kx *= invLen;
                    ky *= invLen;
                }

                if (kx !== 0 || ky !== 0) {
                    return { dx: kx, dy: ky };
                }

                if (this.joystickVector && (this.joystickVector.x !== 0 || this.joystickVector.y !== 0)) {
                    return { dx: this.joystickVector.x, dy: this.joystickVector.y };
                }

                if (this.touchDir) {
                    if (this.touchDir === 'UP') return { dx: 0, dy: -1 };
                    if (this.touchDir === 'DOWN') return { dx: 0, dy: 1 };
                    if (this.touchDir === 'LEFT') return { dx: -1, dy: 0 };
                    if (this.touchDir === 'RIGHT') return { dx: 1, dy: 0 };
                }

                return { dx: 0, dy: 0 };
            }

            setTouchDir(dir) {
                if (this.controlMode === 'GESTURE' && dir !== null && this._fromJoystick) return;
                this.touchDir = dir;
            }

            isTileSolidForPlayer(col, row, playerCol, playerRow) {
                if (row < 0 || row >= this.mapRows || col < 0 || col >= this.mapCols) return true;
                const tile = this.grid[row][col];
                if (tile === TILE.WALL) return true;

                const hasGhost = this.playerStats.ghostTimer > 0;
                if ((tile === TILE.CRATE || tile === TILE.FROST_CRATE) && !hasGhost) return true;

                const hasBomb = this.bombs.some(b => b.col === col && b.row === row && !b.playerAllowed);
                if (hasBomb && !hasGhost) {
                    return true;
                }
                return false;
            }

            canPlayerOccupy(x, y, curCol, curRow) {
                const r = 17.5;
                const minCol = Math.floor((x - r + 0.1) / TILE_SIZE);
                const maxCol = Math.floor((x + r - 0.1) / TILE_SIZE);
                const minRow = Math.floor((y - r + 0.1) / TILE_SIZE);
                const maxRow = Math.floor((y + r - 0.1) / TILE_SIZE);

                for (let rIdx = minRow; rIdx <= maxRow; rIdx++) {
                    for (let cIdx = minCol; cIdx <= maxCol; cIdx++) {
                        if (this.isTileSolidForPlayer(cIdx, rIdx, curCol, curRow)) {
                            return false;
                        }
                    }
                }
                return true;
            }

            updatePlayer(dtScale) {
                const p = this.player;
                if (p.invincibleTimer > 0) p.invincibleTimer -= dtScale;
                if (this.playerStats.ghostTimer > 0) {
                    this.playerStats.ghostTimer = Math.max(0, this.playerStats.ghostTimer - dtScale);
                }
                if (this.playerStats.flameVestTimer > 0) {
                    this.playerStats.flameVestTimer = Math.max(0, this.playerStats.flameVestTimer - dtScale);
                }
                if (this.feverTimer > 0) {
                    this.feverTimer = Math.max(0, this.feverTimer - dtScale);
                }
                if (this.megaFlashTimer > 0) {
                    this.megaFlashTimer = Math.max(0, this.megaFlashTimer - dtScale);
                }
                if (this.portal && this.portal.lockedHintCooldown > 0) {
                    this.portal.lockedHintCooldown -= dtScale;
                }

                if (this.comboTimer > 0) {
                    this.comboTimer -= dtScale;
                    if (this.comboTimer <= 0) {
                        this.comboChain = 0;
                        this.updateComboMeter();
                    }
                }

                this.levelElapsed += dtScale / 60;

                for (let i = 0; i < this.powerups.length; i++) {
                    if (this.powerups[i].spawnProtect > 0) {
                        this.powerups[i].spawnProtect = Math.max(0, this.powerups[i].spawnProtect - dtScale);
                    }
                }

                p.blinkTimer += dtScale;
                if (p.blinkTimer > 150) {
                    p.isBlinking = true;
                    if (p.blinkTimer > 160) {
                        p.isBlinking = false;
                        p.blinkTimer = 0;
                    }
                }

                // 炸弹脱离判定：刚落下的炸弹允许自由脱离，一旦完全走离即变为实体障碍
                const r = 17.5;
                const pBoxLeft = p.x - r, pBoxRight = p.x + r;
                const pBoxTop = p.y - r, pBoxBottom = p.y + r;
                for (let bi = 0; bi < this.bombs.length; bi++) {
                    const b = this.bombs[bi];
                    if (b.playerAllowed) {
                        const bLeft = b.col * TILE_SIZE;
                        const bRight = (b.col + 1) * TILE_SIZE;
                        const bTop = b.row * TILE_SIZE;
                        const bBottom = (b.row + 1) * TILE_SIZE;
                        const overlap = (pBoxLeft < bRight && pBoxRight > bLeft && pBoxTop < bBottom && pBoxBottom > bTop);
                        if (!overlap) {
                            b.playerAllowed = false;
                        }
                    }
                }

                const curCol = Math.floor(p.x / TILE_SIZE);
                const curRow = Math.floor(p.y / TILE_SIZE);
                const onVine = this.grid[curRow] && this.grid[curRow][curCol] === TILE.VINE;

                const rawInput = this.getInputVector();
                // ---- 移动平滑优化：输入抖动过滤 + 加速/减速曲线 ----
                // 1) 对原始输入做指数平滑，过滤摇杆指针事件的抖动（键盘 0/1 输入不受影响）
                const smoothK = Math.min(1, 0.5 * dtScale);
                this.smoothDir.x += (rawInput.dx - this.smoothDir.x) * smoothK;
                this.smoothDir.y += (rawInput.dy - this.smoothDir.y) * smoothK;
                let dx = this.smoothDir.x;
                let dy = this.smoothDir.y;
                if (Math.hypot(dx, dy) < 0.12) {
                    dx = 0; dy = 0;
                    this.smoothDir.x = 0; this.smoothDir.y = 0;
                }
                // 2) 加速/减速混合：起步抬速、急停都有平滑过渡，不再是 0/1 硬切换
                const wantMove = (dx !== 0 || dy !== 0) ? 1 : 0;
                const blendRate = wantMove > this.moveBlend ? 0.38 : 0.55;
                this.moveBlend += (wantMove - this.moveBlend) * Math.min(1, blendRate * dtScale);
                if (this.moveBlend < 0.02) this.moveBlend = 0;
                const mdx = dx * this.moveBlend;
                const mdy = dy * this.moveBlend;

                if (mdx === 0 && mdy === 0) {
                    p.isMoving = false;
                } else {
                    p.isMoving = true;
                    p.walkCycle += 0.22 * dtScale;
                    // 朝向用原始输入判定，转向保持灵敏
                    if (Math.abs(rawInput.dy) > Math.abs(rawInput.dx)) {
                        p.dir = rawInput.dy < 0 ? 'UP' : 'DOWN';
                    } else if (Math.abs(rawInput.dx) > 0.05) {
                        p.dir = rawInput.dx < 0 ? 'LEFT' : 'RIGHT';
                    }

                    let baseSpd = this.playerStats.speed;
                    if (this.feverTimer > 0) baseSpd = Math.max(baseSpd * 1.35, 4.8);
                    if (this.dangerLevel > 0) baseSpd *= 1 + Math.min(0.45, this.dangerLevel * 0.075);
                    if (onVine && this.playerStats.ghostTimer <= 0) baseSpd *= 0.48;

                    const speed = baseSpd * dtScale;
                    const moveStepX = mdx * speed;
                    const moveStepY = mdy * speed;

                    // X 轴独立移动检测与转角平滑辅助
                    if (Math.abs(moveStepX) > 0.001) {
                        const signX = Math.sign(moveStepX);
                        const targetX = p.x + moveStepX;

                        if (this.canPlayerOccupy(targetX, p.y, curCol, curRow)) {
                            p.x = targetX;
                            // 纯横向移动时自动微调对准通道中线，过弯顺畅不刮墙
                            if (Math.abs(mdy) < 0.25) {
                                const laneCenterY = (Math.floor(p.y / TILE_SIZE) + 0.5) * TILE_SIZE;
                                const diffY = laneCenterY - p.y;
                                if (Math.abs(diffY) > 0.5) {
                                    const alignStep = Math.sign(diffY) * Math.min(Math.abs(diffY), speed * 0.45);
                                    if (this.canPlayerOccupy(p.x, p.y + alignStep, curCol, curRow)) {
                                        p.y += alignStep;
                                    }
                                }
                            }
                        } else {
                            // 拐角智能滑行：如果被障碍边缘刮到，自动往通畅方向平滑滑动绕行
                            const slideAmount = Math.min(speed * 0.95, 3.8 * dtScale);
                            let slid = false;
                            const canUp = this.canPlayerOccupy(p.x, p.y - slideAmount, curCol, curRow);
                            const canDown = this.canPlayerOccupy(p.x, p.y + slideAmount, curCol, curRow);
                            const upClear = this.canPlayerOccupy(targetX, p.y - slideAmount, curCol, curRow);
                            const downClear = this.canPlayerOccupy(targetX, p.y + slideAmount, curCol, curRow);

                            if (upClear && canUp && !downClear) {
                                p.y -= slideAmount;
                                if (this.canPlayerOccupy(targetX, p.y, curCol, curRow)) p.x = targetX;
                                slid = true;
                            } else if (downClear && canDown && !upClear) {
                                p.y += slideAmount;
                                if (this.canPlayerOccupy(targetX, p.y, curCol, curRow)) p.x = targetX;
                                slid = true;
                            }

                            if (!slid) {
                                // 紧贴障碍物边缘平滑停止，绝无瞬移后退
                                if (signX > 0) {
                                    const nextCol = Math.floor((p.x + r + moveStepX) / TILE_SIZE);
                                    const wallX = nextCol * TILE_SIZE - r - 0.05;
                                    if (wallX > p.x && this.canPlayerOccupy(wallX, p.y, curCol, curRow)) {
                                        p.x = wallX;
                                    }
                                } else {
                                    const prevCol = Math.floor((p.x - r + moveStepX) / TILE_SIZE);
                                    const wallX = (prevCol + 1) * TILE_SIZE + r + 0.05;
                                    if (wallX < p.x && this.canPlayerOccupy(wallX, p.y, curCol, curRow)) {
                                        p.x = wallX;
                                    }
                                }
                            }
                        }
                    }

                    // Y 轴独立移动检测与转角平滑辅助
                    if (Math.abs(moveStepY) > 0.001) {
                        const signY = Math.sign(moveStepY);
                        const targetY = p.y + moveStepY;

                        if (this.canPlayerOccupy(p.x, targetY, curCol, curRow)) {
                            p.y = targetY;
                            // 纯纵向移动时自动微调对准通道中线
                            if (Math.abs(mdx) < 0.25) {
                                const laneCenterX = (Math.floor(p.x / TILE_SIZE) + 0.5) * TILE_SIZE;
                                const diffX = laneCenterX - p.x;
                                if (Math.abs(diffX) > 0.5) {
                                    const alignStep = Math.sign(diffX) * Math.min(Math.abs(diffX), speed * 0.45);
                                    if (this.canPlayerOccupy(p.x + alignStep, p.y, curCol, curRow)) {
                                        p.x += alignStep;
                                    }
                                }
                            }
                        } else {
                            // 拐角智能滑行
                            const slideAmount = Math.min(speed * 0.95, 3.8 * dtScale);
                            let slid = false;
                            const canLeft = this.canPlayerOccupy(p.x - slideAmount, p.y, curCol, curRow);
                            const canRight = this.canPlayerOccupy(p.x + slideAmount, p.y, curCol, curRow);
                            const leftClear = this.canPlayerOccupy(p.x - slideAmount, targetY, curCol, curRow);
                            const rightClear = this.canPlayerOccupy(p.x + slideAmount, targetY, curCol, curRow);

                            if (leftClear && canLeft && !rightClear) {
                                p.x -= slideAmount;
                                if (this.canPlayerOccupy(p.x, targetY, curCol, curRow)) p.y = targetY;
                                slid = true;
                            } else if (rightClear && canRight && !leftClear) {
                                p.x += slideAmount;
                                if (this.canPlayerOccupy(p.x, targetY, curCol, curRow)) p.y = targetY;
                                slid = true;
                            }

                            if (!slid) {
                                if (signY > 0) {
                                    const nextRow = Math.floor((p.y + r + moveStepY) / TILE_SIZE);
                                    const wallY = nextRow * TILE_SIZE - r - 0.05;
                                    if (wallY > p.y && this.canPlayerOccupy(p.x, wallY, curCol, curRow)) {
                                        p.y = wallY;
                                    }
                                } else {
                                    const prevRow = Math.floor((p.y - r + moveStepY) / TILE_SIZE);
                                    const wallY = (prevRow + 1) * TILE_SIZE + r + 0.05;
                                    if (wallY < p.y && this.canPlayerOccupy(p.x, wallY, curCol, curRow)) {
                                        p.y = wallY;
                                    }
                                }
                            }
                        }
                    }
                }

                const pCol = Math.floor(p.x / TILE_SIZE);
                const pRow = Math.floor(p.y / TILE_SIZE);
                for (let i = this.powerups.length - 1; i >= 0; i--) {
                    const item = this.powerups[i];
                    if (item.col === pCol && item.row === pRow) {
                        this.collectPowerup(item);
                        this.powerups.splice(i, 1);
                    }
                }

                if (this.portal && this.portal.revealed && pCol === this.portal.col && pRow === this.portal.row) {
                    const portalCenterX = (this.portal.col + 0.5) * TILE_SIZE;
                    const portalCenterY = (this.portal.row + 0.5) * TILE_SIZE;
                    const distToPortal = Math.hypot(p.x - portalCenterX, p.y - portalCenterY);

                    if (distToPortal < 24) {
                        if (this.portal.active && this.enemies.length === 0) {
                            this.triggerLevelClear();
                        } else if (this.portal.lockedHintCooldown <= 0) {
                            this.portal.lockedHintCooldown = 75;
                            this.sound.playPortalLocked();
                            this.showToast('需先消灭所有怪物！', 'lock', 1400);
                        }
                    }
                }
            }

            updateCamera(dtScale, snap = false) {
                const isMoba = document.body.classList.contains('moba-mode');
                const baseViewW = isMoba ? 14 : VIEW_COLS; // 与 draw() 保持一致
                const zoom = this.canvas.width / (baseViewW * TILE_SIZE);
                const viewW = this.canvas.width / zoom;
                const viewH = this.canvas.height / zoom;
                const worldW = this.mapCols * TILE_SIZE;
                const worldH = this.mapRows * TILE_SIZE;

                let targetX, targetY;
                if (worldW <= viewW) {
                    targetX = (worldW - viewW) / 2;
                } else {
                    targetX = Math.max(0, Math.min(worldW - viewW, this.player.x - viewW / 2));
                }
                if (worldH <= viewH) {
                    targetY = (worldH - viewH) / 2;
                } else {
                    targetY = Math.max(0, Math.min(worldH - viewH, this.player.y - viewH / 2));
                }

                const lerp = snap ? 1 : Math.min(1, 0.14 * dtScale);
                this.camera.x += (targetX - this.camera.x) * lerp;
                this.camera.y += (targetY - this.camera.y) * lerp;
            }

            updateVineSpread(dtScale) {
                const diffCfg = DIFFICULTY_TIERS[this.difficultyIdx];
                this.vineGrowthTimer += dtScale;
                if (this.vineGrowthTimer < diffCfg.vineSpreadFrames) return;
                this.vineGrowthTimer = 0;

                const vineList = [];
                for (let r = 1; r < this.mapRows - 1; r++) {
                    for (let c = 1; c < this.mapCols - 1; c++) {
                        if (this.grid[r][c] === TILE.VINE) vineList.push({ c, r });
                    }
                }
                if (vineList.length === 0) return;

                vineList.sort(() => Math.random() - 0.5);
                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);
                const dirs = [{ dc: 0, dr: -1 }, { dc: 0, dr: 1 }, { dc: -1, dr: 0 }, { dc: 1, dr: 0 }];

                const maxNew = Math.max(1, Math.ceil(vineList.length * 0.25));
                let grown = 0;

                for (const v of vineList) {
                    if (grown >= maxNew) break;
                    dirs.sort(() => Math.random() - 0.5);
                    for (const d of dirs) {
                        const nc = v.c + d.dc;
                        const nr = v.r + d.dr;
                        if (
                            this.grid[nr][nc] === TILE.EMPTY &&
                            !(nc === pCol && nr === pRow) &&
                            !(this.portal && this.portal.col === nc && this.portal.row === nr) &&
                            !this.bombs.some(b => b.col === nc && b.row === nr) &&
                            !this.powerups.some(pw => pw.col === nc && pw.row === nr)
                        ) {
                            this.grid[nr][nc] = TILE.VINE;
                            grown++;
                            break;
                        }
                    }
                }
            }

            placeBomb() {
                const maxAllowed = this.feverTimer > 0 ? 8 : this.playerStats.maxBombs;
                if (this.bombs.length >= maxAllowed) return;

                const col = Math.floor(this.player.x / TILE_SIZE);
                const row = Math.floor(this.player.y / TILE_SIZE);

                if (this.grid[row][col] === TILE.CRATE || this.grid[row][col] === TILE.FROST_CRATE) return;
                if (this.bombs.some(b => b.col === col && b.row === row)) return;

                const isRemote = this.playerStats.hasRemote;
                const feverOn = this.feverTimer > 0;
                const range = feverOn ? Math.max(this.playerStats.bombRange, 6) : this.playerStats.bombRange;

                this.bombs.push({
                    col,
                    row,
                    playerAllowed: true,
                    isRemote: isRemote,
                    timer: isRemote ? 999999 : 165,
                    maxTimer: 165,
                    range: range,
                    fever: feverOn,
                    scalePhase: 0,
                    frozen: false,
                    frozenTimer: 0,
                    frozenBy: null,
                    pushCd: 0
                });

                this.sound.playPlaceBomb();
                this.updateHUD();
            }

            detonateAllRemoteBombs() {
                const remoteBombs = this.bombs.filter(b => b.isRemote);
                if (remoteBombs.length === 0) return;

                this.sound.playRemoteBeep();
                this.showToast('遥控全引爆！', 'clock');

                const batchStats = { obstacles: 0, enemies: 0 };
                remoteBombs.forEach(rb => {
                    const idx = this.bombs.indexOf(rb);
                    if (idx !== -1) this.detonateBomb(idx, batchStats);
                });
                this.evaluateMatch3Combo(batchStats);
                this.updateHUD();
            }

            detonateBomb(bombIndex, sharedStats = null) {
                if (bombIndex < 0 || bombIndex >= this.bombs.length) return;
                const bomb = this.bombs[bombIndex];
                this.bombs.splice(bombIndex, 1);

                const isRoot = !sharedStats;
                const stats = sharedStats || { obstacles: 0, enemies: 0 };

                this.sound.playExplosion();
                this.addShake(isRoot ? 7 : 3);
                this.updateHUD();

                if (this.grid[bomb.row][bomb.col] === TILE.VINE) {
                    this.grid[bomb.row][bomb.col] = TILE.EMPTY;
                    stats.obstacles++;
                }

                const flameCells = [{ col: bomb.col, row: bomb.row, dir: 'CENTER', isEnd: false }];
                const dirs = [
                    { dc: 0, dr: -1, name: 'UP' },
                    { dc: 0, dr: 1, name: 'DOWN' },
                    { dc: -1, dr: 0, name: 'LEFT' },
                    { dc: 1, dr: 0, name: 'RIGHT' }
                ];

                const chainedBombs = [];

                dirs.forEach(d => {
                    for (let step = 1; step <= bomb.range; step++) {
                        const c = bomb.col + d.dc * step;
                        const r = bomb.row + d.dr * step;

                        if (this.grid[r][c] === TILE.WALL) break;

                        const otherBombIdx = this.bombs.findIndex(b => b.col === c && b.row === r);
                        if (otherBombIdx !== -1) {
                            chainedBombs.push(this.bombs[otherBombIdx]);
                        }

                        const exposedItemIdx = this.powerups.findIndex(
                            pw => pw.col === c && pw.row === r && pw.type !== 'GOLDEN_BAG' && (!pw.spawnProtect || pw.spawnProtect <= 0)
                        );
                        if (exposedItemIdx !== -1) {
                            const destroyedItem = this.powerups[exposedItemIdx];
                            this.powerups.splice(exposedItemIdx, 1);
                            this.spawnMonstersFromDestroyedPowerup(destroyedItem);
                            flameCells.push({ col: c, row: r, dir: d.name, isEnd: true });
                            break;
                        }

                        if (this.grid[r][c] === TILE.FROST_CRATE) {
                            this.crackFrostCrate(c, r);
                            stats.obstacles++;
                            flameCells.push({ col: c, row: r, dir: d.name, isEnd: true });
                            break;
                        } else if (this.grid[r][c] === TILE.CRATE) {
                            this.destroyCrate(c, r);
                            stats.obstacles++;
                            flameCells.push({ col: c, row: r, dir: d.name, isEnd: true });
                            break;
                        } else if (this.grid[r][c] === TILE.VINE) {
                            this.destroyVine(c, r);
                            stats.obstacles++;
                        }

                        flameCells.push({
                            col: c,
                            row: r,
                            dir: d.name,
                            isEnd: step === bomb.range
                        });
                    }
                });

                if (bomb.fever) {
                    const ignited = new Set(flameCells.map(fc => `${fc.col},${fc.row}`));
                    const extraCells = [];

                    dirs.forEach(d => {
                        let lastCell = { col: bomb.col, row: bomb.row };
                        for (let s = 1; s <= bomb.range; s++) {
                            const cc = bomb.col + d.dc * s;
                            const rr = bomb.row + d.dr * s;
                            if (ignited.has(`${cc},${rr}`)) lastCell = { col: cc, row: rr };
                        }
                        if (lastCell.col === bomb.col && lastCell.row === bomb.row && bomb.range > 0) {
                            lastCell = { col: bomb.col + d.dc * bomb.range, row: bomb.row + d.dr * bomb.range };
                        }

                        let stopped = false;
                        for (let e = 1; e <= 6 && !stopped; e++) {
                            const ec = lastCell.col + d.dc * e;
                            const er = lastCell.row + d.dr * e;
                            if (ec <= 0 || ec >= this.mapCols - 1 || er <= 0 || er >= this.mapRows - 1) break;
                            if (this.grid[er][ec] === TILE.WALL) break;
                            if (ignited.has(`${ec},${er}`)) continue;

                            const extraBombIdx = this.bombs.findIndex(b => b.col === ec && b.row === er);
                            if (extraBombIdx !== -1) {
                                chainedBombs.push(this.bombs[extraBombIdx]);
                                break;
                            }

                            const extraItemIdx = this.powerups.findIndex(
                                pw => pw.col === ec && pw.row === er && pw.type !== 'GOLDEN_BAG' && (!pw.spawnProtect || pw.spawnProtect <= 0)
                            );
                            if (extraItemIdx !== -1) {
                                const destroyedItem = this.powerups[extraItemIdx];
                                this.powerups.splice(extraItemIdx, 1);
                                this.spawnMonstersFromDestroyedPowerup(destroyedItem);
                                extraCells.push({ col: ec, row: er, dir: d.name, isEnd: true });
                                break;
                            }

                            if (this.grid[er][ec] === TILE.FROST_CRATE) {
                                this.crackFrostCrate(ec, er);
                                stats.obstacles++;
                                extraCells.push({ col: ec, row: er, dir: d.name, isEnd: true });
                                stopped = true;
                            } else if (this.grid[er][ec] === TILE.CRATE) {
                                this.destroyCrate(ec, er);
                                stats.obstacles++;
                                extraCells.push({ col: ec, row: er, dir: d.name, isEnd: true });
                                stopped = true;
                            } else {
                                if (this.grid[er][ec] === TILE.VINE) {
                                    this.destroyVine(ec, er);
                                    stats.obstacles++;
                                }
                                extraCells.push({ col: ec, row: er, dir: d.name, isEnd: false });
                            }

                            ignited.add(`${ec},${er}`);
                        }
                    });

                    extraCells.forEach(ec => flameCells.push(ec));
                }

                this.explosions.push({
                    cells: flameCells,
                    timer: 32,
                    maxTimer: 32,
                    fever: !!bomb.fever,
                    owner: bomb.ignitedBy || null,
                    statsRef: stats
                });

                flameCells.forEach(cell => {
                    const cx = (cell.col + 0.5) * TILE_SIZE;
                    const cy = (cell.row + 0.5) * TILE_SIZE;
                    for (let i = 0; i < 5; i++) {
                        const angle = Math.random() * Math.PI * 2;
                        const spd = 1.5 + Math.random() * 4;
                        this.particles.push({
                            x: cx,
                            y: cy,
                            vx: Math.cos(angle) * spd,
                            vy: Math.sin(angle) * spd,
                            radius: 4 + Math.random() * 5,
                            color: ['#ff6b6b', '#feca57', '#ff9f43', '#ffffff'][Math.floor(Math.random() * 4)],
                            life: 24 + Math.random() * 12,
                            maxLife: 36
                        });
                    }
                });

                chainedBombs.forEach(targetBomb => {
                    const idx = this.bombs.indexOf(targetBomb);
                    if (idx !== -1) {
                        if (bomb.ignitedBy && !this.bombs[idx].ignitedBy) {
                            this.bombs[idx].ignitedBy = bomb.ignitedBy;
                        }
                        this.detonateBomb(idx, stats);
                    }
                });

                if (isRoot) {
                    setTimeout(() => this.evaluateMatch3Combo(stats), 90);
                }
            }

            crackFrostCrate(col, row) {
                this.grid[row][col] = TILE.CRATE;
                this.score += 15;
                const cx = (col + 0.5) * TILE_SIZE;
                const cy = (row + 0.5) * TILE_SIZE;

                for (let i = 0; i < 12; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 1.5 + Math.random() * 3.8;
                    this.particles.push({
                        x: cx,
                        y: cy,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        radius: 4 + Math.random() * 4,
                        color: i % 2 === 0 ? '#bae6fd' : '#38bdf8',
                        life: 24,
                        maxLife: 24
                    });
                }
                this.showToast('破除冰封!', 'snow');
            }

            destroyVine(col, row) {
                this.grid[row][col] = TILE.EMPTY;
                this.score += 15;
                const cx = (col + 0.5) * TILE_SIZE;
                const cy = (row + 0.5) * TILE_SIZE;

                for (let i = 0; i < 8; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 3;
                    this.particles.push({
                        x: cx,
                        y: cy,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        radius: 3.5 + Math.random() * 3.5,
                        color: i % 2 === 0 ? '#4ade80' : '#16a34a',
                        life: 22,
                        maxLife: 22
                    });
                }
            }

            destroyCrate(col, row) {
                this.grid[row][col] = TILE.EMPTY;
                this.score += 20;

                const cx = (col + 0.5) * TILE_SIZE;
                const cy = (row + 0.5) * TILE_SIZE;

                for (let i = 0; i < 10; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 3.5;
                    this.particles.push({
                        x: cx,
                        y: cy,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        radius: 4 + Math.random() * 4,
                        color: i % 2 === 0 ? '#d9822b' : '#f3b664',
                        life: 25,
                        maxLife: 25
                    });
                }

                if (this.portal && this.portal.col === col && this.portal.row === row) {
                    this.portal.revealed = true;
                    if (this.enemies.length === 0) {
                        this.portal.active = true;
                        this.sound.playPortalUnlock();
                        this.showToast('发现已激活的传送门!', 'swirl');
                    } else {
                        this.showToast('发现封印传送门 (需清怪)', 'lock');
                    }
                    this.updateHUD();
                    return;
                }

                if (this.goldenCrate && this.goldenCrate.col === col && this.goldenCrate.row === row) {
                    this.registerCoin(this.goldenCrate.amount, cx, cy + 6);
                    this.showToast(`金袋打开！+${this.goldenCrate.amount}`, 'coin');
                    this.goldenCrate = null;
                } else if (Math.random() < 0.18) {
                    this.registerCoin(3 + Math.floor(Math.random() * 6), cx, cy);
                }

                if (Math.random() < 0.44) {
                    const pool = [
                        POWERUP_TYPE.BOMB_UP,
                        POWERUP_TYPE.FIRE_UP,
                        POWERUP_TYPE.SPEED_UP,
                        POWERUP_TYPE.SHIELD,
                        POWERUP_TYPE.REMOTE_BOMB,
                        POWERUP_TYPE.GHOST_CAPE,
                        POWERUP_TYPE.FLAME_VEST,
                        POWERUP_TYPE.MAGIC_BIRD
                    ];
                    const type = pool[Math.floor(Math.random() * pool.length)];
                    this.powerups.push({
                        col,
                        row,
                        type,
                        floatPhase: Math.random() * Math.PI * 2,
                        spawnProtect: 42
                    });
                    this.anyItemSpawned = true;
                }
                this.updateHUD();
            }

            evaluateMatch3Combo(stats) {
                const points = stats.obstacles + stats.enemies * 3;
                if (points < 2) return;

                let cheerText = 'GOOD!';
                let color = '#10b981';
                let tier = 1;

                if (points >= 9) {
                    cheerText = 'UNBELIEVABLE!';
                    color = '#d946ef';
                    tier = 4;
                } else if (points >= 6) {
                    cheerText = 'AMAZING!';
                    color = '#0ea5e9';
                    tier = 3;
                } else if (points >= 4) {
                    cheerText = 'GREAT!';
                    color = '#f59e0b';
                    tier = 2;
                }

                this.sound.playComboCheer(tier);
                this.score += points * 30;
                this.addFloatingText(this.player.x, this.player.y - 42, cheerText, color, 21);

                if (this.feverTimer <= 0) {
                    this.feverGauge = Math.min(100, this.feverGauge + points * 14);
                    if (this.feverGauge >= 100) {
                        this.feverGauge = 0;
                        this.feverTimer = 480;
                        this.screenFlashTimer = 24;
                        this.sound.playFever();
                        this.showToast('FEVER TIME! 狂暴时刻！', 'fire', 2000);
                        this.showComboToast(' FEVER TIME!', '火焰 6 格 · 炸弹 8 连', '#ec4899');
                    }
                }
                this.updateHUD();
            }

            triggerMagicBirdEffect() {
                this.sound.playMagicBird();
                this.screenFlashTimer = 22;

                const stats = { obstacles: 0, enemies: 0 };
                const frostCells = [];
                const vineCells = [];

                for (let r = 1; r < this.mapRows - 1; r++) {
                    for (let c = 1; c < this.mapCols - 1; c++) {
                        const t = this.grid[r][c];
                        if (t === TILE.FROST_CRATE) {
                            frostCells.push({ c, r });
                        } else if (t === TILE.VINE) {
                            vineCells.push({ c, r });
                        }
                    }
                }

                frostCells.sort(() => Math.random() - 0.5);
                const unfreezeCount = Math.min(frostCells.length, Math.max(10, Math.ceil(frostCells.length * 0.65)));

                for (let i = 0; i < unfreezeCount; i++) {
                    const cell = frostCells[i];
                    const tx = (cell.c + 0.5) * TILE_SIZE;
                    const ty = (cell.r + 0.5) * TILE_SIZE;

                    this.rainbowBolts.push({
                        x1: this.player.x, y1: this.player.y,
                        x2: tx, y2: ty,
                        color: ['#38bdf8', '#0ea5e9', '#a855f7', '#ec4899', '#facc15'][i % 5],
                        life: 26, maxLife: 26
                    });

                    this.crackFrostCrate(cell.c, cell.r);
                    stats.obstacles++;
                }

                if (unfreezeCount < 4 && vineCells.length > 0) {
                    const cleanVines = Math.min(vineCells.length, 4);
                    for (let j = 0; j < cleanVines; j++) {
                        const vc = vineCells[j];
                        const tx = (vc.c + 0.5) * TILE_SIZE;
                        const ty = (vc.r + 0.5) * TILE_SIZE;
                        this.rainbowBolts.push({
                            x1: this.player.x, y1: this.player.y,
                            x2: tx, y2: ty,
                            color: '#4ade80',
                            life: 24, maxLife: 24
                        });
                        this.destroyVine(vc.c, vc.r);
                        stats.obstacles++;
                    }
                }

                if (unfreezeCount > 0) {
                    this.showToast(`千鸟破冰！解除 ${unfreezeCount} 处冰封！`, 'bird');
                } else {
                    this.addFloatingText(this.player.x, this.player.y - 40, '千鸟共鸣！得分 +300', '#ec4899', 19);
                    this.score += 300;
                }

                this.evaluateMatch3Combo(stats);
            }

            collectPowerup(item) {
                this.sound.playPowerup();
                this.score += 100;
                const cx = (item.col + 0.5) * TILE_SIZE;
                const cy = (item.row + 0.5) * TILE_SIZE;
                // 拾取闪光粒子
                for (let i = 0; i < 10; i++) {
                    const ang = (i / 10) * Math.PI * 2;
                    this.particles.push({
                        x: cx, y: cy,
                        vx: Math.cos(ang) * 2, vy: Math.sin(ang) * 2 - 1.2,
                        radius: 2 + Math.random() * 2.5,
                        color: ['#fde047', '#ffffff', '#fbbf24'][i % 3],
                        life: 22, maxLife: 22
                    });
                }

                switch (item.type) {
                    case 'GOLDEN_BAG': {
                        const amt = item.amount || 60;
                        this.registerCoin(amt, cx, cy + 6, true);
                        this.sound.playNotify();
                        this.showToast(`超级金袋！+${amt}`, 'coin');
                        break;
                    }
                    case POWERUP_TYPE.BOMB_UP:
                        this.playerStats.maxBombs = Math.min(this.playerStats.maxBombs + 1, 6);
                        this.addFloatingText(cx, cy, '炸弹上限 +1', '#334155');
                        break;
                    case POWERUP_TYPE.FIRE_UP:
                        this.playerStats.bombRange = Math.min(this.playerStats.bombRange + 1, 6);
                        this.addFloatingText(cx, cy, '爆炸威力 +1', '#f97316');
                        break;
                    case POWERUP_TYPE.SPEED_UP:
                        this.playerStats.speed = Math.min(this.playerStats.speed + 0.45, 5.2);
                        this.addFloatingText(cx, cy, '移动加速!', '#0284c7');
                        break;
                    case POWERUP_TYPE.SHIELD:
                        if (!this.playerStats.hasShield) {
                            this.playerStats.hasShield = true;
                            this.addFloatingText(cx, cy, '获得能量护盾!', '#10b981');
                        } else {
                            this.playerStats.lives = Math.min(this.playerStats.lives + 1, 9);
                            this.addFloatingText(cx, cy, '生命值 +1', '#e11d48');
                        }
                        break;
                    case POWERUP_TYPE.REMOTE_BOMB:
                        this.playerStats.hasRemote = true;
                        this.addFloatingText(cx, cy, '遥控炸弹! 按K引爆', '#0284c7');
                        break;
                    case POWERUP_TYPE.GHOST_CAPE:
                        this.playerStats.ghostTimer = 900;
                        this.addFloatingText(cx, cy, '幽灵穿墙披风(15秒)!', '#9333ea');
                        break;
                    case POWERUP_TYPE.FLAME_VEST:
                        this.playerStats.flameVestTimer = 900;
                        this.addFloatingText(cx, cy, '火焰防炸衣(15秒)!', '#d97706');
                        break;
                    case POWERUP_TYPE.MAGIC_BIRD:
                        this.triggerMagicBirdEffect();
                        break;
                }
                this.updateHUD();
            }

            addFloatingText(x, y, text, color = '#ffffff', fontSize = 15) {
                // 统一去除 emoji，保持界面干净精致（图标已用矢量绘制）
                if (typeof text === 'string') {
                    text = text.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, '').replace(/\s{2,}/g, ' ').trim();
                }
                const worldW = this.mapCols * TILE_SIZE;
                const clampedX = Math.max(85, Math.min(worldW - 85, x));
                const clampedY = Math.max(30, y);
                this.floatingTexts.push({
                    x: clampedX,
                    y: clampedY,
                    text,
                    color,
                    fontSize: Math.min(fontSize, 15),
                    life: 40,
                    maxLife: 40
                });
                if (this.floatingTexts.length > 26) {
                    this.floatingTexts.splice(0, this.floatingTexts.length - 26);
                }
            }

            damagePlayer(source = 'ENEMY') {
                if (source === 'EXPLOSION' && this.playerStats.flameVestTimer > 0) {
                    if (this.player.invincibleTimer <= 0) {
                        this.player.invincibleTimer = 25;
                        this.sound.playBlock();
                        // 教学第 2 步：记录被炸到（有保护不会真伤血）
                        if (this.tutorial && this.tutorial.active && this.tutorial.step === 2) {
                            this.tutorial.wasHit = true;
                        } else {
                            this.showToast('防炸衣免疫火焰!', 'vest');
                        }
                    }
                    return;
                }

                if (this.player.invincibleTimer > 0) return;

                if (this.playerStats.hasShield) {
                    this.playerStats.hasShield = false;
                    this.player.invincibleTimer = 110;
                    this.sound.playShield();
                    this.showToast('护盾抵消伤害!', 'shield');
                    this.updateHUD();
                    return;
                }

                this.sound.playHurt();
                this.addShake(9);
                this.hitFlash = 14;

                this.playerStats.lives--;
                this.updateHUD();

                if (this.playerStats.lives <= 0) {
                    this.state = 'GAME_OVER';
                    this.sound.playGameOver();
                    if (this.difficultyIdx === 0) this.noviceFailStreak++;
                    else this.noviceFailStreak = 0;

                    if (this.score > this.save.data.bestScore) {
                        this.save.data.bestScore = this.score;
                    }
                    this.save.save();
                    this.updateCareerPanel();

                    this.showModal(
                        '挑战失败啦',
                        `你在【${DIFFICULTY_TIERS[this.difficultyIdx].name}】第 <span class="text-indigo-600 font-black">${this.level}</span> 关惜败！<br>
                         总分：<span class="text-amber-500 font-black">${this.score}</span> · 金币：<span class="text-yellow-600 font-black">${this.coins}</span> · 最高连杀：<span class="text-fuchsia-600 font-black">x${this.bestChain}</span><br>
                         善用遥控炸弹、穿墙披风、防炸衣与超必杀再来一局吧！` +
                        (this.difficultyIdx === 0 && this.noviceFailStreak >= 2
                            ? `<br><span class="text-emerald-700 font-black">小提示（已连败 ${this.noviceFailStreak} 次）：放弹后立刻离开爆炸的十字范围，别站在炸弹旁边等！先清小怪再开箱，稳扎稳打。</span>`
                            : ``),
                        '重新开始冒险',
                        'ghost'
                    );
                } else {
                    this.player.invincibleTimer = 140;
                    this.showToast('生命 -1', 'heart');
                }
            }

            updateEnemies(dtScale) {
                // 教学期间敌人全部冻结（包括教学目标怪），只教操作不挨打
                if (this.tutorial && this.tutorial.active) return;
                const diffCfg = DIFFICULTY_TIERS[this.difficultyIdx];
                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);

                const dirVectors = {
                    'UP': { dx: 0, dy: -1 },
                    'DOWN': { dx: 0, dy: 1 },
                    'LEFT': { dx: -1, dy: 0 },
                    'RIGHT': { dx: 1, dy: 0 }
                };

                for (let i = this.enemies.length - 1; i >= 0; i--) {
                    const e = this.enemies[i];
                    e.animPhase += 0.12 * dtScale;
                    if (e.hurtTimer > 0) e.hurtTimer -= dtScale;
                    if (e.enrageTimer > 0) e.enrageTimer -= dtScale;
                    if (e.skillAnim > 0) e.skillAnim -= dtScale;
                    if (e.swapCd > 0) e.swapCd -= dtScale;
                    if (e.waterGuard > 0) e.waterGuard -= dtScale;
                    if (e.fireImmuneTimer > 0) e.fireImmuneTimer -= dtScale;

                    const curCol = Math.floor(e.x / TILE_SIZE);
                    const curRow = Math.floor(e.y / TILE_SIZE);
                    const centerX = (curCol + 0.5) * TILE_SIZE;
                    const centerY = (curRow + 0.5) * TILE_SIZE;

                    let frozenBySkill = false;
                    if (this.isSpecialist(e.type)) {
                        if (e.windUp > 0) {
                            e.windUp -= dtScale;
                            e.x = centerX;
                            e.y = centerY;
                            frozenBySkill = true;
                            if (e.windUp <= 0) this.executeSpecialistSkill(e);
                            else this.sound.vibrate(6);
                        } else {
                            const acted = this.updateSpecialistAI(e, curCol, curRow, pCol, pRow, dtScale);
                            if (acted) frozenBySkill = true;
                        }
                    }

                    if (frozenBySkill) {
                        const d = Math.hypot(e.x - this.player.x, e.y - this.player.y);
                        if (d < 34) this.damagePlayer('ENEMY');
                        continue;
                    }

                    const v = dirVectors[e.dir];
                    const effectiveSpeed = e.speed * (e.enrageTimer > 0 ? 1.45 : 1.0);
                    const step = effectiveSpeed * dtScale;
                    const nextX = e.x + v.dx * step;
                    const nextY = e.y + v.dy * step;

                    const checkCol = Math.floor((nextX + v.dx * 22) / TILE_SIZE);
                    const checkRow = Math.floor((nextY + v.dy * 22) / TILE_SIZE);

                    const canPassCrate = (e.type === 'GHOST');
                    let blocked = false;
                    if (checkRow <= 0 || checkRow >= this.mapRows - 1 || checkCol <= 0 || checkCol >= this.mapCols - 1) {
                        blocked = true;
                    } else if (this.grid[checkRow][checkCol] === TILE.WALL) {
                        blocked = true;
                    } else if ((this.grid[checkRow][checkCol] === TILE.CRATE || this.grid[checkRow][checkCol] === TILE.FROST_CRATE) && !canPassCrate) {
                        blocked = true;
                    } else if (this.bombs.some(b => b.col === checkCol && b.row === checkRow)) {
                        blocked = true;
                    }

                    const nearCenter = Math.hypot(e.x - centerX, e.y - centerY) < 4.5;

                    if (blocked || (nearCenter && Math.random() < 0.08)) {
                        e.x = centerX;
                        e.y = centerY;

                        let bfsDir = null;
                        if (diffCfg.bfsRange > 0) {
                            bfsDir = this.findBFSDirection(curCol, curRow, pCol, pRow, diffCfg.bfsRange, canPassCrate);
                        }

                        if (bfsDir) {
                            e.dir = bfsDir;
                        } else {
                            const validDirs = ['UP', 'DOWN', 'LEFT', 'RIGHT'].filter(dName => {
                                const dv = dirVectors[dName];
                                const tc = curCol + dv.dx;
                                const tr = curRow + dv.dy;
                                if (tr <= 0 || tr >= this.mapRows - 1 || tc <= 0 || tc >= this.mapCols - 1) return false;
                                if (this.grid[tr][tc] === TILE.WALL) return false;
                                if ((this.grid[tr][tc] === TILE.CRATE || this.grid[tr][tc] === TILE.FROST_CRATE) && !canPassCrate) return false;
                                if (this.bombs.some(b => b.col === tc && b.row === tr)) return false;
                                return true;
                            });

                            if (validDirs.length > 0) {
                                e.dir = validDirs[Math.floor(Math.random() * validDirs.length)];
                            }
                        }
                    } else {
                        e.x = nextX;
                        e.y = nextY;
                        if (v.dx !== 0) e.y += (centerY - e.y) * 0.2;
                        if (v.dy !== 0) e.x += (centerX - e.x) * 0.2;
                    }

                    const distToPlayer = Math.hypot(e.x - this.player.x, e.y - this.player.y);
                    if (distToPlayer < 34) {
                        this.damagePlayer('ENEMY');
                    }
                }
            }

            updateSpecialistAI(e, curCol, curRow, pCol, pRow, dtScale) {
                const cfg = SPECIALIST_CFG[e.type];
                if (e.skillCd > 0) {
                    e.skillCd -= dtScale;
                }

                const distToPlayer = Math.abs(curCol - pCol) + Math.abs(curRow - pRow);
                const inRange = distToPlayer <= (this.difficultyIdx >= 3 ? 6 : 5);

                if (e.skillCd <= 0 && inRange) {
                    e.windUpMax = cfg.windUp;
                    e.windUp = cfg.windUp;
                    e.skillCd = cfg.cd;
                    e.skillAnim = cfg.windUp + 18;
                    e.lastTarget = { col: curCol, row: curRow };
                    this.sound.vibrate(8);
                    return true;
                }
                return false;
            }

            findBombAround(e, curCol, curRow, range, mode) {
                const dirs = [
                    { dc: 0, dr: -1, name: 'UP' },
                    { dc: 0, dr: 1, name: 'DOWN' },
                    { dc: -1, dr: 0, name: 'LEFT' },
                    { dc: 1, dr: 0, name: 'RIGHT' }
                ];

                let best = null;
                let bestDist = Infinity;

                for (const d of dirs) {
                    for (let s = 1; s <= range; s++) {
                        const cc = curCol + d.dc * s;
                        const rr = curRow + d.dr * s;
                        if (cc <= 0 || cc >= this.mapCols - 1 || rr <= 0 || rr >= this.mapRows - 1) break;
                        if (this.grid[rr][cc] === TILE.WALL) break;
                        if (this.grid[rr][cc] === TILE.CRATE || this.grid[rr][cc] === TILE.FROST_CRATE) break;

                        const bomb = this.bombs.find(b => b.col === cc && b.row === rr);
                        if (bomb) {
                            if (s < bestDist) {
                                bestDist = s;
                                best = { bomb, dir: d, dist: s };
                            }
                            break;
                        }
                    }
                }
                return best;
            }

            executeSpecialistSkill(e) {
                const curCol = Math.floor(e.x / TILE_SIZE);
                const curRow = Math.floor(e.y / TILE_SIZE);
                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);
                const cfg = SPECIALIST_CFG[e.type];

                switch (e.type) {
                    case 'SALAMANDER': this.skillSalamanderFlame(e, curCol, curRow, pCol, pRow, cfg); break;
                    case 'TORTOISE':   this.skillTortoiseWater(e, curCol, curRow, cfg); break;
                    case 'AZUREBIRD':  this.skillAzureBirdWind(e, curCol, curRow, cfg); break;
                    case 'WHITETIGER': this.skillWhiteTigerDevour(e, curCol, curRow, cfg); break;
                }
            }

            skillSalamanderFlame(e, curCol, curRow, pCol, pRow, cfg) {
                let dirs;
                if (Math.abs(pCol - curCol) >= Math.abs(pRow - curRow)) {
                    dirs = [{ dc: pCol >= curCol ? 1 : -1, dr: 0 }, { dc: 0, dr: pRow >= curRow ? 1 : -1 }];
                } else {
                    dirs = [{ dc: 0, dr: pRow >= curRow ? 1 : -1 }, { dc: pCol >= curCol ? 1 : -1, dr: 0 }];
                }
                const dirMap = { UP: { dc: 0, dr: -1 }, DOWN: { dc: 0, dr: 1 }, LEFT: { dc: -1, dr: 0 }, RIGHT: { dc: 1, dr: 0 } };
                const dv = dirMap[e.dir];
                dirs.push({ dc: dv.dc, dr: dv.dr });

                let chosen = null;
                for (const d of dirs) {
                    if (d.dc === 0 && d.dr === 0) continue;
                    const cc = curCol + d.dc;
                    const rr = curRow + d.dr;
                    if (cc <= 0 || cc >= this.mapCols - 1 || rr <= 0 || rr >= this.mapRows - 1) continue;
                    if (this.grid[rr][cc] === TILE.WALL) continue;
                    chosen = d;
                    break;
                }
                if (!chosen) return;

                e.dir = chosen.dr < 0 ? 'UP' : chosen.dr > 0 ? 'DOWN' : chosen.dc < 0 ? 'LEFT' : 'RIGHT';
                e.skillAnim = 26;
                this.sound.playFlame();
                this.addFloatingText(e.x, e.y - 30, '喷火!', '#f97316', 15);
                this.spawnSkillBolt(e.x, e.y, e.x + chosen.dc * TILE_SIZE, e.y + chosen.dr * TILE_SIZE, '#f97316');

                e.fireImmuneTimer = cfg.selfImmune;
                e.fireCells = [];

                for (let s = 1; s <= cfg.maxRange; s++) {
                    const c = curCol + chosen.dc * s;
                    const r = curRow + chosen.dr * s;
                    if (c <= 0 || c >= this.mapCols - 1 || r <= 0 || r >= this.mapRows - 1) break;

                    const cx = (c + 0.5) * TILE_SIZE;
                    const cy = (r + 0.5) * TILE_SIZE;

                    for (let i = 0; i < 6; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        const spd = 1.5 + Math.random() * 4;
                        this.particles.push({
                            x: cx, y: cy,
                            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                            radius: 4 + Math.random() * 4,
                            color: ['#f97316', '#facc15', '#ef4444', '#fde047'][i % 4],
                            life: 22, maxLife: 22
                        });
                    }

                    const tile = this.grid[r][c];
                    if (tile === TILE.VINE) {
                        this.destroyVine(c, r);
                        e.fireCells.push({ col: c, row: r });
                        continue;
                    }
                    if (tile === TILE.CRATE || tile === TILE.FROST_CRATE) {
                        if (tile === TILE.FROST_CRATE) this.crackFrostCrate(c, r);
                        break;
                    }

                    const bombIdx = this.bombs.findIndex(b => b.col === c && b.row === r);
                    if (bombIdx !== -1) {
                        e.fireCells.push({ col: c, row: r });
                        this.bombs[bombIdx].ignitedBy = e;
                        this.detonateBomb(bombIdx);
                        this.addFloatingText(cx, cy - 20, '引爆炸弹!', '#ef4444', 15);
                        break;
                    }

                    const itemIdx = this.powerups.findIndex(pw => pw.col === c && pw.row === r && pw.type !== 'GOLDEN_BAG');
                    if (itemIdx !== -1) {
                        const destroyed = this.powerups.splice(itemIdx, 1)[0];
                        this.spawnMonstersFromDestroyedPowerup(destroyed);
                        e.fireCells.push({ col: c, row: r });
                        break;
                    }

                    e.fireCells.push({ col: c, row: r });
                }

                if (e.fireCells.length > 0) {
                    this.explosions.push({
                        cells: e.fireCells.map(fc => ({ col: fc.col, row: fc.row, dir: 'CENTER', isEnd: false })),
                        timer: cfg.flameLife,
                        maxTimer: cfg.flameLife,
                        fever: true,
                        owner: e,
                        statsRef: { obstacles: 0, enemies: 0 }
                    });
                }
            }

            skillTortoiseWater(e, curCol, curRow, cfg) {
                const target = this.findBombAround(e, curCol, curRow, 3, 'flameFirst');
                e.skillAnim = 26;
                this.sound.playFreeze();
                const dirText = target ? '喷水冻结炸弹!' : '喷水!';
                this.addFloatingText(e.x, e.y - 30, dirText, '#38bdf8', 15);
                this.spawnSkillBolt(e.x, e.y, target ? (target.bomb.col + 0.5) * TILE_SIZE : e.x, target ? (target.bomb.row + 0.5) * TILE_SIZE : e.y, '#38bdf8');

                e.waterGuard = cfg.immuneWindow;

                if (!target) return;

                const b = target.bomb;
                if (b.isRemote) return;

                b.frozen = true;
                b.frozenTimer = (b.frozenTimer || 0) + cfg.freezeTicks;
                b.frozenBy = e;
                b.timer = Math.max(b.timer, 60);

                const cx = (b.col + 0.5) * TILE_SIZE;
                const cy = (b.row + 0.5) * TILE_SIZE;
                for (let i = 0; i < 16; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 3.5;
                    this.particles.push({
                        x: cx, y: cy,
                        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                        radius: 3.5 + Math.random() * 4,
                        color: i % 2 === 0 ? '#bae6fd' : '#38bdf8',
                        life: 26, maxLife: 26
                    });
                }
            }

            skillAzureBirdWind(e, curCol, curRow, cfg) {
                const target = this.findBombAround(e, curCol, curRow, 3, 'nearest');
                e.skillAnim = 24;
                this.sound.playWind();
                this.addFloatingText(e.x, e.y - 30, target ? '吹退炸弹!' : '刮风!', '#22d3ee', 15);

                if (!target) return;

                const b = target.bomb;
                if (b.pushCd > 0) return;
                b.pushCd = cfg.pushCd;

                const fromCol = curCol;
                const fromRow = curRow;
                const dc = Math.sign(b.col - fromCol);
                const dr = Math.sign(b.row - fromRow);

                const candidates = [
                    { c: b.col + (dc || 0), r: b.row + (dr || 0) },
                    { c: b.col + (dc ? dc : 0), r: b.row + (dc ? 0 : (dr ? dr : 1)) },
                    { c: b.col + 1, r: b.row },
                    { c: b.col - 1, r: b.row },
                    { c: b.col, r: b.row + 1 },
                    { c: b.col, r: b.row - 1 }
                ];

                let dest = null;
                for (const cand of candidates) {
                    if (cand.c <= 0 || cand.c >= this.mapCols - 1 || cand.r <= 0 || cand.r >= this.mapRows - 1) continue;
                    if (this.grid[cand.r][cand.c] === TILE.WALL) continue;
                    if (this.bombs.some(bb => bb.col === cand.c && bb.row === cand.r)) continue;
                    if (this.powerups.some(pw => pw.col === cand.c && pw.row === cand.r)) continue;
                    dest = cand;
                    break;
                }

                const wx = (b.col + 0.5) * TILE_SIZE;
                const wy = (b.row + 0.5) * TILE_SIZE;
                for (let i = 0; i < 14; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    this.particles.push({
                        x: wx + (Math.random() - 0.5) * 40,
                        y: wy + (Math.random() - 0.5) * 40,
                        vx: (dest ? Math.sign(dest.c - b.col) : dc) * (2 + Math.random() * 3),
                        vy: (dest ? Math.sign(dest.r - b.row) : dr) * (2 + Math.random() * 3),
                        radius: 2.5 + Math.random() * 3,
                        color: i % 2 === 0 ? '#a5f3fc' : '#ffffff',
                        life: 20, maxLife: 20
                    });
                }
                this.spawnSkillBolt(e.x, e.y, wx, wy, '#22d3ee');

                if (!dest) return;
                if (dest.c === b.col && dest.r === b.row) return;

                const t = this.grid[dest.r][dest.c];
                if (t === TILE.CRATE) {
                    this.destroyCrate(dest.c, dest.r);
                    this.addFloatingText((dest.c + 0.5) * TILE_SIZE, (dest.r + 0.5) * TILE_SIZE - 18, '撞爆木箱!', '#f59e0b', 14);
                } else if (t === TILE.FROST_CRATE) {
                    this.crackFrostCrate(dest.c, dest.r);
                } else if (t === TILE.VINE) {
                    this.destroyVine(dest.c, dest.r);
                }

                b.col = dest.c;
                b.row = dest.r;
                b.scalePhase = 0;
                this.updateHUD();
            }

            skillWhiteTigerDevour(e, curCol, curRow, cfg) {
                const target = this.findBombAround(e, curCol, curRow, 3, 'nearest');
                e.skillAnim = 28;
                this.addFloatingText(e.x, e.y - 30, target ? '吞掉炸弹!' : '咆哮!', '#a855f7', 15);

                if (!target) {
                    this.sound.playEnemyDefeat();
                    return;
                }

                const b = target.bomb;
                const bIdx = this.bombs.indexOf(b);
                if (bIdx !== -1) this.bombs.splice(bIdx, 1);

                this.sound.playItemCurseSpawn();
                e.feedCount++;
                if (e.hp < cfg.maxHpCap) {
                    e.hp++;
                    e.maxHp = Math.max(e.maxHp, e.hp);
                }
                e.enrageTimer = 200;
                e.hurtTimer = 26;

                const cx = (b.col + 0.5) * TILE_SIZE;
                const cy = (b.row + 0.5) * TILE_SIZE;
                for (let i = 0; i < 20; i++) {
                    const ang = (Math.PI * 2 * i) / 20;
                    const spd = 2 + Math.random() * 4;
                    this.particles.push({
                        x: cx, y: cy,
                        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                        radius: 4 + Math.random() * 4,
                        color: ['#a855f7', '#c084fc', '#f472b6', '#ffffff'][i % 4],
                        life: 26, maxLife: 26
                    });
                }
                this.spawnSkillBolt(cx, cy, e.x, e.y, '#c084fc');
                this.addFloatingText(e.x, e.y - 44, `强化! ${e.hp}/${e.maxHp}`, '#9333ea', 15);
                this.updateHUD();
            }

            spawnSkillBolt(x1, y1, x2, y2, color) {
                this.rainbowBolts.push({
                    x1, y1, x2, y2,
                    color,
                    life: 20,
                    maxLife: 20
                });
            }

            updateBombsAndExplosions(dtScale) {
                for (let i = this.bombs.length - 1; i >= 0; i--) {
                    const b = this.bombs[i];
                    b.scalePhase += 0.18 * dtScale;
                    if (b.pushCd > 0) b.pushCd -= dtScale;

                    if (b.frozen) {
                        b.frozenTimer -= dtScale;
                        if (b.frozenTimer <= 0) {
                            b.frozen = false;
                            b.frozenBy = null;
                            const cx = (b.col + 0.5) * TILE_SIZE;
                            const cy = (b.row + 0.5) * TILE_SIZE;
                            this.addFloatingText(cx, cy - 22, '冰块化开!', '#0ea5e9', 14);
                            for (let k = 0; k < 10; k++) {
                                const ang = Math.random() * Math.PI * 2;
                                this.particles.push({
                                    x: cx, y: cy,
                                    vx: Math.cos(ang) * 2.5, vy: Math.sin(ang) * 2.5,
                                    radius: 3.5, color: '#bae6fd', life: 20, maxLife: 20
                                });
                            }
                        }
                        continue;
                    }

                    if (!b.isRemote) {
                        b.timer -= dtScale;
                    }

                    if (Math.random() < 0.45) {
                        const bx = (b.col + 0.5) * TILE_SIZE + (b.isRemote ? 0 : 8);
                        const by = (b.row + 0.5) * TILE_SIZE - (b.isRemote ? 28 : 22);
                        this.particles.push({
                            x: bx,
                            y: by,
                            vx: (Math.random() - 0.5) * 2.2,
                            vy: -1 - Math.random() * 2.5,
                            radius: 2.5 + Math.random() * 2,
                            color: b.isRemote ? '#38bdf8' : (Math.random() < 0.5 ? '#fde047' : '#fb923c'),
                            life: 12,
                            maxLife: 12
                        });
                    }

                    if (!b.isRemote && b.timer <= 0) {
                        this.detonateBomb(i);
                    }
                }

                for (let i = this.explosions.length - 1; i >= 0; i--) {
                    const exp = this.explosions[i];
                    exp.timer -= dtScale;

                    if (exp.timer > exp.maxTimer * 0.2) {
                        const pCol = Math.floor(this.player.x / TILE_SIZE);
                        const pRow = Math.floor(this.player.y / TILE_SIZE);

                        exp.cells.forEach(cell => {
                            if (cell.col === pCol && cell.row === pRow) {
                                this.damagePlayer('EXPLOSION');
                            }

                            for (let j = this.enemies.length - 1; j >= 0; j--) {
                                const enemy = this.enemies[j];
                                const eCol = Math.floor(enemy.x / TILE_SIZE);
                                const eRow = Math.floor(enemy.y / TILE_SIZE);
                                if (eCol !== cell.col || eRow !== cell.row) continue;
                                if (enemy.hurtTimer > 0) continue;

                                if (exp.owner && exp.owner === enemy) continue;

                                if (enemy.waterGuard > 0) {
                                    enemy.skillAnim = Math.max(enemy.skillAnim, 20);
                                    if (enemy.waterGuard > 105) {
                                        this.addFloatingText(enemy.x, enemy.y - 26, '冰块护体!', '#38bdf8', 14);
                                    }
                                    continue;
                                }

                                const killed = this.damageEnemy(j, 1);
                                if (killed && exp.statsRef) exp.statsRef.enemies++;
                            }
                        });
                    }

                    if (exp.timer <= 0) {
                        this.explosions.splice(i, 1);
                    }
                }
            }

            releaseSpecialistEffects(e) {
                if (!this.isSpecialist(e.type)) return;

                if (e.type === 'TORTOISE') {
                    let freed = 0;
                    this.bombs.forEach(b => {
                        if (b.frozenBy === e) {
                            b.frozen = false;
                            b.frozenTimer = 0;
                            b.frozenBy = null;
                            freed++;
                        }
                    });
                    if (freed > 0) {
                        this.addFloatingText(e.x, e.y - 26, `${freed} 颗炸弹解冻!`, '#0ea5e9', 15);
                    }
                }

                if (e.type === 'SALAMANDER') {
                    for (let i = this.explosions.length - 1; i >= 0; i--) {
                        if (this.explosions[i].owner === e) {
                            this.explosions[i].timer = Math.min(this.explosions[i].timer, 8);
                        }
                    }
                }

                if (e.type === 'WHITETIGER' && e.feedCount > 0) {
                    const curCol = Math.floor(e.x / TILE_SIZE);
                    const curRow = Math.floor(e.y / TILE_SIZE);
                    const spots = [
                        { c: curCol, r: curRow },
                        { c: curCol + 1, r: curRow }, { c: curCol - 1, r: curRow },
                        { c: curCol, r: curRow + 1 }, { c: curCol, r: curRow - 1 }
                    ];
                    let refund = 0;
                    for (const sp of spots) {
                        if (refund >= e.feedCount) break;
                        if (sp.c <= 0 || sp.c >= this.mapCols - 1 || sp.r <= 0 || sp.r >= this.mapRows - 1) continue;
                        if (this.grid[sp.r][sp.c] !== TILE.EMPTY) continue;
                        if (this.bombs.some(b => b.col === sp.c && b.row === sp.r)) continue;
                        this.bombs.push({
                            col: sp.c, row: sp.r, isRemote: false, timer: 200, maxTimer: 165,
                            range: this.playerStats.bombRange, fever: false, scalePhase: 0,
                            frozen: false, frozenTimer: 0, frozenBy: null, pushCd: 0
                        });
                        refund++;
                    }
                    if (refund > 0) {
                        this.sound.playSpit();
                        this.addFloatingText(e.x, e.y - 30, `吐出 ${refund} 颗炸弹!`, '#9333ea', 16);
                    }
                }
            }

            damageEnemy(index, dmg = 1) {
                const e = this.enemies[index];
                if (!e || e.hurtTimer > 0) return false;

                e.hp -= dmg;
                if (e.hp > 0) {
                    e.hurtTimer = 50;
                    e.enrageTimer = 260;
                    this.sound.playEnemyDefeat();
                    this.showToast(`狂暴! HP:${e.hp}/${e.maxHp}`, 'angry');
                    return false;
                }

                this.enemies.splice(index, 1);
                this.sound.playEnemyDefeat();
                // 敌人死亡粒子爆发
                for (let i = 0; i < 14; i++) {
                    const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.4;
                    const spd = 1.5 + Math.random() * 2.5;
                    this.particles.push({
                        x: e.x, y: e.y - 4,
                        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd - 1,
                        radius: 2.5 + Math.random() * 3,
                        color: ['#f472b6', '#fbbf24', '#ffffff', '#f43f5e'][i % 4],
                        life: 28, maxLife: 28
                    });
                }
                this.addShake(3);

                this.save.data.totalKills++;
                if (this.save.data.totalKills % 25 === 0) this.save.save();

                this.releaseSpecialistEffects(e);

                this.megaCharge = Math.min(MEGA_COST * 3, this.megaCharge + 1);
                if (this.megaCharge === MEGA_COST) {
                    this.showToast('超必杀就绪! 按 L 释放!', 'star', 2200);
                    this.showComboToast(' 超必杀就绪!', '按 L 或点 释放', '#d946ef');
                }

                this.registerKillForCombo();

                const reward = Math.round(200 * e.maxHp * this.getScoreMult());
                this.score += reward;
                this.addFloatingText(e.x, e.y - 10, `+${reward}`, '#10b981');

                this.particles.push({
                    x: e.x, y: e.y,
                    vx: 0, vy: 0,
                    radius: 6,
                    color: 'rgba(255,255,255,0.9)',
                    life: 18,
                    maxLife: 18,
                    ring: true,
                    ringMax: 34
                });

                for (let i = 0; i < 14; i++) {
                    const angle = Math.random() * Math.PI * 2;
                    const spd = 1.5 + Math.random() * 3.5;
                    this.particles.push({
                        x: e.x,
                        y: e.y,
                        vx: Math.cos(angle) * spd,
                        vy: Math.sin(angle) * spd,
                        radius: 4 + Math.random() * 4,
                        color: ['#a855f7', '#38bdf8', '#4ade80', '#f472b6'][i % 4],
                        life: 28,
                        maxLife: 28
                    });
                }

                if (this.enemies.length === 0 && this.portal) {
                    this.portal.active = true;
                    this.screenFlashTimer = 28;
                    this.sound.playPortalUnlock();
                    this.addShake(6);

                    const portalX = (this.portal.col + 0.5) * TILE_SIZE;
                    const portalY = (this.portal.row + 0.5) * TILE_SIZE;

                    if (this.portal.revealed) {
                        this.showToast('传送门已开启！快进去吧！', 'swirl', 2200);
                    } else {
                        this.showToast('怪物已清光！炸开木箱寻找传送门！', 'swirl', 2200);
                    }

                    for (let k = 0; k < 28; k++) {
                        const angle = (Math.PI * 2 * k) / 28;
                        const spd = 2 + Math.random() * 4.5;
                        this.particles.push({
                            x: portalX,
                            y: portalY,
                            vx: Math.cos(angle) * spd,
                            vy: Math.sin(angle) * spd,
                            radius: 5 + Math.random() * 4,
                            color: ['#f43f5e', '#facc15', '#4ade80', '#38bdf8', '#a855f7'][k % 5],
                            life: 40,
                            maxLife: 40
                        });
                    }
                }

                this.updateHUD();
                return true;
            }

            triggerLevelClear() {
                if (this.state === 'LEVEL_CLEAR') return;
                this.state = 'LEVEL_CLEAR';
                this.noviceFailStreak = 0;
                this.touchDir = null;
                this.score += 500 * this.level;

                this.updateHUD();
                this.sound.playWin();
                this.addShake(8);

                this.save.data.totalLevelsCleared++;
                if (this.score > this.save.data.bestScore) {
                    this.save.data.bestScore = this.score;
                }
                this.save.save();
                this.updateCareerPanel();

                this.showModal(
                    `第 ${this.level} 关完美通关！`,
                    `成功消灭所有怪物并踏入魔法传送门！<br>
                     通关奖励 <span class="text-amber-500 font-black">+${500 * this.level}</span> 分 · 本关用时 <span class="text-indigo-600 font-black">${this.levelElapsed.toFixed(1)}s</span><br>
                     总分：<span class="text-amber-500 font-black">${this.score}</span> · 金币：<span class="text-yellow-600 font-black">${this.coins}</span> · 最高连杀：<span class="text-fuchsia-600 font-black">x${this.bestChain}</span>`,
                    `进入强化商店`,
                    'star'
                );
            }

            draw() {
                const ctx = this.ctx;
                ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

                if (this.shakeAmt > 0.15) {
                    this.shakeAmt *= 0.86;
                } else {
                    this.shakeAmt = 0;
                }
                const shakeX = this.shakeAmt > 0 ? (Math.random() * 2 - 1) * this.shakeAmt : 0;
                const shakeY = this.shakeAmt > 0 ? (Math.random() * 2 - 1) * this.shakeAmt : 0;

                const isMoba = document.body.classList.contains('moba-mode');
                const baseViewW = isMoba ? 14 : VIEW_COLS; // 改为 14，视野更广
                const zoom = this.canvas.width / (baseViewW * TILE_SIZE);
                const viewW = this.canvas.width / zoom;
                const viewH = this.canvas.height / zoom;

                const worldW = this.mapCols * TILE_SIZE;
                const worldH = this.mapRows * TILE_SIZE;
                const offX = Math.max(0, (viewW - worldW) / 2);
                const offY = Math.max(0, (viewH - worldH) / 2);

                ctx.save();
                ctx.scale(zoom, zoom);
                ctx.translate(
                    -(this.camera.x - offX) + shakeX,
                    -(this.camera.y - offY) + shakeY
                );

                const startCol = Math.max(0, Math.floor((this.camera.x - offX) / TILE_SIZE) - 1);
                const endCol = Math.min(this.mapCols - 1, Math.ceil((this.camera.x - offX + viewW) / TILE_SIZE) + 1);
                const startRow = Math.max(0, Math.floor((this.camera.y - offY) / TILE_SIZE) - 1);
                const endRow = Math.min(this.mapRows - 1, Math.ceil((this.camera.y - offY + viewH) / TILE_SIZE) + 1);

                for (let r = startRow; r <= endRow; r++) {
                    for (let c = startCol; c <= endCol; c++) {
                        const x = c * TILE_SIZE;
                        const y = r * TILE_SIZE;
                        const isLight = (r + c) % 2 === 0;
                        ctx.fillStyle = isLight ? this._theme.light : this._theme.dark;
                        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

                        if (this.grid[r] && this.grid[r][c] === TILE.EMPTY && (r * 7 + c * 13) % 5 === 0) {
                            ctx.fillStyle = this._theme.deco;
                            ctx.beginPath();
                            ctx.arc(x + 14, y + 46, 3, 0, Math.PI * 2);
                            ctx.arc(x + 20, y + 48, 2.2, 0, Math.PI * 2);
                            ctx.fill();
                        }
                    }
                }

                if (this.portal && this.portal.revealed) {
                    this.drawPortal(this.portal);
                }

                for (let r = startRow; r <= endRow; r++) {
                    for (let c = startCol; c <= endCol; c++) {
                        const tile = this.grid[r] && this.grid[r][c];
                        if (tile === TILE.WALL) {
                            this.drawStoneWall(c, r);
                        } else if (tile === TILE.CRATE) {
                            this.drawWoodCrate(c, r);
                        } else if (tile === TILE.FROST_CRATE) {
                            this.drawFrostCrate(c, r);
                        } else if (tile === TILE.VINE) {
                            this.drawVineTile(c, r);
                        }
                    }
                }

                if (this.goldenCrate) {
                    const gx = (this.goldenCrate.col + 0.5) * TILE_SIZE;
                    const gy = (this.goldenCrate.row + 0.5) * TILE_SIZE;
                    const bob = Math.sin(this.globalTime * 0.14) * 3;
                    ctx.font = '900 15px "Fredoka", "Noto Sans SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawIcon('coin', gx, gy - 24 + bob, 26);
                }

                this.powerups.forEach(item => this.drawPowerup(item));
                this.bombs.forEach(bomb => this.drawBomb(bomb));
                this.explosions.forEach(exp => this.drawExplosion(exp));
                this.enemies.forEach(enemy => this.drawEnemy(enemy));

                if (this.player) {
                    this.drawPlayer(this.player);
                }

                this.drawRainbowBolts();
                this.drawParticlesAndTexts();

                ctx.restore();

                // 小地图节流：每 6 帧重绘一次
                this._minimapTick = (this._minimapTick || 0) + 1;
                if (this._minimapTick % 6 === 0) this.drawMinimap();

                if (this.screenFlashTimer > 0) {
                    this.screenFlashTimer--;
                    const alpha = (this.screenFlashTimer / 28) * 0.42;
                    ctx.fillStyle = `rgba(254, 240, 138, ${alpha})`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }

                if (this.megaFlashTimer > 0) {
                    this.megaFlashTimer--;
                    const a = (this.megaFlashTimer / 34) * 0.55;
                    ctx.fillStyle = `rgba(217, 70, 239, ${a})`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }

                if (this.hitFlash > 0) {
                    this.hitFlash--;
                    ctx.fillStyle = `rgba(244, 63, 94, ${(this.hitFlash / 14) * 0.34})`;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }

                if (this.dangerLevel > 0 && this.state === 'PLAYING') {
                    const a = Math.min(0.4, this.dangerLevel * 0.08) * (0.6 + 0.4 * Math.sin(this.globalTime * 0.25));
                    const grad = ctx.createRadialGradient(
                        this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.25,
                        this.canvas.width / 2, this.canvas.height / 2, this.canvas.height * 0.72
                    );
                    grad.addColorStop(0, 'rgba(244, 63, 94, 0)');
                    grad.addColorStop(1, `rgba(244, 63, 94, ${a})`);
                    ctx.fillStyle = grad;
                    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
                }
            }

            drawStoneWall(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
                drawRoundRect(ctx, x + 3, y + 6, TILE_SIZE - 6, TILE_SIZE - 6, 14);
                ctx.fill();

                ctx.fillStyle = '#64748b';
                drawRoundRect(ctx, x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 8, 14);
                ctx.fill();

                ctx.fillStyle = '#94a3b8';
                drawRoundRect(ctx, x + 5, y + 4, TILE_SIZE - 10, TILE_SIZE - 14, 12);
                ctx.fill();

                // 砖缝：两横一竖
                ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 7, y + 20); ctx.lineTo(x + TILE_SIZE - 7, y + 20);
                ctx.moveTo(x + 7, y + 36); ctx.lineTo(x + TILE_SIZE - 7, y + 36);
                ctx.moveTo(x + TILE_SIZE / 2, y + 20); ctx.lineTo(x + TILE_SIZE / 2, y + 36);
                ctx.moveTo(x + 16, y + 6); ctx.lineTo(x + 16, y + 20);
                ctx.moveTo(x + TILE_SIZE - 16, y + 36); ctx.lineTo(x + TILE_SIZE - 16, y + 50);
                ctx.stroke();

                // 顶部高光
                ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
                drawRoundRect(ctx, x + 9, y + 6, TILE_SIZE - 18, 6, 3);
                ctx.fill();

                ctx.fillStyle = '#475569';
                ctx.beginPath();
                ctx.arc(x + 13, y + TILE_SIZE - 16, 2.5, 0, Math.PI * 2);
                ctx.arc(x + TILE_SIZE - 13, y + TILE_SIZE - 16, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            drawWoodCrate(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                ctx.fillStyle = 'rgba(0,0,0,0.16)';
                drawRoundRect(ctx, x + 4, y + 7, TILE_SIZE - 8, TILE_SIZE - 8, 12);
                ctx.fill();

                // 箱体底色
                ctx.fillStyle = '#b45309';
                drawRoundRect(ctx, x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 10, 12);
                ctx.fill();

                ctx.fillStyle = '#d97706';
                drawRoundRect(ctx, x + 8, y + 7, TILE_SIZE - 16, TILE_SIZE - 17, 9);
                ctx.fill();

                // 木板纹理：竖向木纹线
                ctx.strokeStyle = 'rgba(146, 64, 14, 0.55)';
                ctx.lineWidth = 1.6;
                const px = [x + 17, x + 28, x + 39];
                px.forEach((lx, i) => {
                    ctx.beginPath();
                    ctx.moveTo(lx, y + 10);
                    ctx.bezierCurveTo(lx + (i % 2 ? 2 : -2), y + 20, lx + (i % 2 ? -2 : 2), y + 32, lx, y + 42);
                    ctx.stroke();
                });

                // 金属包边
                ctx.fillStyle = '#92400e';
                ctx.fillRect(x + 8, y + 7, TILE_SIZE - 16, 4);
                ctx.fillRect(x + 8, y + TILE_SIZE - 14, TILE_SIZE - 16, 4);

                // 四角铆钉
                ctx.fillStyle = '#78716c';
                [[x + 13, y + 12], [x + TILE_SIZE - 13, y + 12], [x + 13, y + TILE_SIZE - 13], [x + TILE_SIZE - 13, y + TILE_SIZE - 13]].forEach(([nx, ny]) => {
                    ctx.beginPath(); ctx.arc(nx, ny, 2.6, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#d6d3d1';
                    ctx.beginPath(); ctx.arc(nx - 0.8, ny - 0.8, 1, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#78716c';
                });

                // 高光
                ctx.fillStyle = 'rgba(253, 230, 138, 0.5)';
                drawRoundRect(ctx, x + 10, y + 9, 8, TILE_SIZE - 22, 4);
                ctx.fill();
            }

            drawFrostCrate(col, row) {
                this.drawWoodCrate(col, row);
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                ctx.fillStyle = 'rgba(125, 211, 252, 0.78)';
                drawRoundRect(ctx, x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 8, 12);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                drawRoundRect(ctx, x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 14, 10);
                ctx.stroke();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                drawRoundRect(ctx, x + 9, y + 8, TILE_SIZE - 26, 8, 4);
                ctx.fill();

                this.drawIcon('snow', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 1, 22);
            }

            drawVineTile(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;
                const cx = x + TILE_SIZE / 2;
                const cy = y + TILE_SIZE / 2;
                const sway = Math.sin(this.globalTime * 0.08 + col + row) * 2.5;

                ctx.fillStyle = 'rgba(22, 163, 74, 0.25)';
                drawRoundRect(ctx, x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10, 14);
                ctx.fill();

                ctx.strokeStyle = '#15803d';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(cx, cy, 18 + sway * 0.5, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = '#4ade80';
                ctx.beginPath();
                ctx.arc(cx - 12, cy - 10, 5, 0, Math.PI * 2);
                ctx.arc(cx + 13, cy + 9, 5, 0, Math.PI * 2);
                ctx.fill();

                this.drawIcon('leaf', cx + sway * 0.4, cy, 24);
            }

            drawPortal(portal) {
                const ctx = this.ctx;
                const cx = (portal.col + 0.5) * TILE_SIZE;
                const cy = (portal.row + 0.5) * TILE_SIZE;

                if (!portal.active) {
                    ctx.save();
                    ctx.translate(cx, cy);

                    ctx.fillStyle = '#475569';
                    ctx.beginPath();
                    ctx.arc(0, 0, 23, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#1e293b';
                    ctx.beginPath();
                    ctx.arc(0, 0, 17, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.arc(0, 0, 14, this.globalTime * 0.015, this.globalTime * 0.015 + Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.strokeStyle = '#94a3b8';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-14, -14);
                    ctx.lineTo(14, 14);
                    ctx.moveTo(14, -14);
                    ctx.lineTo(-14, 14);
                    ctx.stroke();

                    ctx.font = '15px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawIcon('lock', 0, 1, 20);

                    ctx.restore();
                } else {
                    const pulse = Math.sin(this.globalTime * 0.12) * 4;

                    if (this.state === 'PLAYING' && Math.random() < 0.35) {
                        const ang = Math.random() * Math.PI * 2;
                        this.particles.push({
                            x: cx + Math.cos(ang) * 18,
                            y: cy + Math.sin(ang) * 18,
                            vx: (Math.random() - 0.5) * 1.2,
                            vy: -0.8 - Math.random() * 1.5,
                            radius: 3 + Math.random() * 2.5,
                            color: ['#fde047', '#f472b6', '#38bdf8', '#c084fc'][Math.floor(Math.random() * 4)],
                            life: 22,
                            maxLife: 22
                        });
                    }

                    ctx.save();
                    ctx.translate(cx, cy);

                    const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, 28 + pulse);
                    grad.addColorStop(0, '#fef08a');
                    grad.addColorStop(0.45, '#ec4899');
                    grad.addColorStop(0.75, '#8b5cf6');
                    grad.addColorStop(1, 'rgba(139, 92, 246, 0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(0, 0, 28 + pulse, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.rotate(this.globalTime * 0.06);
                    ctx.strokeStyle = '#fde047';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(0, 0, 20, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    for (let i = 0; i < 6; i++) {
                        ctx.rotate(Math.PI / 3);
                        ctx.beginPath();
                        ctx.arc(6, 6, 9, 0, Math.PI);
                        ctx.stroke();
                    }
                    ctx.restore();

                    const floatY = cy - 30 + Math.sin(this.globalTime * 0.15) * 4;
                    ctx.font = '900 12px "Fredoka", "Noto Sans SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3.5;
                    ctx.strokeText('进入过关 ▼', cx, floatY);
                    ctx.fillStyle = '#7e22ce';
                    ctx.fillText('进入过关 ▼', cx, floatY);
                }
            }

            drawPowerup(item) {
                const ctx = this.ctx;
                const cx = (item.col + 0.5) * TILE_SIZE;
                const bounceY = Math.sin(this.globalTime * 0.1 + item.floatPhase) * 4;
                const cy = (item.row + 0.5) * TILE_SIZE + bounceY;

                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.ellipse(cx, (item.row + 0.5) * TILE_SIZE + 18, 14, 5, 0, 0, Math.PI * 2);
                ctx.fill();

                if (item.type === 'GOLDEN_BAG') {
                    const glow = 0.5 + 0.5 * Math.sin(this.globalTime * 0.18);
                    ctx.save();
                    ctx.shadowColor = `rgba(250, 204, 21, ${glow})`;
                    ctx.shadowBlur = 18;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(cx, cy, 21, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    ctx.fillStyle = '#eab308';
                    ctx.beginPath();
                    ctx.arc(cx, cy, 17.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath();
                    ctx.arc(cx - 6, cy - 6, 4.5, 0, Math.PI * 2);
                    ctx.fill();

                    this.drawIcon('coin', cx, cy, 24);
                    return;
                }

                const bgColors = {
                    [POWERUP_TYPE.BOMB_UP]: '#334155',
                    [POWERUP_TYPE.FIRE_UP]: '#f97316',
                    [POWERUP_TYPE.SPEED_UP]: '#0ea5e9',
                    [POWERUP_TYPE.SHIELD]: '#10b981',
                    [POWERUP_TYPE.REMOTE_BOMB]: '#0284c7',
                    [POWERUP_TYPE.GHOST_CAPE]: '#9333ea',
                    [POWERUP_TYPE.FLAME_VEST]: '#f59e0b',
                    [POWERUP_TYPE.MAGIC_BIRD]: '#ec4899'
                };
                const icons = {
                    [POWERUP_TYPE.BOMB_UP]: 'bomb',
                    [POWERUP_TYPE.FIRE_UP]: 'fire',
                    [POWERUP_TYPE.SPEED_UP]: 'bolt',
                    [POWERUP_TYPE.SHIELD]: 'shield',
                    [POWERUP_TYPE.REMOTE_BOMB]: 'clock',
                    [POWERUP_TYPE.GHOST_CAPE]: 'ghost',
                    [POWERUP_TYPE.FLAME_VEST]: 'vest',
                    [POWERUP_TYPE.MAGIC_BIRD]: 'bird'
                };

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, 20, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = bgColors[item.type] || '#334155';
                ctx.beginPath();
                ctx.arc(cx, cy, 16.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.beginPath();
                ctx.arc(cx - 6, cy - 6, 4.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                this.drawIcon(icons[item.type] || 'star', cx, cy, 22);
            }

            drawBomb(bomb) {
                const ctx = this.ctx;
                const cx = (bomb.col + 0.5) * TILE_SIZE;
                const cy = (bomb.row + 0.5) * TILE_SIZE;

                const urgency = bomb.isRemote ? 1.3 : (1 + (1 - bomb.timer / bomb.maxTimer) * 2.2);
                const scaleX = 1 + Math.sin(bomb.scalePhase * urgency) * 0.1;
                const scaleY = 1 - Math.sin(bomb.scalePhase * urgency) * 0.08;

                const frozen = !!bomb.frozen;

                if (bomb.fever && !frozen) {
                    ctx.strokeStyle = `hsl(${(this.globalTime * 10) % 360}, 95%, 60%)`;
                    ctx.lineWidth = 3.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy + 2, 26 + Math.sin(this.globalTime * 0.3) * 3, 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (bomb.isRemote) {
                    const pulseR = 23 + Math.sin(this.globalTime * 0.2) * 4;
                    ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
                    ctx.beginPath();
                    ctx.arc(cx, cy + 2, pulseR, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.beginPath();
                ctx.ellipse(cx, cy + 19, 18 * scaleX, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(cx, cy + 2);
                ctx.scale(scaleX, scaleY);

                const isRedFlash = !frozen && !bomb.isRemote && bomb.timer < 55 && Math.floor(bomb.timer / 5) % 2 === 0;
                const grad = ctx.createRadialGradient(-6, -6, 3, 0, 0, 22);
                if (bomb.isRemote) {
                    grad.addColorStop(0, '#7dd3fc');
                    grad.addColorStop(0.5, '#0284c7');
                    grad.addColorStop(1, '#0c4a6e');
                } else if (isRedFlash) {
                    grad.addColorStop(0, '#fca5a5');
                    grad.addColorStop(0.5, '#ef4444');
                    grad.addColorStop(1, '#7f1d1d');
                } else if (frozen) {
                    grad.addColorStop(0, '#e0f2fe');
                    grad.addColorStop(0.5, '#38bdf8');
                    grad.addColorStop(1, '#075985');
                } else {
                    grad.addColorStop(0, '#64748b');
                    grad.addColorStop(0.5, '#1e293b');
                    grad.addColorStop(1, '#0f172a');
                }

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, 21, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#94a3b8';
                drawRoundRect(ctx, -6, -24, 12, 6, 3);
                ctx.fill();

                if (bomb.isRemote) {
                    ctx.strokeStyle = '#e0f2fe';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(0, -24);
                    ctx.lineTo(0, -32);
                    ctx.stroke();

                    ctx.fillStyle = frozen ? '#bae6fd' : (Math.floor(this.globalTime / 8) % 2 === 0 ? '#38bdf8' : '#f43f5e');
                    ctx.beginPath();
                    ctx.arc(0, -33, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                } else if (frozen) {
                    ctx.strokeStyle = '#dbeafe';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(0, -24);
                    ctx.quadraticCurveTo(6, -31, 10, -26);
                    ctx.stroke();
                } else {
                    ctx.strokeStyle = '#fde047';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(0, -24);
                    ctx.quadraticCurveTo(6, -31, 10, -26);
                    ctx.stroke();
                }

                ctx.fillStyle = 'rgba(255,255,255,0.65)';
                ctx.beginPath();
                ctx.ellipse(-8, -8, 5, 3, -Math.PI / 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = frozen ? '#f0f9ff' : '#ffffff';
                ctx.beginPath();
                ctx.arc(-5, 3, 2.2, 0, Math.PI * 2);
                ctx.arc(6, 3, 2.2, 0, Math.PI * 2);
                ctx.fill();

                if (frozen) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.lineWidth = 2.2;
                    ctx.beginPath();
                    ctx.moveTo(-16, -14); ctx.lineTo(-4, -2);
                    ctx.moveTo(16, -15); ctx.lineTo(3, 4);
                    ctx.moveTo(-14, 15); ctx.lineTo(-2, 3);
                    ctx.stroke();
                }

                ctx.restore();

                if (frozen) {
                    ctx.font = '900 15px "Fredoka", "Noto Sans SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawIcon('snow', cx, cy - 44, 20);

                    const maxF = SPECIALIST_CFG.TORTOISE.freezeTicks;
                    const pct = Math.max(0, Math.min(1, bomb.frozenTimer / maxF));
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(cx, cy + 2, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
                    ctx.stroke();
                }
            }

            drawExplosion(exp) {
                const ctx = this.ctx;
                const progress = exp.timer / exp.maxTimer;
                const radiusScale = Math.sin(progress * Math.PI);

                exp.cells.forEach(cell => {
                    const cx = (cell.col + 0.5) * TILE_SIZE;
                    const cy = (cell.row + 0.5) * TILE_SIZE;
                    const r = (TILE_SIZE * 0.46) * (0.5 + 0.5 * radiusScale);

                    if (exp.fever) {
                        ctx.fillStyle = `hsl(${(this.globalTime * 14 + cell.col * 24) % 360}, 95%, 62%)`;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.fillStyle = '#f97316';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fef08a';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            drawEnemy(e) {
                if (
                    e.x < this.camera.x - TILE_SIZE * 2 ||
                    e.x > this.camera.x + this.canvas.width + TILE_SIZE * 2 ||
                    e.y < this.camera.y - TILE_SIZE * 2 ||
                    e.y > this.camera.y + this.canvas.height + TILE_SIZE * 2
                ) {
                    return;
                }

                const ctx = this.ctx;
                if (e.hurtTimer > 0 && Math.floor(e.hurtTimer / 3) % 2 === 0) {
                    ctx.globalAlpha = 0.45;
                }

                const bounce = Math.sin(e.animPhase * 2) * 3.5;
                const stretchX = 1 + Math.sin(e.animPhase * 2) * 0.07;
                const stretchY = 1 - Math.sin(e.animPhase * 2) * 0.07;

                ctx.fillStyle = 'rgba(0,0,0,0.18)';
                ctx.beginPath();
                ctx.ellipse(e.x, e.y + 19, 16 * stretchX, 5, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(e.x, e.y + bounce);
                ctx.scale(stretchX, stretchY);

                if (e.type === 'SLIME' || e.type === 'GOLD_SLIME') {
                    ctx.fillStyle = e.type === 'GOLD_SLIME' ? '#facc15' : '#38bdf8';
                    ctx.beginPath();
                    ctx.arc(0, 2, 19, Math.PI, 0, false);
                    ctx.quadraticCurveTo(19, 18, 0, 18);
                    ctx.quadraticCurveTo(-19, 18, -19, 2);
                    ctx.fill();

                    if (e.type === 'GOLD_SLIME') {
                        ctx.fillStyle = '#f97316';
                        ctx.beginPath();
                        ctx.moveTo(-10, -16);
                        ctx.lineTo(-5, -24);
                        ctx.lineTo(0, -18);
                        ctx.lineTo(5, -24);
                        ctx.lineTo(10, -16);
                        ctx.closePath();
                        ctx.fill();
                    }

                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    ctx.beginPath();
                    ctx.ellipse(-7, -5, 5, 2.8, -0.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6, 3, 2.8, 0, Math.PI * 2);
                    ctx.arc(6, 3, 2.8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#f472b6';
                    ctx.beginPath();
                    ctx.arc(-11, 6, 3, 0, Math.PI * 2);
                    ctx.arc(11, 6, 3, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'IRON_SNAIL') {
                    ctx.fillStyle = '#94a3b8';
                    ctx.beginPath();
                    ctx.arc(0, 0, 19, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#334155';
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    ctx.fillStyle = '#cbd5e1';
                    ctx.beginPath();
                    ctx.arc(0, 0, 11, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6, 6, 2.6, 0, Math.PI * 2);
                    ctx.arc(6, 6, 2.6, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'MUSHROOM') {
                    ctx.fillStyle = '#fef3c7';
                    drawRoundRect(ctx, -11, 2, 22, 16, 7);
                    ctx.fill();

                    ctx.fillStyle = '#f43f5e';
                    ctx.beginPath();
                    ctx.arc(0, 3, 20, Math.PI, 0, false);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(-9, -6, 4, 0, Math.PI * 2);
                    ctx.arc(8, -8, 3.5, 0, Math.PI * 2);
                    ctx.arc(0, -13, 3, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#1e293b';
                    ctx.beginPath();
                    ctx.arc(-5, 9, 2.4, 0, Math.PI * 2);
                    ctx.arc(5, 9, 2.4, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'GHOST') {
                    ctx.globalAlpha = 0.88;
                    ctx.fillStyle = '#c084fc';
                    ctx.beginPath();
                    ctx.arc(0, -2, 18, Math.PI, 0, false);
                    ctx.lineTo(18, 16);
                    ctx.lineTo(9, 11);
                    ctx.lineTo(0, 16);
                    ctx.lineTo(-9, 11);
                    ctx.lineTo(-18, 16);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(-6, 0, 4, 0, Math.PI * 2);
                    ctx.arc(6, 0, 4, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#3b0764';
                    ctx.beginPath();
                    ctx.arc(-6, 0, 2, 0, Math.PI * 2);
                    ctx.arc(6, 0, 2, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'SALAMANDER') {
                    ctx.fillStyle = '#fb923c';
                    ctx.beginPath();
                    ctx.ellipse(0, 4, 17, 15, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = '#fb923c';
                    ctx.lineWidth = 6;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-14, 8);
                    ctx.quadraticCurveTo(-24, 4, -25, -6);
                    ctx.stroke();

                    const flick = Math.sin(this.globalTime * 0.35) * 2;
                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.moveTo(-25, -5);
                    ctx.lineTo(-21, -13 - flick);
                    ctx.lineTo(-17, -4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#ef4444';
                    ctx.beginPath();
                    ctx.moveTo(-24, -4);
                    ctx.lineTo(-21, -9 - flick);
                    ctx.lineTo(-18, -3);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#f97316';
                    ctx.beginPath();
                    ctx.moveTo(-8, -10);
                    ctx.lineTo(-3, -19);
                    ctx.lineTo(2, -11);
                    ctx.lineTo(7, -18);
                    ctx.lineTo(11, -9);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#fed7aa';
                    ctx.beginPath();
                    ctx.ellipse(0, 9, 10, 8, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fff7ed';
                    ctx.beginPath();
                    ctx.arc(-6, 0, 5, 0, Math.PI * 2);
                    ctx.arc(6, 0, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6, 1, 2.6, 0, Math.PI * 2);
                    ctx.arc(6, 1, 2.6, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#7c2d12';
                    ctx.beginPath();
                    ctx.arc(-2.5, 7, 1.2, 0, Math.PI * 2);
                    ctx.arc(2.5, 7, 1.2, 0, Math.PI * 2);
                    ctx.fill();

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.fillStyle = `rgba(250, 204, 21, ${0.35 + heat * 0.5})`;
                        ctx.beginPath();
                        ctx.arc(0, 12, 4 + heat * 5, 0, Math.PI * 2);
                        ctx.fill();
                    }

                } else if (e.type === 'TORTOISE') {
                    ctx.fillStyle = '#86efac';
                    ctx.beginPath();
                    ctx.arc(-14, 12, 5.5, 0, Math.PI * 2);
                    ctx.arc(14, 12, 5.5, 0, Math.PI * 2);
                    ctx.arc(-14, -6, 5, 0, Math.PI * 2);
                    ctx.arc(14, -6, 5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#a7f3d0';
                    ctx.beginPath();
                    ctx.arc(0, -14, 9, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-3.5, -16, 1.8, 0, Math.PI * 2);
                    ctx.arc(3.5, -16, 1.8, 0, Math.PI * 2);
                    ctx.fill();

                    const shellGrad = ctx.createLinearGradient(0, -12, 0, 16);
                    shellGrad.addColorStop(0, '#22c55e');
                    shellGrad.addColorStop(1, '#15803d');
                    ctx.fillStyle = shellGrad;
                    ctx.beginPath();
                    ctx.ellipse(0, 2, 18, 15, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(240, 253, 244, 0.75)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, -13); ctx.lineTo(0, 17);
                    ctx.moveTo(-17, 2); ctx.lineTo(17, 2);
                    ctx.moveTo(-11, -9); ctx.lineTo(11, 13);
                    ctx.moveTo(11, -9); ctx.lineTo(-11, 13);
                    ctx.stroke();

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + heat * 0.5})`;
                        ctx.beginPath();
                        ctx.arc(0, -24 - heat * 3, 3 + heat * 3, 0, Math.PI * 2);
                        ctx.fill();
                    }

                } else if (e.type === 'AZUREBIRD') {
                    ctx.fillStyle = '#22d3ee';
                    ctx.beginPath();
                    ctx.ellipse(0, 2, 15, 13, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#06b6d4';
                    ctx.beginPath();
                    ctx.moveTo(-12, 2);
                    ctx.lineTo(-26, -4);
                    ctx.lineTo(-24, 4);
                    ctx.lineTo(-26, 11);
                    ctx.closePath();
                    ctx.fill();

                    const flap = Math.sin(e.animPhase * 3.2) * 5;
                    ctx.fillStyle = '#67e8f9';
                    ctx.beginPath();
                    ctx.ellipse(-4, -8 - flap * 0.4, 12, 6, -0.5 - flap * 0.05, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(6, -9 + flap * 0.4, 11, 5.5, 0.45 + flap * 0.05, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#cffafe';
                    ctx.beginPath();
                    ctx.arc(11, -9, 8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fbbf24';
                    ctx.beginPath();
                    ctx.moveTo(18, -9);
                    ctx.lineTo(26, -7);
                    ctx.lineTo(18, -5);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(13, -11, 2, 0, Math.PI * 2);
                    ctx.fill();

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.strokeStyle = `rgba(165, 243, 252, ${0.4 + heat * 0.5})`;
                        ctx.lineWidth = 2.5;
                        for (let w = 0; w < 3; w++) {
                            ctx.beginPath();
                            ctx.arc(0, 0, 22 + w * 5 + heat * 6, -0.6, 0.6);
                            ctx.stroke();
                        }
                    }

                } else if (e.type === 'WHITETIGER') {
                    ctx.fillStyle = '#f1f5f9';
                    ctx.beginPath();
                    ctx.ellipse(0, 4, 18, 16, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#e2e8f0';
                    ctx.beginPath();
                    ctx.moveTo(-14, -10); ctx.lineTo(-9, -22); ctx.lineTo(-4, -10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(14, -10); ctx.lineTo(9, -22); ctx.lineTo(4, -10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#f9a8d4';
                    ctx.beginPath();
                    ctx.moveTo(-12, -11); ctx.lineTo(-9, -18); ctx.lineTo(-6, -11);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(12, -11); ctx.lineTo(9, -18); ctx.lineTo(6, -11);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-6, -14); ctx.lineTo(-6, -4);
                    ctx.moveTo(0, -16); ctx.lineTo(0, -5);
                    ctx.moveTo(6, -14); ctx.lineTo(6, -4);
                    ctx.moveTo(-1, -11); ctx.lineTo(1, -11);
                    ctx.stroke();

                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.arc(-6.5, 1, 3.4, 0, Math.PI * 2);
                    ctx.arc(6.5, 1, 3.4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6.5, 1, 1.6, 0, Math.PI * 2);
                    ctx.arc(6.5, 1, 1.6, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fbcfe8';
                    ctx.beginPath();
                    ctx.ellipse(0, 9, 6, 4.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.moveTo(-3, 11); ctx.lineTo(3, 11); ctx.lineTo(0, 14);
                    ctx.closePath();
                    ctx.fill();

                    if (e.feedCount > 0) {
                        ctx.strokeStyle = `rgba(192, 132, 252, ${0.45 + 0.35 * Math.sin(this.globalTime * 0.22)})`;
                        ctx.lineWidth = 2;
                        for (let s = -1; s <= 1; s += 2) {
                            ctx.beginPath();
                            ctx.moveTo(s * 8, 9);
                            ctx.lineTo(s * 22, 7 + s * 3);
                            ctx.stroke();
                        }
                    }

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.fillStyle = `rgba(168, 85, 247, ${0.2 + heat * 0.45})`;
                        ctx.beginPath();
                        ctx.arc(0, 10, 6 + heat * 8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                ctx.restore();
                ctx.globalAlpha = 1.0;

                if (e.enrageTimer > 0) {
                    this.drawIcon('angry', e.x + 17, e.y - 21, 18);
                }

                if (this.isSpecialist(e.type)) {
                    const badge = e.type === 'SALAMANDER' ? 'fire'
                                : e.type === 'TORTOISE' ? 'water'
                                : e.type === 'AZUREBIRD' ? 'wind' : 'swirl';
                    if (e.windUp > 0) {
                        this.drawIcon(badge, e.x - 18, e.y - 20, 20);
                        const pct = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
                        ctx.lineWidth = 3.5;
                        ctx.beginPath();
                        ctx.arc(e.x, e.y - 2, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
                        ctx.stroke();
                    } else if (e.skillCd <= 0) {
                        this.drawIcon(badge, e.x - 18, e.y - 20, 20);
                    }
                }

                if (e.waterGuard > 0) {
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
                    ctx.lineWidth = 3.5;
                    ctx.setLineDash([7, 5]);
                    ctx.beginPath();
                    ctx.arc(e.x, e.y - 2, 27, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                if (e.fireImmuneTimer > 0) {
                    ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y - 2, 29 + Math.sin(this.globalTime * 0.3) * 2, 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (e.maxHp > 1) {
                    const barW = 36;
                    const barH = 6;
                    const bx = e.x - barW / 2;
                    const by = e.y - 31;

                    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
                    drawRoundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, 3);
                    ctx.fill();

                    const segW = barW / e.maxHp;
                    for (let s = 0; s < e.hp; s++) {
                        ctx.fillStyle = e.hp === 1 ? '#f43f5e' : '#facc15';
                        ctx.fillRect(bx + s * segW + 1, by, segW - 2, barH);
                    }
                }
            }

            // ============================================================
            // 矢量图标系统：糖果风小图标，替代 emoji（精致游戏质感）
            // 所有图标绘制在 24x24 网格上，(x,y) 为中心，s 为目标尺寸
            // ============================================================
            drawIcon(name, x, y, s, targetCtx = null) {
                const ctx = targetCtx || this.ctx;
                ctx.save();
                ctx.translate(x, y);
                const u = s / 24;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                const circle = (r, fill) => {
                    if (!fill) return;
                    ctx.fillStyle = fill;
                    ctx.beginPath(); ctx.arc(0, 0, r * u, 0, Math.PI * 2); ctx.fill();
                };
                const shine = (sx, sy, r, a = 0.55) => {
                    ctx.fillStyle = `rgba(255,255,255,${a})`;
                    ctx.beginPath(); ctx.arc(sx * u, sy * u, r * u, 0, Math.PI * 2); ctx.fill();
                };

                switch (name) {
                    case 'coin': {
                        circle(11, '#92400e');
                        circle(9.2, '#f59e0b');
                        circle(7, '#fcd34d');
                        ctx.strokeStyle = '#b45309';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath(); ctx.arc(0, 0, 4.6 * u, 0, Math.PI * 2); ctx.stroke();
                        shine(-2.6, -3.2, 2, 0.65);
                        break;
                    }
                    case 'bomb': {
                        // 引线
                        ctx.strokeStyle = '#92400e';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath(); ctx.moveTo(4 * u, -7 * u); ctx.quadraticCurveTo(8 * u, -11 * u, 10 * u, -8 * u); ctx.stroke();
                        // 火花
                        ctx.fillStyle = '#fbbf24';
                        ctx.beginPath(); ctx.arc(10.5 * u, -8.5 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#f97316';
                        ctx.beginPath(); ctx.arc(10.5 * u, -8.5 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
                        // 本体
                        circle(9.2, '#1f2937');
                        circle(9.2, null);
                        ctx.fillStyle = '#374151';
                        ctx.beginPath(); ctx.arc(0, 0, 9.2 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#111827';
                        ctx.beginPath(); ctx.arc(1 * u, 1.5 * u, 7.6 * u, 0, Math.PI * 2); ctx.fill();
                        shine(-3, -3.4, 2.4, 0.5);
                        // 顶部盖
                        ctx.fillStyle = '#6b7280';
                        drawRoundRect(ctx, -3.4 * u, -11.6 * u, 6.8 * u, 3.4 * u, 1.4 * u);
                        ctx.fill();
                        break;
                    }
                    case 'fire': {
                        // 外焰
                        ctx.fillStyle = '#f97316';
                        ctx.beginPath();
                        ctx.moveTo(0, -11 * u);
                        ctx.bezierCurveTo(7 * u, -4 * u, 9 * u, 2 * u, 6 * u, 8 * u);
                        ctx.bezierCurveTo(4 * u, 11 * u, -4 * u, 11 * u, -6 * u, 8 * u);
                        ctx.bezierCurveTo(-9 * u, 2 * u, -7 * u, -4 * u, 0, -11 * u);
                        ctx.fill();
                        // 内焰
                        ctx.fillStyle = '#fde047';
                        ctx.beginPath();
                        ctx.moveTo(0, -5 * u);
                        ctx.bezierCurveTo(4 * u, 0, 5 * u, 4 * u, 3 * u, 8 * u);
                        ctx.bezierCurveTo(1.5 * u, 10 * u, -1.5 * u, 10 * u, -3 * u, 8 * u);
                        ctx.bezierCurveTo(-5 * u, 4 * u, -4 * u, 0, 0, -5 * u);
                        ctx.fill();
                        break;
                    }
                    case 'bolt': {
                        ctx.fillStyle = '#facc15';
                        ctx.strokeStyle = '#b45309';
                        ctx.lineWidth = 1.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(4 * u, -11 * u);
                        ctx.lineTo(-5 * u, 2 * u);
                        ctx.lineTo(-1 * u, 2 * u);
                        ctx.lineTo(-4 * u, 11 * u);
                        ctx.lineTo(5 * u, -2 * u);
                        ctx.lineTo(1 * u, -2 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        break;
                    }
                    case 'shield': {
                        ctx.fillStyle = '#10b981';
                        ctx.strokeStyle = '#065f46';
                        ctx.lineWidth = 1.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.lineTo(8 * u, -6 * u);
                        ctx.lineTo(8 * u, 1 * u);
                        ctx.bezierCurveTo(8 * u, 7 * u, 4 * u, 10 * u, 0, 11.5 * u);
                        ctx.bezierCurveTo(-4 * u, 10 * u, -8 * u, 7 * u, -8 * u, 1 * u);
                        ctx.lineTo(-8 * u, -6 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        shine(-2.6, -3.4, 1.8, 0.5);
                        break;
                    }
                    case 'clock': {
                        circle(9.4, '#e0f2fe');
                        ctx.strokeStyle = '#0284c7';
                        ctx.lineWidth = 2 * u;
                        ctx.beginPath(); ctx.arc(0, 0, 9.4 * u, 0, Math.PI * 2); ctx.stroke();
                        ctx.strokeStyle = '#0c4a6e';
                        ctx.lineWidth = 2 * u;
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5.5 * u); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4 * u, 1.5 * u); ctx.stroke();
                        circle(1.6, '#0c4a6e');
                        break;
                    }
                    case 'ghost': {
                        ctx.fillStyle = '#a78bfa';
                        ctx.beginPath();
                        ctx.arc(0, -2 * u, 8 * u, Math.PI, 0);
                        ctx.lineTo(8 * u, 7 * u);
                        // 波浪底边
                        for (let i = 0; i < 3; i++) {
                            ctx.arc((8 - (i * 2 + 1) * 16 / 6) * u, 7 * u, (16 / 6 / 2) * u, 0, Math.PI, true);
                        }
                        ctx.closePath();
                        ctx.fill();
                        // 眼睛
                        ctx.fillStyle = '#1e1b4b';
                        ctx.beginPath(); ctx.arc(-3 * u, -3 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(3 * u, -3 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        shine(-3.4, -6, 1.6, 0.5);
                        break;
                    }
                    case 'vest': {
                        // 火焰纹章盾
                        ctx.fillStyle = '#f59e0b';
                        ctx.strokeStyle = '#92400e';
                        ctx.lineWidth = 1.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.lineTo(8 * u, -6 * u);
                        ctx.lineTo(8 * u, 1 * u);
                        ctx.bezierCurveTo(8 * u, 7 * u, 4 * u, 10 * u, 0, 11.5 * u);
                        ctx.bezierCurveTo(-4 * u, 10 * u, -8 * u, 7 * u, -8 * u, 1 * u);
                        ctx.lineTo(-8 * u, -6 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        // 小火焰
                        ctx.fillStyle = '#ef4444';
                        ctx.beginPath();
                        ctx.moveTo(0, -5 * u);
                        ctx.bezierCurveTo(3.4 * u, -1 * u, 4 * u, 3 * u, 2.4 * u, 6 * u);
                        ctx.bezierCurveTo(1 * u, 8 * u, -1 * u, 8 * u, -2.4 * u, 6 * u);
                        ctx.bezierCurveTo(-4 * u, 3 * u, -3.4 * u, -1 * u, 0, -5 * u);
                        ctx.fill();
                        break;
                    }
                    case 'bird': {
                        // 魔力鸟：圆身 + 翅膀 + 喙
                        ctx.fillStyle = '#f472b6';
                        ctx.beginPath(); ctx.ellipse(0, 1 * u, 7.5 * u, 6 * u, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#ec4899';
                        ctx.beginPath(); ctx.ellipse(-5 * u, -1 * u, 4.5 * u, 3 * u, -0.5, 0, Math.PI * 2); ctx.fill();
                        // 眼睛
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(3 * u, -1 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#0f172a';
                        ctx.beginPath(); ctx.arc(3.6 * u, -1 * u, 1.3 * u, 0, Math.PI * 2); ctx.fill();
                        // 喙
                        ctx.fillStyle = '#fbbf24';
                        ctx.beginPath();
                        ctx.moveTo(8.5 * u, 0); ctx.lineTo(11.5 * u, 1.6 * u); ctx.lineTo(8.5 * u, 3.2 * u);
                        ctx.closePath(); ctx.fill();
                        // 彩虹尾
                        ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2 * u;
                        ctx.beginPath(); ctx.moveTo(-7 * u, 4 * u); ctx.quadraticCurveTo(-11 * u, 7 * u, -10 * u, 10 * u); ctx.stroke();
                        break;
                    }
                    case 'snow': {
                        ctx.strokeStyle = '#e0f2fe';
                        ctx.lineWidth = 2.2 * u;
                        for (let i = 0; i < 6; i++) {
                            const a = (i / 6) * Math.PI * 2;
                            ctx.beginPath();
                            ctx.moveTo(0, 0);
                            ctx.lineTo(Math.cos(a) * 9 * u, Math.sin(a) * 9 * u);
                            ctx.stroke();
                            // 小分叉
                            const bx = Math.cos(a) * 6 * u, by = Math.sin(a) * 6 * u;
                            ctx.lineWidth = 1.6 * u;
                            ctx.beginPath();
                            ctx.moveTo(bx, by);
                            ctx.lineTo(bx + Math.cos(a + 0.5) * 2.6 * u, by + Math.sin(a + 0.5) * 2.6 * u);
                            ctx.moveTo(bx, by);
                            ctx.lineTo(bx + Math.cos(a - 0.5) * 2.6 * u, by + Math.sin(a - 0.5) * 2.6 * u);
                            ctx.stroke();
                            ctx.lineWidth = 2.2 * u;
                        }
                        circle(1.8, '#ffffff');
                        break;
                    }
                    case 'leaf': {
                        ctx.fillStyle = '#22c55e';
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.bezierCurveTo(8 * u, -4 * u, 8 * u, 6 * u, 0, 10 * u);
                        ctx.bezierCurveTo(-8 * u, 6 * u, -8 * u, -4 * u, 0, -10 * u);
                        ctx.fill();
                        ctx.strokeStyle = '#15803d';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath(); ctx.moveTo(0, -8 * u); ctx.lineTo(0, 8 * u); ctx.stroke();
                        shine(-2.4, -3, 1.6, 0.5);
                        break;
                    }
                    case 'heart': {
                        ctx.fillStyle = '#f43f5e';
                        ctx.strokeStyle = '#9f1239';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath();
                        ctx.moveTo(0, 9 * u);
                        ctx.bezierCurveTo(-11 * u, 1 * u, -9 * u, -8 * u, -4 * u, -8 * u);
                        ctx.bezierCurveTo(-1.5 * u, -8 * u, 0, -6 * u, 0, -5 * u);
                        ctx.bezierCurveTo(0, -6 * u, 1.5 * u, -8 * u, 4 * u, -8 * u);
                        ctx.bezierCurveTo(9 * u, -8 * u, 11 * u, 1 * u, 0, 9 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        shine(-3, -3.4, 1.6, 0.5);
                        break;
                    }
                    case 'play': {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-4 * u, -8 * u);
                        ctx.lineTo(8 * u, 0);
                        ctx.lineTo(-4 * u, 8 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'pause': {
                        ctx.fillStyle = '#ffffff';
                        drawRoundRect(ctx, -7 * u, -8 * u, 5.5 * u, 16 * u, 2.4 * u);
                        ctx.fill();
                        drawRoundRect(ctx, 1.5 * u, -8 * u, 5.5 * u, 16 * u, 2.4 * u);
                        ctx.fill();
                        break;
                    }
                    case 'speaker': {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-8 * u, -4 * u);
                        ctx.lineTo(-3 * u, -4 * u);
                        ctx.lineTo(2 * u, -9 * u);
                        ctx.lineTo(2 * u, 9 * u);
                        ctx.lineTo(-3 * u, 4 * u);
                        ctx.lineTo(-8 * u, 4 * u);
                        ctx.closePath();
                        ctx.fill();
                        // 声波
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath(); ctx.arc(3 * u, 0, 5 * u, -0.9, 0.9); ctx.stroke();
                        ctx.beginPath(); ctx.arc(3 * u, 0, 8.5 * u, -0.9, 0.9); ctx.stroke();
                        break;
                    }
                    case 'speakerOff': {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-8 * u, -4 * u);
                        ctx.lineTo(-3 * u, -4 * u);
                        ctx.lineTo(2 * u, -9 * u);
                        ctx.lineTo(2 * u, 9 * u);
                        ctx.lineTo(-3 * u, 4 * u);
                        ctx.lineTo(-8 * u, 4 * u);
                        ctx.closePath();
                        ctx.fill();
                        ctx.strokeStyle = '#fca5a5';
                        ctx.lineWidth = 2.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(5 * u, -5 * u); ctx.lineTo(11 * u, 5 * u);
                        ctx.moveTo(11 * u, -5 * u); ctx.lineTo(5 * u, 5 * u);
                        ctx.stroke();
                        break;
                    }
                    case 'restart': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3 * u;
                        ctx.beginPath();
                        ctx.arc(0, 0, 7.5 * u, -0.6, Math.PI * 1.35);
                        ctx.stroke();
                        // 箭头
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(9.5 * u, -6 * u);
                        ctx.lineTo(4 * u, -8.5 * u);
                        ctx.lineTo(7.5 * u, -2.5 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'fullscreen': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3 * u;
                        const corner = (sx, sy) => {
                            ctx.beginPath();
                            ctx.moveTo(sx * 9 * u, sy * 5.5 * u);
                            ctx.lineTo(sx * 9 * u, sy * 9 * u);
                            ctx.lineTo(sx * 5.5 * u, sy * 9 * u);
                            ctx.stroke();
                        };
                        corner(-1, -1); corner(1, -1); corner(-1, 1); corner(1, 1);
                        break;
                    }
                    case 'flag': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.4 * u;
                        ctx.beginPath();
                        ctx.moveTo(-5 * u, -9 * u); ctx.lineTo(-5 * u, 10 * u);
                        ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-5 * u, -9 * u);
                        ctx.lineTo(8 * u, -5.5 * u);
                        ctx.lineTo(-5 * u, -2 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'trophy': {
                        // 杯身
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-6 * u, -9 * u);
                        ctx.lineTo(6 * u, -9 * u);
                        ctx.lineTo(4 * u, 2 * u);
                        ctx.quadraticCurveTo(0, 4 * u, -4 * u, 2 * u);
                        ctx.closePath();
                        ctx.fill();
                        // 杯耳
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath(); ctx.arc(-7.5 * u, -5 * u, 3 * u, Math.PI * 0.4, Math.PI * 1.5); ctx.stroke();
                        ctx.beginPath(); ctx.arc(7.5 * u, -5 * u, 3 * u, Math.PI * 1.5, Math.PI * 0.6); ctx.stroke();
                        // 底座
                        ctx.fillRect(-2 * u, 4 * u, 4 * u, 3 * u);
                        ctx.fillRect(-5 * u, 7 * u, 10 * u, 2.6 * u);
                        break;
                    }
                    case 'target': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.4 * u;
                        circle(8.5, null);
                        ctx.beginPath(); ctx.arc(0, 0, 8.5 * u, 0, Math.PI * 2); ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(0, 0, 4.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(0,0,0,0.25)';
                        ctx.beginPath(); ctx.arc(0, 0, 2 * u, 0, Math.PI * 2); ctx.fill();
                        break;
                    }
                    case 'monster': {
                        // 小怪兽头
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(0, 1 * u, 8 * u, 0, Math.PI * 2);
                        ctx.fill();
                        // 角
                        ctx.beginPath();
                        ctx.moveTo(-6 * u, -5 * u); ctx.lineTo(-8 * u, -11 * u); ctx.lineTo(-2 * u, -7 * u);
                        ctx.moveTo(6 * u, -5 * u); ctx.lineTo(8 * u, -11 * u); ctx.lineTo(2 * u, -7 * u);
                        ctx.fill();
                        // 眼睛
                        ctx.fillStyle = 'rgba(0,0,0,0.35)';
                        ctx.beginPath(); ctx.arc(-3 * u, 0, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(3 * u, 0, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        // 嘴
                        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                        ctx.lineWidth = 1.8 * u;
                        ctx.beginPath(); ctx.arc(0, 3 * u, 3 * u, 0.3, Math.PI - 0.3); ctx.stroke();
                        break;
                    }
                    case 'rotate': {
                        // 手机旋转
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.4 * u;
                        drawRoundRect(ctx, -6 * u, -9 * u, 12 * u, 18 * u, 2.5 * u);
                        ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(0, 6.5 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
                        // 旋转箭头
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath();
                        ctx.arc(0, 0, 13 * u, -2.4, -0.9);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(12.5 * u, -4.5 * u);
                        ctx.lineTo(13.5 * u, -11 * u);
                        ctx.lineTo(7 * u, -9 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'help': {
                        // 问号：帮助
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(0, 0, 11 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#2e9e5b';
                        ctx.font = `900 ${17 * u}px 'Fredoka', sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('?', 0, 1 * u);
                        break;
                    }
                    case 'lock': {
                        // 锁体
                        ctx.fillStyle = '#64748b';
                        drawRoundRect(ctx, -7 * u, -2 * u, 14 * u, 11 * u, 3 * u);
                        ctx.fill();
                        ctx.fillStyle = '#475569';
                        drawRoundRect(ctx, -7 * u, -2 * u, 14 * u, 4 * u, 3 * u);
                        ctx.fill();
                        // 锁梁
                        ctx.strokeStyle = '#cbd5e1';
                        ctx.lineWidth = 3 * u;
                        ctx.beginPath(); ctx.arc(0, -2 * u, 5 * u, Math.PI, 0); ctx.stroke();
                        // 钥匙孔
                        ctx.fillStyle = '#f8fafc';
                        ctx.beginPath(); ctx.arc(0, 2.5 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillRect(-0.9 * u, 2.5 * u, 1.8 * u, 3.4 * u);
                        break;
                    }
                    case 'angry': {
                        // 怒气青筋（动漫式）
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 3.2 * u;
                        const bump = (cx, cy, r) => {
                            ctx.beginPath(); ctx.arc(cx * u, cy * u, r * u, 0, Math.PI * 2); ctx.stroke();
                        };
                        bump(-3.4, -2.4, 3.4); bump(3.4, -2.4, 3.4);
                        bump(-3.4, 3.6, 3.4); bump(3.4, 3.6, 3.4);
                        break;
                    }
                    case 'star': {
                        ctx.fillStyle = '#facc15';
                        ctx.strokeStyle = '#b45309';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath();
                        for (let i = 0; i < 10; i++) {
                            const r = (i % 2 === 0 ? 10 : 4.4) * u;
                            const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
                            const px = Math.cos(a) * r, py = Math.sin(a) * r;
                            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.closePath(); ctx.fill(); ctx.stroke();
                        shine(-2.4, -3, 1.6, 0.6);
                        break;
                    }
                    case 'water': {
                        ctx.fillStyle = '#38bdf8';
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.bezierCurveTo(6 * u, -2 * u, 8 * u, 3 * u, 8 * u, 6 * u);
                        ctx.bezierCurveTo(8 * u, 10 * u, 4 * u, 11.5 * u, 0, 11.5 * u);
                        ctx.bezierCurveTo(-4 * u, 11.5 * u, -8 * u, 10 * u, -8 * u, 6 * u);
                        ctx.bezierCurveTo(-8 * u, 3 * u, -6 * u, -2 * u, 0, -10 * u);
                        ctx.fill();
                        shine(-2.6, 3.4, 1.8, 0.55);
                        break;
                    }
                    case 'wind': {
                        ctx.strokeStyle = '#7dd3fc';
                        ctx.lineWidth = 2.4 * u;
                        const gust = (yOff, len) => {
                            ctx.beginPath();
                            ctx.moveTo(-9 * u, yOff * u);
                            ctx.bezierCurveTo(-3 * u, (yOff - 3) * u, 3 * u, (yOff + 3) * u, (len) * u, yOff * u);
                            ctx.stroke();
                        };
                        gust(-5, 7); gust(0, 9); gust(5, 6);
                        break;
                    }
                    case 'swirl': {
                        ctx.strokeStyle = '#c4b5fd';
                        ctx.lineWidth = 2.6 * u;
                        ctx.beginPath();
                        for (let a = 0; a < Math.PI * 3.4; a += 0.15) {
                            const r = (1 + a * 1.9) * u;
                            const px = Math.cos(a) * r, py = Math.sin(a) * r;
                            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.stroke();
                        break;
                    }
                }
                ctx.restore();
            }

            // 顶部提示 pill：不遮挡游戏面板，用于重要播报
            showToast(text, icon = 'star', ms = 1700) {
                const box = document.getElementById('gameToasts');
                if (!box) return;
                // 最多同时 3 条
                while (box.children.length >= 3) box.removeChild(box.firstChild);
                const el = document.createElement('div');
                el.className = 'game-toast';
                const cv = document.createElement('canvas');
                cv.width = 20; cv.height = 20;
                const bctx = cv.getContext('2d');
                this.drawIcon(icon, 10, 10, 18, bctx);
                const tx = document.createElement('span');
                tx.textContent = text;
                el.appendChild(cv);
                el.appendChild(tx);
                box.appendChild(el);
                setTimeout(() => {
                    el.classList.add('toast-out');
                    setTimeout(() => el.remove(), 400);
                }, ms);
            }

            // 关卡开场横幅：显示关卡数 + 场景主题
            showLevelBanner() {
                const banner = document.getElementById('levelBanner');
                const numEl = document.getElementById('levelBannerNum');
                const themeEl = document.getElementById('levelBannerTheme');
                if (!banner || !numEl || !themeEl) return;
                const theme = this.getLevelTheme();
                numEl.textContent = `第 ${this.level} 关`;
                themeEl.textContent = theme.name;
                this.sound.playLevelStart();
                banner.classList.remove('hidden', 'level-banner-hide');
                // 重新触发入场动画
                const card = banner.querySelector('.level-banner-card');
                if (card) {
                    card.style.animation = 'none';
                    void card.offsetWidth;
                    card.style.animation = '';
                }
                clearTimeout(this._levelBannerTimer);
                this._levelBannerTimer = setTimeout(() => {
                    banner.classList.add('level-banner-hide');
                    setTimeout(() => banner.classList.add('hidden'), 420);
                }, 1600);
            }

            // ============================================================
            // 关卡主题：随关卡推进切换场景配色（草原→沙漠→冰原→火山）
            // ============================================================
            getLevelTheme() {
                const stage = Math.min(3, Math.floor((this.level - 1) / 3));
                return ChibiBombermanGame.LEVEL_THEMES[stage];
            }

            drawPlayer(p) {
                const ctx = this.ctx;

                if (p.invincibleTimer > 0 && Math.floor(p.invincibleTimer / 4) % 2 === 0) {
                    ctx.globalAlpha = 0.45;
                } else if (this.playerStats.ghostTimer > 0) {
                    ctx.globalAlpha = 0.58;
                }

                const breathScale = 1 + Math.sin(this.globalTime * 0.12) * 0.035;
                const walkBob = p.isMoving ? Math.abs(Math.sin(p.walkCycle)) * 4 : 0;

                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.beginPath();
                ctx.ellipse(p.x, p.y + 21, 16, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(p.x, p.y - walkBob);
                ctx.scale(breathScale, 2 - breathScale);

                const footOffset = p.isMoving ? Math.sin(p.walkCycle) * 5 : 0;
                ctx.fillStyle = '#f43f5e';
                ctx.beginPath();
                ctx.arc(-7, 17 + footOffset, 5.5, 0, Math.PI * 2);
                ctx.arc(7, 17 - footOffset, 5.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#2563eb';
                drawRoundRect(ctx, -12, 4, 24, 14, 7);
                ctx.fill();

                ctx.fillStyle = '#facc15';
                ctx.fillRect(-11, 11, 22, 3);

                ctx.fillStyle = '#f43f5e';
                ctx.beginPath();
                ctx.arc(-15, 9 - footOffset * 0.5, 4.5, 0, Math.PI * 2);
                ctx.arc(15, 9 + footOffset * 0.5, 4.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.moveTo(0, -18);
                ctx.lineTo(0, -26);
                ctx.stroke();

                ctx.fillStyle = '#ec4899';
                ctx.beginPath();
                ctx.arc(0, -28, 5.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#ffffff';
                drawRoundRect(ctx, -19, -20, 38, 28, 14);
                ctx.fill();
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 2;
                ctx.stroke();

                let faceOffsetX = 0, faceOffsetY = 0;
                if (p.dir === 'LEFT') faceOffsetX = -3;
                if (p.dir === 'RIGHT') faceOffsetX = 3;
                if (p.dir === 'UP') faceOffsetY = -2;

                if (p.dir !== 'UP') {
                    ctx.fillStyle = '#fed7aa';
                    drawRoundRect(ctx, -13 + faceOffsetX, -13 + faceOffsetY, 26, 16, 8);
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    if (p.isBlinking) {
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = '#0f172a';
                        ctx.beginPath();
                        ctx.moveTo(-8 + faceOffsetX, -5);
                        ctx.lineTo(-3 + faceOffsetX, -5);
                        ctx.moveTo(3 + faceOffsetX, -5);
                        ctx.lineTo(8 + faceOffsetX, -5);
                        ctx.stroke();
                    } else {
                        ctx.beginPath();
                        ctx.ellipse(-6 + faceOffsetX, -5, 2.4, 4.2, 0, 0, Math.PI * 2);
                        ctx.ellipse(6 + faceOffsetX, -5, 2.4, 4.2, 0, 0, Math.PI * 2);
                        ctx.fill();

                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(-6.5 + faceOffsetX, -6.8, 1, 0, Math.PI * 2);
                        ctx.arc(5.5 + faceOffsetX, -6.8, 1, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
                    ctx.beginPath();
                    ctx.arc(-10 + faceOffsetX, -2, 2.8, 0, Math.PI * 2);
                    ctx.arc(10 + faceOffsetX, -2, 2.8, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (this.playerStats.hasShield) {
                    ctx.strokeStyle = 'rgba(16, 185, 129, 0.75)';
                    ctx.lineWidth = 3;
                    ctx.setLineDash([6, 4]);
                    ctx.beginPath();
                    ctx.arc(0, -2, 27, this.globalTime * 0.05, this.globalTime * 0.05 + Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                if (this.playerStats.flameVestTimer > 0) {
                    ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
                    ctx.strokeStyle = '#f59e0b';
                    ctx.lineWidth = 3.5;
                    ctx.beginPath();
                    ctx.arc(0, -2, 29 + Math.sin(this.globalTime * 0.25) * 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                }

                if (this.playerStats.ghostTimer > 0) {
                    ctx.strokeStyle = 'rgba(168, 85, 247, 0.85)';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(0, -2, 31, 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (this.feverTimer > 0) {
                    ctx.strokeStyle = `hsl(${(this.globalTime * 8) % 360}, 95%, 55%)`;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(0, -2, 33, 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (this.megaCharge >= MEGA_COST) {
                    const r = 36 + Math.sin(this.globalTime * 0.22) * 3;
                    ctx.strokeStyle = `hsla(${(this.globalTime * 12) % 360}, 95%, 60%, 0.75)`;
                    ctx.lineWidth = 3;
                    ctx.setLineDash([7, 6]);
                    ctx.beginPath();
                    ctx.arc(0, -2, r, this.globalTime * 0.06, this.globalTime * 0.06 + Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                ctx.restore();
                ctx.globalAlpha = 1.0;
            }

            drawRainbowBolts() {
                const ctx = this.ctx;
                for (let i = this.rainbowBolts.length - 1; i >= 0; i--) {
                    const b = this.rainbowBolts[i];
                    b.life--;
                    if (b.life <= 0) {
                        this.rainbowBolts.splice(i, 1);
                        continue;
                    }
                    ctx.save();
                    ctx.globalAlpha = b.life / b.maxLife;
                    ctx.strokeStyle = b.color;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(b.x1, b.y1);
                    const mx = (b.x1 + b.x2) / 2 + (Math.random() - 0.5) * 28;
                    const my = (b.y1 + b.y2) / 2 + (Math.random() - 0.5) * 28;
                    ctx.lineTo(mx, my);
                    ctx.lineTo(b.x2, b.y2);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            drawMinimap() {
                if (document.body.classList.contains('moba-mode')) return;
                if (this.mapCols <= 13 && this.difficultyIdx < 2) return;

                const ctx = this.ctx;
                const maxW = 148;
                const scale = Math.min(maxW / this.mapCols, maxW / this.mapRows);
                const mw = this.mapCols * scale;
                const mh = this.mapRows * scale;
                const mx = this.canvas.width - mw - 12;
                const my = 12;

                ctx.save();
                ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                drawRoundRect(ctx, mx - 3, my - 3, mw + 6, mh + 6, 8);
                ctx.fill();
                ctx.stroke();

                for (let r = 0; r < this.mapRows; r++) {
                    for (let c = 0; c < this.mapCols; c++) {
                        const t = this.grid[r][c];
                        if (t === TILE.WALL) {
                            ctx.fillStyle = '#64748b';
                            ctx.fillRect(mx + c * scale, my + r * scale, scale, scale);
                        } else if (t === TILE.CRATE) {
                            ctx.fillStyle = '#f59e0b';
                            ctx.fillRect(mx + c * scale, my + r * scale, scale, scale);
                        } else if (t === TILE.FROST_CRATE) {
                            ctx.fillStyle = '#38bdf8';
                            ctx.fillRect(mx + c * scale, my + r * scale, scale, scale);
                        } else if (t === TILE.VINE) {
                            ctx.fillStyle = '#22c55e';
                            ctx.fillRect(mx + c * scale, my + r * scale, scale, scale);
                        }
                    }
                }

                if (this.portal && this.portal.revealed) {
                    ctx.fillStyle = '#d946ef';
                    ctx.fillRect(mx + this.portal.col * scale - 1, my + this.portal.row * scale - 1, scale + 2, scale + 2);
                }

                if (this.goldenCrate) {
                    ctx.fillStyle = '#facc15';
                    ctx.fillRect(mx + this.goldenCrate.col * scale - 1.5, my + this.goldenCrate.row * scale - 1.5, scale + 3, scale + 3);
                }

                ctx.fillStyle = '#ffffff';
                this.powerups.forEach(pw => {
                    ctx.fillRect(mx + pw.col * scale + scale * 0.25, my + pw.row * scale + scale * 0.25, scale * 0.5, scale * 0.5);
                });

                ctx.fillStyle = '#f43f5e';
                this.enemies.forEach(e => {
                    const ec = e.x / TILE_SIZE;
                    const er = e.y / TILE_SIZE;
                    ctx.fillRect(mx + ec * scale - 1.2, my + er * scale - 1.2, 2.5, 2.5);
                });

                ctx.fillStyle = '#4ade80';
                const pc = this.player.x / TILE_SIZE;
                const pr = this.player.y / TILE_SIZE;
                ctx.beginPath();
                ctx.arc(mx + pc * scale, my + pr * scale, 3, 0, Math.PI * 2);
                ctx.fill();

                ctx.strokeStyle = '#fde047';
                ctx.lineWidth = 1.2;
                ctx.strokeRect(
                    mx + (this.camera.x / TILE_SIZE) * scale,
                    my + (this.camera.y / TILE_SIZE) * scale,
                    (this.canvas.width / TILE_SIZE) * scale,
                    (this.canvas.height / TILE_SIZE) * scale
                );

                ctx.restore();
            }

            drawParticlesAndTexts() {
                const ctx = this.ctx;

                for (let i = this.particles.length - 1; i >= 0; i--) {
                    const pt = this.particles[i];
                    pt.x += pt.vx;
                    pt.y += pt.vy;
                    pt.life--;

                    if (pt.life <= 0) {
                        this.particles.splice(i, 1);
                        continue;
                    }

                    const lifeRatio = pt.life / pt.maxLife;
                    ctx.globalAlpha = lifeRatio;

                    if (pt.ring) {
                        const rr = pt.ringMax * (1 - lifeRatio) + 6;
                        ctx.strokeStyle = pt.color;
                        ctx.lineWidth = 3 * lifeRatio;
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2);
                        ctx.stroke();
                        continue;
                    }

                    ctx.fillStyle = pt.color;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, pt.radius * lifeRatio, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (this.particles.length > 420) {
                    this.particles.splice(0, this.particles.length - 420);
                }

                for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
                    const ft = this.floatingTexts[i];
                    ft.y -= 0.8;
                    ft.life--;

                    if (ft.life <= 0) {
                        this.floatingTexts.splice(i, 1);
                        continue;
                    }

                    ctx.globalAlpha = Math.min(1, (ft.life / ft.maxLife) * 1.5);
                    ctx.font = `900 ${ft.fontSize || 15}px "Fredoka", "Noto Sans SC", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4;
                    ctx.strokeText(ft.text, ft.x, ft.y);
                    ctx.fillStyle = ft.color;
                    ctx.fillText(ft.text, ft.x, ft.y);
                }

                ctx.globalAlpha = 1.0;
            }

            loop(timestamp) {
                const dt = Math.min(timestamp - this.lastFrameTime, 50);
                this.lastFrameTime = timestamp;
                const dtScale = dt / 16.667;

                this.globalTime += dtScale;

                if (this.state === 'PLAYING') {
                    this.updateDangerState(dtScale);
                    this.updatePlayer(dtScale);
                    this.updateEnemies(dtScale);
                    this.updateBombsAndExplosions(dtScale);
                    this.updateVineSpread(dtScale);
                    this.updateCamera(dtScale);
                    // HUD 节流：每 15 帧更新一次（约 4 次/秒），避免整秒突发式 DOM 更新造成卡顿
                    this._hudTick++;
                    if (this._hudTick % 15 === 0) {
                        this.updateHUD();
                    }
                } else {
                    this.updateDangerState(dtScale);
                }

                if (this.tutorial && this.tutorial.active) {
                    this.updateTutorial();
                }
                this.draw();
                if (this.tutorial && this.tutorial.active) {
                    this.drawTutorialMarkers();
                }
                if (this.state === 'MENU' && !document.getElementById('startScreen').classList.contains('hidden')) {
                    this.drawHero();
                }
                requestAnimationFrame((t) => this.loop(t));
            }
        }

        window.onload = function () {
            new ChibiBombermanGame();
        };
