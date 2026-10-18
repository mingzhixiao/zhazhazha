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

            global.GamePure = {
                calcEnemyCount,
                pickSpawnSpots,
                SAVE_SCHEMA_VERSION,
                SAVE_KEY,
                UPGRADE_MAX,
                saveDefaults,
                validateSaveData,
                migrateSaveData
            };
        })(typeof window !== 'undefined' ? window : globalThis);
