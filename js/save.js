        /**
         * ============================================================================
         * 2. 存档系统：最高分 / 生涯统计 / 永久强化
         * ============================================================================
         */
        class SaveSystem {
            constructor() {
                this.KEY = 'chibi_bomberman_save_v2';
                this.data = this.load();
            }

            defaults() {
                return {
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

            load() {
                const base = this.defaults();
                try {
                    const raw = localStorage.getItem(this.KEY);
                    if (raw) {
                        const parsed = JSON.parse(raw);
                        return {
                            ...base,
                            ...parsed,
                            upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) }
                        };
                    }
                } catch (e) {}
                return base;
            }

            save() {
                try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) {}
            }

            reset() {
                this.data = this.defaults();
                this.save();
            }
        }

