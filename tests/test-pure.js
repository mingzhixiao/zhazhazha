const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('../js/rng.js');
require('../js/pure.js');
const P = globalThis.GamePure;

describe('calcEnemyCount', () => {
    it('第 1 关 = baseEnemies', () => {
        assert.equal(P.calcEnemyCount({ baseEnemies: 8, perLevelAdd: 3 }, 1), 8);
    });
    it('后续关卡线性增长', () => {
        assert.equal(P.calcEnemyCount({ baseEnemies: 8, perLevelAdd: 3 }, 4), 17);
        assert.equal(P.calcEnemyCount({ baseEnemies: 145, perLevelAdd: 20 }, 2), 165);
    });
    it('非法输入回退为安全值', () => {
        assert.equal(P.calcEnemyCount({ baseEnemies: -5, perLevelAdd: 3 }, 1), 0);
        assert.equal(P.calcEnemyCount({ baseEnemies: 8 }, 0), 8);
    });
});

describe('pickSpawnSpots', () => {
    const mkSpots = (n) => Array.from({ length: n }, (_, i) => ({ c: i % 10, r: Math.floor(i / 10) }));

    it('点位充足时数量精确、无重复', () => {
        RNG.seed(7);
        const spots = P.pickSpawnSpots(mkSpots(50), 8, () => RNG.random());
        RNG.reset();
        assert.equal(spots.length, 8);
        const keys = spots.map(s => `${s.c},${s.r}`);
        assert.equal(new Set(keys).size, 8, '不能有重复出生点');
    });

    it('目标数超过空地数时按可用数截断（不再取模重叠）', () => {
        RNG.seed(7);
        const spots = P.pickSpawnSpots(mkSpots(5), 20, () => RNG.random());
        RNG.reset();
        assert.equal(spots.length, 5, '应截断为可用空地数');
        const keys = spots.map(s => `${s.c},${s.r}`);
        assert.equal(new Set(keys).size, 5, '截断后仍无重复');
    });

    it('空数组返回空数组', () => {
        assert.deepEqual(P.pickSpawnSpots([], 10, Math.random), []);
    });

    it('20 个固定 seed 回归：数量与唯一性', () => {
        const spots = mkSpots(100);
        for (let seed = 1; seed <= 20; seed++) {
            RNG.seed(seed);
            const picked = P.pickSpawnSpots(spots, 14, () => RNG.random());
            RNG.reset();
            assert.equal(picked.length, 14, `seed=${seed} 数量不符`);
            const keys = picked.map(s => `${s.c},${s.r}`);
            assert.equal(new Set(keys).size, 14, `seed=${seed} 有重复`);
            for (const s of picked) {
                assert.ok(s.c >= 0 && s.c < 10 && s.r >= 0 && s.r < 10, `seed=${seed} 坐标越界`);
            }
        }
    });
});

describe('validateSaveData', () => {
    it('合法数据通过', () => {
        const { data, errors } = P.validateSaveData({
            bestScore: 1234, totalKills: 56, totalCoinsEarned: 789, totalLevelsCleared: 3,
            upgrades: { bombCap: 2, fireRange: 1, speed: 0, lives: 0, startShield: 1 }
        });
        assert.equal(errors.length, 0);
        assert.equal(data.bestScore, 1234);
        assert.equal(data.upgrades.bombCap, 2);
    });

    it('null/损坏输入回退默认值', () => {
        for (const bad of [null, undefined, 'xxx', 42, []]) {
            const { data, errors } = P.validateSaveData(bad);
            assert.ok(errors.length > 0);
            assert.equal(data.bestScore, 0);
        }
    });

    it('非法数字被拒绝并记录', () => {
        const { data, errors } = P.validateSaveData({ bestScore: NaN, totalKills: -5, totalCoinsEarned: Infinity });
        assert.ok(errors.some(e => e.includes('bestScore')));
        assert.equal(data.bestScore, 0);
        assert.equal(data.totalKills, 0);
    });

    it('强化等级越界被截断', () => {
        const { data, errors } = P.validateSaveData({ upgrades: { bombCap: 99, startShield: 5 } });
        assert.equal(data.upgrades.bombCap, 5);
        assert.equal(data.upgrades.startShield, 1);
        assert.ok(errors.some(e => e.startsWith('clamped:')));
    });

    it('缺失字段用默认值补齐', () => {
        const { data } = P.validateSaveData({ bestScore: 100 });
        assert.equal(data.totalKills, 0);
        assert.equal(data.upgrades.fireRange, 0);
    });
});

describe('migrateSaveData', () => {
    it('无版本号视为 v1 并迁移到 v2', () => {
        const { data, migrated, errors } = P.migrateSaveData({ bestScore: 500 });
        assert.equal(migrated, true);
        assert.equal(data.schemaVersion, 2);
        assert.equal(data.bestScore, 500);
        assert.ok(errors.some(e => e.includes('migrated')));
    });

    it('已是 v2 不重复迁移', () => {
        const { migrated } = P.migrateSaveData({ schemaVersion: 2, bestScore: 1 });
        assert.equal(migrated, false);
    });
});
