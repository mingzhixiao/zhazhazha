const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('../js/cat-puzzle-core.js');
const C = globalThis.CatPuzzle;

describe('CatPuzzle 核心规则', () => {
    it('关卡表生成且每关解可验证', () => {
        assert.equal(C.levelCount(), 6);
        for (let i = 0; i < C.levelCount(); i++) {
            const L = C.getLevel(i);
            assert.ok(L, 'level ' + (i + 1));
            assert.equal(L.size, L.regions.length);
            const board = C.emptyBoard(L.size);
            L.solution.forEach(function (p) { board[p.r][p.c] = C.CELL.CAT; });
            assert.equal(C.isSolved(L.regions, board), true, L.name + ' 解应合法');
        }
    });

    it('第1关为教学且无时限，后续有时限且尺寸递增', () => {
        const L1 = C.getLevel(0);
        assert.equal(L1.tutorial, true);
        assert.equal(L1.timeLimit, 0);
        let prev = L1.size;
        for (let i = 1; i < C.levelCount(); i++) {
            const L = C.getLevel(i);
            assert.ok(L.size >= prev);
            if (i >= 2) assert.ok(L.timeLimit > 0, L.name + ' 应有倒计时');
            prev = L.size;
        }
    });

    it('同行两猫触发 row 冲突', () => {
        const regions = [
            [0, 0, 1, 1],
            [0, 2, 1, 1],
            [3, 2, 2, 1],
            [3, 3, 2, 1]
        ];
        const board = C.emptyBoard(4);
        board[0][0] = C.CELL.CAT;
        board[0][2] = C.CELL.CAT;
        const res = C.findConflicts(regions, board);
        assert.equal(res.ok, false);
        assert.ok(res.conflicts.some(function (c) { return c.type === 'row'; }));
    });

    it('对角相邻触发 touch 冲突', () => {
        const regions = [
            [0, 1, 1, 2],
            [0, 0, 2, 2],
            [3, 3, 2, 2],
            [3, 3, 3, 2]
        ];
        const board = C.emptyBoard(4);
        board[0][0] = C.CELL.CAT;
        board[1][1] = C.CELL.CAT;
        const res = C.findConflicts(regions, board);
        assert.ok(res.conflicts.some(function (c) { return c.type === 'touch'; }));
    });

    it('cycleCell 空→猫→叉→空', () => {
        assert.equal(C.cycleCell(C.CELL.EMPTY), C.CELL.CAT);
        assert.equal(C.cycleCell(C.CELL.CAT), C.CELL.MARK);
        assert.equal(C.cycleCell(C.CELL.MARK), C.CELL.EMPTY);
    });

    it('applyTap 放满合法解后 won=true', () => {
        let s = C.createSession(1);
        assert.ok(s);
        const sol = s.level.solution;
        for (let i = 0; i < sol.length; i++) {
            s = C.applyTap(s, sol[i].r, sol[i].c);
        }
        assert.equal(s.won, true);
        assert.equal(C.isSolved(s.level.regions, s.board), true);
    });

    it('tickTimer 耗尽后 failed=time', () => {
        let s = C.createSession(2);
        assert.ok(s.remaining > 0);
        s = C.tickTimer(s, s.remaining + 1);
        assert.equal(s.failed, true);
        assert.equal(s.failReason, 'time');
    });

    it('教学步骤可推进到结束', () => {
        let s = C.createSession(0);
        assert.equal(s.tutorialStep, 0);
        for (let i = 0; i < C.TUTORIAL_STEPS.length; i++) {
            s = C.advanceTutorial(s);
        }
        assert.equal(s.tutorialStep, -1);
    });

    it('同 seed 生成可复现', () => {
        const a = C.generatePuzzle(5, 77);
        const b = C.generatePuzzle(5, 77);
        assert.deepEqual(a.regions, b.regions);
        assert.deepEqual(a.solution, b.solution);
    });
});
