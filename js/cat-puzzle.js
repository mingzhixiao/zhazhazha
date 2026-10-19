/**
 * ============================================================================
 * 猫咪逻辑特别模式 — UI / 会话控制
 * 挂到 window.CatPuzzleMode，由 game.js 在首页入口调用
 * ============================================================================
 */
(function (global) {
    'use strict';

    const C = global.CatPuzzle;
    if (!C) {
        console.error('CatPuzzle core missing');
        return;
    }

    let host = null;       // game 实例（音效/回首页）
    let session = null;
    let rafId = 0;
    let lastTs = 0;
    let bound = false;

    function $(id) { return document.getElementById(id); }

    function show(el) { if (el) el.classList.remove('hidden'); }
    function hide(el) { if (el) el.classList.add('hidden'); }

    function formatTime(sec) {
        if (sec === null || sec === undefined) return '∞';
        const s = Math.max(0, Math.ceil(sec));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return m + ':' + (r < 10 ? '0' : '') + r;
    }

    function bindOnce() {
        if (bound) return;
        bound = true;

        $('catPuzzleBackBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            exitMode();
        });

        $('catPuzzleHintBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            revealHint();
        });

        $('catPuzzleResetBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            resetLevel();
        });

        $('catTutNextBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            session = C.advanceTutorial(session);
            renderAll();
        });

        $('catTutSkipBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            session = Object.assign({}, session, { tutorialStep: -1 });
            renderAll();
        });

        $('catResultNextBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            const next = session.levelIndex + 1;
            if (next >= C.levelCount()) {
                exitMode();
                return;
            }
            hide($('catPuzzleResult'));
            startLevel(next);
        });

        $('catResultRetryBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            hide($('catPuzzleResult'));
            startLevel(session.levelIndex);
        });

        $('catResultHomeBtn').addEventListener('click', function () {
            if (host && host.sound) host.sound.playClick();
            exitMode();
        });
    }

    function enterMode(game) {
        host = game || null;
        bindOnce();
        if (host && host.hideStartScreen) host.hideStartScreen();
        if (host) host.state = 'MENU';
        show($('catPuzzleScreen'));
        hide($('catPuzzleResult'));
        startLevel(0);
        lastTs = performance.now();
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(tick);
    }

    function exitMode() {
        cancelAnimationFrame(rafId);
        rafId = 0;
        session = null;
        hide($('catPuzzleScreen'));
        hide($('catPuzzleResult'));
        if (host && host.showStartScreen) host.showStartScreen();
    }

    function startLevel(index) {
        session = C.createSession(index);
        hide($('catPuzzleResult'));
        renderAll();
    }

    function resetLevel() {
        if (!session) return;
        startLevel(session.levelIndex);
    }

    function revealHint() {
        if (!session || session.won || session.failed) return;
        const sol = session.level.solution;
        const board = session.board;
        for (let i = 0; i < sol.length; i++) {
            const p = sol[i];
            if (board[p.r][p.c] !== C.CELL.CAT) {
                const next = C.applyTap(
                    Object.assign({}, session, {
                        board: board.map(function (row) { return row.slice(); })
                    }),
                    p.r, p.c
                );
                // applyTap cycles; if cell was MARK, need to land on CAT
                let b = next.board;
                if (b[p.r][p.c] !== C.CELL.CAT) {
                    b = b.map(function (row) { return row.slice(); });
                    b[p.r][p.c] = C.CELL.CAT;
                    next.board = b;
                    next.won = C.isSolved(next.level.regions, b);
                }
                session = next;
                renderAll();
                if (session.won) showResult(true);
                return;
            }
        }
    }

    function onCellTap(r, c) {
        if (!session || session.won || session.failed) return;
        if (host && host.sound) host.sound.playClick();
        session = C.applyTap(session, r, c);
        renderBoard();
        renderHud();
        if (session.won) showResult(true);
    }

    function tick(ts) {
        rafId = requestAnimationFrame(tick);
        if (!session || !$('catPuzzleScreen') || $('catPuzzleScreen').classList.contains('hidden')) return;
        const dt = Math.min(0.1, (ts - lastTs) / 1000);
        lastTs = ts;
        if (session.remaining === null || session.won || session.failed) return;
        const prev = Math.ceil(session.remaining);
        session = C.tickTimer(session, dt);
        if (Math.ceil(session.remaining) !== prev) renderHud();
        if (session.failed) showResult(false);
    }

    function showResult(won) {
        const panel = $('catPuzzleResult');
        const title = $('catResultTitle');
        const desc = $('catResultDesc');
        const nextBtn = $('catResultNextBtn');
        if (won) {
            title.textContent = '过关！';
            const last = session.levelIndex >= C.levelCount() - 1;
            desc.textContent = last
                ? '你通关了全部特别模式关卡，真棒！'
                : ('完成「' + session.level.name + '」，准备好下一关了吗？');
            nextBtn.textContent = last ? '回到首页' : '下一关';
            nextBtn.dataset.done = last ? '1' : '0';
            show(nextBtn);
        } else {
            title.textContent = '时间到';
            desc.textContent = '再试一次，仔细看颜色与接触规则。';
            hide(nextBtn);
        }
        show(panel);
    }

    function renderAll() {
        renderRules();
        renderHud();
        renderBoard();
        renderTutorial();
    }

    function renderRules() {
        const highlight = (session && session.tutorialStep >= 0)
            ? C.TUTORIAL_STEPS[session.tutorialStep].ruleHighlight
            : -1;
        const items = document.querySelectorAll('#catRulesPanel .cat-rule');
        for (let i = 0; i < items.length; i++) {
            items[i].classList.toggle('cat-rule-on', highlight === i);
        }
    }

    function renderHud() {
        if (!session) return;
        const L = session.level;
        $('catLevelLabel').textContent = '第 ' + L.id + ' 关 · ' + L.name;
        const placed = C.catCount(session.board);
        $('catProgressText').textContent = placed + '/' + L.size;
        const bar = $('catProgressBar');
        bar.style.width = Math.min(100, (placed / L.size) * 100) + '%';

        const timerEl = $('catTimer');
        if (L.timeLimit > 0) {
            show(timerEl);
            timerEl.textContent = formatTime(session.remaining);
            timerEl.classList.toggle('cat-timer-warn', session.remaining !== null && session.remaining <= 15);
        } else {
            hide(timerEl);
        }
    }

    function renderTutorial() {
        const card = $('catTutorialCard');
        if (!session || session.tutorialStep < 0) {
            hide(card);
            return;
        }
        const step = C.TUTORIAL_STEPS[session.tutorialStep];
        $('catTutTitle').textContent = step.title;
        $('catTutText').textContent = step.text;
        $('catTutStep').textContent = (session.tutorialStep + 1) + '/' + C.TUTORIAL_STEPS.length;
        const nextBtn = $('catTutNextBtn');
        if (session.tutorialStep >= C.TUTORIAL_STEPS.length - 1) {
            nextBtn.textContent = '开始挑战';
        } else {
            nextBtn.textContent = '下一步';
        }
        show(card);
        renderRules();
    }

    function renderBoard() {
        const grid = $('catPuzzleGrid');
        if (!session || !grid) return;
        const L = session.level;
        const n = L.size;
        const check = C.findConflicts(L.regions, session.board);
        const bad = C.conflictCellSet(check.conflicts);

        grid.style.gridTemplateColumns = 'repeat(' + n + ', 1fr)';
        grid.innerHTML = '';
        grid.dataset.size = String(n);

        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'cat-cell';
                cell.style.background = L.colors[L.regions[r][c]] || '#cbd5e1';
                cell.setAttribute('aria-label', '第' + (r + 1) + '行第' + (c + 1) + '列');
                const val = session.board[r][c];
                if (val === C.CELL.CAT) {
                    cell.classList.add('has-cat');
                    cell.innerHTML = '<span class="cat-face" aria-hidden="true"><i></i><i></i></span>';
                } else if (val === C.CELL.MARK) {
                    cell.classList.add('has-mark');
                    cell.innerHTML = '<span class="cat-x" aria-hidden="true"></span>';
                }
                if (bad[r + ',' + c]) cell.classList.add('conflict');

                // 区域边界：与右/下不同色则加边
                if (c + 1 < n && L.regions[r][c] !== L.regions[r][c + 1]) cell.classList.add('edge-r');
                if (r + 1 < n && L.regions[r][c] !== L.regions[r + 1][c]) cell.classList.add('edge-b');

                cell.addEventListener('click', (function (rr, cc) {
                    return function () { onCellTap(rr, cc); };
                })(r, c));
                grid.appendChild(cell);
            }
        }
    }

    global.CatPuzzleMode = {
        enter: enterMode,
        exit: exitMode,
        isActive: function () {
            const el = $('catPuzzleScreen');
            return !!(el && !el.classList.contains('hidden'));
        }
    };
})(typeof window !== 'undefined' ? window : globalThis);
