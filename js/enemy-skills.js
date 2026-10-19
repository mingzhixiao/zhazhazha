(function (global) {
    'use strict';

    class GameEnemySkillsMixin {
            isSpecialist(type) {
                return type === 'SALAMANDER' || type === 'TORTOISE' ||
                       type === 'AZUREBIRD' || type === 'WHITETIGER';
            }

            findBFSDirection(startCol, startRow, targetCol, targetRow, maxRange, canPassCrate) {
                const manhattan = Math.abs(startCol - targetCol) + Math.abs(startRow - targetRow);
                if (manhattan === 0 || manhattan > maxRange) return null;

                const queue = [{ c: startCol, r: startRow, firstDir: null, dist: 0 }];
                const visited = new Set([`${startCol},${startRow}`]);
                const dirs = [
                    { name: 'UP', dc: 0, dr: -1 },
                    { name: 'DOWN', dc: 0, dr: 1 },
                    { name: 'LEFT', dc: -1, dr: 0 },
                    { name: 'RIGHT', dc: 1, dr: 0 }
                ];

                while (queue.length > 0) {
                    const cur = queue.shift();
                    if (cur.c === targetCol && cur.r === targetRow) return cur.firstDir;
                    if (cur.dist >= maxRange) continue;

                    for (const d of dirs) {
                        const nc = cur.c + d.dc;
                        const nr = cur.r + d.dr;
                        const key = `${nc},${nr}`;
                        if (nc <= 0 || nc >= this.mapCols - 1 || nr <= 0 || nr >= this.mapRows - 1) continue;
                        if (visited.has(key)) continue;

                        const tile = this.grid[nr][nc];
                        if (tile === TILE.WALL) continue;
                        if ((tile === TILE.CRATE || tile === TILE.FROST_CRATE) && !canPassCrate) continue;
                        if (this.bombs.some(b => b.col === nc && b.row === nr)) continue;

                        visited.add(key);
                        queue.push({
                            c: nc,
                            r: nr,
                            firstDir: cur.firstDir || d.name,
                            dist: cur.dist + 1
                        });
                    }
                }
                return null;
            }

            updateSpecialistAI(e, curCol, curRow, pCol, pRow, dtScale) {
                const cfg = SPECIALIST_CFG[e.type];
                if (e.skillCd > 0) {
                    e.skillCd -= dtScale;
                }

                const distToPlayer = Math.abs(curCol - pCol) + Math.abs(curRow - pRow);
                const inRange = distToPlayer <= (this.difficultyIdx >= 3 ? 6 : 5);

                if (e.skillCd <= 0 && inRange) {
                    e.windUpMax = cfg.windUp;
                    e.windUp = cfg.windUp;
                    e.skillCd = cfg.cd;
                    e.skillAnim = cfg.windUp + 18;
                    e.lastTarget = { col: curCol, row: curRow };
                    this.sound.vibrate(8);
                    return true;
                }
                return false;
            }

            findBombAround(e, curCol, curRow, range, mode) {
                const dirs = [
                    { dc: 0, dr: -1, name: 'UP' },
                    { dc: 0, dr: 1, name: 'DOWN' },
                    { dc: -1, dr: 0, name: 'LEFT' },
                    { dc: 1, dr: 0, name: 'RIGHT' }
                ];

                let best = null;
                let bestDist = Infinity;

                for (const d of dirs) {
                    for (let s = 1; s <= range; s++) {
                        const cc = curCol + d.dc * s;
                        const rr = curRow + d.dr * s;
                        if (cc <= 0 || cc >= this.mapCols - 1 || rr <= 0 || rr >= this.mapRows - 1) break;
                        if (this.grid[rr][cc] === TILE.WALL) break;
                        if (this.grid[rr][cc] === TILE.CRATE || this.grid[rr][cc] === TILE.FROST_CRATE) break;

                        const bomb = this.bombs.find(b => b.col === cc && b.row === rr);
                        if (bomb) {
                            if (s < bestDist) {
                                bestDist = s;
                                best = { bomb, dir: d, dist: s };
                            }
                            break;
                        }
                    }
                }
                return best;
            }

            executeSpecialistSkill(e) {
                const curCol = Math.floor(e.x / TILE_SIZE);
                const curRow = Math.floor(e.y / TILE_SIZE);
                const pCol = Math.floor(this.player.x / TILE_SIZE);
                const pRow = Math.floor(this.player.y / TILE_SIZE);
                const cfg = SPECIALIST_CFG[e.type];

                switch (e.type) {
                    case 'SALAMANDER': this.skillSalamanderFlame(e, curCol, curRow, pCol, pRow, cfg); break;
                    case 'TORTOISE':   this.skillTortoiseWater(e, curCol, curRow, cfg); break;
                    case 'AZUREBIRD':  this.skillAzureBirdWind(e, curCol, curRow, cfg); break;
                    case 'WHITETIGER': this.skillWhiteTigerDevour(e, curCol, curRow, cfg); break;
                }
            }

            skillSalamanderFlame(e, curCol, curRow, pCol, pRow, cfg) {
                let dirs;
                if (Math.abs(pCol - curCol) >= Math.abs(pRow - curRow)) {
                    dirs = [{ dc: pCol >= curCol ? 1 : -1, dr: 0 }, { dc: 0, dr: pRow >= curRow ? 1 : -1 }];
                } else {
                    dirs = [{ dc: 0, dr: pRow >= curRow ? 1 : -1 }, { dc: pCol >= curCol ? 1 : -1, dr: 0 }];
                }
                const dirMap = { UP: { dc: 0, dr: -1 }, DOWN: { dc: 0, dr: 1 }, LEFT: { dc: -1, dr: 0 }, RIGHT: { dc: 1, dr: 0 } };
                const dv = dirMap[e.dir];
                dirs.push({ dc: dv.dc, dr: dv.dr });

                let chosen = null;
                for (const d of dirs) {
                    if (d.dc === 0 && d.dr === 0) continue;
                    const cc = curCol + d.dc;
                    const rr = curRow + d.dr;
                    if (cc <= 0 || cc >= this.mapCols - 1 || rr <= 0 || rr >= this.mapRows - 1) continue;
                    if (this.grid[rr][cc] === TILE.WALL) continue;
                    chosen = d;
                    break;
                }
                if (!chosen) return;

                e.dir = chosen.dr < 0 ? 'UP' : chosen.dr > 0 ? 'DOWN' : chosen.dc < 0 ? 'LEFT' : 'RIGHT';
                e.skillAnim = 26;
                this.sound.playFlame();
                this.addFloatingText(e.x, e.y - 30, '喷火!', '#f97316', 15);
                this.spawnSkillBolt(e.x, e.y, e.x + chosen.dc * TILE_SIZE, e.y + chosen.dr * TILE_SIZE, '#f97316');

                e.fireImmuneTimer = cfg.selfImmune;
                e.fireCells = [];

                for (let s = 1; s <= cfg.maxRange; s++) {
                    const c = curCol + chosen.dc * s;
                    const r = curRow + chosen.dr * s;
                    if (c <= 0 || c >= this.mapCols - 1 || r <= 0 || r >= this.mapRows - 1) break;

                    const cx = (c + 0.5) * TILE_SIZE;
                    const cy = (r + 0.5) * TILE_SIZE;

                    for (let i = 0; i < 6; i++) {
                        const ang = Math.random() * Math.PI * 2;
                        const spd = 1.5 + Math.random() * 4;
                        this.particles.push({
                            x: cx, y: cy,
                            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                            radius: 4 + Math.random() * 4,
                            color: ['#f97316', '#facc15', '#ef4444', '#fde047'][i % 4],
                            life: 22, maxLife: 22
                        });
                    }

                    const tile = this.grid[r][c];
                    if (tile === TILE.VINE) {
                        this.destroyVine(c, r);
                        e.fireCells.push({ col: c, row: r });
                        continue;
                    }
                    if (tile === TILE.CRATE || tile === TILE.FROST_CRATE) {
                        if (tile === TILE.FROST_CRATE) this.crackFrostCrate(c, r);
                        break;
                    }

                    const bombIdx = this.bombs.findIndex(b => b.col === c && b.row === r);
                    if (bombIdx !== -1) {
                        e.fireCells.push({ col: c, row: r });
                        this.bombs[bombIdx].ignitedBy = e;
                        this.detonateBomb(bombIdx);
                        this.addFloatingText(cx, cy - 20, '引爆炸弹!', '#ef4444', 15);
                        break;
                    }

                    const itemIdx = this.powerups.findIndex(pw => pw.col === c && pw.row === r && pw.type !== 'GOLDEN_BAG');
                    if (itemIdx !== -1) {
                        const destroyed = this.powerups.splice(itemIdx, 1)[0];
                        this.spawnMonstersFromDestroyedPowerup(destroyed);
                        e.fireCells.push({ col: c, row: r });
                        break;
                    }

                    e.fireCells.push({ col: c, row: r });
                }

                if (e.fireCells.length > 0) {
                    this.explosions.push({
                        cells: e.fireCells.map(fc => ({ col: fc.col, row: fc.row, dir: 'CENTER', isEnd: false })),
                        timer: cfg.flameLife,
                        maxTimer: cfg.flameLife,
                        fever: true,
                        owner: e,
                        // 小火龙直接喷出的火焰只伤玩家，不伤其它怪物（否则等价于帮玩家清怪）
                        noEnemyDamage: true,
                        statsRef: { obstacles: 0, enemies: 0 }
                    });
                }
            }

            skillTortoiseWater(e, curCol, curRow, cfg) {
                const target = this.findBombAround(e, curCol, curRow, 3, 'flameFirst');
                e.skillAnim = 26;
                this.sound.playFreeze();
                const dirText = target ? '喷水冻结炸弹!' : '喷水!';
                this.addFloatingText(e.x, e.y - 30, dirText, '#38bdf8', 15);
                this.spawnSkillBolt(e.x, e.y, target ? (target.bomb.col + 0.5) * TILE_SIZE : e.x, target ? (target.bomb.row + 0.5) * TILE_SIZE : e.y, '#38bdf8');

                e.waterGuard = cfg.immuneWindow;

                if (!target) return;

                const b = target.bomb;
                if (b.isRemote) return;

                b.frozen = true;
                b.frozenTimer = (b.frozenTimer || 0) + cfg.freezeTicks;
                b.frozenBy = e;
                b.timer = Math.max(b.timer, 60);

                const cx = (b.col + 0.5) * TILE_SIZE;
                const cy = (b.row + 0.5) * TILE_SIZE;
                for (let i = 0; i < 16; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const spd = 1 + Math.random() * 3.5;
                    this.particles.push({
                        x: cx, y: cy,
                        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                        radius: 3.5 + Math.random() * 4,
                        color: i % 2 === 0 ? '#bae6fd' : '#38bdf8',
                        life: 26, maxLife: 26
                    });
                }
            }

            skillAzureBirdWind(e, curCol, curRow, cfg) {
                const target = this.findBombAround(e, curCol, curRow, 3, 'nearest');
                e.skillAnim = 24;
                this.sound.playWind();
                this.addFloatingText(e.x, e.y - 30, target ? '吹退炸弹!' : '刮风!', '#22d3ee', 15);

                if (!target) return;

                const b = target.bomb;
                if (b.pushCd > 0) return;
                b.pushCd = cfg.pushCd;

                const fromCol = curCol;
                const fromRow = curRow;
                const dc = Math.sign(b.col - fromCol);
                const dr = Math.sign(b.row - fromRow);

                const candidates = [
                    { c: b.col + (dc || 0), r: b.row + (dr || 0) },
                    { c: b.col + (dc ? dc : 0), r: b.row + (dc ? 0 : (dr ? dr : 1)) },
                    { c: b.col + 1, r: b.row },
                    { c: b.col - 1, r: b.row },
                    { c: b.col, r: b.row + 1 },
                    { c: b.col, r: b.row - 1 }
                ];

                let dest = null;
                for (const cand of candidates) {
                    if (cand.c <= 0 || cand.c >= this.mapCols - 1 || cand.r <= 0 || cand.r >= this.mapRows - 1) continue;
                    if (this.grid[cand.r][cand.c] === TILE.WALL) continue;
                    if (this.bombs.some(bb => bb.col === cand.c && bb.row === cand.r)) continue;
                    if (this.powerups.some(pw => pw.col === cand.c && pw.row === cand.r)) continue;
                    dest = cand;
                    break;
                }

                const wx = (b.col + 0.5) * TILE_SIZE;
                const wy = (b.row + 0.5) * TILE_SIZE;
                for (let i = 0; i < 14; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    this.particles.push({
                        x: wx + (Math.random() - 0.5) * 40,
                        y: wy + (Math.random() - 0.5) * 40,
                        vx: (dest ? Math.sign(dest.c - b.col) : dc) * (2 + Math.random() * 3),
                        vy: (dest ? Math.sign(dest.r - b.row) : dr) * (2 + Math.random() * 3),
                        radius: 2.5 + Math.random() * 3,
                        color: i % 2 === 0 ? '#a5f3fc' : '#ffffff',
                        life: 20, maxLife: 20
                    });
                }
                this.spawnSkillBolt(e.x, e.y, wx, wy, '#22d3ee');

                if (!dest) return;
                if (dest.c === b.col && dest.r === b.row) return;

                const t = this.grid[dest.r][dest.c];
                if (t === TILE.CRATE) {
                    this.destroyCrate(dest.c, dest.r);
                    this.addFloatingText((dest.c + 0.5) * TILE_SIZE, (dest.r + 0.5) * TILE_SIZE - 18, '撞爆木箱!', '#f59e0b', 14);
                } else if (t === TILE.FROST_CRATE) {
                    this.crackFrostCrate(dest.c, dest.r);
                } else if (t === TILE.VINE) {
                    this.destroyVine(dest.c, dest.r);
                }

                b.col = dest.c;
                b.row = dest.r;
                b.scalePhase = 0;
                this.updateHUD();
            }

            skillWhiteTigerDevour(e, curCol, curRow, cfg) {
                const target = this.findBombAround(e, curCol, curRow, 3, 'nearest');
                e.skillAnim = 28;
                this.addFloatingText(e.x, e.y - 30, target ? '吞掉炸弹!' : '咆哮!', '#a855f7', 15);

                if (!target) {
                    this.sound.playEnemyDefeat();
                    return;
                }

                const b = target.bomb;
                const bIdx = this.bombs.indexOf(b);
                if (bIdx !== -1) this.bombs.splice(bIdx, 1);

                this.sound.playItemCurseSpawn();
                e.feedCount++;
                if (e.hp < cfg.maxHpCap) {
                    e.hp++;
                    e.maxHp = Math.max(e.maxHp, e.hp);
                }
                e.enrageTimer = 200;
                e.hurtTimer = 26;

                const cx = (b.col + 0.5) * TILE_SIZE;
                const cy = (b.row + 0.5) * TILE_SIZE;
                for (let i = 0; i < 20; i++) {
                    const ang = (Math.PI * 2 * i) / 20;
                    const spd = 2 + Math.random() * 4;
                    this.particles.push({
                        x: cx, y: cy,
                        vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
                        radius: 4 + Math.random() * 4,
                        color: ['#a855f7', '#c084fc', '#f472b6', '#ffffff'][i % 4],
                        life: 26, maxLife: 26
                    });
                }
                this.spawnSkillBolt(cx, cy, e.x, e.y, '#c084fc');
                this.addFloatingText(e.x, e.y - 44, `强化! ${e.hp}/${e.maxHp}`, '#9333ea', 15);
                this.updateHUD();
            }

            spawnSkillBolt(x1, y1, x2, y2, color) {
                this.rainbowBolts.push({
                    x1, y1, x2, y2,
                    color,
                    life: 20,
                    maxLife: 20
                });
            }

            releaseSpecialistEffects(e) {
                if (!this.isSpecialist(e.type)) return;

                if (e.type === 'TORTOISE') {
                    let freed = 0;
                    this.bombs.forEach(b => {
                        if (b.frozenBy === e) {
                            b.frozen = false;
                            b.frozenTimer = 0;
                            b.frozenBy = null;
                            freed++;
                        }
                    });
                    if (freed > 0) {
                        this.addFloatingText(e.x, e.y - 26, `${freed} 颗炸弹解冻!`, '#0ea5e9', 15);
                    }
                }

                if (e.type === 'SALAMANDER') {
                    for (let i = this.explosions.length - 1; i >= 0; i--) {
                        if (this.explosions[i].owner === e) {
                            this.explosions[i].timer = Math.min(this.explosions[i].timer, 8);
                        }
                    }
                }

                if (e.type === 'WHITETIGER' && e.feedCount > 0) {
                    const curCol = Math.floor(e.x / TILE_SIZE);
                    const curRow = Math.floor(e.y / TILE_SIZE);
                    const spots = [
                        { c: curCol, r: curRow },
                        { c: curCol + 1, r: curRow }, { c: curCol - 1, r: curRow },
                        { c: curCol, r: curRow + 1 }, { c: curCol, r: curRow - 1 }
                    ];
                    let refund = 0;
                    for (const sp of spots) {
                        if (refund >= e.feedCount) break;
                        if (sp.c <= 0 || sp.c >= this.mapCols - 1 || sp.r <= 0 || sp.r >= this.mapRows - 1) continue;
                        if (this.grid[sp.r][sp.c] !== TILE.EMPTY) continue;
                        if (this.bombs.some(b => b.col === sp.c && b.row === sp.r)) continue;
                        this.bombs.push({
                            col: sp.c, row: sp.r, isRemote: false, timer: 200, maxTimer: 165,
                            range: this.playerStats.bombRange, fever: false, scalePhase: 0,
                            frozen: false, frozenTimer: 0, frozenBy: null, pushCd: 0
                        });
                        refund++;
                    }
                    if (refund > 0) {
                        this.sound.playSpit();
                        this.addFloatingText(e.x, e.y - 30, `吐出 ${refund} 颗炸弹!`, '#9333ea', 16);
                    }
                }
            }
    }

    global.GameEnemySkillsMixin = GameEnemySkillsMixin;
})(typeof window !== 'undefined' ? window : globalThis);
