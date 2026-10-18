        /**
         * ============================================================================
         * 0. 可注入随机数：游戏默认用 Math.random，测试可固定 seed 复现
         * ============================================================================
         * 用法：
         *   RNG.random()            // 等价于 Math.random()
         *   RNG.seed(12345)         // 切换到确定性序列（测试用）
         *   RNG.reset()             // 恢复 Math.random（真实游戏）
         *   RNG.isSeeded()          // 当前是否为测试模式
         */
        (function (global) {
            function mulberry32(seed) {
                let a = seed >>> 0;
                return function () {
                    a |= 0;
                    a = (a + 0x6D2B79F5) | 0;
                    let t = Math.imul(a ^ (a >>> 15), 1 | a);
                    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
                    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
                };
            }

            const RNG = {
                _rand: Math.random,
                _seed: null,

                random() {
                    return this._rand();
                },

                seed(s) {
                    this._seed = s >>> 0;
                    this._rand = mulberry32(this._seed);
                },

                reset() {
                    this._seed = null;
                    this._rand = Math.random;
                },

                isSeeded() {
                    return this._seed !== null;
                }
            };

            global.RNG = RNG;
        })(typeof window !== 'undefined' ? window : globalThis);
