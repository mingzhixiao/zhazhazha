/**
 * ============================================================================
 * 猫咪逻辑特别模式 — 纯函数核心（无 DOM）
 * 规则对齐「一种颜色一只猫 / 每行每列仅一只 / 猫咪不能接触(含对角)」
 * ============================================================================
 */
(function (global) {
    'use strict';

    const CELL = { EMPTY: 0, CAT: 1, MARK: 2 };

    const REGION_COLORS = [
        '#94a3b8', '#f87171', '#fb923c', '#facc15', '#4ade80',
        '#38bdf8', '#a78bfa', '#f472b6', '#2dd4bf', '#eab308'
    ];

    /** 切比雪夫距离 ≤ 1 视为接触（含对角） */
    function catsTouch(a, b) {
        return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) <= 1;
    }

    function listCats(board) {
        const cats = [];
        for (let r = 0; r < board.length; r++) {
            for (let c = 0; c < board[r].length; c++) {
                if (board[r][c] === CELL.CAT) cats.push({ r, c });
            }
        }
        return cats;
    }

    /**
     * 检查冲突。返回 { ok, conflicts:[{type, cells, region?}...] }
     * type: 'row' | 'col' | 'region' | 'touch'
     */
    function findConflicts(regions, board) {
        const n = regions.length;
        const cats = listCats(board);
        const conflicts = [];

        const byRow = {};
        const byCol = {};
        const byRegion = {};
        for (let i = 0; i < cats.length; i++) {
            const cat = cats[i];
            const rid = regions[cat.r][cat.c];
            if (!byRow[cat.r]) byRow[cat.r] = [];
            byRow[cat.r].push(cat);
            if (!byCol[cat.c]) byCol[cat.c] = [];
            byCol[cat.c].push(cat);
            if (!byRegion[rid]) byRegion[rid] = [];
            byRegion[rid].push(cat);
        }

        Object.keys(byRow).forEach(function (k) {
            if (byRow[k].length > 1) conflicts.push({ type: 'row', cells: byRow[k] });
        });
        Object.keys(byCol).forEach(function (k) {
            if (byCol[k].length > 1) conflicts.push({ type: 'col', cells: byCol[k] });
        });
        Object.keys(byRegion).forEach(function (k) {
            if (byRegion[k].length > 1) {
                conflicts.push({ type: 'region', region: Number(k), cells: byRegion[k] });
            }
        });

        for (let i = 0; i < cats.length; i++) {
            for (let j = i + 1; j < cats.length; j++) {
                if (catsTouch(cats[i], cats[j])) {
                    conflicts.push({ type: 'touch', cells: [cats[i], cats[j]] });
                }
            }
        }

        return { ok: conflicts.length === 0, conflicts: conflicts, cats: cats };
    }

    /** 是否通关：恰好 n 只猫、无冲突、每个区域恰 1 只 */
    function isSolved(regions, board) {
        const n = regions.length;
        const check = findConflicts(regions, board);
        if (!check.ok) return false;
        if (check.cats.length !== n) return false;
        const seen = {};
        for (let i = 0; i < check.cats.length; i++) {
            const cat = check.cats[i];
            const rid = regions[cat.r][cat.c];
            if (seen[rid]) return false;
            seen[rid] = true;
        }
        return Object.keys(seen).length === n;
    }

    /** 单击循环：空 → 猫 → 叉 → 空 */
    function cycleCell(value) {
        if (value === CELL.EMPTY) return CELL.CAT;
        if (value === CELL.CAT) return CELL.MARK;
        return CELL.EMPTY;
    }

    function emptyBoard(n) {
        const board = [];
        for (let r = 0; r < n; r++) {
            board[r] = [];
            for (let c = 0; c < n; c++) board[r][c] = CELL.EMPTY;
        }
        return board;
    }

    function cloneBoard(board) {
        return board.map(function (row) { return row.slice(); });
    }

    /** 放置一组猫（每行一列），保证互不接触 */
    function placeCats(n, rng) {
        const cols = [];
        for (let i = 0; i < n; i++) cols.push(i);
        for (let attempt = 0; attempt < 800; attempt++) {
            // 洗牌列分配
            for (let i = cols.length - 1; i > 0; i--) {
                const j = Math.floor(rng() * (i + 1));
                const t = cols[i];
                cols[i] = cols[j];
                cols[j] = t;
            }
            const cats = [];
            let ok = true;
            for (let r = 0; r < n; r++) {
                const cat = { r: r, c: cols[r] };
                for (let k = 0; k < cats.length; k++) {
                    if (catsTouch(cat, cats[k])) { ok = false; break; }
                }
                if (!ok) break;
                cats.push(cat);
            }
            if (ok) return cats;
        }
        return null;
    }

    /** 多源 BFS：从每只猫扩散成连通色块 */
    function paintRegions(n, cats, rng) {
        const regions = [];
        for (let r = 0; r < n; r++) {
            regions[r] = [];
            for (let c = 0; c < n; c++) regions[r][c] = -1;
        }
        const queue = [];
        for (let i = 0; i < cats.length; i++) {
            const cat = cats[i];
            regions[cat.r][cat.c] = i;
            queue.push({ r: cat.r, c: cat.c, id: i });
        }
        const dirs = [[0, 1], [1, 0], [0, -1], [-1, 0]];
        while (queue.length) {
            // 轻微随机化扩展顺序，让色块形状不那么方正
            if (rng() < 0.35 && queue.length > 1) {
                const j = Math.floor(rng() * queue.length);
                const tmp = queue[0];
                queue[0] = queue[j];
                queue[j] = tmp;
            }
            const cur = queue.shift();
            for (let d = 0; d < dirs.length; d++) {
                const nr = cur.r + dirs[d][0];
                const nc = cur.c + dirs[d][1];
                if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
                if (regions[nr][nc] !== -1) continue;
                regions[nr][nc] = cur.id;
                queue.push({ r: nr, c: nc, id: cur.id });
            }
        }
        return regions;
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return function () {
            t += 0x6D2B79F5;
            let r = Math.imul(t ^ (t >>> 15), 1 | t);
            r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
            return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
        };
    }

    function generatePuzzle(size, seed) {
        const rng = mulberry32(seed);
        const cats = placeCats(size, rng);
        if (!cats) return null;
        const regions = paintRegions(size, cats, rng);
        return { size: size, regions: regions, solution: cats };
    }

    /**
     * 关卡表：第 1 关教学无时限，其后加大棋盘并加倒计时
     * timeLimit 单位秒；0 = 无限制
     */
    function buildLevelTable() {
        const defs = [
            { id: 1, name: '新手教学', size: 4, seed: 20261019, timeLimit: 0, tutorial: true },
            { id: 2, name: '热身 4×4', size: 4, seed: 42, timeLimit: 0, tutorial: false },
            { id: 3, name: '进阶 5×5', size: 5, seed: 77, timeLimit: 120, tutorial: false },
            { id: 4, name: '挑战 6×6', size: 6, seed: 123, timeLimit: 100, tutorial: false },
            { id: 5, name: '高压 7×7', size: 7, seed: 456, timeLimit: 90, tutorial: false },
            { id: 6, name: '极限 8×8', size: 8, seed: 789, timeLimit: 75, tutorial: false }
        ];
        const levels = [];
        for (let i = 0; i < defs.length; i++) {
            const d = defs[i];
            const puzzle = generatePuzzle(d.size, d.seed);
            if (!puzzle) throw new Error('cat-puzzle: failed to generate level ' + d.id);
            levels.push({
                id: d.id,
                name: d.name,
                size: d.size,
                timeLimit: d.timeLimit,
                tutorial: d.tutorial,
                regions: puzzle.regions,
                solution: puzzle.solution,
                colors: REGION_COLORS.slice(0, d.size)
            });
        }
        return levels;
    }

    const LEVELS = buildLevelTable();

    const TUTORIAL_STEPS = [
        {
            id: 'intro',
            title: '欢迎来到猫咪逻辑',
            text: '目标：在彩色棋盘上放满猫咪。一共三条规则，我们一步步学。',
            ruleHighlight: -1
        },
        {
            id: 'color',
            title: '一种颜色一只猫',
            text: '每个相连的同色区域里，只能放恰好一只猫。点一下空格放下猫咪。',
            ruleHighlight: 0
        },
        {
            id: 'rowcol',
            title: '每行每列仅一只',
            text: '每一行、每一列也只能有一只猫——像皇后棋一样占位。',
            ruleHighlight: 1
        },
        {
            id: 'touch',
            title: '猫咪不能接触',
            text: '猫咪周围 8 格（含斜角）都不能再放另一只。再点一下可改成叉号辅助排除。',
            ruleHighlight: 2
        },
        {
            id: 'finish',
            title: '完成教学关',
            text: '把棋盘放满（进度条满格）且没有红框冲突，就过关啦！',
            ruleHighlight: -1
        }
    ];

    function getLevel(index) {
        if (index < 0 || index >= LEVELS.length) return null;
        return LEVELS[index];
    }

    function levelCount() {
        return LEVELS.length;
    }

    function createSession(levelIndex) {
        const level = getLevel(levelIndex);
        if (!level) return null;
        return {
            levelIndex: levelIndex,
            level: level,
            board: emptyBoard(level.size),
            remaining: level.timeLimit > 0 ? level.timeLimit : null,
            tutorialStep: level.tutorial ? 0 : -1,
            won: false,
            failed: false,
            failReason: null
        };
    }

    function applyTap(session, r, c) {
        if (!session || session.won || session.failed) return session;
        const n = session.level.size;
        if (r < 0 || c < 0 || r >= n || c >= n) return session;
        const next = {
            levelIndex: session.levelIndex,
            level: session.level,
            board: cloneBoard(session.board),
            remaining: session.remaining,
            tutorialStep: session.tutorialStep,
            won: false,
            failed: false,
            failReason: null
        };
        next.board[r][c] = cycleCell(next.board[r][c]);
        if (isSolved(next.level.regions, next.board)) {
            next.won = true;
        }
        return next;
    }

    function tickTimer(session, dtSec) {
        if (!session || session.won || session.failed) return session;
        if (session.remaining === null || session.remaining === undefined) return session;
        const left = session.remaining - dtSec;
        if (left <= 0) {
            return {
                levelIndex: session.levelIndex,
                level: session.level,
                board: session.board,
                remaining: 0,
                tutorialStep: session.tutorialStep,
                won: false,
                failed: true,
                failReason: 'time'
            };
        }
        return {
            levelIndex: session.levelIndex,
            level: session.level,
            board: session.board,
            remaining: left,
            tutorialStep: session.tutorialStep,
            won: false,
            failed: false,
            failReason: null
        };
    }

    function advanceTutorial(session) {
        if (!session || session.tutorialStep < 0) return session;
        const nextStep = session.tutorialStep + 1;
        return {
            levelIndex: session.levelIndex,
            level: session.level,
            board: session.board,
            remaining: session.remaining,
            tutorialStep: nextStep >= TUTORIAL_STEPS.length ? -1 : nextStep,
            won: session.won,
            failed: session.failed,
            failReason: session.failReason
        };
    }

    function catCount(board) {
        return listCats(board).length;
    }

    function conflictCellSet(conflicts) {
        const set = {};
        for (let i = 0; i < conflicts.length; i++) {
            const cells = conflicts[i].cells;
            for (let j = 0; j < cells.length; j++) {
                set[cells[j].r + ',' + cells[j].c] = true;
            }
        }
        return set;
    }

    global.CatPuzzle = {
        CELL: CELL,
        REGION_COLORS: REGION_COLORS,
        LEVELS: LEVELS,
        TUTORIAL_STEPS: TUTORIAL_STEPS,
        catsTouch: catsTouch,
        listCats: listCats,
        findConflicts: findConflicts,
        isSolved: isSolved,
        cycleCell: cycleCell,
        emptyBoard: emptyBoard,
        generatePuzzle: generatePuzzle,
        getLevel: getLevel,
        levelCount: levelCount,
        createSession: createSession,
        applyTap: applyTap,
        tickTimer: tickTimer,
        advanceTutorial: advanceTutorial,
        catCount: catCount,
        conflictCellSet: conflictCellSet,
        mulberry32: mulberry32
    };
})(typeof window !== 'undefined' ? window : globalThis);
