# 测试说明

## 运行

```bash
npm test          # 全部测试（node --test tests/）
npm run check     # 全部 JS 语法检查
```

无需安装依赖（只用 Node 18+ 内置 `node:test`）。CI 在每次 push / PR 自动跑。

## 测试文件

| 文件 | 覆盖 |
|---|---|
| test-rng.js | 种子随机数：可复现性、reset、分布范围 |
| test-pure.js | 纯函数：敌人数量、出生点选择（20 seed 回归）、存档校验/迁移 |
| test-config.js | 难度配置健全性：字段合法、数量单调、新手 8 怪承诺、商店价格 |
| test-spawn.js | 出生点选择回归（并入 test-pure.js 的 20 seed 用例） |
| test-smoke.js | 冒烟：JS 语法、HTML 关键 ID、JS↔HTML ID 交叉、零 emoji、脚本顺序 |

## 随机 seed 机制

- `js/rng.js` 提供全局 `RNG`：游戏默认 `Math.random`，测试用 `RNG.seed(n)` 固定。
- `spawnEnemies` 通过 `GamePure.pickSpawnSpots(spots, count, () => RNG.random())` 选点。
- **测试 seed 不影响真实玩家**：游戏启动时 `RNG` 处于非种子模式。

## 失败排查

- 某 seed 回归失败：看断言里的 `seed=N`，用 `RNG.seed(N)` 本地复现。
- ID 交叉失败：`getElementById('x')` 在 game.js 存在但 index.html 缺少对应 `id="x"`。
- config 测试失败：检查 `js/config.js` 的 `DIFFICULTY_TIERS` / `SHOP_ITEMS`。

## 未覆盖（需真机/手工）

- Canvas 实际渲染、动画帧率
- iOS Safari / Android Chrome 触控、视口、旋转
- 音效播放、localStorage 真实读写
- 完整一局流程（见发布检查清单）
