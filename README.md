# Q版炸弹人大冒险 (zhazhazha)

手机/PC 双端可玩的网页炸弹人游戏：放弹爆破、怪物围堵、特化怪技能、强化商店、永久成长。

**在线试玩**：https://mingzhixiao.github.io/zhazhazha/（GitHub Pages，已验证可访问）

## 玩法

清光每关的怪物军团，进入传送门过关。炸木箱开道具、金币去商店永久强化自己。

### 操作

| 桌面端 | 移动端 |
|---|---|
| WASD / 方向键：移动 | 虚拟摇杆 / 十字键 / 手势滑动：移动 |
| 空格 / J：放炸弹 | 放炸弹按钮：放弹 |
| K / E：引爆遥控炸弹 | 引爆按钮：引爆 |
| L：全屏超必杀（魔力满 5 点） | 必杀按钮 |
| P：暂停，F：全屏，F3：性能面板 | 顶部按钮：暂停/音效/重玩 |

### 难度

新手（8怪）→ 简单（14怪）→ 中等（20精英）→ 困难1（68怪）→ 困难2（145怪）。
新手档有教学引导、延长保护、每关一次复活、降低的道具惩罚。

### 逻辑布阵（独立玩法）

首页顶部「逻辑布阵」进入独立解谜模式：在连通地块中部署炸弹，**每区一颗、每行每列各一颗、八向不得相邻**。共 100 关，棋盘从 4×4 逐步扩展到 9×9；点击格子循环「部署 → 标记 → 撤回」，提供提示、自动标记、清除标记与重置。

### 存档

- 位置：浏览器 `localStorage`（key: `chibi_bomberman_save_v2`），**仅本地，不跨设备同步**
- 内容：最高分、生涯统计（击杀/金币/通关）、商店永久强化
- 存储不可用时游戏仍可玩，本次进度不保存；损坏数据会自动备份并恢复默认值
- 生涯浮层可重置存档（二次确认）

## 本地运行

```bash
# 直接打开
open index.html

# 或启动静态服务器
npx serve .
```

## 开发

```bash
npm install     # 安装 devDependencies（含 tailwindcss，用于构建 CSS）
npm run build   # 构建 Tailwind CSS（css/tailwind-built.css）
npm test        # 自动化测试（node --test，pretest 会先构建 CSS，需先 npm install）
npm run check   # JS 语法检查
```

> 注意：`npm test` 的 `pretest` 会先运行 `npm run build:css`（依赖 `tailwindcss`），因此**需要先 `npm install` 安装依赖**，不能“零安装”直接跑。仓库已提交 `package-lock.json`，CI 使用 `npm ci` 复现同一依赖树。

## 测试与 CI

- 测试说明见 `tests/README.md`。
- CI：`.github/workflows/test.yml` 在每次 push 到 `main` 与 pull_request 时触发，使用 **Node.js 20 LTS**，依次执行 `npm ci` → `npm run check` → `npm test`；任一断言失败即导致工作流失败，不会吞掉退出码。
- GitHub Pages 部署走独立流水线，不与单元测试混淆。

代码审查报告：`REVIEW-2026-10-18.md`；RC 验收：`RELEASE-RESULTS.md`。

## 文件结构

```
index.html          # 主线页面结构
logic-mode.html     # 独立玩法：逻辑布阵（1–100 关）
assets/
  fonts/            # 自托管 Fredoka（OFL 授权），不依赖境外 CDN
css/
  style.css         # 自定义样式（含移动端 / MOBA / 旋转模式）
  tailwind-built.css# Tailwind 构建产物（npm run build 生成）
  tailwind-input.css# Tailwind 输入
js/
  rng.js            # 可注入随机数（测试 seed）
  pure.js           # 可测试纯函数（数值/存档校验/出生点/地图生成）
  tutorial-core.js  # 教程状态机纯逻辑（步骤推进/传送门解析/难度沙盒）
  config.js         # 常量：地图/道具/难度/商店配置
  sprites.js        # 预渲染贴图：地板/墙体/木箱/冰块/藤蔓/爆炸帧
  audio.js          # Web Audio 合成音效
  save.js           # 本地存档（版本化/校验/备份）
  ui.js             # UI Mixin：布局/商店/弹层/音效图标
  render.js         # Canvas 绘制与矢量图标
  enemy-skills.js   # 特化怪技能
  tutorial.js       # 新手教学运行时
  game.js           # 游戏主引擎
tests/              # 自动化测试（145 用例）
qa/
  h5-audit.js       # 多机型布局体检（尺寸/留白/单格像素/溢出/报错）
  h5-perf.js        # H5 性能验收（CPU 降速 + 高分屏 + 145 怪大地图）
  h5-verify.js      # 裁切边界/爆炸/横屏/小屏回归验证
```

## 移动端（H5）适配

游戏以手机竖屏为主要场景，已按 320~430px 宽度分档适配：

- **棋盘铺满屏宽**：地图最外圈是纯装饰外墙，竖屏小地图下会把这圈裁掉，
  可玩区 11×9 正好填满屏宽，单格比原来大 16~19%
- **高分屏渲染**：画布按 `CSS 尺寸 × devicePixelRatio` 渲染（2.0MP 预算），
  dpr3 手机上不再被放大拉伸
- **自适应画质**：实战帧率连续低于 45fps 会自动降采样保手感，恢复后自动升回
- **屏幕常亮**：实战中持有 Wake Lock，回到菜单即释放
- **触控尺寸**：摇杆 130px、放弹 84px（320×568 超矮屏自动退一档）
- **横屏**：自动切换 MOBA 三栏布局；也可点顶部旋转按钮"竖握横玩"
- **启动占位**：弱网下先显示纯 CSS 炸弹 logo，不白屏

验收截图见 `docs/h5-adapt-2026-10-24/`。

## 已知限制

- 需要真机验证：iOS Safari / Android Chrome 的触控手感、刘海安全区、微信内置浏览器（见发布检查清单）
- 困难2（145怪）在低端手机会触发自适应降画质（属预期行为），可按 F3 或 `?perf=1` 查看性能面板
- 大地图（41×35）不启用"裁外墙放大"：视野本身在滚动，裁边会露出残缺墙面
- 无外部字体/图片依赖，断网可完整运行

## 反馈

通过 GitHub Issues 反馈：https://github.com/mingzhixiao/zhazhazha/issues

## 许可证

待定（作者未决定，暂不标注）。
