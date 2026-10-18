        /**
         * ============================================================================
         * 2. 存档系统：最高分 / 生涯统计 / 永久强化（加固版）
         * ============================================================================
         * - schemaVersion 版本化，旧存档自动迁移
         * - 字段级校验（GamePure.validateSaveData），损坏数据先备份再回退
         * - localStorage 不可用时降级运行 + 用户提示，不崩溃
         * - 语义：totalCoinsEarned = 累计获得金币（含已消费）
         */
        class SaveSystem {
            constructor() {
                this.KEY = GamePure.SAVE_KEY;
                this.BACKUP_KEY = GamePure.SAVE_KEY + '_backup';
                this.available = this.checkAvailable();
                this.data = this.load();
                this._saveFailedNotified = false;
            }

            // 存储是否可用（禁用/隐私模式/配额）
            checkAvailable() {
                try {
                    const t = '__save_test__';
                    localStorage.setItem(t, '1');
                    localStorage.removeItem(t);
                    return true;
                } catch (e) {
                    return false;
                }
            }

            load() {
                const base = GamePure.saveDefaults();
                if (!this.available) return base;

                let raw = null;
                try {
                    raw = localStorage.getItem(this.KEY);
                } catch (e) {
                    return base;
                }
                if (!raw) return base;

                let parsed = null;
                try {
                    parsed = JSON.parse(raw);
                } catch (e) {
                    // JSON 损坏：先备份，再回退默认值
                    this.backupCorrupted(raw);
                    this._corrupted = true;
                    return base;
                }

                const { data, errors, migrated } = GamePure.migrateSaveData(parsed);
                if (errors.length > 0) {
                    // 有字段问题：备份原始数据以便恢复
                    this.backupCorrupted(raw);
                }
                this._loadErrors = errors;
                this._migrated = migrated;
                return data;
            }

            backupCorrupted(raw) {
                try {
                    localStorage.setItem(this.BACKUP_KEY, raw);
                } catch (e) {}
            }

            save() {
                if (!this.available) {
                    this.notifySaveFailed();
                    return false;
                }
                try {
                    localStorage.setItem(this.KEY, JSON.stringify(this.data));
                    return true;
                } catch (e) {
                    this.notifySaveFailed();
                    return false;
                }
            }

            notifySaveFailed() {
                if (this._saveFailedNotified) return;
                this._saveFailedNotified = true;
                // 延迟到游戏实例就绪后用 toast 提示（避免构造时序问题）
                setTimeout(() => {
                    if (window.game && window.game.showToast) {
                        window.game.showToast('存档不可用，本次进度不会保存', 'lock', 2500);
                    }
                }, 1500);
            }

            // 供 UI 调用：返回 { hadIssue, message } 用于启动时提示
            getLoadReport() {
                if (!this.available) {
                    return { hadIssue: true, message: '浏览器存储不可用，进度无法保存，但游戏可正常游玩' };
                }
                if (this._corrupted) {
                    return { hadIssue: true, message: '存档数据损坏，已恢复为初始状态（原数据已备份）' };
                }
                if (this._migrated) {
                    return { hadIssue: false, message: '存档已升级到新版本' };
                }
                if (this._loadErrors && this._loadErrors.length > 0) {
                    return { hadIssue: true, message: '存档部分数据异常，已自动修复' };
                }
                return { hadIssue: false, message: '' };
            }

            reset() {
                this.data = GamePure.saveDefaults();
                this.save();
            }
        }
