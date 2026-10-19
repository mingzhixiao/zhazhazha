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

### 特别模式 · 猫咪逻辑

首页「特别模式 · 猫咪逻辑」：在彩色区域棋盘上放置猫咪（类似皇后/色块逻辑谜题）。

- 规则：一种颜色一只猫；每行每列仅一只；猫咪不能接触（含对角）
- 第 1 关新手教学（分步讲解三条规则，无时限）
- 之后逐步加大棋盘（4×4 → 8×8）并加入倒计时
- 点格子循环：放猫 → 标叉 → 清空；冲突格红框提示

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
index.html        # 页面结构
css/
  style.css         # 自定义样式
  tailwind-built.css# Tailwind 构建产物（npm run build 生成）
  tailwind-input.css# Tailwind 输入
js/
  rng.js            # 可注入随机数（测试 seed）
  pure.js           # 可测试纯函数（数值/存档校验/出生点/地图生成）
  tutorial-core.js  # 教程状态机纯逻辑（步骤推进/传送门解析/难度沙盒）
  cat-puzzle-core.js# 特别模式：猫咪逻辑纯规则/关卡生成
  cat-puzzle.js     # 特别模式 UI
  config.js         # 常量：地块/道具/难度/商店配置
  audio.js          # Web Audio 合成音效
  save.js           # 本地存档（版本化/校验/备份）
  game.js           # 游戏主引擎
tests/              # 自动化测试
```

## 已知限制

- 需要真机验证：iOS Safari / Android Chrome 的触控手感、视口裁切（见发布检查清单）
- 困难2（145怪）在低端手机可能掉帧，可按 F3 或 `?perf=1` 查看性能面板
- Google Fonts 加载失败时回退到系统字体

## 反馈

通过 GitHub Issues 反馈：https://github.com/mingzhixiao/zhazhazha/issues

## 许可证

待定（作者未决定，暂不标注）。
