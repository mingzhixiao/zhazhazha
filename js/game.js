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
                // 性能面板（dev）：?perf=1 或按 F3 开启，默认关闭
                this.perf = {
                    enabled: (typeof location !== 'undefined' && location.search.includes('perf=1')),
                    frames: 0, lastFpsT: 0, fps: 0,
                    updateMs: 0, drawMs: 0
                };
                this.lastDamageCause = null; // 最后一次受伤原因
                this.noviceReviveUsed = false; // 新手每关复活是否已用
                this.seenElite = false; // 是否见过精英怪
                this.seenSpecialist = false; // 是否见过特化怪
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
                this.trauma = 0;
                this.hitFlash = 0;
                this.hitStopFrames = 0;
                this.bombBufferTimer = 0;
                this.playerSquash = 0;

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
                this.setupWakeLock();
                this.setupAdaptiveQuality();
                this.bindEvents();
                this.initLevel(1);
                this.drawStaticIcons();
                this.showStartScreen();
                // 存档健康报告（有问题才打扰玩家）
                setTimeout(() => {
                    const report = this.save.getLoadReport();
                    if (report.hadIssue && report.message) {
                        this.showToast(report.message, 'lock', 3000);
                    }
                }, 1200);

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
                    ghostExiting: false,
                    ghostExitGrace: 0,
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
                this.trauma = 0;
                this.hitFlash = 0;
                this.hitStopFrames = 0;
                this.bombBufferTimer = 0;
                this.playerSquash = 0;
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
                this.noviceReviveUsed = false;
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

                // 地图生成委托给可注入随机数、可单测的纯函数（REVIEW-2026-10-18 P1-7 / P2-8）
                const map = GamePure.generateMapGrid(diffCfg, levelNum, Math.random, TILE);
                this.grid = map.grid;
                this.portal = map.portal;
                this.goldenCrate = map.goldenCrate;

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
                // 地图尺寸变化会决定画布是否需要"裁外墙铺满屏"以及像素预算，
                // 入场后必须重算一次，否则第一关会沿用上一局的画布尺寸。
                if (this._updateCanvasSize) this._updateCanvasSize();
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
                this.checkFirstEncounterTips();
            }

            // 首次遇到精英/特化怪：简短提示，不遮挡视野（toast 形式）
            checkFirstEncounterTips() {
                const ELITES = ['GOLD_SLIME', 'IRON_SNAIL'];
                const SPECIALS = ['SALAMANDER', 'TORTOISE', 'AZUREBIRD', 'WHITETIGER'];
                let hasElite = false, hasSpecial = false;
                for (const e of this.enemies) {
                    if (ELITES.includes(e.type)) hasElite = true;
                    if (SPECIALS.includes(e.type)) hasSpecial = true;
                }
                if (hasElite && !this.seenElite) {
                    this.seenElite = true;
                    this.showToast('精英怪血厚！多炸几次，趁它走位失误', 'star', 2200);
                }
                if (hasSpecial && !this.seenSpecialist) {
                    this.seenSpecialist = true;
                    this.showToast('特化怪会玩你的炸弹！看准蓄力间隙出手', 'angry', 2200);
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


            bindEvents() {
                window.addEventListener('contextmenu', (e) => e.preventDefault());
                // 仅在游戏画布上阻止 gesturestart（iOS Safari 双指缩放手势），
                // 不全局禁用页面缩放——教程弹窗、帮助、首页等区域保持系统缩放能力（无障碍）。
                if (this.canvas) {
                    this.canvas.addEventListener('gesturestart', (e) => e.preventDefault());
                }

                window.addEventListener('keydown', (e) => {
                    if (e.code === 'Escape') {
                        if (this.closeTopOverlay()) {
                            e.preventDefault();
                            return;
                        }
                    }
                    // 任意弹层打开时锁住游戏按键，并让 Tab 在弹层内循环（含确认弹层）。
                    // 注意不要 preventDefault Space/Enter：否则键盘无法激活弹层按钮。
                    let activeDialog = null;
                    for (const id of ['overlayModal', 'confirmModal', 'tutorialOffer', 'helpModal', 'careerPop', 'diffSheet', 'shopModal']) {
                        const el = document.getElementById(id);
                        if (el && !el.classList.contains('hidden')) { activeDialog = el; break; }
                    }
                    if (activeDialog) {
                        if (e.code === 'Tab') {
                            const focusables = [...activeDialog.querySelectorAll('button:not([disabled]), [href], select, input, [tabindex]:not([tabindex="-1"])')]
                                .filter(el => el.offsetParent !== null && !el.classList.contains('hidden'));
                            if (focusables.length) {
                                e.preventDefault();
                                const idx = focusables.indexOf(document.activeElement);
                                const step = e.shiftKey ? -1 : 1;
                                const next = idx === -1
                                    ? focusables[e.shiftKey ? focusables.length - 1 : 0]
                                    : focusables[(idx + step + focusables.length) % focusables.length];
                                try { next.focus({ preventScroll: true }); } catch (err) {}
                            }
                        }
                        return;
                    }
                    // 从按钮/下拉框回到键盘操作时先移除焦点，避免空格既放弹又触发按钮
                    const ae = document.activeElement;
                    if (ae && ae !== document.body && ['BUTTON', 'SELECT', 'INPUT', 'TEXTAREA'].includes(ae.tagName)
                        && ['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
                        try { ae.blur(); } catch (err) {}
                    }
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
                    if (e.code === 'F3') { e.preventDefault(); this.togglePerfPanel(); }
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
                    const sel = e.target;
                    const idx = Number(sel.value);
                    const prev = this.difficultyIdx;
                    if (idx === prev) return;
                    const resumeState = this.state;
                    const apply = () => {
                        this.setDifficulty(idx);
                        this.score = 0;
                        this.coins = 0;
                        this.initLevel(1);
                        this.state = 'PLAYING';
                        this.hideModal();
                        this.hideShop();
                    };
                    // 已经在游戏中：切换难度意味着重开，必须确认，避免误触丢进度
                    if (this.state === 'PLAYING' || this.state === 'PAUSED' || this.state === 'SHOP') {
                        if (this.state === 'PLAYING') this.state = 'PAUSED';
                        this.showConfirm({
                            title: '切换难度？',
                            desc: `将立即回到第 1 关，本局得分和金币清空。永久强化会保留。`,
                            okText: '切换并重开',
                            onConfirm: apply,
                            onCancel: () => {
                                sel.value = String(prev);
                                this.state = resumeState;
                            }
                        });
                    } else {
                        apply();
                    }
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
                        this.paintIconCanvas(iconCanvas, on ? 'speaker' : 'speakerOff');
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
                    const restart = () => {
                        this.score = 0;
                        this.coins = 0;
                        this.initLevel(1);
                        this.state = 'PLAYING';
                        this.hideModal();
                        this.hideShop();
                    };
                    if (this.state === 'MENU' || this.state === 'GAME_OVER' || this.state === 'LEVEL_CLEAR') {
                        restart();
                        return;
                    }
                    const resumeState = this.state;
                    if (this.state === 'PLAYING') this.state = 'PAUSED';
                    this.showConfirm({
                        title: '重新开始？',
                        desc: '当前关卡进度、得分和本局金币会清空，已购买的永久强化会保留。',
                        okText: '重新开始',
                        onConfirm: restart,
                        onCancel: () => { this.state = resumeState; }
                    });
                });

                // 二次确认弹层
                document.getElementById('confirmOkBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.runConfirm();
                });
                document.getElementById('confirmCancelBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.hideConfirm();
                });
                document.getElementById('confirmBackdrop').addEventListener('click', () => this.hideConfirm());

                // 主按钮：菜单开始 / 结算重开 / 暂停继续 / 关卡通关 → 进商店
                document.getElementById('modalActionBtn').addEventListener('click', () => {
                    this.sound.init();
                    this.sound.playClick();

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
                // 重置存档：二次确认，列出影响范围
                document.getElementById('careerResetBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    const btn = document.getElementById('careerResetBtn');
                    if (!btn.dataset.confirming) {
                        btn.dataset.confirming = '1';
                        btn.textContent = '确认重置？将清空最高分/击杀/金币/通关数/全部永久强化';
                        btn.classList.add('text-rose-600', 'border-rose-300');
                        setTimeout(() => {
                            delete btn.dataset.confirming;
                            btn.textContent = '重置存档';
                            btn.classList.remove('text-rose-600', 'border-rose-300');
                        }, 5000);
                        return;
                    }
                    delete btn.dataset.confirming;
                    btn.textContent = '重置存档';
                    btn.classList.remove('text-rose-600', 'border-rose-300');
                    this.save.reset();
                    this.updateCareerPanel();
                    this.renderShop();
                    this.showToast('存档已重置', 'lock');
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
                        this.paintIconCanvas(iconCanvas, on ? 'speaker' : 'speakerOff');
                    }
                    const st = document.getElementById('soundText');
                    if (st) st.textContent = on ? '音效' : '静音';
                });

                // 回到首页（游戏结束）
                document.getElementById('modalHomeBtn').addEventListener('click', () => {
                    this.sound.playClick();
                    this.hideModal();
                    this.showStartScreen();
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
                    this.showModal('游戏已暂停', '喝口奶茶休息一下，点继续游戏回到战场，或结束本局回首页。', '继续游戏', 'pause');
                    const homeBtn = document.getElementById('modalHomeBtn');
                    homeBtn.textContent = '结束本局并回首页';
                    homeBtn.classList.remove('hidden');
                } else if (this.state === 'PAUSED') {
                    this.state = 'PLAYING';
                    this.hideModal();
                }
            }


            // ============ 新手交互式教学 ============

            // 教学步骤完成反馈：写入教学卡内的反馈行（与“当前步骤指令”分离，避免互相覆盖）
            setTutorialFeedback(text) {
                const fb = document.getElementById('tutorialFeedback');
                if (!fb) return;
                fb.textContent = text || '';
                fb.classList.remove('hidden');
                fb.classList.remove('tutorial-flash');
                void fb.offsetWidth;
                fb.classList.add('tutorial-flash');
                clearTimeout(this._tutFeedbackTimer);
                this._tutFeedbackTimer = setTimeout(() => fb.classList.add('hidden'), 1500);
            }



            // ============ 首页：底部锚点 + 中部舞台 ============

            startGameFromMenu() {
                this.sound.init();
                this.sound.playClick();
                // 首次游玩：先邀请新手教学
                if (!this.tutorialDone() && !this._tutorialOffered) {
                    this._tutorialOffered = true;
                    this.showTutorialOffer();
                    return;
                }
                // 不再强制旋转屏幕：旋转模式改为顶部按钮主动开启，
                // 首次竖屏进入时只给一条不打断操作的提示。
                const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
                const portrait = window.innerHeight > window.innerWidth;
                if (isTouch && portrait && !this._rotateSuggested) {
                    this._rotateSuggested = true;
                    this._rotateHintTimer = setTimeout(() => {
                        if (this.state === 'PLAYING' && !this.rotateMode) {
                            this.showToast('想横屏？点顶部旋转按钮即可', 'rotate', 2200);
                        }
                    }, 1200);
                }
                this.hideStartScreen();
                this.hideDiffSheet();
                this.state = 'PLAYING';
            }

            // 性能面板更新（dev only）

            // 主角立绘：首页中部舞台，大号炸弹人 + 呼吸浮动 + 眨眼


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
                const feverHot = this.feverTimer > 0;
                if (feverHot) {
                    const pct = Math.min(100, (this.feverTimer / 480) * 100);
                    feverBar.style.width = `${pct}%`;
                    feverLabel.textContent = '狂暴中!';
                } else {
                    feverBar.style.width = `${Math.min(100, this.feverGauge)}%`;
                    feverLabel.textContent = '狂暴';
                }
                feverLabel.classList.toggle('is-ready', feverHot);

                const megaBar = document.getElementById('hudMegaBar');
                const megaReady = this.megaCharge >= MEGA_COST;
                megaBar.style.width = megaReady ? '100%' : `${Math.min(100, (this.megaCharge / MEGA_COST) * 100)}%`;
                const megaLabel = document.getElementById('megaLabel');
                if (megaLabel) {
                    megaLabel.textContent = megaReady ? '必杀就绪' : '必杀';
                    megaLabel.classList.toggle('is-ready', megaReady);
                }
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
                const buffIcons = document.getElementById('buffIcons');
                if (buffIcons) buffIcons.textContent = buffs.trim() || '无';

                const mobileHint = document.getElementById('mobileBuffHint');
                if (mobileHint) {
                    mobileHint.textContent = megaReady ? '超必杀就绪! 按 L 引爆!' : (buffs ? `当前增益: ${buffs.trim()}` : '别炸毁道具(会爆怪)!');
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
                if (questBanner) {
                    const cleared = this.enemies.length === 0;
                    questBanner.classList.toggle('quest-ready', cleared);
                    questBanner.classList.toggle('quest-active', cleared);
                    if (!cleared) {
                        questBanner.textContent = `剩余 ${this.enemies.length} 怪 · 清空解锁传送门`;
                    } else if (this.portal && this.portal.revealed) {
                        questBanner.textContent = '传送门开启 · 快进去！';
                    } else {
                        questBanner.textContent = '传送门解封 · 炸箱找到入口';
                    }
                }

                this.updateMobaHud();
            }

            showComboToast(text, sub, color = '#ec4899') {
                const toast = document.getElementById('comboToast');
                const tText = document.getElementById('comboToastText');
                const tSub = document.getElementById('comboToastSub');
                if (!toast) return;

                // 与关卡横幅互斥：横幅展示期间延后非紧急连杀播报
                if (this.bannerActive) {
                    this._pendingCombo = { text, sub: sub || '', color };
                    return;
                }

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
                    if (Math.hypot(e.x - this.player.x, e.y - this.player.y) < TILE_SIZE * 2.6) near++;
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
                // Game-feel (game-dev-skills): 基于 Decaying Trauma 模型累加震度
                const addTrauma = Math.min(1.0, (mag || 3) / 16);
                this.trauma = Math.min(1.0, (this.trauma || 0) + addTrauma);
                this.shakeAmt = Math.max(this.shakeAmt, mag);
            }

            triggerHitStop(frames = 3) {
                // Game-feel (game-dev-skills): 强冲击时短暂定格逻辑推进（顿挫感），主绘制维持
                this.hitStopFrames = Math.max(this.hitStopFrames || 0, frames);
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
                this.triggerHitStop(5);

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

                const hasGhost = this.playerStats.ghostTimer > 0 || this.playerStats.ghostExiting;
                if ((tile === TILE.CRATE || tile === TILE.FROST_CRATE) && !hasGhost) return true;

                const hasBomb = this.bombs.some(b => b.col === col && b.row === row && !b.playerAllowed);
                if (hasBomb && !hasGhost) {
                    return true;
                }
                return false;
            }

            isPlayerInCrate(x = this.player.x, y = this.player.y) {
                if (typeof GamePure !== 'undefined' && GamePure.isBoxOverlappingCrate) {
                    return GamePure.isBoxOverlappingCrate(this.grid, this.mapRows, this.mapCols, x, y, 17.5, TILE, TILE_SIZE);
                }
                const r = 17.5;
                const minCol = Math.floor((x - r + 0.1) / TILE_SIZE);
                const maxCol = Math.floor((x + r - 0.1) / TILE_SIZE);
                const minRow = Math.floor((y - r + 0.1) / TILE_SIZE);
                const maxRow = Math.floor((y + r - 0.1) / TILE_SIZE);
                for (let rIdx = minRow; rIdx <= maxRow; rIdx++) {
                    for (let cIdx = minCol; cIdx <= maxCol; cIdx++) {
                        if (rIdx >= 0 && rIdx < this.mapRows && cIdx >= 0 && cIdx < this.mapCols) {
                            const tile = this.grid[rIdx][cIdx];
                            if (tile === TILE.CRATE || tile === TILE.FROST_CRATE) return true;
                        }
                    }
                }
                return false;
            }

            ejectPlayerFromCrate() {
                const p = this.player;
                const startCol = Math.floor(p.x / TILE_SIZE);
                const startRow = Math.floor(p.y / TILE_SIZE);
                let target = null;
                if (typeof GamePure !== 'undefined' && GamePure.findNearestWalkableTile) {
                    target = GamePure.findNearestWalkableTile(this.grid, this.mapRows, this.mapCols, startCol, startRow, this.bombs, TILE);
                }
                if (target) {
                    p.x = (target.c + 0.5) * TILE_SIZE;
                    p.y = (target.r + 0.5) * TILE_SIZE;
                    this.showToast('脱离障碍！', 'ghost', 1500);
                }
                this.playerStats.ghostExiting = false;
                this.playerStats.ghostExitGrace = 0;
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
                    this.playerStats.ghostTimer -= dtScale;
                    if (this.playerStats.ghostTimer <= 0) {
                        this.playerStats.ghostTimer = 0;
                        if (this.isPlayerInCrate()) {
                            this.playerStats.ghostExiting = true;
                            this.playerStats.ghostExitGrace = 180;
                            this.showToast('穿墙结束，正在脱离木块...', 'ghost', 1500);
                        } else {
                            this.playerStats.ghostExiting = false;
                            this.playerStats.ghostExitGrace = 0;
                        }
                    }
                } else if (this.playerStats.ghostExiting) {
                    if (!this.isPlayerInCrate()) {
                        this.playerStats.ghostExiting = false;
                        this.playerStats.ghostExitGrace = 0;
                    } else {
                        this.playerStats.ghostExitGrace -= dtScale;
                        if (this.playerStats.ghostExitGrace <= 0) {
                            this.ejectPlayerFromCrate();
                        }
                    }
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

                // Game-feel (game-dev-skills): Squash & stretch 弹跳平滑复原
                if (this.playerSquash) {
                    this.playerSquash *= Math.pow(0.82, dtScale);
                    if (Math.abs(this.playerSquash) < 0.01) this.playerSquash = 0;
                }

                // Input-systems (game-dev-skills): 消耗炸弹输入缓冲，当有空槽或走出障碍瞬间立即自动放下
                if (this.bombBufferTimer > 0) {
                    this.bombBufferTimer -= dtScale;
                    const maxAllowed = this.feverTimer > 0 ? 8 : this.playerStats.maxBombs;
                    if (this.bombs.length < maxAllowed) {
                        const bCol = Math.floor(p.x / TILE_SIZE);
                        const bRow = Math.floor(p.y / TILE_SIZE);
                        const bTile = this.grid[bRow] && this.grid[bRow][bCol];
                        if (bTile !== TILE.CRATE && bTile !== TILE.FROST_CRATE && !this.bombs.some(b => b.col === bCol && b.row === bRow)) {
                            this.placeBomb();
                        }
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
                if (this.bombs.length >= maxAllowed) {
                    // Input-systems (game-dev-skills): 输入缓冲 ~120ms (7帧)，炸弹爆炸或腾位瞬间立刻释放
                    this.bombBufferTimer = 7;
                    return false;
                }

                const col = Math.floor(this.player.x / TILE_SIZE);
                const row = Math.floor(this.player.y / TILE_SIZE);

                if (this.grid[row][col] === TILE.CRATE || this.grid[row][col] === TILE.FROST_CRATE) {
                    this.bombBufferTimer = 7;
                    return false;
                }
                if (this.bombs.some(b => b.col === col && b.row === row)) {
                    this.bombBufferTimer = 7;
                    return false;
                }

                this.bombBufferTimer = 0;
                // Game-feel (game-dev-skills): 放置炸弹时产生物理挤压感 (Squash & stretch)
                this.playerSquash = 0.25;

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
                        // 不再弹出 "FEVER TIME" 提示条：会遮挡棋盘/顶部面板。
                        // 狂暴状态由 HUD 的"狂暴中!"进度条 + 屏幕闪光 + 音效表达。
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
                // Game-feel (game-dev-skills): 拾取道具向上拉伸弹动 (Squash & stretch pop)
                this.playerSquash = -0.22;
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

            // 受伤原因文案（不伪造：未知返回通用提示）
            damageCauseText() {
                const cause = this.lastDamageCause;
                if (cause === 'EXPLOSION') return '被自己（或连锁）的炸弹爆炸击中';
                if (cause && cause.startsWith('ENEMY:')) {
                    const type = cause.slice(6);
                    const names = {
                        'SLIME': '史莱姆', 'MUSHROOM': '蘑菇怪', 'GHOST': '幽灵',
                        'GOLD_SLIME': '金史莱姆（精英）', 'IRON_SNAIL': '铁蜗牛（精英）',
                        'SALAMANDER': '小火龙', 'TORTOISE': '小乌龟',
                        'AZUREBIRD': '青鸟', 'WHITETIGER': '白虎'
                    };
                    return `被${names[type] || '怪物'}撞到`;
                }
                if (cause === 'ENEMY') return '被怪物撞到';
                return '受到致命伤害';
            }

            // 清除玩家周围 4 格内的敌人（新手复活用）
            clearEnemiesNearPlayer() {
                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);
                this.enemies = this.enemies.filter(e => {
                    const ec = Math.floor(e.x / TILE_SIZE);
                    const er = Math.floor(e.y / TILE_SIZE);
                    return Math.abs(ec - pCol) + Math.abs(er - pRow) > 4;
                });
            }

            damagePlayer(source = 'ENEMY', enemyType = null) {
                // 记录受伤原因（用于失败反馈，不伪造：未知则为通用）
                if (source === 'EXPLOSION') {
                    this.lastDamageCause = 'EXPLOSION';
                } else if (enemyType) {
                    this.lastDamageCause = 'ENEMY:' + enemyType;
                } else {
                    this.lastDamageCause = 'ENEMY';
                }
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
                this.triggerHitStop(4);

                this.playerStats.lives--;
                this.updateHUD();

                if (this.playerStats.lives <= 0) {
                    // 新手保护：每关一次低代价复活
                    if (this.difficultyIdx === 0 && !this.noviceReviveUsed) {
                        this.noviceReviveUsed = true;
                        this.playerStats.lives = 2;
                        this.player.invincibleTimer = 180;
                        this.clearEnemiesNearPlayer();
                        this.sound.playPowerup();
                        this.showToast('复活！周围怪物已清除，再接再厉', 'heart', 2500);
                        this.updateHUD();
                        return;
                    }
                    this.state = 'GAME_OVER';
                    this.sound.playGameOver();
                    if (this.difficultyIdx === 0) this.noviceFailStreak++;
                    else this.noviceFailStreak = 0;

                    if (this.score > this.save.data.bestScore) {
                        this.save.data.bestScore = this.score;
                    }
                    this.save.save();
                    this.updateCareerPanel();

                    const causeText = this.damageCauseText();
                    const bombTip = this.lastDamageCause === 'EXPLOSION'
                        ? `<br><span class="text-amber-700 font-black">记住：放弹后立刻离开爆炸的十字范围！</span>` : ``;
                    this.showModal(
                        '挑战失败啦',
                        `你在【${DIFFICULTY_TIERS[this.difficultyIdx].name}】第 <span class="text-indigo-600 font-black">${this.level}</span> 关惜败！<br>
                         失败原因：<span class="text-rose-600 font-black">${causeText}</span><br>
                         总分：<span class="text-amber-500 font-black">${this.score}</span> · 金币：<span class="text-yellow-600 font-black">${this.coins}</span> · 最高连杀：<span class="text-fuchsia-600 font-black">x${this.bestChain}</span>${bombTip}<br>
                         善用遥控炸弹、穿墙披风、防炸衣与超必杀再来一局吧！` +
                        (this.difficultyIdx === 0 && this.noviceFailStreak >= 2
                            ? `<br><span class="text-emerald-700 font-black">小提示（已连败 ${this.noviceFailStreak} 次）：先清小怪再开箱，稳扎稳打。</span>`
                            : ``),
                        '重新开始冒险',
                        'ghost'
                    );
                    const homeBtn = document.getElementById('modalHomeBtn');
                    homeBtn.textContent = '回到首页';
                    homeBtn.classList.remove('hidden');
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
                    // 循环内 damagePlayer → 新手复活 clearEnemiesNearPlayer() 会整体替换 enemies 数组，
                    // 继续用旧下标取到的可能是 undefined，必须防御
                    if (!e) continue;
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
                        if (d < 34) this.damagePlayer('ENEMY', e.type);
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
                        this.damagePlayer('ENEMY', e.type);
                    }
                }
            }


            updateBombsAndExplosions(dtScale) {
                for (let i = this.bombs.length - 1; i >= 0; i--) {
                    const b = this.bombs[i];
                    // detonateBomb 会链式引爆：一次可能移除多颗炸弹（含下标更小的），
                    // 旧下标取到的可能是 undefined，直接访问属性会抛异常并让主循环停摆（页面卡死）
                    if (!b) continue;
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
                        // 链式引爆后数组可能变短，夹紧下标避免后续取到 undefined
                        i = Math.min(i, this.bombs.length);
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

                            // 怪物喷出的火焰（如小火龙）不应误伤其它怪物，否则等于帮玩家清怪
                            if (!exp.noEnemyDamage) {
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
                            }
                        });
                    }

                    if (exp.timer <= 0) {
                        this.explosions.splice(i, 1);
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

                // 地图外的底色：MOBA 模式视野（14 列）比 13 列地图宽，
                // 不铺底会直接露出容器的纯色 #7bc96f，看起来像没画完。
                const bgGrad = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
                bgGrad.addColorStop(0, '#6aa869');
                bgGrad.addColorStop(1, '#548c58');
                ctx.fillStyle = bgGrad;
                ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

                // Game-feel (game-dev-skills): 基于 Decaying Trauma 模型计算平滑相机震动（非纯随机白噪）
                let shakeX = 0, shakeY = 0;
                if (this.trauma > 0.005) {
                    this.trauma = Math.max(0, this.trauma - 0.035);
                    this.shakeAmt = this.trauma * 16;
                    this._shakeTime = (this._shakeTime || 0) + 0.45;
                    const shakeIntensity = this.trauma * this.trauma; // quadratic: 小震柔和，大震极具爆发力
                    const maxOffset = 15;
                    shakeX = maxOffset * shakeIntensity * Math.sin(this._shakeTime * 1.7) * Math.cos(this._shakeTime * 0.7);
                    shakeY = maxOffset * shakeIntensity * Math.sin(this._shakeTime * 2.3);
                } else if (this.shakeAmt > 0.15) {
                    this.shakeAmt *= 0.86;
                    this._shakeTime = (this._shakeTime || 0) + 0.45;
                    const factor = this.shakeAmt / 16;
                    shakeX = factor * 14 * Math.sin(this._shakeTime * 1.7);
                    shakeY = factor * 14 * Math.sin(this._shakeTime * 2.3);
                } else {
                    this.trauma = 0;
                    this.shakeAmt = 0;
                }

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

                // 地板：走预渲染贴图（含棋盘格柔光、草簇/沙纹/冰面/熔岩裂纹、主光源），
                // 每次切关或换主题只生成一次；缺失贴图模块时回退逐格绘制。
                const floorTS = typeof TileSprites !== "undefined" ? TileSprites : null;
                if (floorTS && floorTS.buildFloor) {
                    const themeKey = (this._theme && this._theme.name) || 'grass';
                    const fk = themeKey + ':' + this.mapCols + 'x' + this.mapRows;
                    if (!this._floorSprite || this._floorKey !== fk) {
                        this._floorSprite = floorTS.buildFloor(themeKey, this.mapCols, this.mapRows, TILE_SIZE);
                        this._floorKey = fk;
                    }
                    ctx.drawImage(this._floorSprite, 0, 0);
                } else {
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
                this.enemies.forEach(enemy => this.drawEnemy(enemy));
                // 火焰盖在怪物之上：爆炸是最强视觉事件，不应被小怪挡住
                this.explosions.forEach(exp => this.drawExplosion(exp));

                if (this.player) {
                    this.drawPlayer(this.player);
                }

                this.drawRainbowBolts();
                this.drawParticlesAndTexts();

                ctx.restore();

                // 屏幕暗角：把视觉焦点收拢到棋盘中央（贴图按画布尺寸缓存）
                const vigTS = typeof TileSprites !== "undefined" ? TileSprites : null;
                if (vigTS && vigTS.buildBoardVignette) {
                    const vk = this.canvas.width + 'x' + this.canvas.height;
                    if (!this._vigSprite || this._vigKey !== vk) {
                        this._vigSprite = vigTS.buildBoardVignette(this.canvas.width, this.canvas.height);
                        this._vigKey = vk;
                    }
                    ctx.drawImage(this._vigSprite, 0, 0);
                }

                // 大地图小地图雷达：每帧正常绘制，禁止跳帧/节流（主画布每帧重绘，跳帧会导致频闪）
                this.drawMinimap();

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
                    // 边缘渐入的受击红晕：原来整屏铺 rgba(...,0.34) 纯色会把绿色棋盘
                    // 与灰色砖墙一起染成粉紫，观感像渲染错误。改为只压暗画面边缘。
                    const a = (this.hitFlash / 14) * 0.30;
                    const hw = this.canvas.width;
                    const hh = this.canvas.height;
                    const hg = ctx.createRadialGradient(hw / 2, hh / 2, hh * 0.30, hw / 2, hh / 2, hh * 0.78);
                    hg.addColorStop(0, 'rgba(244, 63, 94, 0)');
                    hg.addColorStop(1, `rgba(244, 63, 94, ${a})`);
                    ctx.fillStyle = hg;
                    ctx.fillRect(0, 0, hw, hh);
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


            // 顶部提示 pill：不遮挡游戏面板，用于重要播报
            showToast(text, icon = 'star', ms = 1700) {
                // 教学进行中：普通提示改为写入教学卡反馈行，不在棋盘上弹 Toast
                if (this.tutorial && this.tutorial.active) {
                    this.setTutorialFeedback(text);
                    return;
                }
                const box = document.getElementById('gameToasts');
                if (!box) return;
                // 一次只显示 1 条：用替换机制，避免棋盘区域堆叠多个提示
                box.innerHTML = '';
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
                clearTimeout(this._gameToastTimer);
                this._gameToastTimer = setTimeout(() => {
                    el.classList.add('toast-out');
                    setTimeout(() => { if (el.parentElement) el.remove(); }, 400);
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
                // 关卡横幅优先：展示期间隐藏连杀播报，结束后若有延后的连杀再补播
                this.bannerActive = true;
                this.hideComboToast();
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
                    setTimeout(() => {
                        banner.classList.add('hidden');
                        this.bannerActive = false;
                        // 横幅结束后，补播展示期间被延后的连杀播报
                        if (this._pendingCombo) {
                            const p = this._pendingCombo;
                            this._pendingCombo = null;
                            this.showComboToast(p.text, p.sub, p.color);
                        }
                    }, 420);
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
                } else if (this.playerStats.ghostExiting) {
                    ctx.globalAlpha = (Math.floor(this.globalTime * 0.25) % 2 === 0) ? 0.72 : 0.42;
                }

                const breathScale = 1 + Math.sin(this.globalTime * 0.12) * 0.035;
                const walkBob = p.isMoving ? Math.abs(Math.sin(p.walkCycle)) * 4 : 0;
                const actionSquash = this.playerSquash || 0;

                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.beginPath();
                ctx.ellipse(p.x, p.y + 21, 16, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(p.x, p.y - walkBob);
                ctx.scale(breathScale * (1 + actionSquash), (2 - breathScale) * (1 - actionSquash * 0.82));

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


            drawMinimap() {
                if (document.body.classList.contains('moba-mode')) return;
                // 仅在超出单屏视野的大地图（困难1/困难2）时绘制小地图；13x11 全景单屏地图无需小地图，避免遮挡与冗余
                if (this.mapCols <= 13 && this.mapRows <= 11) return;

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

                if (this.player) {
                    ctx.fillStyle = '#4ade80';
                    const pc = this.player.x / TILE_SIZE;
                    const pr = this.player.y / TILE_SIZE;
                    ctx.beginPath();
                    ctx.arc(mx + pc * scale, my + pr * scale, 3, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (this.camera) {
                    ctx.strokeStyle = '#fde047';
                    ctx.lineWidth = 1.2;
                    ctx.strokeRect(
                        mx + (this.camera.x / TILE_SIZE) * scale,
                        my + (this.camera.y / TILE_SIZE) * scale,
                        (this.canvas.width / TILE_SIZE) * scale,
                        (this.canvas.height / TILE_SIZE) * scale
                    );
                }

                ctx.restore();
            }


            loop(timestamp) {
                // 任何一帧内的未捕获异常都不能让 rAF 链断掉——否则整个游戏永久卡死（画面静止、按键无反应）
                try {
                    const dt = Math.min(timestamp - this.lastFrameTime, 50);
                    this.lastFrameTime = timestamp;
                    const dtScale = dt / 16.667;

                    this.globalTime += dtScale;

                    // Game-feel (game-dev-skills): Hit-stop (Freeze frame) 定格逻辑帧，突出打击与受击质感
                    if (this.hitStopFrames > 0) {
                        this.hitStopFrames--;
                        this.draw();
                        return;
                    }

                    const perfStart = this.perf.enabled ? performance.now() : 0;

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
                    if (this.perf.enabled) {
                        this.perf.updateMs = performance.now() - perfStart;
                    }
                    const drawStart = this.perf.enabled ? performance.now() : 0;
                    this.draw();
                    if (this.perf.enabled) {
                        this.perf.drawMs = performance.now() - drawStart;
                        this.updatePerfPanel();
                    }
                    if (this.tutorial && this.tutorial.active) {
                        this.drawTutorialMarkers();
                    }
                    if (this.state === 'MENU' && !document.getElementById('startScreen').classList.contains('hidden')) {
                        this.drawHero();
                    }
                } catch (err) {
                    // 隔离单帧异常：记录一次（防刷屏），游戏继续跑，而不是整个页面卡死
                    this._loopErrorCount = (this._loopErrorCount || 0) + 1;
                    if (this._loopErrorCount <= 5) {
                        console.error('[loop] 帧内异常已隔离，游戏继续运行：', err);
                    }
                } finally {
                    requestAnimationFrame((t) => this.loop(t));
                }
            }
        }


        function applyMixin(TargetClass, SourceClass) {
            if (!SourceClass || !SourceClass.prototype) return;
            const props = Object.getOwnPropertyNames(SourceClass.prototype);
            for (let i = 0; i < props.length; i++) {
                const prop = props[i];
                if (prop !== 'constructor') {
                    const desc = Object.getOwnPropertyDescriptor(SourceClass.prototype, prop);
                    if (desc) {
                        Object.defineProperty(TargetClass.prototype, prop, desc);
                    }
                }
            }
        }

        const g = typeof window !== 'undefined' ? window : globalThis;
        applyMixin(ChibiBombermanGame, g.GameUIMixin);
        applyMixin(ChibiBombermanGame, g.GameRenderMixin);
        applyMixin(ChibiBombermanGame, g.GameEnemySkillsMixin);
        applyMixin(ChibiBombermanGame, g.GameTutorialMixin);
        g.ChibiBombermanGame = ChibiBombermanGame;

        if (typeof window !== 'undefined') {
            window.onload = function () {
                window.game = new ChibiBombermanGame();
            };
        }
