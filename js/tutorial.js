(function (global) {
    'use strict';

    class GameTutorialMixin {
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
                // 教学沙盒强制使用新手档（13x11 / 8 怪），暂存用户所选难度以便结束后恢复
                const pair = GameTutorial.tutorialDifficultyPair(this.difficultyIdx);
                this._tutorialSavedDifficulty = pair.restore;
                this.setDifficulty(pair.sandbox); // 强制新手沙盒（无论首页选了什么难度）
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
                // 注意：不要在此无条件清零 bombWasPlaced，否则第 2 步（躲避爆炸）
                // 会因标记被清而无法推进，造成教学死锁。该标记只在 startTutorial 初始化。
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
                        // 教学传送门格必须可通行：清除底层障碍，清理可能重叠的炸弹/道具，
                        // 否则 isTileSolidForPlayer 会阻止角色进入，导致教学卡在最后一步。
                        const resolved = GameTutorial.resolveTutorialPortalTile(this.grid, this.portal, TILE);
                        this.grid = resolved.grid;
                        this.powerups = this.powerups.filter(p => !(p.col === this.portal.col && p.row === this.portal.row));
                        this.bombs = this.bombs.filter(b => !(b.col === this.portal.col && b.row === this.portal.row));
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

                const world = {
                    atTarget,
                    bombsActive: this.bombs.length,
                    powerupsCount: this.powerups.length,
                    enemiesCount: this.enemies.length
                };
                const res = GameTutorial.evaluateTutorialStep(t, world);
                if (!res.action) return;
                // 放弹成功标记必须在推进前设置，且不会被下一 setupTutorialStep 清零
                if (res.markBombPlaced) t.bombWasPlaced = true;
                if (res.action === 'complete') {
                    this.endTutorial(true);
                } else {
                    this.tutorialNext(res.feedback);
                }
            }

            tutorialNext(msg) {
                if (msg) this.setTutorialFeedback(msg);
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
                // 恢复用户所选难度（教学期间强制为新手档），再开一局干净的真实第 1 关
                if (this._tutorialSavedDifficulty !== undefined) {
                    this.setDifficulty(this._tutorialSavedDifficulty);
                    delete this._tutorialSavedDifficulty;
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
    }

    global.GameTutorialMixin = GameTutorialMixin;
})(typeof window !== 'undefined' ? window : globalThis);
