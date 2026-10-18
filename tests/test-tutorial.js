const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('../js/tutorial-core.js');
const T = globalThis.GameTutorial;

// 与 config.js 一致的本地 tile 常量（避免依赖浏览器脚本加载顺序）
const TILE = { EMPTY: 0, WALL: 1, CRATE: 2, FROST_CRATE: 3, VINE: 4 };

describe('evaluateTutorialStep：步骤推进（修复 P0-1 死锁）', () => {
    it('step0 到达目标 → 推进', () => {
        const res = T.evaluateTutorialStep({ step: 0, bombWasPlaced: false, wasHit: false, powerupCount: 0 },
            { atTarget: true, bombsActive: 0, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, 'advance');
    });

    it('step1 放弹后（bombsActive>0）→ 推进并标记 markBombPlaced', () => {
        const res = T.evaluateTutorialStep({ step: 1, bombWasPlaced: false, wasHit: false, powerupCount: 0 },
            { atTarget: false, bombsActive: 1, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, 'advance');
        assert.equal(res.markBombPlaced, true);
    });

    it('step2 放弹标记为真且炸弹消失（bombsActive===0）→ 推进（不死锁）', () => {
        const res = T.evaluateTutorialStep({ step: 2, bombWasPlaced: true, wasHit: false, powerupCount: 0 },
            { atTarget: false, bombsActive: 0, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, 'advance');
        assert.equal(res.feedback, '完美躲避！');
    });

    it('step2 放弹标记被错清零（bombWasPlaced=false）→ 不推进（这正是死锁根因）', () => {
        const res = T.evaluateTutorialStep({ step: 2, bombWasPlaced: false, wasHit: false, powerupCount: 0 },
            { atTarget: false, bombsActive: 0, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, null, '错误清零后不应推进，避免掩盖状态机缺陷');
    });

    it('step2 炸弹还在（bombsActive>0）→ 等待，不推进', () => {
        const res = T.evaluateTutorialStep({ step: 2, bombWasPlaced: true, wasHit: false, powerupCount: 0 },
            { atTarget: false, bombsActive: 1, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, null);
    });

    it('step2 被炸到 → 给出保护提示', () => {
        const res = T.evaluateTutorialStep({ step: 2, bombWasPlaced: true, wasHit: true, powerupCount: 0 },
            { atTarget: false, bombsActive: 0, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, 'advance');
        assert.ok(res.feedback.includes('保护'));
    });

    it('step3 道具被拾取（powerupsCount 减少）→ 推进', () => {
        const res = T.evaluateTutorialStep({ step: 3, bombWasPlaced: false, wasHit: false, powerupCount: 1 },
            { atTarget: false, bombsActive: 0, powerupsCount: 0, enemiesCount: 1 });
        assert.equal(res.action, 'advance');
    });

    it('step4 怪物清空（enemiesCount===0）→ 推进', () => {
        const res = T.evaluateTutorialStep({ step: 4, bombWasPlaced: false, wasHit: false, powerupCount: 0 },
            { atTarget: false, bombsActive: 0, powerupsCount: 1, enemiesCount: 0 });
        assert.equal(res.action, 'advance');
    });

    it('step5 到达传送门 → 完成', () => {
        const res = T.evaluateTutorialStep({ step: 5, bombWasPlaced: false, wasHit: false, powerupCount: 0 },
            { atTarget: true, bombsActive: 0, powerupsCount: 0, enemiesCount: 0 });
        assert.equal(res.action, 'complete');
    });

    it('step5 未到达 → 不完成', () => {
        const res = T.evaluateTutorialStep({ step: 5, bombWasPlaced: false, wasHit: false, powerupCount: 0 },
            { atTarget: false, bombsActive: 0, powerupsCount: 0, enemiesCount: 0 });
        assert.equal(res.action, null);
    });

    it('连续状态迁移：step1→2→3 不会在放弹后卡死', () => {
        // 模拟真实流程：step1 放弹（标记），切步不清除，step2 炸弹消失后推进
        let state = { step: 1, bombWasPlaced: false, wasHit: false, powerupCount: 0 };
        let world = { atTarget: false, bombsActive: 1, powerupsCount: 0, enemiesCount: 1 };
        let r = T.evaluateTutorialStep(state, world);
        assert.equal(r.action, 'advance');
        if (r.markBombPlaced) state.bombWasPlaced = true;
        state.step = 2; // 进入躲避步骤，标记必须保留
        world = { atTarget: false, bombsActive: 0, powerupsCount: 0, enemiesCount: 1 };
        r = T.evaluateTutorialStep(state, world);
        assert.equal(r.action, 'advance', 'step2 在炸弹消失后应推进，不得死锁');
    });
});

describe('resolveTutorialPortalTile：传送门格可通行（修复 P0-2）', () => {
    function gridWithPortal(tileAtPortal) {
        const g = Array.from({ length: 5 }, () => Array(5).fill(TILE.EMPTY));
        g[2][2] = tileAtPortal; // 传送门所在格
        return g;
    }

    it('传送门在木箱上 → 解析为可通行 EMPTY', () => {
        const g = gridWithPortal(TILE.CRATE);
        const portal = { col: 2, row: 2 };
        const { grid, cleared } = T.resolveTutorialPortalTile(g, portal, TILE);
        assert.equal(cleared, true);
        assert.equal(grid[2][2], TILE.EMPTY);
        // 原始 grid 不被修改（纯函数）
        assert.equal(g[2][2], TILE.CRATE);
    });

    it('传送门在冰箱上 → 解析为可通行 EMPTY', () => {
        const g = gridWithPortal(TILE.FROST_CRATE);
        const { grid, cleared } = T.resolveTutorialPortalTile(g, { col: 2, row: 2 }, TILE);
        assert.equal(cleared, true);
        assert.equal(grid[2][2], TILE.EMPTY);
    });

    it('传送门已在空地 → 无需清理', () => {
        const g = gridWithPortal(TILE.EMPTY);
        const { grid, cleared } = T.resolveTutorialPortalTile(g, { col: 2, row: 2 }, TILE);
        assert.equal(cleared, false);
        assert.equal(grid[2][2], TILE.EMPTY);
    });

    it('无传送门 → 原样返回', () => {
        const g = gridWithPortal(TILE.EMPTY);
        const { grid, cleared } = T.resolveTutorialPortalTile(g, null, TILE);
        assert.equal(cleared, false);
        assert.equal(grid, g);
    });
});

describe('tutorialDifficultyPair：教学沙盒强制新手档（修复 P1-3）', () => {
    it('选了困难2 → 沙盒用新手(0)，恢复用困难2', () => {
        const pair = T.tutorialDifficultyPair(4);
        assert.equal(pair.sandbox, 0);
        assert.equal(pair.restore, 4);
    });

    it('未选择（undefined）→ 沙盒与恢复都用新手(0)', () => {
        const pair = T.tutorialDifficultyPair(undefined);
        assert.equal(pair.sandbox, 0);
        assert.equal(pair.restore, 0);
    });

    it('沙盒档始终是新手', () => {
        assert.equal(T.tutorialSandboxDifficultyIndex(), 0);
    });
});
