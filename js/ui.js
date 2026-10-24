(function (global) {
    'use strict';

    class GameUIMixin {
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
                if (on) {
                    clearTimeout(this._rotateHintTimer);
                    const toasts = document.getElementById('gameToasts');
                    if (toasts) toasts.innerHTML = '';
                }
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

                    // 竖屏手机 + 小地图（地图不大于视野）时，可以安全裁掉四周的装饰外墙：
                    // 地图边界 1 圈是纯 WALL（见 pure.js generateMapGrid），可玩区恒为
                    // (1..cols-2) × (1..rows-2)。按 118% 放大画布后，左右各裁掉约 1 格外墙，
                    // 可玩区正好铺满屏宽——单格从 ~28px 涨到 ~33px，是手机上最直接的观感提升。
                    // 大地图（41×35）视野本来就在滚动，裁边会出现残缺墙面，故不启用。
                    const isCoarse = window.matchMedia ? window.matchMedia('(pointer: coarse)').matches : false;
                    const portraitPhone = isCoarse && window.innerWidth <= 639 && window.innerHeight > window.innerWidth;
                    const canCrop = portraitPhone && !isMoba && this.mapCols <= VIEW_COLS && this.mapRows <= VIEW_ROWS;
                    if (document.body.classList.contains('board-crop') !== canCrop) {
                        document.body.classList.toggle('board-crop', canCrop);
                    }
                    const cropZoom = canCrop ? 1.182 : 1;

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
                        // MOBA/横屏同样按物理像素渲染：横屏时棋盘离眼睛更远感，糊了更明显。
                        // 保留 2.0MP 像素预算，避免横屏大面积填充拖垮中低端机。
                        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1)) * (this._qualityScale || 1);
                        let pixW = Math.round(targetW * dpr);
                        let pixH = Math.round(targetH * dpr);
                        const MAX_PIXELS = 2.0e6;
                        if (pixW * pixH > MAX_PIXELS) {
                            const k = Math.sqrt(MAX_PIXELS / (pixW * pixH));
                            pixW = Math.round(pixW * k);
                            pixH = Math.round(pixH * k);
                        }
                        if (this.canvas.width !== pixW || this.canvas.height !== pixH) {
                            this.canvas.width = pixW;
                            this.canvas.height = pixH;
                        }
                    } else {
                        // 画布分辨率必须跟随「CSS 尺寸 × 物理像素比」。
                        // H5 手机 dpr 普遍是 2~3：若只给 780 逻辑宽，等于把画面放大 1.4~2 倍显示，
                        // 角色描边、方块贴图、文字全部发虚——这是手机上"糊"的第一来源。
                        // 上限 2.6 倍基准宽（≈2028px）+ 2.0MP 总像素护栏，
                        // 兼顾高分屏清晰度与中低端机 GPU 填充率。
                        const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
                        const baseW = 780; // 逻辑基准：13 格 × 60px
                        // 自适应画质系数：中低端机持续掉帧时自动降采样，保帧率优先
                        const qScale = this._qualityScale || 1;
                        let pixW = Math.max(baseW, Math.min(Math.round(baseW * 2.6), Math.round(targetW * cropZoom * dpr * qScale)));
                        let pixH = Math.round(pixW * (660 / 780));
                        const MAX_PIXELS = 2.0e6;
                        if (pixW * pixH > MAX_PIXELS) {
                            const k = Math.sqrt(MAX_PIXELS / (pixW * pixH));
                            pixW = Math.round(pixW * k);
                            pixH = Math.round(pixH * k);
                        }
                        if (this.canvas.width !== pixW || this.canvas.height !== pixH) {
                            this.canvas.width = pixW;
                            this.canvas.height = pixH;
                        }
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

            // 自适应画质：H5 设备性能跨度极大（旗舰机 120Hz vs 千元机 30fps），
            // 与其让弱机卡成幻灯片，不如自动降画布采样率保操作手感。
            // 降档快（连续 2 秒 < 45fps）、升档慢（连续 5 秒 > 57fps），带滞回避免来回跳。
            setupAdaptiveQuality() {
                if (this._qualityActive) return;
                this._qualityActive = true;
                this._qualityScale = 1;
                this._qFrames = 0;
                this._qLast = performance.now();
                this._qLow = 0;
                this._qHigh = 0;
                // 玩家一旦手动切换过画质，就不再自动干预
                this._qUserLocked = false;

                const applyScale = (next) => {
                    const clamped = Math.max(0.55, Math.min(1, next));
                    if (Math.abs(clamped - this._qualityScale) < 0.03) return;
                    this._qualityScale = clamped;
                    this._qLow = 0;
                    this._qHigh = 0;
                    if (this._updateCanvasSize) this._updateCanvasSize();
                };
                this._setQualityScale = applyScale;

                const tick = () => {
                    const now = performance.now();
                    this._qFrames++;
                    const elapsed = now - this._qLast;
                    if (elapsed >= 1000) {
                        const fps = (this._qFrames * 1000) / elapsed;
                        this._qFrames = 0;
                        this._qLast = now;
                        // 只在实战中判断：菜单/暂停/弹窗停帧不代表性能
                        const inGame = this.state === 'PLAYING' && !document.hidden;
                        if (inGame && !this._qUserLocked) {
                            if (fps < 45) { this._qLow++; this._qHigh = 0; }
                            else if (fps > 57) { this._qHigh++; this._qLow = 0; }
                            else { this._qLow = 0; this._qHigh = 0; }

                            if (this._qLow >= 2) applyScale(this._qualityScale - 0.18);
                            else if (this._qHigh >= 5 && this._qualityScale < 0.999) applyScale(this._qualityScale + 0.12);
                        }
                        // 屏幕常亮：手游里手一停看局势就息屏，回来已经死了。
                        // 只在实战持有，回到菜单/暂停即刻释放（省电、也不打扰系统）。
                        if (inGame) this._acquireWakeLock && this._acquireWakeLock();
                        else this._releaseWakeLock && this._releaseWakeLock();
                    }
                    requestAnimationFrame(tick);
                };
                requestAnimationFrame(tick);
            }

            // Wake Lock：Chrome/Edge/Android 直接可用；iOS 16.4+ 支持，但同样需要页面可见。
            // 失败（不支持/被策略拒绝）时静默降级，游戏不受影响。
            setupWakeLock() {
                this._wakeLock = null;
                this._wakeLastTry = 0;
                this._acquireWakeLock = () => {
                    if (!navigator.wakeLock || this._wakeLock || document.hidden) return;
                    const now = performance.now();
                    if (now - this._wakeLastTry < 5000) return; // 失败时别每帧重试
                    this._wakeLastTry = now;
                    try {
                        navigator.wakeLock.request('screen').then((lock) => {
                            this._wakeLock = lock;
                            lock.addEventListener('release', () => { this._wakeLock = null; });
                        }).catch(() => { this._wakeLock = null; });
                    } catch (e) {
                        this._wakeLock = null;
                    }
                };
                this._releaseWakeLock = () => {
                    if (!this._wakeLock) return;
                    try { this._wakeLock.release(); } catch (e) {}
                    this._wakeLock = null;
                };
                document.addEventListener('visibilitychange', () => {
                    if (document.hidden) this._releaseWakeLock();
                });
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
                document.getElementById('modalHomeBtn').classList.add('hidden');
            }

            showStartScreen() {
                this.state = 'MENU';
                this.hideModal();
                this.hideShop();
                document.getElementById('startScreen').classList.remove('hidden');
                this.updateCareerPanel();
                this.setDifficulty(this.difficultyIdx || 0);
                this.syncStartSoundIcon();
                // 首屏启动占位淡出（只在冷启动第一次有效）。
                // 至少展示 300ms：本地秒开时若立刻淡出，会闪一下 logo 反而更廉价。
                const splash = document.getElementById('bootSplash');
                if (splash && !splash.classList.contains('is-done')) {
                    const shown = Date.now() - (window.__bootT || Date.now());
                    const wait = Math.max(0, 300 - shown);
                    setTimeout(() => {
                        splash.classList.add('is-done');
                        setTimeout(() => splash.remove(), 420);
                    }, wait);
                }
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

            // 破坏性操作统一二次确认（重开 / 切换难度）
            showConfirm({ title, desc, okText = '确认', cancelText = '取消', onConfirm = null, onCancel = null, danger = true }) {
                const modal = document.getElementById('confirmModal');
                if (!modal) return;
                this._confirmAction = onConfirm;
                this._confirmCancel = onCancel;
                document.getElementById('confirmTitle').textContent = title || '确认操作';
                document.getElementById('confirmDesc').textContent = desc || '';
                const ok = document.getElementById('confirmOkBtn');
                const cancel = document.getElementById('confirmCancelBtn');
                ok.textContent = okText;
                cancel.textContent = cancelText;
                ok.classList.toggle('confirm-ok', danger);
                ok.classList.toggle('confirm-cancel', !danger);
                this._confirmLastFocus = document.activeElement;
                modal.classList.remove('hidden');
                setTimeout(() => {
                    const initial = danger ? cancel : ok;
                    try { initial.focus({ preventScroll: true }); } catch (e) {}
                }, 30);
            }

            hideConfirm() {
                const modal = document.getElementById('confirmModal');
                if (modal) modal.classList.add('hidden');
                const cancel = this._confirmCancel;
                this._confirmAction = null;
                this._confirmCancel = null;
                if (this._confirmLastFocus && this._confirmLastFocus.focus) {
                    try { this._confirmLastFocus.focus({ preventScroll: true }); } catch (e) {}
                }
                if (typeof cancel === 'function') cancel();
            }

            runConfirm() {
                const action = this._confirmAction;
                const modal = document.getElementById('confirmModal');
                if (modal) modal.classList.add('hidden');
                this._confirmAction = null;
                this._confirmCancel = null;
                if (this._confirmLastFocus && this._confirmLastFocus.focus) {
                    try { this._confirmLastFocus.focus({ preventScroll: true }); } catch (e) {}
                }
                if (typeof action === 'function') action();
            }

            // Esc 优先关闭最上层弹层；返回 true 表示已消费
            closeTopOverlay() {
                if (!document.getElementById('confirmModal').classList.contains('hidden')) {
                    this.hideConfirm();
                    return true;
                }
                if (!document.getElementById('tutorialOffer').classList.contains('hidden')) {
                    document.getElementById('tutorialSkipOfferBtn').click();
                    return true;
                }
                if (!document.getElementById('helpModal').classList.contains('hidden')) {
                    this.hideHelpModal();
                    return true;
                }
                if (!document.getElementById('careerPop').classList.contains('hidden')) {
                    this.hideCareerPop();
                    return true;
                }
                if (!document.getElementById('diffSheet').classList.contains('hidden')) {
                    this.hideDiffSheet();
                    return true;
                }
                if (!document.getElementById('shopModal').classList.contains('hidden')) {
                    document.getElementById('shopContinueBtn').click();
                    return true;
                }
                if (this.state === 'PAUSED') {
                    this.togglePause();
                    return true;
                }
                if (this.state === 'PLAYING') {
                    this.togglePause();
                    return true;
                }
                return false;
            }

            syncStartSoundIcon() {
                const cv = document.getElementById('startSoundIcon');
                if (cv && this.paintIconCanvas) {
                    this.paintIconCanvas(cv, this.sound.enabled ? 'speaker' : 'speakerOff');
                }
            }

            updatePerfPanel() {
                const p = this.perf;
                p.frames++;
                const now = performance.now();
                if (now - p.lastFpsT >= 500) {
                    p.fps = Math.round(p.frames * 1000 / (now - p.lastFpsT));
                    p.frames = 0;
                    p.lastFpsT = now;
                }
                let el = document.getElementById('perfPanel');
                if (!el) {
                    el = document.createElement('div');
                    el.id = 'perfPanel';
                    el.style.cssText = 'position:fixed;top:4px;left:4px;z-index:999;background:rgba(0,0,0,0.7);color:#0f0;font:11px monospace;padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre;';
                    document.body.appendChild(el);
                }
                el.textContent =
                    `FPS:${p.fps} upd:${p.updateMs.toFixed(1)}ms draw:${p.drawMs.toFixed(1)}ms\n` +
                    `怪:${this.enemies.length} 弹:${this.bombs.length} 爆:${this.explosions.length} 粒:${this.particles.length}`;
            }

            togglePerfPanel() {
                this.perf.enabled = !this.perf.enabled;
                const el = document.getElementById('perfPanel');
                if (el) el.remove();
                this.showToast(this.perf.enabled ? '性能面板开' : '性能面板关', 'bolt');
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
                    const shortfall = maxed ? 0 : Math.max(0, cost - this.coins);

                    const cls = maxed
                        ? 'shop-item maxed'
                        : (canBuy ? 'shop-item buyable candy-btn' : 'shop-item');

                    // 生成等级进度点
                    let pipsHtml = '';
                    for (let p = 1; p <= item.max; p++) {
                        pipsHtml += `<span class="shop-pip ${p <= lvl ? 'filled' : ''}"></span>`;
                    }

                    let costLabel = '';
                    if (maxed) {
                        costLabel = '<span class="shop-cost-pill is-maxed">已满级</span>';
                    } else {
                        const buyCls = canBuy ? 'can-buy' : 'cannot-buy';
                        costLabel = `
                            <span class="shop-cost-pill ${buyCls}">
                                <canvas class="guide-icon shop-coin-icon" data-icon="coin" width="14" height="14"></canvas>
                                <span>${cost}</span>
                            </span>
                        `;
                    }

                    const actionTag = maxed
                        ? '<span class="shop-buy-tag maxed">满级</span>'
                        : (canBuy
                            ? '<span class="shop-buy-tag">购买</span>'
                            : `<span class="shop-buy-tag locked">差 ${shortfall}</span>`);
                    const ariaLabel = maxed
                        ? `${item.name}已达到最高等级`
                        : (canBuy
                            ? `购买${item.name}，花费 ${cost} 金币`
                            : `${item.name}还差 ${shortfall} 金币`);

                    html += `
                        <button type="button" data-key="${item.key}" class="${cls}" ${maxed ? 'disabled' : ''} aria-label="${ariaLabel}">
                            <span class="w-10 h-10 shrink-0 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center border-2 border-white shadow-sm">
                                <canvas class="shop-icon" data-icon="${item.icon}" width="30" height="30"></canvas>
                            </span>
                            <span class="flex-1 min-w-0 text-left">
                                <span class="flex items-center justify-between gap-1">
                                    <span class="text-xs font-black text-slate-800">${item.name}</span>
                                    <span class="text-[10px] font-bold text-slate-400">Lv.${lvl}/${item.max}</span>
                                </span>
                                <span class="block text-[10px] text-slate-500 font-bold truncate mt-0.5">${item.desc}</span>
                                <span class="flex items-center gap-1 mt-1.5">${pipsHtml}</span>
                            </span>
                            <span class="flex flex-col items-end gap-1 shrink-0">
                                ${costLabel}
                                ${actionTag}
                            </span>
                        </button>
                    `;
                }

                container.innerHTML = html;
                // 绘制商店矢量图标与金币微图标
                container.querySelectorAll('.shop-icon').forEach(cv => {
                    const bctx = cv.getContext('2d');
                    bctx.clearRect(0, 0, 30, 30);
                    this.drawIcon(cv.dataset.icon, 15, 15, 24, bctx);
                });
                container.querySelectorAll('.shop-coin-icon').forEach(cv => {
                    const bctx = cv.getContext('2d');
                    bctx.clearRect(0, 0, 14, 14);
                    this.drawIcon('coin', 7, 7, 12, bctx);
                });

                container.querySelectorAll('.shop-item').forEach(btn => {
                    btn.addEventListener('click', () => {
                        this.sound.playClick();
                        if (btn.disabled) {
                            this.setShopNotice('已经满级啦');
                            return;
                        }
                        const key = btn.getAttribute('data-key');
                        this.buyUpgrade(key);
                    });
                });

                document.getElementById('shopCoins').textContent = this.coins;
                document.getElementById('shopContinueBtn').textContent = `进入第 ${this.level + 1} 关`;
            }

            setShopNotice(text, ms = 1800) {
                const el = document.getElementById('shopNotice');
                if (!el) return;
                el.textContent = text;
                clearTimeout(this._shopNoticeTimer);
                this._shopNoticeTimer = setTimeout(() => { el.textContent = ''; }, ms);
            }

            buyUpgrade(key) {
                const item = SHOP_ITEMS.find(i => i.key === key);
                if (!item) return;

                const up = this.save.data.upgrades;
                const lvl = up[key] || 0;
                const cost = getUpgradeCost(item, lvl);

                if (cost === null) {
                    this.sound.playPortalLocked();
                    this.setShopNotice(`${item.name}已经满级啦`);
                    return;
                }
                if (this.coins < cost) {
                    this.sound.playPortalLocked();
                    this.setShopNotice(`还差 ${cost - this.coins} 金币`);
                    return;
                }

                this.coins -= cost;
                up[key] = lvl + 1;
                this.save.save();

                this.sound.playPurchase();
                this.renderShop();
                const coinsEl = document.getElementById('shopCoins');
                if (coinsEl) {
                    coinsEl.classList.remove('coin-spend');
                    void coinsEl.offsetWidth;
                    coinsEl.classList.add('coin-spend');
                }
                this.setShopNotice(`已升级 ${item.name} → Lv.${lvl + 1}`);
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

                // 首页成绩行：让玩家第一眼看到既有进度（留存的基础信息）
                const bestLine = document.getElementById('startBestLine');
                if (bestLine) {
                    const best = d.bestScore.toLocaleString();
                    const cleared = d.totalLevelsCleared || 0;
                    if (d.bestScore > 0) {
                        bestLine.innerHTML = '最高分 <span class="hl">' + best + '</span> · 生涯通关 <span class="hl">' + cleared + '</span> 关';
                    } else {
                        bestLine.textContent = '首次冒险 · 清光怪物即可过关';
                    }
                }
            }
    }

    global.GameUIMixin = GameUIMixin;
})(typeof window !== 'undefined' ? window : globalThis);
