# 测试说明

## 运行

```bash
npm install       # 安装 devDependencies（含 tailwindcss，pretest 构建 CSS 需要）
npm run build     # 构建 Tailwind CSS（css/tailwind-built.css）
npm test          # 全部测试（node --test tests/，pretest 会先构建 CSS）
npm run check     # 全部 JS 语法检查
```

> 需要先 `npm install`：虽然测试逻辑只用 Node 18+ 内置的 `node:test`，但 `npm test` 的 `pretest`
> 会先执行 `npm run build:css`（依赖 `tailwindcss`），因此**零安装无法直接跑 npm test**。
> 仓库已提交 `package-lock.json`，CI 用 `npm ci` 复现同一依赖树。

## CI

- `.github/workflows/test.yml` 在每次 push 到 `main` 与 pull_request 时触发。
- 环境：**Node.js 20 LTS**，步骤为 `npm ci` → `npm run check` → `npm test`。
- 断言失败会让工作流失败（不吞退出码）；GitHub Pages 部署走独立流水线。

## 测试文件

| 文件 | 覆盖 |
|---|---|
| test-rng.js | 种子随机数：可复现性、reset、分布范围 |
| test-pure.js | 纯函数：敌人数量、出生点选择（20 seed 回归）、存档校验/迁移 |
| test-config.js | 难度配置健全性：字段合法、数量单调、新手 8 怪承诺、商店价格 |
| test-save.js | 存档：空/迁移/损坏/非法/不可用/重置 6 类用例 |
| test-smoke.js | 冒烟：JS 语法、HTML 关键 ID、JS↔HTML ID 交叉、零 emoji、脚本顺序 |
| test-tutorial.js | **教程状态机回归（修复 P0-1/2、P1-3）**：步骤推进不死锁、传送门格可通行、教学沙盒强制新手档 |
| test-map.js | **完整地图 seed 回归（修复 P1-7）**：100 seed × 5 难度 × 3 关，校验边界墙/出生格/传送门可达/敌人数=min(target,可用点) |

## 随机 seed 机制

- `js/rng.js` 提供全局 `RNG`：游戏默认 `Math.random`，测试用 `RNG.seed(n)` 固定。
- `spawnEnemies` 通过 `GamePure.pickSpawnSpots(spots, count, () => RNG.random())` 选点。
- `generateMapGrid(diffCfg, level, rng, TILE)` 接受可注入 `rng`，固定 seed 即可复现整张地图。
- **测试 seed 不影响真实玩家**：游戏启动时 `RNG` 处于非种子模式，`initLevel` 传入 `Math.random`。

## 失败排查

- 地图/出生点 seed 回归失败：看错误信息里的 `seed=N diff=D lvl=L`，用 `RNG.seed(N)` 本地复现。
- 教程测试失败：检查 `js/tutorial-core.js` 的 `evaluateTutorialStep` / `resolveTutorialPortalTile`。
- ID 交叉失败：`getElementById('x')` 在 game.js 存在但 index.html 缺少对应 `id="x"`。
- config 测试失败：检查 `js/config.js` 的 `DIFFICULTY_TIERS` / `SHOP_ITEMS`。

## 未覆盖（需真机/手工）

- Canvas 实际渲染、动画帧率
- iOS Safari / Android Chrome 触控、视口、旋转
- 音效播放、localStorage 真实读写
- 完整一局流程（见发布检查清单 / RELEASE-RESULTS.md）
