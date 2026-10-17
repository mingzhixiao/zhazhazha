        /**
         * ============================================================================
         * 3. 游戏常量、五档难度阶梯与道具定义
         * ============================================================================
         */
        const VIEW_COLS = 13;
        const VIEW_ROWS = 11;
        const TILE_SIZE = 60;

        const TILE = {
            EMPTY: 0,
            WALL: 1,
            CRATE: 2,
            FROST_CRATE: 3,
            VINE: 4
        };

        const POWERUP_TYPE = {
            BOMB_UP: 'BOMB_UP',
            FIRE_UP: 'FIRE_UP',
            SPEED_UP: 'SPEED_UP',
            SHIELD: 'SHIELD',
            REMOTE_BOMB: 'REMOTE_BOMB',
            GHOST_CAPE: 'GHOST_CAPE',
            FLAME_VEST: 'FLAME_VEST',
            MAGIC_BIRD: 'MAGIC_BIRD'
        };

        const DIFFICULTY_TIERS = [
            {
                id: 0, name: '新手', cols: 13, rows: 11,
                baseEnemies: 8, perLevelAdd: 3, speedMult: 0.82, bfsRange: 0,
                eliteRatio: 0.05, specialistRatio: 0.06,
                frostChance: 0.28, crateDensity: 0.50, initialVines: 1, vineSpreadFrames: 720,
                itemBombSpawnCount: 2
            },
            {
                id: 1, name: '简单', cols: 13, rows: 11,
                baseEnemies: 14, perLevelAdd: 4, speedMult: 1.05, bfsRange: 5,
                eliteRatio: 0.25, specialistRatio: 0.10,
                frostChance: 0.35, crateDensity: 0.50, initialVines: 2, vineSpreadFrames: 540,
                itemBombSpawnCount: 2
            },
            {
                id: 2, name: '中等', cols: 13, rows: 11,
                baseEnemies: 20, perLevelAdd: 5, speedMult: 1.15, bfsRange: 7,
                eliteRatio: 0.58, specialistRatio: 0.14,
                frostChance: 0.42, crateDensity: 0.48, initialVines: 3, vineSpreadFrames: 450,
                itemBombSpawnCount: 3
            },
            {
                id: 3, name: '困难1(5倍图)', cols: 29, rows: 25,
                baseEnemies: 68, perLevelAdd: 12, speedMult: 1.25, bfsRange: 11,
                eliteRatio: 0.68, specialistRatio: 0.18,
                frostChance: 0.48, crateDensity: 0.48, initialVines: 10, vineSpreadFrames: 390,
                itemBombSpawnCount: 4
            },
            {
                id: 4, name: '困难2(10倍图)', cols: 41, rows: 35,
                baseEnemies: 145, perLevelAdd: 20, speedMult: 1.38, bfsRange: 15,
                eliteRatio: 0.80, specialistRatio: 0.22,
                frostChance: 0.52, crateDensity: 0.46, initialVines: 18, vineSpreadFrames: 320,
                itemBombSpawnCount: 5
            }
        ];

        const SPECIALIST_CFG = {
            SALAMANDER: { cd: 250, windUp: 32, maxRange: 3, flameLife: 30, selfImmune: 80 },
            TORTOISE:   { cd: 300, windUp: 30, freezeTicks: 430, immuneWindow: 110 },
            AZUREBIRD:  { cd: 270, windUp: 26, pushCd: 22 },
            WHITETIGER: { cd: 330, windUp: 34, maxHpCap: 4 }
        };

        const MEGA_COST = 5;
        const MEGA_RADIUS = 3;
        const GOLDEN_QUOTA_BASE = 40;

        const SHOP_ITEMS = [
            { key: 'bombCap',   icon: 'bomb', name: '炸弹容量', desc: '开局携带炸弹上限 +1', max: 5, baseCost: 60,  costMul: 1.9, color: 'from-slate-600 to-slate-800' },
            { key: 'fireRange', icon: 'fire', name: '爆炸威力', desc: '开局爆炸范围 +1',     max: 5, baseCost: 60,  costMul: 1.9, color: 'from-orange-400 to-red-500' },
            { key: 'speed',     icon: 'bolt', name: '疾风之靴', desc: '基础移动速度 +0.25',  max: 4, baseCost: 90,  costMul: 2.0, color: 'from-sky-400 to-blue-600' },
            { key: 'lives',     icon: 'heart', name: '生命护符', desc: '每关初始生命 +1',     max: 3, baseCost: 150, costMul: 2.2, color: 'from-rose-400 to-pink-600' },
            { key: 'startShield', icon: 'shield', name: '守护结界', desc: '每关开局自带一层护盾', max: 1, baseCost: 280, costMul: 1.0, color: 'from-emerald-400 to-teal-600' }
        ];

        function getUpgradeCost(item, level) {
            if (level >= item.max) return null;
            return Math.round(item.baseCost * Math.pow(item.costMul, level));
        }

