const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

require('../js/rng.js');

describe('RNG', () => {
    it('默认使用 Math.random，非种子模式', () => {
        RNG.reset();
        assert.equal(RNG.isSeeded(), false);
        const v = RNG.random();
        assert.ok(v >= 0 && v < 1, 'random() 返回 [0,1)');
    });

    it('固定 seed 产生可复现序列', () => {
        RNG.seed(12345);
        const a = [RNG.random(), RNG.random(), RNG.random()];
        RNG.seed(12345);
        const b = [RNG.random(), RNG.random(), RNG.random()];
        assert.deepEqual(a, b, '相同 seed 序列必须一致');
        RNG.reset();
    });

    it('不同 seed 产生不同序列', () => {
        RNG.seed(1);
        const a = RNG.random();
        RNG.seed(2);
        const b = RNG.random();
        assert.notEqual(a, b, '不同 seed 应大概率不同');
        RNG.reset();
    });

    it('reset 后恢复非种子模式', () => {
        RNG.seed(999);
        assert.equal(RNG.isSeeded(), true);
        RNG.reset();
        assert.equal(RNG.isSeeded(), false);
    });

    it('seed 序列分布在 [0,1) 内', () => {
        RNG.seed(42);
        for (let i = 0; i < 1000; i++) {
            const v = RNG.random();
            assert.ok(v >= 0 && v < 1, `第 ${i} 个值越界: ${v}`);
        }
        RNG.reset();
    });
});
