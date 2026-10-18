const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

require('../js/rng.js');
require('../js/pure.js');
const P = globalThis.GamePure;

// 载入 config.js（顶层 const：TILE / DIFFICULTY_TIERS），供测试访问
vm.runInThisContext(fs.readFileSync(__dirname + '/../js/config.js', 'utf8'), { filename: 'config.js' });

// 完整地图 seed 回归（REVIEW-2026-10-18 P1-7）：固定 seed 复现整张地图并验证可玩性
const SEEDS = 100;
const DIFFS = [0, 1, 2, 3, 4];
const LEVELS = [1, 2, 3];

function emptySpawnSpots(grid, rows, cols) {
    const spots = [];
    for (let r = 1; r < rows - 1; r++) {
        for (let c = 1; c < cols - 1; c++) {
            if (grid[r][c] === TILE.EMPTY && (r + c > 4)) spots.push({ c, r });
        }
    }
    return spots;
}

describe('calcEnemyCount 契约（地图测试前提）', () => {
    it('新手第 1 关 = 8', () => {
        assert.equal(P.calcEnemyCount(DIFFICULTY_TIERS[0], 1), 8);
    });
    it('困难2 第 1 关 = 145', () => {
        assert.equal(P.calcEnemyCount(DIFFICULTY_TIERS[4], 1), 145);
    });
});

describe('完整地图 seed 回归：100 seed × 5 难度 × 3 关', () => {
    let total = 0;
    let failures = [];

    for (const diff of DIFFS) {
        for (const level of LEVELS) {
            for (let seed = 1; seed <= SEEDS; seed++) {
                RNG.seed(seed);
                const { grid, portal } = P.generateMapGrid(DIFFICULTY_TIERS[diff], level, () => RNG.random(), TILE);
                RNG.reset();
                total++;

                const cols = DIFFICULTY_TIERS[diff].cols;
                const rws = DIFFICULTY_TIERS[diff].rows;

                // 1) 边界与固定墙合法
                let wallOk = true;
                for (let c = 0; c < cols; c++) {
                    if (grid[0][c] !== TILE.WALL || grid[rws - 1][c] !== TILE.WALL) wallOk = false;
                }
                for (let r = 0; r < rws; r++) {
                    if (grid[r][0] !== TILE.WALL || grid[r][cols - 1] !== TILE.WALL) wallOk = false;
                    for (let c = 0; c < cols; c++) {
                        if (r % 2 === 0 && c % 2 === 0) {
                            if (grid[r][c] !== TILE.WALL) wallOk = false;
                        }
                    }
                }
                if (!wallOk) failures.push(`seed=${seed} diff=${diff} lvl=${level} 墙结构异常`);

                // 2) 出生格 (1,1) 为空且不在障碍中
                if (grid[1][1] !== TILE.EMPTY) failures.push(`seed=${seed} diff=${diff} lvl=${level} 出生格非空`);

                // 3) 传送门存在且底层是障碍（正常关卡需炸箱进入），解析后可通行
                if (!portal) { failures.push(`seed=${seed} diff=${diff} lvl=${level} 无传送门`); continue; }
                const portalTile = grid[portal.row][portal.col];
                if (portalTile !== TILE.CRATE && portalTile !== TILE.FROST_CRATE) {
                    failures.push(`seed=${seed} diff=${diff} lvl=${level} 传送门不在木箱上 (tile=${portalTile})`);
                }

                // 4) 从出生区到传送门存在“可清障”路径（木箱/冰箱可炸开）
                const reachable = P.isReachableWithBombing(grid, rws, cols, { c: 1, r: 1 }, portal, TILE);
                if (!reachable) failures.push(`seed=${seed} diff=${diff} lvl=${level} 传送门不可达`);

                // 5) 敌人数 = min(target, 可用合法出生点)，且出生点不重叠、不落在出生安全区
                const emptySpots = emptySpawnSpots(grid, rws, cols);
                const target = P.calcEnemyCount(DIFFICULTY_TIERS[diff], level);
                const spots = P.pickSpawnSpots(emptySpots, target, () => 0.5); // rng 不影响数量
                const spawnedCount = spots.length;
                const expectedCount = Math.min(target, emptySpots.length);
                if (spawnedCount !== expectedCount) {
                    failures.push(`seed=${seed} diff=${diff} lvl=${level} 敌人数=${spawnedCount} 期望=${expectedCount} (target=${target}, spots=${emptySpots.length})`);
                }
                const keys = new Set(spots.map(s => `${s.c},${s.r}`));
                if (keys.size !== spots.length) failures.push(`seed=${seed} diff=${diff} lvl=${level} 出生点重复`);
                for (const s of spots) {
                    if (s.r + s.c <= 4) failures.push(`seed=${seed} diff=${diff} lvl=${level} 出生点落在安全区 (${s.c},${s.r})`);
                }
            }
        }
    }

    it(`共生成 ${total} 张完整地图，全部满足可玩性不变量`, () => {
        if (failures.length) {
            // 打印前 20 条失败以便本地复现
            console.error('地图可玩性失败样例：\n' + failures.slice(0, 20).join('\n'));
            throw new Error(`${failures.length} 张地图不满足可玩性不变量`);
        }
        assert.equal(failures.length, 0);
    });
});

describe('地图生成：新手第 1 关特殊保护', () => {
    it('新手第 1 关不生成藤蔓', () => {
        RNG.seed(42);
        const { grid } = P.generateMapGrid(DIFFICULTY_TIERS[0], 1, () => RNG.random(), TILE);
        RNG.reset();
        let vines = 0;
        for (const row of grid) for (const t of row) if (t === TILE.VINE) vines++;
        assert.equal(vines, 0, '新手第 1 关不应有藤蔓');
    });

    it('不同 seed 产生不同地图（随机性生效）', () => {
        RNG.seed(1);
        const a = P.generateMapGrid(DIFFICULTY_TIERS[1], 2, () => RNG.random(), TILE);
        RNG.reset();
        RNG.seed(2);
        const b = P.generateMapGrid(DIFFICULTY_TIERS[1], 2, () => RNG.random(), TILE);
        RNG.reset();
        assert.notDeepEqual(a.grid, b.grid, '不同 seed 应生成不同地图');
    });
});
