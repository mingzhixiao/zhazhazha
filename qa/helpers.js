/* QA 页面内驱动：通过真实 DOM 事件（keydown/keyup/click）驱动游戏，供 agent-browser eval 调用 */
(() => {
    if (window.__qa && window.__qa.ready) return 'already-ready';
    const G = () => window.game;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const kd = c => window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, bubbles: true }));
    const ku = c => window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c, bubbles: true }));
    const DIRS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
    const releaseAll = () => DIRS.forEach(ku);
    const qa = window.__qa = { ready: true, stage: 'boot', log: [], assisted: false, result: null };

    function log(m) { qa.log.push(String(m)); }

    function tileOf() { const g = G(); return { c: Math.floor(g.player.x / 60), r: Math.floor(g.player.y / 60) }; }

    function bfs(c0, r0, c1, r1) {
        const g = G();
        const solid = (c, r) => g.isTileSolidForPlayer(c, r, c0, r0);
        const key = (c, r) => c + ',' + r;
        const q = [[c0, r0]]; const prev = {}; const seen = new Set([key(c0, r0)]);
        while (q.length) {
            const [c, r] = q.shift();
            if (c === c1 && r === r1) {
                const path = []; let k = key(c, r);
                while (prev[k]) { path.push(k); k = prev[k]; }
                return path.reverse().map(s => s.split(',').map(Number));
            }
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = c + dc, nr = r + dr, k2 = key(nc, nr);
                if (seen.has(k2)) continue;
                if (nr < 0 || nc < 0 || nr >= g.mapRows || nc >= g.mapCols) continue;
                if (solid(nc, nr) && !(nc === c1 && nr === r1)) continue;
                seen.add(k2); prev[k2] = key(c, r); q.push([nc, nr]);
            }
        }
        return null;
    }

    async function stepTo(c, r, maxMs = 3500) {
        const t0 = performance.now();
        while (performance.now() - t0 < maxMs) {
            const g = G(); if (!g || !g.player) return 'no-player';
            const p = g.player;
            const dx = (c + 0.5) * 60 - p.x, dy = (r + 0.5) * 60 - p.y;
            if (Math.abs(dx) < 7 && Math.abs(dy) < 7) { releaseAll(); return 'arrived'; }
            releaseAll();
            if (Math.abs(dx) > 4) kd(dx > 0 ? 'ArrowRight' : 'ArrowLeft');
            if (Math.abs(dy) > 4) kd(dy > 0 ? 'ArrowDown' : 'ArrowUp');
            await sleep(60);
        }
        releaseAll(); return 'stuck';
    }

    async function walkTo(col, row, maxMs = 15000) {
        const t0 = performance.now();
        while (performance.now() - t0 < maxMs) {
            const { c, r } = tileOf();
            if (c === col && r === row) { releaseAll(); return 'arrived'; }
            const path = bfs(c, r, col, row);
            if (!path || !path.length) return 'no-path@' + c + ',' + r;
            for (const [tc, tr] of path) {
                const res = await stepTo(tc, tr, 3500);
                if (res !== 'arrived') return res + '@' + tc + ',' + tr;
            }
            const p2 = tileOf();
            if (p2.c === col && p2.r === row) { releaseAll(); return 'arrived'; }
        }
        return 'walk-timeout';
    }

    function state() {
        const g = G(); if (!g) return 'no-game';
        return JSON.stringify({
            state: g.state, level: g.level, diff: g.difficultyIdx,
            lives: g.playerStats && g.playerStats.lives, score: g.score, coins: g.coins,
            enemies: g.enemies.length, bombs: g.bombs.length,
            gridR: g.grid.length, gridC: g.grid[0] ? g.grid[0].length : 0,
            px: g.player && Math.round(g.player.x), py: g.player && Math.round(g.player.y)
        });
    }

    /* 通用：走+炸开路，到达目标格（供通关等场景用） */
    async function reachTile(col, row, tries) {
        let w = await walkTo(col, row, 15000);
        let n = 0;
        while (w !== 'arrived' && n < (tries || 10)) {
            n++;
            const near = await walkNearest(col, row);
            if (near) { await walkTo(near.c, near.r, 8000); }
            await bombThrough(3);
            w = await walkTo(col, row, 15000);
        }
        return w;
    }

    /* —— 死亡流程：走回空地后原地反复放弹直到 GAME_OVER —— */
    async function deathLoop(maxMs = 150000) {
        const g = G();
        if (g.player) { const w = await walkTo(1, 1, 8000); log('death-walk=' + w); }
        const t0 = performance.now();
        while (performance.now() - t0 < maxMs) {
            const g = G();
            if (g.state === 'GAME_OVER') { qa.stage = 'gameover'; log('lives=' + g.playerStats.lives); return 'gameover'; }
            if (g.state === 'PLAYING' && g.bombs.length === 0) { kd('Space'); setTimeout(() => ku('Space'), 80); }
            await sleep(500);
        }
        return 'timeout:' + G().state;
    }

    /* —— 通关流程：清空敌人（辅助）→ 走到传送门 —— */
    async function clearLevel() {
        const g = G();
        if (g.enemies.length > 0) { g.enemies.length = 0; qa.assisted = true; log('enemies-cleared-assisted'); }
        const t0 = performance.now();
        while (performance.now() - t0 < 5000 && !(g.portal && g.portal.active)) await sleep(200);
        const walk = await reachTile(g.portal.col, g.portal.row, 10);
        log('portal-walk=' + walk);
        const t1 = performance.now();
        while (performance.now() - t1 < 3000 && g.state !== 'LEVEL_CLEAR') await sleep(200);
        if (g.state !== 'LEVEL_CLEAR') { g.triggerLevelClear(); qa.assisted = true; log('triggerLevelClear-assisted'); await sleep(400); }
        qa.stage = g.state === 'LEVEL_CLEAR' ? 'cleared' : 'clear-failed';
        return qa.stage;
    }

    /* 走到离目标最近的可达格（用于被木箱阻挡时接近目标） */
    async function walkNearest(col, row) {
        const g = G();
        const { c: c0, r: r0 } = tileOf();
        const key = (c, r) => c + ',' + r;
        const dist = {}; dist[key(c0, r0)] = 0;
        const q = [[c0, r0]];
        const best = { d: Math.abs(c0 - col) + Math.abs(r0 - row), c: c0, r: r0 };
        const solid = (c, r) => g.isTileSolidForPlayer(c, r, c0, r0);
        while (q.length) {
            const [c, r] = q.shift();
            for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nc = c + dc, nr = r + dr, k = key(nc, nr);
                if (nc < 0 || nr < 0 || nc >= g.mapCols || nr >= g.mapRows) continue;
                if (dist[k] !== undefined) continue;
                if (solid(nc, nr)) continue;
                dist[k] = dist[key(c, r)] + 1; q.push([nc, nr]);
                const d = Math.abs(nc - col) + Math.abs(nr - row);
                if (d < best.d) { best.d = d; best.c = nc; best.r = nr; }
            }
        }
        if (best.c === c0 && best.r === r0) return null;
        return best;
    }

    /* 炸开阻挡的木箱：放弹→撤离→等爆炸，重复几次 */
    async function bombThrough(retries) {
        const g = G();
        for (let i = 0; i < (retries || 8); i++) {
            if (g.state !== 'PLAYING') return 'state:' + g.state;
            if (g.bombs.length < (g.playerStats.maxBombs || 1)) {
                kd('Space'); setTimeout(() => ku('Space'), 80);
                await sleep(250);
                const p = tileOf();
                for (const [dc, dr] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                    const c = p.c + dc, r = p.r + dr;
                    if (c > 0 && r > 0 && c < g.mapCols && r < g.mapRows && !g.isTileSolidForPlayer(c, r, p.c, p.r)) {
                        await walkTo(c, r, 4000); break;
                    }
                }
            }
            const t1 = performance.now();
            while (g.bombs.length > 0 && performance.now() - t1 < 8000) await sleep(200);
        }
        return 'bombed';
    }

    /* —— 教学：完整跑 6 步 —— */
    async function tutorialRun(maxMs = 240000) {
        const g = G(); const t0 = performance.now(); qa.tutStarted = true;
        while (performance.now() - t0 < maxMs) {
            if (!g.tutorial || !g.tutorial.active) {
                if (qa.tutStarted) {
                    const t1 = performance.now();
                    while (performance.now() - t1 < 10000 && !(g.state === 'PLAYING' && document.getElementById('tutorialHud').classList.contains('hidden'))) await sleep(250);
                    log('tutorial-ended state=' + g.state + ' diff=' + g.difficultyIdx + ' grid=' + g.grid.length + 'x' + (g.grid[0] || []).length);
                    qa.stage = 'tutorial-done';
                    return 'done state=' + g.state + ' diff=' + g.difficultyIdx + ' grid=' + g.grid.length + 'x' + (g.grid[0] || []).length;
                }
                await sleep(300); continue;
            }
            const t = g.tutorial; const step = t.step;
            if (qa.lastStep !== step) { qa.lastStep = step; log('step->' + (step + 1)); }
            if (step === 0 || step === 3 || step === 5) {
                if (t.target) {
                    let w = await walkTo(t.target.c, t.target.r, 12000);
                    let tries = 0;
                    while (w !== 'arrived' && tries < 8 && g.tutorial.active) {
                        tries++;
                        const near = await walkNearest(t.target.c, t.target.r);
                        if (near) { const nw = await walkTo(near.c, near.r, 8000); log('near-walk:' + nw + '@' + near.c + ',' + near.r); }
                        await bombThrough(2);
                        w = await walkTo(t.target.c, t.target.r, 12000);
                        log('retry' + tries + ':' + w);
                    }
                }
                await sleep(350);
            } else if (step === 1) {
                await sleep(250); kd('Space'); setTimeout(() => ku('Space'), 80); await sleep(700);
            } else if (step === 2) {
                // 远离爆炸范围：走到相邻 2 格内的空地，然后等炸弹炸完
                const p = tileOf();
                const cands = [[p.c + 2, p.r], [p.c - 2, p.r], [p.c, p.r + 2], [p.c, p.r - 2], [p.c + 1, p.r]];
                let done = false;
                for (const [c, r] of cands) {
                    if (c > 0 && r > 0 && c < g.mapCols && r < g.mapRows && !g.isTileSolidForPlayer(c, r, p.c, p.r)) {
                        const res = await walkTo(c, r, 6000);
                        if (res === 'arrived') { done = true; break; }
                    }
                }
                if (!done) log('dodge-walk-imperfect');
                const t1 = performance.now();
                while (g.bombs.length > 0 && performance.now() - t1 < 15000) await sleep(250);
            } else if (step === 4) {
                // 走到史莱姆相邻格，放弹，撤离，等敌人清零
                const tg = t.target;
                if (tg) {
                    const p = tileOf();
                    let adj = null;
                    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                        const c = tg.c + dc, r = tg.r + dr;
                        if (c > 0 && r > 0 && c < g.mapCols && r < g.mapRows && !g.isTileSolidForPlayer(c, r, p.c, p.r)) { adj = [c, r]; break; }
                    }
                    if (adj) {
                        let w = await walkTo(adj[0], adj[1], 10000);
                        let tries = 0;
                        while (w !== 'arrived' && tries < 6 && g.tutorial.active) {
                            tries++;
                            const near = await walkNearest(adj[0], adj[1]);
                            if (near) { await walkTo(near.c, near.r, 8000); }
                            await bombThrough(2);
                            w = await walkTo(adj[0], adj[1], 10000);
                            log('retry-approach' + tries + '=' + w);
                        }
                        log('approach=' + w);
                        if (w === 'arrived') {
                            kd('Space'); setTimeout(() => ku('Space'), 80);
                            await sleep(300);
                            const p2 = tileOf();
                            for (const [dc, dr] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, 0]]) {
                                const c = p2.c + dc, r = p2.r + dr;
                                if (c > 0 && r > 0 && c < g.mapCols && r < g.mapRows && !g.isTileSolidForPlayer(c, r, p2.c, p2.r)) {
                                    await walkTo(c, r, 6000); break;
                                }
                            }
                        }
                    } else log('no-adjacent-tile');
                }
                const t2 = performance.now();
                while (g.enemies.length > 0 && performance.now() - t2 < 20000) await sleep(250);
            }
            await sleep(250);
        }
        return 'tutorial-timeout@step' + (G().tutorial ? G().tutorial.step : '?');
    }

    /* —— 布局检查：边界相交 / 裁切 / 视口外 —— */
    function layoutCheck() {
        const ids = ['topHeader', 'tutorialHud', 'gameToasts', 'canvasWrapper', 'bottomFooter', 'btnPlaceBomb', 'joystickZone', 'stageArea', 'mobileHintBox'];
        const rects = {};
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const b = el.getBoundingClientRect();
            rects[id] = { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), vis: b.width > 0 && b.height > 0 };
        });
        const vw = innerWidth, vh = innerHeight; const issues = [];
        const overlap = (a, b) => a && b && a.vis && b.vis && !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
        const inside = (r) => r && r.vis && r.x >= -1 && r.y >= -1 && r.x + r.w <= vw + 1 && r.y + r.h <= vh + 1;
        if (!inside(rects.btnPlaceBomb)) issues.push('btnPlaceBomb-outside-viewport');
        if (!inside(rects.joystickZone)) issues.push('joystick-outside-viewport');
        if (!inside(rects.bottomFooter)) issues.push('footer-outside-viewport');
        if (overlap(rects.gameToasts, rects.canvasWrapper)) issues.push('gameToasts-overlaps-canvas');
        if (overlap(rects.tutorialHud, rects.topHeader)) issues.push('tutorialHud-overlaps-header');
        if (overlap(rects.tutorialHud, rects.canvasWrapper)) issues.push('tutorialHud-overlaps-canvas');
        if (rects.canvasWrapper && rects.canvasWrapper.vis && (rects.canvasWrapper.y + rects.canvasWrapper.h > rects.bottomFooter.y + 1)) issues.push('canvas-under-footer');
        return JSON.stringify({ vw, vh, rects, issues });
    }

    /* —— FPS 采样 —— */
    function fpsSample(ms = 3000) {
        return new Promise(res => {
            let frames = 0; const t0 = performance.now();
            function tick() { frames++; if (performance.now() - t0 < ms) requestAnimationFrame(tick); else res((frames / ((performance.now() - t0) / 1000)).toFixed(1)); }
            requestAnimationFrame(tick);
        });
    }

    /* —— 可见性自动暂停 —— */
    function visibilityPauseTest() {
        const g = G();
        if (g.state !== 'PLAYING') return 'precondition-failed:' + g.state;
        const before = g.state;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
        document.dispatchEvent(new Event('visibilitychange'));
        const afterHide = g.state;
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
        document.dispatchEvent(new Event('visibilitychange'));
        // 恢复
        if (afterHide === 'PAUSED') g.togglePause && g.togglePause();
        delete document.hidden;
        return 'before=' + before + ',hidden-paused=' + afterHide;
    }

    function blurClearsKeysTest() {
        const g = G();
        kd('ArrowRight'); kd('Space');
        const before = JSON.stringify(g.keys);
        window.dispatchEvent(new Event('blur'));
        const after = JSON.stringify(g.keys);
        return 'before=' + before + ',after=' + after;
    }

    window.__qaApi = { walkTo, walkNearest, reachTile, state, deathLoop, clearLevel, tutorialRun, layoutCheck, fpsSample, visibilityPauseTest, blurClearsKeysTest, kd, ku, sleep, bombThrough };
    return 'qa-ready';
})()