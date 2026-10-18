        /**
         * ============================================================================
         * 教程状态机（纯逻辑，无 DOM）：供浏览器 game.js 与 Node 测试共用
         * 浏览器通过 <script> 直接加载；Node 测试通过 require/globalThis 使用。
         *
         * 设计要点（对应 REVIEW-2026-10-18 的 P0-1 / P0-2 / P1-3）：
         * - 步骤推进只依赖“当前步骤内”的状态，切换步骤不会被无条件清零的标记卡死。
         * - 传送门格解析保证可通行（清除底层障碍）。
         * - 教学沙盒强制使用新手档，结束后恢复用户所选难度。
         * ============================================================================
         */
        (function (global) {
            // 教学沙盒固定使用新手档（idx 0）
            function tutorialSandboxDifficultyIndex() {
                return 0;
            }

            // 计算教学开始/结束的难度对：sandbox 用新手，restore 用用户原选
            function tutorialDifficultyPair(savedIdx) {
                const sandbox = tutorialSandboxDifficultyIndex();
                const restore = (savedIdx === undefined || savedIdx === null) ? sandbox : savedIdx;
                return { sandbox, restore };
            }

            /**
             * 纯状态机：根据当前教学状态与一次世界探测，返回推进决策。
             * @param {{step:number, bombWasPlaced:boolean, wasHit:boolean, powerupCount:number}} state
             * @param {{atTarget:boolean, bombsActive:number, powerupsCount:number, enemiesCount:number}} world
             * @returns {{action:'advance'|'complete'|null, feedback:string|null, markBombPlaced?:boolean}}
             */
            function evaluateTutorialStep(state, world) {
                const s = state;
                if (s.step === 0 && world.atTarget) {
                    return { action: 'advance', feedback: '移动得很好！' };
                }
                if (s.step === 1 && world.bombsActive > 0) {
                    // 放弹成功：必须在推进前标记，且不会被下一 setupTutorialStep 清零
                    return { action: 'advance', feedback: '放弹成功！', markBombPlaced: true };
                }
                if (s.step === 2 && s.bombWasPlaced && world.bombsActive === 0) {
                    // 炸弹已炸完且确实放过了炸弹 → 推进（修复死锁）
                    return {
                        action: 'advance',
                        feedback: s.wasHit
                            ? '被炸到了！还好有保护——记住要跑出红圈'
                            : '完美躲避！'
                    };
                }
                if (s.step === 3 && world.powerupsCount < s.powerupCount) {
                    return { action: 'advance', feedback: '拾取成功！注意：炸到道具会引来怪物' };
                }
                if (s.step === 4 && world.enemiesCount === 0) {
                    return { action: 'advance', feedback: '击败！炸弹是十字范围的' };
                }
                if (s.step === 5 && world.atTarget) {
                    return { action: 'complete', feedback: null };
                }
                return { action: null, feedback: null };
            }

            /**
             * 教学传送门格解析：将传送门所在格子从障碍（CRATE/FROST_CRATE/VINE）变为可通行 EMPTY，
             * 保证玩家能实际走到目标格并触发 endTutorial(true)。普通关卡的拆箱开门逻辑不受影响。
             * @returns {{grid:number[][], cleared:boolean}}
             */
            function resolveTutorialPortalTile(grid, portal, TILE) {
                if (!portal) return { grid, cleared: false };
                const g = grid.map(row => row.slice());
                const t = g[portal.row][portal.col];
                const wasObstacle = (t === TILE.CRATE || t === TILE.FROST_CRATE || t === TILE.VINE);
                if (wasObstacle) g[portal.row][portal.col] = TILE.EMPTY;
                return { grid: g, cleared: wasObstacle };
            }

            global.GameTutorial = {
                tutorialSandboxDifficultyIndex,
                tutorialDifficultyPair,
                evaluateTutorialStep,
                resolveTutorialPortalTile
            };
        })(typeof window !== 'undefined' ? window : globalThis);
