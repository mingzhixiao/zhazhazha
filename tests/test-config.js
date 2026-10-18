const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// config.js 是浏览器 classic script（顶层 const），用 vm 载入后取全局词法作用域
const src = fs.readFileSync(__dirname + '/../js/config.js', 'utf8');
vm.runInThisContext(src, { filename: 'config.js' });

describe('DIFFICULTY_TIERS 配置健全性', () => {
    it('5 档难度齐全', () => {
        assert.equal(DIFFICULTY_TIERS.length, 5);
    });

    it('每档关键字段合法', () => {
        for (const t of DIFFICULTY_TIERS) {
            assert.ok(t.cols > 0 && t.rows > 0, `${t.name} 地图尺寸`);
            assert.ok(t.baseEnemies > 0, `${t.name} baseEnemies`);
            assert.ok(t.perLevelAdd >= 0, `${t.name} perLevelAdd`);
            assert.ok(t.eliteRatio >= 0 && t.eliteRatio <= 1, `${t.name} eliteRatio 越界`);
            assert.ok(t.specialistRatio >= 0 && t.specialistRatio <= 1, `${t.name} specialistRatio 越界`);
            assert.ok(t.speedMult > 0, `${t.name} speedMult`);
            assert.ok(t.frostChance >= 0 && t.frostChance <= 1, `${t.name} frostChance`);
            assert.ok(t.crateDensity >= 0 && t.crateDensity <= 1, `${t.name} crateDensity`);
        }
    });

    it('敌人数量随难度单调递增', () => {
        const counts = DIFFICULTY_TIERS.map(t => t.baseEnemies);
        for (let i = 1; i < counts.length; i++) {
            assert.ok(counts[i] > counts[i - 1], `第 ${i} 档应比上一档多: ${counts}`);
        }
    });

    it('新手档第 1 关为 8 只（宣传承诺）', () => {
        const rookie = DIFFICULTY_TIERS[0];
        assert.equal(rookie.baseEnemies, 8);
    });

    it('SHOP_ITEMS 价格与等级上限合法', () => {
        assert.ok(SHOP_ITEMS.length > 0);
        for (const item of SHOP_ITEMS) {
            assert.ok(item.max > 0, `${item.key} max`);
            assert.ok(item.baseCost > 0, `${item.key} baseCost`);
            assert.ok(item.costMul >= 1, `${item.key} costMul`);
            // 价格公式单调递增
            let prev = 0;
            for (let lv = 0; lv < item.max; lv++) {
                const cost = getUpgradeCost(item, lv);
                assert.ok(cost > prev, `${item.key} lv${lv} 价格应递增`);
                prev = cost;
            }
            assert.equal(getUpgradeCost(item, item.max), null, `${item.key} 满级后应返回 null`);
        }
    });
});
