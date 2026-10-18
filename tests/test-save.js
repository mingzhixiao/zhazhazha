const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

require('../js/rng.js');
require('../js/pure.js');

// localStorage stub
function makeStorage(initial = {}) {
    const store = { ...initial };
    return {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; },
        _store: store
    };
}

function loadSaveSystem(storage) {
    const sandbox = {
        localStorage: storage,
        window: {},
        setTimeout: () => {},
        GamePure: globalThis.GamePure,
        console
    };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    const src = fs.readFileSync(__dirname + '/../js/save.js', 'utf8')
        + '\n;globalThis.SaveSystem = SaveSystem;';
    vm.runInContext(src, sandbox, { filename: 'save.js' });
    return sandbox;
}

describe('SaveSystem', () => {
    it('空存储返回默认值', () => {
        const sb = loadSaveSystem(makeStorage());
        const s = new sb.SaveSystem();
        assert.equal(s.data.bestScore, 0);
        assert.equal(s.data.schemaVersion, 2);
        assert.equal(s.available, true);
    });

    it('合法旧存档（无版本号）迁移到 v2', () => {
        const storage = makeStorage({
            'chibi_bomberman_save_v2': JSON.stringify({ bestScore: 500, upgrades: { bombCap: 2 } })
        });
        const sb = loadSaveSystem(storage);
        const s = new sb.SaveSystem();
        assert.equal(s.data.bestScore, 500);
        assert.equal(s.data.schemaVersion, 2);
        assert.equal(s.data.upgrades.bombCap, 2);
    });

    it('损坏 JSON 备份后回退默认值', () => {
        const storage = makeStorage({ 'chibi_bomberman_save_v2': '{bad json' });
        const sb = loadSaveSystem(storage);
        const s = new sb.SaveSystem();
        assert.equal(s.data.bestScore, 0);
        assert.equal(storage._store['chibi_bomberman_save_v2_backup'], '{bad json');
        const report = s.getLoadReport();
        assert.equal(report.hadIssue, true);
    });

    it('字段非法被修复并备份', () => {
        const storage = makeStorage({
            'chibi_bomberman_save_v2': JSON.stringify({ bestScore: NaN, upgrades: { bombCap: 99 } })
        });
        // NaN 会被 JSON.stringify 转成 null
        const sb = loadSaveSystem(storage);
        const s = new sb.SaveSystem();
        assert.equal(s.data.bestScore, 0);
        assert.equal(s.data.upgrades.bombCap, 5);
    });

    it('localStorage 不可用时降级运行', () => {
        const broken = {
            getItem: () => { throw new Error('denied'); },
            setItem: () => { throw new Error('denied'); },
            removeItem: () => {}
        };
        const sb = loadSaveSystem(broken);
        const s = new sb.SaveSystem();
        assert.equal(s.available, false);
        assert.equal(s.data.bestScore, 0);
        assert.equal(s.save(), false, 'save 应返回 false 而非抛错');
        const report = s.getLoadReport();
        assert.equal(report.hadIssue, true);
    });

    it('reset 清空数据', () => {
        const storage = makeStorage({
            'chibi_bomberman_save_v2': JSON.stringify({ bestScore: 999, upgrades: { bombCap: 3 } })
        });
        const sb = loadSaveSystem(storage);
        const s = new sb.SaveSystem();
        s.reset();
        assert.equal(s.data.bestScore, 0);
        assert.equal(s.data.upgrades.bombCap, 0);
    });
});
