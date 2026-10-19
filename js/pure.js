        /**
         * ============================================================================
         * 纯函数模块：可独立单元测试的游戏逻辑（无 DOM、无 canvas、无副作用）
         * 浏览器通过 <script> 直接加载；Node 测试通过 require/globalThis 使用。
         * ============================================================================
         */
        (function (global) {
            // ---------- 敌人数量 ----------
            function calcEnemyCount(diffCfg, levelNum) {
                const base = Math.max(0, Math.floor(diffCfg.baseEnemies) || 0);
                const add = Math.max(0, Math.floor(diffCfg.perLevelAdd) || 0);
                const lvl = Math.max(1, Math.floor(levelNum) || 1);
                return base + (lvl - 1) * add;
            }

            // ---------- 出生点选择：洗牌后取前 N 个，不重复、不取模重叠 ----------
            // spots: [{c, r}]，count: 目标数，rng: () => [0,1)
            // 返回至多 min(count, spots.length) 个不重复点位
            function pickSpawnSpots(spots, count, rng) {
                const arr = spots.slice();
                for (let i = arr.length - 1; i > 0; i--) {
                    const j = Math.floor(rng() * (i + 1));
                    const tmp = arr[i];
                    arr[i] = arr[j];
                    arr[j] = tmp;
                }
                const n = Math.max(0, Math.min(Math.floor(count) || 0, arr.length));
                return arr.slice(0, n);
            }

            // ---------- 地图生成：可在 Node 中测试的纯函数（对应 REVIEW-2026-10-18 的 P1-7 / P2-8） ----------
            // 复刻 game.js:initLevel 的网格/藤蔓/传送门/金袋逻辑，但随机数由可注入的 rng 提供，
            // 以便固定 seed 复现完整关卡、并对“可通关性”做断言。
            // TILE: { EMPTY, WALL, CRATE, FROST_CRATE, VINE }
            // 返回 { grid, crateSlots, portal, goldenCrate }
            function generateMapGrid(diffCfg, levelNum, rng, TILE) {
                const cols = diffCfg.cols;
                const rows = diffCfg.rows;
                const grid = [];
                const crateSlots = [];

                for (let r = 0; r < rows; r++) {
                    grid[r] = [];
                    for (let c = 0; c < cols; c++) {
                        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
                            grid[r][c] = TILE.WALL;
                        } else if (r % 2 === 0 && c % 2 === 0) {
                            grid[r][c] = TILE.WALL;
                        } else {
                            const isSpawnZone = (r <= 2 && c <= 2);
                            if (!isSpawnZone && rng() < diffCfg.crateDensity) {
                                grid[r][c] = rng() < diffCfg.frostChance ? TILE.FROST_CRATE : TILE.CRATE;
                                crateSlots.push({ c, r });
                            } else {
                                grid[r][c] = TILE.EMPTY;
                            }
                        }
                    }
                }

                if (crateSlots.length === 0) {
                    grid[rows - 2][cols - 2] = TILE.CRATE;
                    crateSlots.push({ c: cols - 2, r: rows - 2 });
                }

                // 新手第 1 关不生成藤蔓，避免刚学移动就被减速干扰
                const vineTarget = (diffCfg.id === 0 && levelNum === 1) ? 0 : diffCfg.initialVines;
                let vinesPlaced = 0;
                for (let tries = 0; tries < 250 && vinesPlaced < vineTarget; tries++) {
                    const rc = 1 + Math.floor(rng() * (cols - 2));
                    const rr = 1 + Math.floor(rng() * (rows - 2));
                    if (grid[rr][rc] === TILE.EMPTY && (rc + rr > 5)) {
                        grid[rr][rc] = TILE.VINE;
                        vinesPlaced++;
                    }
                }

                const idx = Math.floor(rng() * crateSlots.length);
                const slot = crateSlots[idx];
                const portal = {
                    col: slot.c,
                    row: slot.r,
                    revealed: false,
                    active: false,
                    lockedHintCooldown: 0
                };

                const otherSlots = crateSlots.filter(s => !(s.c === slot.c && s.r === slot.r));
                let goldenCrate = null;
                if (otherSlots.length > 0) {
                    const gSlot = otherSlots[Math.floor(rng() * otherSlots.length)];
                    goldenCrate = {
                        col: gSlot.c,
                        row: gSlot.r,
                        amount: 25 + Math.floor(rng() * 26) + (levelNum - 1) * 5
                    };
                }

                // 保证从出生区到传送门存在“可清障”路径；正常网格在数学上必连通，
                // 这里做兜底：极端/未来配置下若不可达则强制开一条通路。
                ensurePortalReachable(grid, portal, rows, cols, TILE);

                return { grid, crateSlots, portal, goldenCrate };
            }

            // 玩家可从 (1,1) 到达传送门：木箱/冰箱可炸开（通行），WALL 不可。
            function isReachableWithBombing(grid, rows, cols, start, target, TILE) {
                const passable = (t) =>
                    (t === TILE.EMPTY || t === TILE.CRATE || t === TILE.FROST_CRATE || t === TILE.VINE);
                if (start.c === target.col && start.r === target.row) return true;
                const visited = new Set([start.r + ',' + start.c]);
                const queue = [start];
                const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
                while (queue.length) {
                    const cur = queue.shift();
                    for (const [dc, dr] of dirs) {
                        const nc = cur.c + dc;
                        const nr = cur.r + dr;
                        if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
                        const key = nr + ',' + nc;
                        if (visited.has(key)) continue;
                        if (!passable(grid[nr][nc])) continue;
                        if (nc === target.col && nr === target.row) return true;
                        visited.add(key);
                        queue.push({ c: nc, r: nr });
                    }
                }
                return false;
            }

            function ensurePortalReachable(grid, portal, rows, cols, TILE) {
                if (!portal) return;
                const start = { c: 1, r: 1 };
                if (isReachableWithBombing(grid, rows, cols, start, portal, TILE)) return;
                // 兜底：沿曼哈顿 L 形路径清障（仅在非 WALL 格上开道，WALL 无法清除时改走相邻行）
                const clearTo = (c, r) => {
                    if (c <= 0 || r <= 0 || c >= cols - 1 || r >= rows - 1) return;
                    if (grid[r][c] !== TILE.WALL) grid[r][c] = TILE.EMPTY;
                };
                let c = start.c, r = start.r;
                while (c !== portal.col) {
                    c += (portal.col > c ? 1 : -1);
                    clearTo(c, r);
                }
                while (r !== portal.row) {
                    r += (portal.row > r ? 1 : -1);
                    clearTo(c, r);
                }
                // 二次确认，仍不可达则告警（不应发生）
                if (!isReachableWithBombing(grid, rows, cols, start, portal, TILE)) {
                    // 极端兜底：直接打通整行1与传送门所在列
                    for (let cc = 1; cc < cols - 1; cc++) clearTo(cc, 1);
                    for (let rr = 1; rr < rows - 1; rr++) clearTo(portal.col, rr);
                }
            }

            // ---------- 存档：schema / 默认值 / 校验 / 迁移 ----------
            const SAVE_SCHEMA_VERSION = 2;
            const SAVE_KEY = 'chibi_bomberman_save_v2';

            function saveDefaults() {
                return {
                    schemaVersion: SAVE_SCHEMA_VERSION,
                    bestScore: 0,
                    totalKills: 0,
                    totalCoinsEarned: 0,
                    totalLevelsCleared: 0,
                    upgrades: {
                        bombCap: 0,
                        fireRange: 0,
                        speed: 0,
                        lives: 0,
                        startShield: 0
                    }
                };
            }

            // 强化等级上限（与 SHOP_ITEMS 对应：每项最多 5 级）
            // 与 config.js SHOP_ITEMS 的 max 对齐
            const UPGRADE_MAX = {
                bombCap: 5, fireRange: 5, speed: 4, lives: 3, startShield: 1
            };

            function isValidNumber(v) {
                return typeof v === 'number' && Number.isFinite(v) && v >= 0;
            }

            // 校验并修复：返回 { data, errors[] }，data 恒为可用结构
            function validateSaveData(input) {
                const errors = [];
                const base = saveDefaults();

                if (!input || typeof input !== 'object' || Array.isArray(input)) {
                    errors.push('not-an-object');
                    return { data: base, errors };
                }

                const data = saveDefaults();

                for (const k of ['bestScore', 'totalKills', 'totalCoinsEarned', 'totalLevelsCleared']) {
                    if (isValidNumber(input[k])) {
                        data[k] = Math.floor(input[k]);
                    } else if (input[k] !== undefined) {
                        errors.push(`invalid:${k}`);
                    }
                }

                const up = (input.upgrades && typeof input.upgrades === 'object') ? input.upgrades : {};
                for (const k of Object.keys(UPGRADE_MAX)) {
                    const max = UPGRADE_MAX[k];
                    if (isValidNumber(up[k])) {
                        data.upgrades[k] = Math.min(max, Math.floor(up[k]));
                        if (Math.floor(up[k]) > max) errors.push(`clamped:${k}`);
                    } else if (up[k] !== undefined) {
                        errors.push(`invalid:upgrades.${k}`);
                    }
                }

                if (typeof input.schemaVersion === 'number') {
                    data.schemaVersion = Math.floor(input.schemaVersion);
                }

                return { data, errors };
            }

            // 旧版本迁移：v1（无 schemaVersion）→ v2；未知版本 → 按当前校验
            function migrateSaveData(input) {
                const { data, errors } = validateSaveData(input);
                if (!input || typeof input !== 'object') {
                    return { data, errors, migrated: false };
                }
                const fromV = (typeof input.schemaVersion === 'number') ? Math.floor(input.schemaVersion) : 1;
                const migrated = fromV !== SAVE_SCHEMA_VERSION;
                data.schemaVersion = SAVE_SCHEMA_VERSION;
                if (migrated) errors.push(`migrated:v${fromV}->v${SAVE_SCHEMA_VERSION}`);
                return { data, errors, migrated };
            }

            // ---------- 穿墙脱离与防卡死：纯函数判定与安全点位搜索 ----------
            function isBoxOverlappingCrate(grid, rows, cols, x, y, r, TILE, tileSize = 60) {
                const minCol = Math.floor((x - r + 0.1) / tileSize);
                const maxCol = Math.floor((x + r - 0.1) / tileSize);
                const minRow = Math.floor((y - r + 0.1) / tileSize);
                const maxRow = Math.floor((y + r - 0.1) / tileSize);

                for (let rIdx = minRow; rIdx <= maxRow; rIdx++) {
                    for (let cIdx = minCol; cIdx <= maxCol; cIdx++) {
                        if (rIdx >= 0 && rIdx < rows && cIdx >= 0 && cIdx < cols) {
                            const tile = grid[rIdx][cIdx];
                            if (tile === TILE.CRATE || tile === TILE.FROST_CRATE) {
                                return true;
                            }
                        }
                    }
                }
                return false;
            }

            function findNearestWalkableTile(grid, rows, cols, startCol, startRow, bombPositions, TILE) {
                const queue = [{ c: startCol, r: startRow }];
                const visited = new Set([`${startCol},${startRow}`]);
                const dirs = [
                    { dc: 0, dr: -1 },
                    { dc: 0, dr: 1 },
                    { dc: -1, dr: 0 },
                    { dc: 1, dr: 0 }
                ];

                const bombSet = new Set((bombPositions || []).map(b => `${b.col},${b.row}`));

                while (queue.length > 0) {
                    const cur = queue.shift();
                    const tile = grid[cur.r] && grid[cur.r][cur.c];
                    const isSolid = (tile === TILE.WALL || tile === TILE.CRATE || tile === TILE.FROST_CRATE);
                    const hasBomb = bombSet.has(`${cur.c},${cur.r}`);

                    if (!isSolid && !hasBomb && cur.c > 0 && cur.c < cols - 1 && cur.r > 0 && cur.r < rows - 1) {
                        return cur;
                    }

                    for (const d of dirs) {
                        const nc = cur.c + d.dc;
                        const nr = cur.r + d.dr;
                        const key = `${nc},${nr}`;
                        if (nc <= 0 || nc >= cols - 1 || nr <= 0 || nr >= rows - 1) continue;
                        if (visited.has(key)) continue;
                        if (grid[nr][nc] === TILE.WALL) continue;
                        visited.add(key);
                        queue.push({ c: nc, r: nr });
                    }
                }
                return null;
            }

            global.GamePure = {
                calcEnemyCount,
                pickSpawnSpots,
                generateMapGrid,
                isReachableWithBombing,
                isBoxOverlappingCrate,
                findNearestWalkableTile,
                SAVE_SCHEMA_VERSION,
                SAVE_KEY,
                UPGRADE_MAX,
                saveDefaults,
                validateSaveData,
                migrateSaveData
            };
        })(typeof window !== 'undefined' ? window : globalThis);
