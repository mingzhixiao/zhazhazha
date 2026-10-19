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

                    html += `
                        <button data-key="${item.key}" class="${cls}" ${canBuy ? '' : 'disabled'}>
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
                            ${costLabel}
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
    }

    global.GameUIMixin = GameUIMixin;
})(typeof window !== 'undefined' ? window : globalThis);
