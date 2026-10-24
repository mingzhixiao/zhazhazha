(function (global) {
    'use strict';

    function drawRoundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    class GameRenderMixin {
            drawStaticIcons() {
                document.querySelectorAll('.guide-icon').forEach(cv => {
                    // 装饰性 canvas 不抢占辅助技术焦点
                    if (!cv.hasAttribute('aria-hidden')) cv.setAttribute('aria-hidden', 'true');
                    this.paintIconCanvas(cv, cv.dataset.icon);
                });
            }

            // 把矢量图标画进页面上的小 canvas。
            // data-tint 用于把整组白色描边图标染成深色，解决白底白图标不可见的问题；
            // 多色图标（金币/火焰/星星等）不要设置 data-tint。
            paintIconCanvas(cv, name) {
                if (!cv) return;
                const bctx = cv.getContext('2d');
                bctx.clearRect(0, 0, cv.width, cv.height);
                const s = Math.min(cv.width, cv.height);
                this.drawIcon(name, cv.width / 2, cv.height / 2, s * 0.92, bctx, cv.dataset.tint || null);
            }

            drawHero() {
                const cv = document.getElementById('heroCanvas');
                if (!cv) return;
                const hctx = cv.getContext('2d');
                const W = cv.width, H = cv.height;
                hctx.clearRect(0, 0, W, H);

                const t = performance.now() / 1000;
                const bob = Math.sin(t * 2.2) * 6;
                const breath = 1 + Math.sin(t * 3.1) * 0.025;
                const blink = (t % 3.7) < 0.12;

                hctx.save();
                hctx.translate(W / 2, H / 2 + bob);
                hctx.scale(3.1 * breath, 3.1 * (2 - breath));

                // 地面光斑：主角是悬浮在柔和光晕上的。
                // 原来画的是硬边椭圆阴影，但主角离下方草坡很远，阴影反而强化了"悬空"的违和感。
                hctx.save();
                hctx.translate(0, 26 - bob * 0.3);
                hctx.scale(1, 0.34);
                const haloGrad = hctx.createRadialGradient(0, 0, 1, 0, 0, 36);
                haloGrad.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
                haloGrad.addColorStop(0.45, 'rgba(255, 255, 255, 0.26)');
                haloGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
                hctx.fillStyle = haloGrad;
                hctx.beginPath();
                hctx.arc(0, 0, 36, 0, Math.PI * 2);
                hctx.fill();
                hctx.restore();

                // 脚
                hctx.fillStyle = '#f43f5e';
                hctx.beginPath();
                hctx.arc(-8, 20, 6, 0, Math.PI * 2);
                hctx.arc(8, 20, 6, 0, Math.PI * 2);
                hctx.fill();

                // 腰带
                hctx.fillStyle = '#2563eb';
                drawRoundRect(hctx, -13, 6, 26, 13, 6);
                hctx.fill();
                hctx.fillStyle = '#facc15';
                hctx.fillRect(-12, 12, 24, 3.5);

                // 手
                hctx.fillStyle = '#f43f5e';
                hctx.beginPath();
                hctx.arc(-17, 10, 5, 0, Math.PI * 2);
                hctx.arc(17, 10, 5, 0, Math.PI * 2);
                hctx.fill();

                // 天线
                hctx.strokeStyle = '#ffffff';
                hctx.lineWidth = 3.5;
                hctx.beginPath();
                hctx.moveTo(0, -20);
                hctx.lineTo(0, -28);
                hctx.stroke();
                hctx.fillStyle = '#ec4899';
                hctx.beginPath();
                hctx.arc(0, -31, 6, 0, Math.PI * 2);
                hctx.fill();
                hctx.fillStyle = 'rgba(255,255,255,0.55)';
                hctx.beginPath();
                hctx.arc(-2, -33, 2, 0, Math.PI * 2);
                hctx.fill();

                // 身体
                hctx.fillStyle = '#ffffff';
                drawRoundRect(hctx, -21, -22, 42, 30, 15);
                hctx.fill();
                hctx.strokeStyle = '#cbd5e1';
                hctx.lineWidth = 2;
                hctx.stroke();

                // 脸
                hctx.fillStyle = '#fed7aa';
                drawRoundRect(hctx, -14, -14, 28, 17, 8);
                hctx.fill();

                hctx.fillStyle = '#0f172a';
                if (blink) {
                    hctx.lineWidth = 2.4;
                    hctx.strokeStyle = '#0f172a';
                    hctx.beginPath();
                    hctx.moveTo(-9, -5); hctx.lineTo(-4, -5);
                    hctx.moveTo(4, -5); hctx.lineTo(9, -5);
                    hctx.stroke();
                } else {
                    hctx.beginPath();
                    hctx.ellipse(-6.5, -5.5, 2.6, 4.6, 0, 0, Math.PI * 2);
                    hctx.ellipse(6.5, -5.5, 2.6, 4.6, 0, 0, Math.PI * 2);
                    hctx.fill();
                    hctx.fillStyle = '#ffffff';
                    hctx.beginPath();
                    hctx.arc(-7.2, -7.4, 1.1, 0, Math.PI * 2);
                    hctx.arc(5.8, -7.4, 1.1, 0, Math.PI * 2);
                    hctx.fill();
                }
                // 腮红
                hctx.fillStyle = 'rgba(244, 63, 94, 0.45)';
                hctx.beginPath();
                hctx.arc(-11, -2, 3, 0, Math.PI * 2);
                hctx.arc(11, -2, 3, 0, Math.PI * 2);
                hctx.fill();

                hctx.restore();
            }

            drawStoneWall(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                // 预渲染贴图（含外描边 / 顶部受光 / 底部内阴影 / 落地投影）
                const TS = global.TileSprites;
                if (TS && TS.drawTileSprite) {
                    TS.drawTileSprite(ctx, 'wall', 0, x, y, TILE_SIZE);
                    return;
                }

                ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
                drawRoundRect(ctx, x + 3, y + 6, TILE_SIZE - 6, TILE_SIZE - 6, 14);
                ctx.fill();

                ctx.fillStyle = '#64748b';
                drawRoundRect(ctx, x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 8, 14);
                ctx.fill();

                ctx.fillStyle = '#94a3b8';
                drawRoundRect(ctx, x + 5, y + 4, TILE_SIZE - 10, TILE_SIZE - 14, 12);
                ctx.fill();

                // 砖缝：两横一竖
                ctx.strokeStyle = 'rgba(71, 85, 105, 0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 7, y + 20); ctx.lineTo(x + TILE_SIZE - 7, y + 20);
                ctx.moveTo(x + 7, y + 36); ctx.lineTo(x + TILE_SIZE - 7, y + 36);
                ctx.moveTo(x + TILE_SIZE / 2, y + 20); ctx.lineTo(x + TILE_SIZE / 2, y + 36);
                ctx.moveTo(x + 16, y + 6); ctx.lineTo(x + 16, y + 20);
                ctx.moveTo(x + TILE_SIZE - 16, y + 36); ctx.lineTo(x + TILE_SIZE - 16, y + 50);
                ctx.stroke();

                // 顶部高光
                ctx.fillStyle = 'rgba(203, 213, 225, 0.55)';
                drawRoundRect(ctx, x + 9, y + 6, TILE_SIZE - 18, 6, 3);
                ctx.fill();

                ctx.fillStyle = '#475569';
                ctx.beginPath();
                ctx.arc(x + 13, y + TILE_SIZE - 16, 2.5, 0, Math.PI * 2);
                ctx.arc(x + TILE_SIZE - 13, y + TILE_SIZE - 16, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }

            drawWoodCrate(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                const TS = global.TileSprites;
                if (TS && TS.drawTileSprite) {
                    // 3 个变体：木纹/加强板位置不同，降低成片木箱的重复感
                    TS.drawTileSprite(ctx, 'crate', (col * 3 + row * 5) % 3, x, y, TILE_SIZE);
                    return;
                }

                ctx.fillStyle = 'rgba(0,0,0,0.16)';
                drawRoundRect(ctx, x + 4, y + 7, TILE_SIZE - 8, TILE_SIZE - 8, 12);
                ctx.fill();

                // 箱体底色
                ctx.fillStyle = '#b45309';
                drawRoundRect(ctx, x + 4, y + 4, TILE_SIZE - 8, TILE_SIZE - 10, 12);
                ctx.fill();

                ctx.fillStyle = '#d97706';
                drawRoundRect(ctx, x + 8, y + 7, TILE_SIZE - 16, TILE_SIZE - 17, 9);
                ctx.fill();

                // 木板纹理：竖向木纹线
                ctx.strokeStyle = 'rgba(146, 64, 14, 0.55)';
                ctx.lineWidth = 1.6;
                const px = [x + 17, x + 28, x + 39];
                px.forEach((lx, i) => {
                    ctx.beginPath();
                    ctx.moveTo(lx, y + 10);
                    ctx.bezierCurveTo(lx + (i % 2 ? 2 : -2), y + 20, lx + (i % 2 ? -2 : 2), y + 32, lx, y + 42);
                    ctx.stroke();
                });

                // 金属包边
                ctx.fillStyle = '#92400e';
                ctx.fillRect(x + 8, y + 7, TILE_SIZE - 16, 4);
                ctx.fillRect(x + 8, y + TILE_SIZE - 14, TILE_SIZE - 16, 4);

                // 四角铆钉
                ctx.fillStyle = '#78716c';
                [[x + 13, y + 12], [x + TILE_SIZE - 13, y + 12], [x + 13, y + TILE_SIZE - 13], [x + TILE_SIZE - 13, y + TILE_SIZE - 13]].forEach(([nx, ny]) => {
                    ctx.beginPath(); ctx.arc(nx, ny, 2.6, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#d6d3d1';
                    ctx.beginPath(); ctx.arc(nx - 0.8, ny - 0.8, 1, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#78716c';
                });

                // 高光
                ctx.fillStyle = 'rgba(253, 230, 138, 0.5)';
                drawRoundRect(ctx, x + 10, y + 9, 8, TILE_SIZE - 22, 4);
                ctx.fill();
            }

            drawFrostCrate(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;

                const TS = global.TileSprites;
                if (TS && TS.drawTileSprite) {
                    // 冰壳直接画在木箱上（含雪花/裂冰/斜高光）
                    TS.drawTileSprite(ctx, 'frost', (col * 3 + row * 5) % 3, x, y, TILE_SIZE);
                    return;
                }

                this.drawWoodCrate(col, row);

                ctx.fillStyle = 'rgba(125, 211, 252, 0.78)';
                drawRoundRect(ctx, x + 3, y + 3, TILE_SIZE - 6, TILE_SIZE - 8, 12);
                ctx.fill();

                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.5;
                drawRoundRect(ctx, x + 6, y + 6, TILE_SIZE - 12, TILE_SIZE - 14, 10);
                ctx.stroke();

                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                drawRoundRect(ctx, x + 9, y + 8, TILE_SIZE - 26, 8, 4);
                ctx.fill();

                this.drawIcon('snow', x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 1, 22);
            }

            drawVineTile(col, row) {
                const ctx = this.ctx;
                const x = col * TILE_SIZE;
                const y = row * TILE_SIZE;
                const cx = x + TILE_SIZE / 2;
                const cy = y + TILE_SIZE / 2;

                const TS = global.TileSprites;
                if (TS && TS.drawTileSprite) {
                    TS.drawTileSprite(ctx, 'vine', 0, x, y, TILE_SIZE);
                    return;
                }

                const sway = Math.sin(this.globalTime * 0.08 + col + row) * 2.5;

                ctx.fillStyle = 'rgba(22, 163, 74, 0.25)';
                drawRoundRect(ctx, x + 5, y + 5, TILE_SIZE - 10, TILE_SIZE - 10, 14);
                ctx.fill();

                ctx.strokeStyle = '#15803d';
                ctx.lineWidth = 3.5;
                ctx.beginPath();
                ctx.arc(cx, cy, 18 + sway * 0.5, 0, Math.PI * 2);
                ctx.stroke();

                ctx.fillStyle = '#4ade80';
                ctx.beginPath();
                ctx.arc(cx - 12, cy - 10, 5, 0, Math.PI * 2);
                ctx.arc(cx + 13, cy + 9, 5, 0, Math.PI * 2);
                ctx.fill();

                this.drawIcon('leaf', cx + sway * 0.4, cy, 24);
            }

            drawPortal(portal) {
                const ctx = this.ctx;
                const cx = (portal.col + 0.5) * TILE_SIZE;
                const cy = (portal.row + 0.5) * TILE_SIZE;

                if (!portal.active) {
                    ctx.save();
                    ctx.translate(cx, cy);

                    ctx.fillStyle = '#475569';
                    ctx.beginPath();
                    ctx.arc(0, 0, 23, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#1e293b';
                    ctx.beginPath();
                    ctx.arc(0, 0, 17, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
                    ctx.lineWidth = 2.5;
                    ctx.setLineDash([5, 5]);
                    ctx.beginPath();
                    ctx.arc(0, 0, 14, this.globalTime * 0.015, this.globalTime * 0.015 + Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);

                    ctx.strokeStyle = '#94a3b8';
                    ctx.lineWidth = 4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-14, -14);
                    ctx.lineTo(14, 14);
                    ctx.moveTo(14, -14);
                    ctx.lineTo(-14, 14);
                    ctx.stroke();

                    ctx.font = '15px sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawIcon('lock', 0, 1, 20);

                    ctx.restore();
                } else {
                    const pulse = Math.sin(this.globalTime * 0.12) * 4;

                    if (this.state === 'PLAYING' && Math.random() < 0.35) {
                        const ang = Math.random() * Math.PI * 2;
                        this.particles.push({
                            x: cx + Math.cos(ang) * 18,
                            y: cy + Math.sin(ang) * 18,
                            vx: (Math.random() - 0.5) * 1.2,
                            vy: -0.8 - Math.random() * 1.5,
                            radius: 3 + Math.random() * 2.5,
                            color: ['#fde047', '#f472b6', '#38bdf8', '#c084fc'][Math.floor(Math.random() * 4)],
                            life: 22,
                            maxLife: 22
                        });
                    }

                    ctx.save();
                    ctx.translate(cx, cy);

                    const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, 28 + pulse);
                    grad.addColorStop(0, '#fef08a');
                    grad.addColorStop(0.45, '#ec4899');
                    grad.addColorStop(0.75, '#8b5cf6');
                    grad.addColorStop(1, 'rgba(139, 92, 246, 0)');
                    ctx.fillStyle = grad;
                    ctx.beginPath();
                    ctx.arc(0, 0, 28 + pulse, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.rotate(this.globalTime * 0.06);
                    ctx.strokeStyle = '#fde047';
                    ctx.lineWidth = 2.5;
                    ctx.beginPath();
                    ctx.arc(0, 0, 20, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3;
                    for (let i = 0; i < 6; i++) {
                        ctx.rotate(Math.PI / 3);
                        ctx.beginPath();
                        ctx.arc(6, 6, 9, 0, Math.PI);
                        ctx.stroke();
                    }
                    ctx.restore();

                    const floatY = cy - 30 + Math.sin(this.globalTime * 0.15) * 4;
                    ctx.font = '900 12px "Fredoka", "Noto Sans SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 3.5;
                    ctx.strokeText('进入过关 ▼', cx, floatY);
                    ctx.fillStyle = '#7e22ce';
                    ctx.fillText('进入过关 ▼', cx, floatY);
                }
            }

            drawPowerup(item) {
                const ctx = this.ctx;
                const cx = (item.col + 0.5) * TILE_SIZE;
                const bounceY = Math.sin(this.globalTime * 0.1 + item.floatPhase) * 4;
                const cy = (item.row + 0.5) * TILE_SIZE + bounceY;

                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.ellipse(cx, (item.row + 0.5) * TILE_SIZE + 18, 14, 5, 0, 0, Math.PI * 2);
                ctx.fill();

                if (item.type === 'GOLDEN_BAG') {
                    const glow = 0.5 + 0.5 * Math.sin(this.globalTime * 0.18);
                    ctx.save();
                    ctx.shadowColor = `rgba(250, 204, 21, ${glow})`;
                    ctx.shadowBlur = 18;
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(cx, cy, 21, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    ctx.fillStyle = '#eab308';
                    ctx.beginPath();
                    ctx.arc(cx, cy, 17.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = 'rgba(255,255,255,0.5)';
                    ctx.beginPath();
                    ctx.arc(cx - 6, cy - 6, 4.5, 0, Math.PI * 2);
                    ctx.fill();

                    this.drawIcon('coin', cx, cy, 24);
                    return;
                }

                const bgColors = {
                    [POWERUP_TYPE.BOMB_UP]: '#334155',
                    [POWERUP_TYPE.FIRE_UP]: '#f97316',
                    [POWERUP_TYPE.SPEED_UP]: '#0ea5e9',
                    [POWERUP_TYPE.SHIELD]: '#10b981',
                    [POWERUP_TYPE.REMOTE_BOMB]: '#0284c7',
                    [POWERUP_TYPE.GHOST_CAPE]: '#9333ea',
                    [POWERUP_TYPE.FLAME_VEST]: '#f59e0b',
                    [POWERUP_TYPE.MAGIC_BIRD]: '#ec4899'
                };
                const icons = {
                    [POWERUP_TYPE.BOMB_UP]: 'bomb',
                    [POWERUP_TYPE.FIRE_UP]: 'fire',
                    [POWERUP_TYPE.SPEED_UP]: 'bolt',
                    [POWERUP_TYPE.SHIELD]: 'shield',
                    [POWERUP_TYPE.REMOTE_BOMB]: 'clock',
                    [POWERUP_TYPE.GHOST_CAPE]: 'ghost',
                    [POWERUP_TYPE.FLAME_VEST]: 'vest',
                    [POWERUP_TYPE.MAGIC_BIRD]: 'bird'
                };

                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(cx, cy, 20, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = bgColors[item.type] || '#334155';
                ctx.beginPath();
                ctx.arc(cx, cy, 16.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = 'rgba(255,255,255,0.45)';
                ctx.beginPath();
                ctx.arc(cx - 6, cy - 6, 4.5, 0, Math.PI * 2);
                ctx.fill();

                ctx.font = '18px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                this.drawIcon(icons[item.type] || 'star', cx, cy, 22);
            }

            drawBomb(bomb) {
                const ctx = this.ctx;
                const cx = (bomb.col + 0.5) * TILE_SIZE;
                const cy = (bomb.row + 0.5) * TILE_SIZE;

                const urgency = bomb.isRemote ? 1.3 : (1 + (1 - bomb.timer / bomb.maxTimer) * 2.2);
                const scaleX = 1 + Math.sin(bomb.scalePhase * urgency) * 0.1;
                const scaleY = 1 - Math.sin(bomb.scalePhase * urgency) * 0.08;

                const frozen = !!bomb.frozen;

                if (bomb.fever && !frozen) {
                    ctx.strokeStyle = `hsl(${(this.globalTime * 10) % 360}, 95%, 60%)`;
                    ctx.lineWidth = 3.5;
                    ctx.beginPath();
                    ctx.arc(cx, cy + 2, 26 + Math.sin(this.globalTime * 0.3) * 3, 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (bomb.isRemote) {
                    const pulseR = 23 + Math.sin(this.globalTime * 0.2) * 4;
                    ctx.fillStyle = 'rgba(56, 189, 248, 0.28)';
                    ctx.beginPath();
                    ctx.arc(cx, cy + 2, pulseR, 0, Math.PI * 2);
                    ctx.fill();
                }

                ctx.fillStyle = 'rgba(0,0,0,0.22)';
                ctx.beginPath();
                ctx.ellipse(cx, cy + 19, 18 * scaleX, 6, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(cx, cy + 2);
                ctx.scale(scaleX, scaleY);

                const isRedFlash = !frozen && !bomb.isRemote && bomb.timer < 55 && Math.floor(bomb.timer / 5) % 2 === 0;
                const grad = ctx.createRadialGradient(-6, -6, 3, 0, 0, 22);
                if (bomb.isRemote) {
                    grad.addColorStop(0, '#7dd3fc');
                    grad.addColorStop(0.5, '#0284c7');
                    grad.addColorStop(1, '#0c4a6e');
                } else if (isRedFlash) {
                    grad.addColorStop(0, '#fca5a5');
                    grad.addColorStop(0.5, '#ef4444');
                    grad.addColorStop(1, '#7f1d1d');
                } else if (frozen) {
                    grad.addColorStop(0, '#e0f2fe');
                    grad.addColorStop(0.5, '#38bdf8');
                    grad.addColorStop(1, '#075985');
                } else {
                    grad.addColorStop(0, '#64748b');
                    grad.addColorStop(0.5, '#1e293b');
                    grad.addColorStop(1, '#0f172a');
                }

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(0, 0, 21, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#94a3b8';
                drawRoundRect(ctx, -6, -24, 12, 6, 3);
                ctx.fill();

                if (bomb.isRemote) {
                    ctx.strokeStyle = '#e0f2fe';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.moveTo(0, -24);
                    ctx.lineTo(0, -32);
                    ctx.stroke();

                    ctx.fillStyle = frozen ? '#bae6fd' : (Math.floor(this.globalTime / 8) % 2 === 0 ? '#38bdf8' : '#f43f5e');
                    ctx.beginPath();
                    ctx.arc(0, -33, 4.5, 0, Math.PI * 2);
                    ctx.fill();
                } else if (frozen) {
                    ctx.strokeStyle = '#dbeafe';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(0, -24);
                    ctx.quadraticCurveTo(6, -31, 10, -26);
                    ctx.stroke();
                } else {
                    ctx.strokeStyle = '#fde047';
                    ctx.lineWidth = 3;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(0, -24);
                    ctx.quadraticCurveTo(6, -31, 10, -26);
                    ctx.stroke();
                }

                ctx.fillStyle = 'rgba(255,255,255,0.65)';
                ctx.beginPath();
                ctx.ellipse(-8, -8, 5, 3, -Math.PI / 4, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = frozen ? '#f0f9ff' : '#ffffff';
                ctx.beginPath();
                ctx.arc(-5, 3, 2.2, 0, Math.PI * 2);
                ctx.arc(6, 3, 2.2, 0, Math.PI * 2);
                ctx.fill();

                if (frozen) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
                    ctx.lineWidth = 2.2;
                    ctx.beginPath();
                    ctx.moveTo(-16, -14); ctx.lineTo(-4, -2);
                    ctx.moveTo(16, -15); ctx.lineTo(3, 4);
                    ctx.moveTo(-14, 15); ctx.lineTo(-2, 3);
                    ctx.stroke();
                }

                ctx.restore();

                if (frozen) {
                    ctx.font = '900 15px "Fredoka", "Noto Sans SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    this.drawIcon('snow', cx, cy - 44, 20);

                    const maxF = SPECIALIST_CFG.TORTOISE.freezeTicks;
                    const pct = Math.max(0, Math.min(1, bomb.frozenTimer / maxF));
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(cx, cy + 2, 27, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
                    ctx.stroke();
                }
            }

            drawExplosion(exp) {
                const ctx = this.ctx;
                const progress = exp.timer / exp.maxTimer;
                const radiusScale = Math.sin(progress * Math.PI);

                // 预渲染火焰帧：快速膨胀 -> 保持 -> 淡出，带不规则轮廓与飞散火星
                const TS = global.TileSprites;
                if (TS && TS.buildExplosionFrames) {
                    const frames = TS.buildExplosionFrames();
                    const life = Math.max(0, Math.min(0.999, 1 - progress));
                    const idx = Math.min(frames.length - 1, Math.floor(life * frames.length));
                    const sprite = frames[idx];
                    const pulse = 1.7 + Math.sin(this.globalTime * 0.55) * 0.035;
                    const size = TILE_SIZE * pulse;
                    const half = size / 2;

                    exp.cells.forEach(cell => {
                        const cx = (cell.col + 0.5) * TILE_SIZE;
                        const cy = (cell.row + 0.5) * TILE_SIZE;
                        // 逐格微抖动，避免整片火焰像同一张贴图平铺
                        const jx = Math.sin(this.globalTime * 0.11 + cell.col * 2.1 + cell.row * 1.3) * 1.8;
                        const jy = Math.cos(this.globalTime * 0.09 + cell.row * 1.7 + cell.col * 0.9) * 1.8;
                        ctx.drawImage(sprite, cx - half + jx, cy - half + jy, size, size);
                    });

                    // 狂暴弹：额外一圈彩色外焰
                    if (exp.fever) {
                        ctx.save();
                        ctx.globalCompositeOperation = 'lighter';
                        ctx.globalAlpha = 0.5 * radiusScale;
                        exp.cells.forEach(cell => {
                            const cx = (cell.col + 0.5) * TILE_SIZE;
                            const cy = (cell.row + 0.5) * TILE_SIZE;
                            ctx.fillStyle = `hsl(${(this.globalTime * 14 + cell.col * 24) % 360}, 95%, 62%)`;
                            ctx.beginPath();
                            ctx.arc(cx, cy, TILE_SIZE * 0.62 * radiusScale, 0, Math.PI * 2);
                            ctx.fill();
                        });
                        ctx.restore();
                    }
                    return;
                }

                exp.cells.forEach(cell => {
                    const cx = (cell.col + 0.5) * TILE_SIZE;
                    const cy = (cell.row + 0.5) * TILE_SIZE;
                    const r = (TILE_SIZE * 0.46) * (0.5 + 0.5 * radiusScale);

                    if (exp.fever) {
                        ctx.fillStyle = `hsl(${(this.globalTime * 14 + cell.col * 24) % 360}, 95%, 62%)`;
                        ctx.beginPath();
                        ctx.arc(cx, cy, r * 1.3, 0, Math.PI * 2);
                        ctx.fill();
                    }

                    ctx.fillStyle = '#f97316';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 1.1, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fef08a';
                    ctx.beginPath();
                    ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2);
                    ctx.fill();
                });
            }

            drawEnemy(e) {
                if (
                    e.x < this.camera.x - TILE_SIZE * 2 ||
                    e.x > this.camera.x + this.canvas.width + TILE_SIZE * 2 ||
                    e.y < this.camera.y - TILE_SIZE * 2 ||
                    e.y > this.camera.y + this.canvas.height + TILE_SIZE * 2
                ) {
                    return;
                }

                const ctx = this.ctx;
                if (e.hurtTimer > 0 && Math.floor(e.hurtTimer / 3) % 2 === 0) {
                    ctx.globalAlpha = 0.45;
                }

                const bounce = Math.sin(e.animPhase * 2) * 3.5;
                const stretchX = 1 + Math.sin(e.animPhase * 2) * 0.07;
                const stretchY = 1 - Math.sin(e.animPhase * 2) * 0.07;

                ctx.fillStyle = 'rgba(0,0,0,0.18)';
                ctx.beginPath();
                ctx.ellipse(e.x, e.y + 19, 16 * stretchX, 5, 0, 0, Math.PI * 2);
                ctx.fill();

                ctx.save();
                ctx.translate(e.x, e.y + bounce);
                ctx.scale(stretchX, stretchY);

                if (e.type === 'SLIME' || e.type === 'GOLD_SLIME') {
                    ctx.fillStyle = e.type === 'GOLD_SLIME' ? '#facc15' : '#38bdf8';
                    ctx.beginPath();
                    ctx.arc(0, 2, 19, Math.PI, 0, false);
                    ctx.quadraticCurveTo(19, 18, 0, 18);
                    ctx.quadraticCurveTo(-19, 18, -19, 2);
                    ctx.fill();

                    if (e.type === 'GOLD_SLIME') {
                        ctx.fillStyle = '#f97316';
                        ctx.beginPath();
                        ctx.moveTo(-10, -16);
                        ctx.lineTo(-5, -24);
                        ctx.lineTo(0, -18);
                        ctx.lineTo(5, -24);
                        ctx.lineTo(10, -16);
                        ctx.closePath();
                        ctx.fill();
                    }

                    ctx.fillStyle = 'rgba(255,255,255,0.6)';
                    ctx.beginPath();
                    ctx.ellipse(-7, -5, 5, 2.8, -0.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6, 3, 2.8, 0, Math.PI * 2);
                    ctx.arc(6, 3, 2.8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#f472b6';
                    ctx.beginPath();
                    ctx.arc(-11, 6, 3, 0, Math.PI * 2);
                    ctx.arc(11, 6, 3, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'IRON_SNAIL') {
                    ctx.fillStyle = '#94a3b8';
                    ctx.beginPath();
                    ctx.arc(0, 0, 19, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#334155';
                    ctx.lineWidth = 3;
                    ctx.stroke();

                    ctx.fillStyle = '#cbd5e1';
                    ctx.beginPath();
                    ctx.arc(0, 0, 11, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6, 6, 2.6, 0, Math.PI * 2);
                    ctx.arc(6, 6, 2.6, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'MUSHROOM') {
                    ctx.fillStyle = '#fef3c7';
                    drawRoundRect(ctx, -11, 2, 22, 16, 7);
                    ctx.fill();

                    ctx.fillStyle = '#f43f5e';
                    ctx.beginPath();
                    ctx.arc(0, 3, 20, Math.PI, 0, false);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(-9, -6, 4, 0, Math.PI * 2);
                    ctx.arc(8, -8, 3.5, 0, Math.PI * 2);
                    ctx.arc(0, -13, 3, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#1e293b';
                    ctx.beginPath();
                    ctx.arc(-5, 9, 2.4, 0, Math.PI * 2);
                    ctx.arc(5, 9, 2.4, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'GHOST') {
                    ctx.globalAlpha = 0.88;
                    ctx.fillStyle = '#c084fc';
                    ctx.beginPath();
                    ctx.arc(0, -2, 18, Math.PI, 0, false);
                    ctx.lineTo(18, 16);
                    ctx.lineTo(9, 11);
                    ctx.lineTo(0, 16);
                    ctx.lineTo(-9, 11);
                    ctx.lineTo(-18, 16);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(-6, 0, 4, 0, Math.PI * 2);
                    ctx.arc(6, 0, 4, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#3b0764';
                    ctx.beginPath();
                    ctx.arc(-6, 0, 2, 0, Math.PI * 2);
                    ctx.arc(6, 0, 2, 0, Math.PI * 2);
                    ctx.fill();

                } else if (e.type === 'SALAMANDER') {
                    ctx.fillStyle = '#fb923c';
                    ctx.beginPath();
                    ctx.ellipse(0, 4, 17, 15, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = '#fb923c';
                    ctx.lineWidth = 6;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-14, 8);
                    ctx.quadraticCurveTo(-24, 4, -25, -6);
                    ctx.stroke();

                    const flick = Math.sin(this.globalTime * 0.35) * 2;
                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.moveTo(-25, -5);
                    ctx.lineTo(-21, -13 - flick);
                    ctx.lineTo(-17, -4);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#ef4444';
                    ctx.beginPath();
                    ctx.moveTo(-24, -4);
                    ctx.lineTo(-21, -9 - flick);
                    ctx.lineTo(-18, -3);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#f97316';
                    ctx.beginPath();
                    ctx.moveTo(-8, -10);
                    ctx.lineTo(-3, -19);
                    ctx.lineTo(2, -11);
                    ctx.lineTo(7, -18);
                    ctx.lineTo(11, -9);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#fed7aa';
                    ctx.beginPath();
                    ctx.ellipse(0, 9, 10, 8, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fff7ed';
                    ctx.beginPath();
                    ctx.arc(-6, 0, 5, 0, Math.PI * 2);
                    ctx.arc(6, 0, 5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6, 1, 2.6, 0, Math.PI * 2);
                    ctx.arc(6, 1, 2.6, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#7c2d12';
                    ctx.beginPath();
                    ctx.arc(-2.5, 7, 1.2, 0, Math.PI * 2);
                    ctx.arc(2.5, 7, 1.2, 0, Math.PI * 2);
                    ctx.fill();

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.fillStyle = `rgba(250, 204, 21, ${0.35 + heat * 0.5})`;
                        ctx.beginPath();
                        ctx.arc(0, 12, 4 + heat * 5, 0, Math.PI * 2);
                        ctx.fill();
                    }

                } else if (e.type === 'TORTOISE') {
                    ctx.fillStyle = '#86efac';
                    ctx.beginPath();
                    ctx.arc(-14, 12, 5.5, 0, Math.PI * 2);
                    ctx.arc(14, 12, 5.5, 0, Math.PI * 2);
                    ctx.arc(-14, -6, 5, 0, Math.PI * 2);
                    ctx.arc(14, -6, 5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#a7f3d0';
                    ctx.beginPath();
                    ctx.arc(0, -14, 9, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-3.5, -16, 1.8, 0, Math.PI * 2);
                    ctx.arc(3.5, -16, 1.8, 0, Math.PI * 2);
                    ctx.fill();

                    const shellGrad = ctx.createLinearGradient(0, -12, 0, 16);
                    shellGrad.addColorStop(0, '#22c55e');
                    shellGrad.addColorStop(1, '#15803d');
                    ctx.fillStyle = shellGrad;
                    ctx.beginPath();
                    ctx.ellipse(0, 2, 18, 15, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = 'rgba(240, 253, 244, 0.75)';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(0, -13); ctx.lineTo(0, 17);
                    ctx.moveTo(-17, 2); ctx.lineTo(17, 2);
                    ctx.moveTo(-11, -9); ctx.lineTo(11, 13);
                    ctx.moveTo(11, -9); ctx.lineTo(-11, 13);
                    ctx.stroke();

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.fillStyle = `rgba(56, 189, 248, ${0.4 + heat * 0.5})`;
                        ctx.beginPath();
                        ctx.arc(0, -24 - heat * 3, 3 + heat * 3, 0, Math.PI * 2);
                        ctx.fill();
                    }

                } else if (e.type === 'AZUREBIRD') {
                    ctx.fillStyle = '#22d3ee';
                    ctx.beginPath();
                    ctx.ellipse(0, 2, 15, 13, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#06b6d4';
                    ctx.beginPath();
                    ctx.moveTo(-12, 2);
                    ctx.lineTo(-26, -4);
                    ctx.lineTo(-24, 4);
                    ctx.lineTo(-26, 11);
                    ctx.closePath();
                    ctx.fill();

                    const flap = Math.sin(e.animPhase * 3.2) * 5;
                    ctx.fillStyle = '#67e8f9';
                    ctx.beginPath();
                    ctx.ellipse(-4, -8 - flap * 0.4, 12, 6, -0.5 - flap * 0.05, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.beginPath();
                    ctx.ellipse(6, -9 + flap * 0.4, 11, 5.5, 0.45 + flap * 0.05, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#cffafe';
                    ctx.beginPath();
                    ctx.arc(11, -9, 8, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fbbf24';
                    ctx.beginPath();
                    ctx.moveTo(18, -9);
                    ctx.lineTo(26, -7);
                    ctx.lineTo(18, -5);
                    ctx.closePath();
                    ctx.fill();

                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(13, -11, 2, 0, Math.PI * 2);
                    ctx.fill();

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.strokeStyle = `rgba(165, 243, 252, ${0.4 + heat * 0.5})`;
                        ctx.lineWidth = 2.5;
                        for (let w = 0; w < 3; w++) {
                            ctx.beginPath();
                            ctx.arc(0, 0, 22 + w * 5 + heat * 6, -0.6, 0.6);
                            ctx.stroke();
                        }
                    }

                } else if (e.type === 'WHITETIGER') {
                    ctx.fillStyle = '#f1f5f9';
                    ctx.beginPath();
                    ctx.ellipse(0, 4, 18, 16, 0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#e2e8f0';
                    ctx.beginPath();
                    ctx.moveTo(-14, -10); ctx.lineTo(-9, -22); ctx.lineTo(-4, -10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(14, -10); ctx.lineTo(9, -22); ctx.lineTo(4, -10);
                    ctx.closePath();
                    ctx.fill();
                    ctx.fillStyle = '#f9a8d4';
                    ctx.beginPath();
                    ctx.moveTo(-12, -11); ctx.lineTo(-9, -18); ctx.lineTo(-6, -11);
                    ctx.closePath();
                    ctx.fill();
                    ctx.beginPath();
                    ctx.moveTo(12, -11); ctx.lineTo(9, -18); ctx.lineTo(6, -11);
                    ctx.closePath();
                    ctx.fill();

                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.4;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(-6, -14); ctx.lineTo(-6, -4);
                    ctx.moveTo(0, -16); ctx.lineTo(0, -5);
                    ctx.moveTo(6, -14); ctx.lineTo(6, -4);
                    ctx.moveTo(-1, -11); ctx.lineTo(1, -11);
                    ctx.stroke();

                    ctx.fillStyle = '#facc15';
                    ctx.beginPath();
                    ctx.arc(-6.5, 1, 3.4, 0, Math.PI * 2);
                    ctx.arc(6.5, 1, 3.4, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.arc(-6.5, 1, 1.6, 0, Math.PI * 2);
                    ctx.arc(6.5, 1, 1.6, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#fbcfe8';
                    ctx.beginPath();
                    ctx.ellipse(0, 9, 6, 4.5, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.fillStyle = '#0f172a';
                    ctx.beginPath();
                    ctx.moveTo(-3, 11); ctx.lineTo(3, 11); ctx.lineTo(0, 14);
                    ctx.closePath();
                    ctx.fill();

                    if (e.feedCount > 0) {
                        ctx.strokeStyle = `rgba(192, 132, 252, ${0.45 + 0.35 * Math.sin(this.globalTime * 0.22)})`;
                        ctx.lineWidth = 2;
                        for (let s = -1; s <= 1; s += 2) {
                            ctx.beginPath();
                            ctx.moveTo(s * 8, 9);
                            ctx.lineTo(s * 22, 7 + s * 3);
                            ctx.stroke();
                        }
                    }

                    if (e.windUp > 0) {
                        const heat = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.fillStyle = `rgba(168, 85, 247, ${0.2 + heat * 0.45})`;
                        ctx.beginPath();
                        ctx.arc(0, 10, 6 + heat * 8, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }

                ctx.restore();
                ctx.globalAlpha = 1.0;

                if (e.enrageTimer > 0) {
                    this.drawIcon('angry', e.x + 17, e.y - 21, 18);
                }

                if (this.isSpecialist(e.type)) {
                    const badge = e.type === 'SALAMANDER' ? 'fire'
                                : e.type === 'TORTOISE' ? 'water'
                                : e.type === 'AZUREBIRD' ? 'wind' : 'swirl';
                    if (e.windUp > 0) {
                        this.drawIcon(badge, e.x - 18, e.y - 20, 20);
                        const pct = 1 - e.windUp / Math.max(1, e.windUpMax);
                        ctx.strokeStyle = 'rgba(250, 204, 21, 0.95)';
                        ctx.lineWidth = 3.5;
                        ctx.beginPath();
                        ctx.arc(e.x, e.y - 2, 26, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
                        ctx.stroke();
                    } else if (e.skillCd <= 0) {
                        this.drawIcon(badge, e.x - 18, e.y - 20, 20);
                    }
                }

                if (e.waterGuard > 0) {
                    ctx.strokeStyle = 'rgba(56, 189, 248, 0.9)';
                    ctx.lineWidth = 3.5;
                    ctx.setLineDash([7, 5]);
                    ctx.beginPath();
                    ctx.arc(e.x, e.y - 2, 27, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                if (e.fireImmuneTimer > 0) {
                    ctx.strokeStyle = 'rgba(249, 115, 22, 0.85)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(e.x, e.y - 2, 29 + Math.sin(this.globalTime * 0.3) * 2, 0, Math.PI * 2);
                    ctx.stroke();
                }

                if (e.maxHp > 1) {
                    const barW = 36;
                    const barH = 6;
                    const bx = e.x - barW / 2;
                    const by = e.y - 31;

                    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
                    drawRoundRect(ctx, bx - 1, by - 1, barW + 2, barH + 2, 3);
                    ctx.fill();

                    const segW = barW / e.maxHp;
                    for (let s = 0; s < e.hp; s++) {
                        ctx.fillStyle = e.hp === 1 ? '#f43f5e' : '#facc15';
                        ctx.fillRect(bx + s * segW + 1, by, segW - 2, barH);
                    }
                }
            }

            drawIcon(name, x, y, s, targetCtx = null, tint = null) {
                if (tint) {
                    // 先离屏绘制，再用 source-in 整体染色，只染色不改变原有透明度轮廓
                    const size = Math.max(4, Math.ceil(s * 1.8));
                    const tmp = document.createElement('canvas');
                    tmp.width = size;
                    tmp.height = size;
                    const tctx = tmp.getContext('2d');
                    this.drawIcon(name, size / 2, size / 2, s, tctx);
                    tctx.globalCompositeOperation = 'source-in';
                    tctx.fillStyle = tint;
                    tctx.fillRect(0, 0, size, size);
                    const out = targetCtx || this.ctx;
                    out.drawImage(tmp, x - size / 2, y - size / 2);
                    return;
                }
                const ctx = targetCtx || this.ctx;
                ctx.save();
                ctx.translate(x, y);
                const u = s / 24;
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';

                const circle = (r, fill) => {
                    if (!fill) return;
                    ctx.fillStyle = fill;
                    ctx.beginPath(); ctx.arc(0, 0, r * u, 0, Math.PI * 2); ctx.fill();
                };
                const shine = (sx, sy, r, a = 0.55) => {
                    ctx.fillStyle = `rgba(255,255,255,${a})`;
                    ctx.beginPath(); ctx.arc(sx * u, sy * u, r * u, 0, Math.PI * 2); ctx.fill();
                };

                switch (name) {
                    case 'coin': {
                        circle(11, '#92400e');
                        circle(9.2, '#f59e0b');
                        circle(7, '#fcd34d');
                        ctx.strokeStyle = '#b45309';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath(); ctx.arc(0, 0, 4.6 * u, 0, Math.PI * 2); ctx.stroke();
                        shine(-2.6, -3.2, 2, 0.65);
                        break;
                    }
                    case 'bomb': {
                        // 引线
                        ctx.strokeStyle = '#92400e';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath(); ctx.moveTo(4 * u, -7 * u); ctx.quadraticCurveTo(8 * u, -11 * u, 10 * u, -8 * u); ctx.stroke();
                        // 火花
                        ctx.fillStyle = '#fbbf24';
                        ctx.beginPath(); ctx.arc(10.5 * u, -8.5 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#f97316';
                        ctx.beginPath(); ctx.arc(10.5 * u, -8.5 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
                        // 本体
                        circle(9.2, '#1f2937');
                        circle(9.2, null);
                        ctx.fillStyle = '#374151';
                        ctx.beginPath(); ctx.arc(0, 0, 9.2 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#111827';
                        ctx.beginPath(); ctx.arc(1 * u, 1.5 * u, 7.6 * u, 0, Math.PI * 2); ctx.fill();
                        shine(-3, -3.4, 2.4, 0.5);
                        // 顶部盖
                        ctx.fillStyle = '#6b7280';
                        drawRoundRect(ctx, -3.4 * u, -11.6 * u, 6.8 * u, 3.4 * u, 1.4 * u);
                        ctx.fill();
                        break;
                    }
                    case 'fire': {
                        // 外焰
                        ctx.fillStyle = '#f97316';
                        ctx.beginPath();
                        ctx.moveTo(0, -11 * u);
                        ctx.bezierCurveTo(7 * u, -4 * u, 9 * u, 2 * u, 6 * u, 8 * u);
                        ctx.bezierCurveTo(4 * u, 11 * u, -4 * u, 11 * u, -6 * u, 8 * u);
                        ctx.bezierCurveTo(-9 * u, 2 * u, -7 * u, -4 * u, 0, -11 * u);
                        ctx.fill();
                        // 内焰
                        ctx.fillStyle = '#fde047';
                        ctx.beginPath();
                        ctx.moveTo(0, -5 * u);
                        ctx.bezierCurveTo(4 * u, 0, 5 * u, 4 * u, 3 * u, 8 * u);
                        ctx.bezierCurveTo(1.5 * u, 10 * u, -1.5 * u, 10 * u, -3 * u, 8 * u);
                        ctx.bezierCurveTo(-5 * u, 4 * u, -4 * u, 0, 0, -5 * u);
                        ctx.fill();
                        break;
                    }
                    case 'bolt': {
                        ctx.fillStyle = '#facc15';
                        ctx.strokeStyle = '#b45309';
                        ctx.lineWidth = 1.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(4 * u, -11 * u);
                        ctx.lineTo(-5 * u, 2 * u);
                        ctx.lineTo(-1 * u, 2 * u);
                        ctx.lineTo(-4 * u, 11 * u);
                        ctx.lineTo(5 * u, -2 * u);
                        ctx.lineTo(1 * u, -2 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        break;
                    }
                    case 'shield': {
                        ctx.fillStyle = '#10b981';
                        ctx.strokeStyle = '#065f46';
                        ctx.lineWidth = 1.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.lineTo(8 * u, -6 * u);
                        ctx.lineTo(8 * u, 1 * u);
                        ctx.bezierCurveTo(8 * u, 7 * u, 4 * u, 10 * u, 0, 11.5 * u);
                        ctx.bezierCurveTo(-4 * u, 10 * u, -8 * u, 7 * u, -8 * u, 1 * u);
                        ctx.lineTo(-8 * u, -6 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        shine(-2.6, -3.4, 1.8, 0.5);
                        break;
                    }
                    case 'clock': {
                        circle(9.4, '#e0f2fe');
                        ctx.strokeStyle = '#0284c7';
                        ctx.lineWidth = 2 * u;
                        ctx.beginPath(); ctx.arc(0, 0, 9.4 * u, 0, Math.PI * 2); ctx.stroke();
                        ctx.strokeStyle = '#0c4a6e';
                        ctx.lineWidth = 2 * u;
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5.5 * u); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(4 * u, 1.5 * u); ctx.stroke();
                        circle(1.6, '#0c4a6e');
                        break;
                    }
                    case 'ghost': {
                        ctx.fillStyle = '#a78bfa';
                        ctx.beginPath();
                        ctx.arc(0, -2 * u, 8 * u, Math.PI, 0);
                        ctx.lineTo(8 * u, 7 * u);
                        // 波浪底边
                        for (let i = 0; i < 3; i++) {
                            ctx.arc((8 - (i * 2 + 1) * 16 / 6) * u, 7 * u, (16 / 6 / 2) * u, 0, Math.PI, true);
                        }
                        ctx.closePath();
                        ctx.fill();
                        // 眼睛
                        ctx.fillStyle = '#1e1b4b';
                        ctx.beginPath(); ctx.arc(-3 * u, -3 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(3 * u, -3 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        shine(-3.4, -6, 1.6, 0.5);
                        break;
                    }
                    case 'vest': {
                        // 火焰纹章盾
                        ctx.fillStyle = '#f59e0b';
                        ctx.strokeStyle = '#92400e';
                        ctx.lineWidth = 1.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.lineTo(8 * u, -6 * u);
                        ctx.lineTo(8 * u, 1 * u);
                        ctx.bezierCurveTo(8 * u, 7 * u, 4 * u, 10 * u, 0, 11.5 * u);
                        ctx.bezierCurveTo(-4 * u, 10 * u, -8 * u, 7 * u, -8 * u, 1 * u);
                        ctx.lineTo(-8 * u, -6 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        // 小火焰
                        ctx.fillStyle = '#ef4444';
                        ctx.beginPath();
                        ctx.moveTo(0, -5 * u);
                        ctx.bezierCurveTo(3.4 * u, -1 * u, 4 * u, 3 * u, 2.4 * u, 6 * u);
                        ctx.bezierCurveTo(1 * u, 8 * u, -1 * u, 8 * u, -2.4 * u, 6 * u);
                        ctx.bezierCurveTo(-4 * u, 3 * u, -3.4 * u, -1 * u, 0, -5 * u);
                        ctx.fill();
                        break;
                    }
                    case 'bird': {
                        // 魔力鸟：圆身 + 翅膀 + 喙
                        ctx.fillStyle = '#f472b6';
                        ctx.beginPath(); ctx.ellipse(0, 1 * u, 7.5 * u, 6 * u, 0, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#ec4899';
                        ctx.beginPath(); ctx.ellipse(-5 * u, -1 * u, 4.5 * u, 3 * u, -0.5, 0, Math.PI * 2); ctx.fill();
                        // 眼睛
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(3 * u, -1 * u, 2.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#0f172a';
                        ctx.beginPath(); ctx.arc(3.6 * u, -1 * u, 1.3 * u, 0, Math.PI * 2); ctx.fill();
                        // 喙
                        ctx.fillStyle = '#fbbf24';
                        ctx.beginPath();
                        ctx.moveTo(8.5 * u, 0); ctx.lineTo(11.5 * u, 1.6 * u); ctx.lineTo(8.5 * u, 3.2 * u);
                        ctx.closePath(); ctx.fill();
                        // 彩虹尾
                        ctx.strokeStyle = '#a78bfa'; ctx.lineWidth = 2 * u;
                        ctx.beginPath(); ctx.moveTo(-7 * u, 4 * u); ctx.quadraticCurveTo(-11 * u, 7 * u, -10 * u, 10 * u); ctx.stroke();
                        break;
                    }
                    case 'snow': {
                        ctx.strokeStyle = '#e0f2fe';
                        ctx.lineWidth = 2.2 * u;
                        for (let i = 0; i < 6; i++) {
                            const a = (i / 6) * Math.PI * 2;
                            ctx.beginPath();
                            ctx.moveTo(0, 0);
                            ctx.lineTo(Math.cos(a) * 9 * u, Math.sin(a) * 9 * u);
                            ctx.stroke();
                            // 小分叉
                            const bx = Math.cos(a) * 6 * u, by = Math.sin(a) * 6 * u;
                            ctx.lineWidth = 1.6 * u;
                            ctx.beginPath();
                            ctx.moveTo(bx, by);
                            ctx.lineTo(bx + Math.cos(a + 0.5) * 2.6 * u, by + Math.sin(a + 0.5) * 2.6 * u);
                            ctx.moveTo(bx, by);
                            ctx.lineTo(bx + Math.cos(a - 0.5) * 2.6 * u, by + Math.sin(a - 0.5) * 2.6 * u);
                            ctx.stroke();
                            ctx.lineWidth = 2.2 * u;
                        }
                        circle(1.8, '#ffffff');
                        break;
                    }
                    case 'leaf': {
                        ctx.fillStyle = '#22c55e';
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.bezierCurveTo(8 * u, -4 * u, 8 * u, 6 * u, 0, 10 * u);
                        ctx.bezierCurveTo(-8 * u, 6 * u, -8 * u, -4 * u, 0, -10 * u);
                        ctx.fill();
                        ctx.strokeStyle = '#15803d';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath(); ctx.moveTo(0, -8 * u); ctx.lineTo(0, 8 * u); ctx.stroke();
                        shine(-2.4, -3, 1.6, 0.5);
                        break;
                    }
                    case 'heart': {
                        ctx.fillStyle = '#f43f5e';
                        ctx.strokeStyle = '#9f1239';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath();
                        ctx.moveTo(0, 9 * u);
                        ctx.bezierCurveTo(-11 * u, 1 * u, -9 * u, -8 * u, -4 * u, -8 * u);
                        ctx.bezierCurveTo(-1.5 * u, -8 * u, 0, -6 * u, 0, -5 * u);
                        ctx.bezierCurveTo(0, -6 * u, 1.5 * u, -8 * u, 4 * u, -8 * u);
                        ctx.bezierCurveTo(9 * u, -8 * u, 11 * u, 1 * u, 0, 9 * u);
                        ctx.closePath();
                        ctx.fill(); ctx.stroke();
                        shine(-3, -3.4, 1.6, 0.5);
                        break;
                    }
                    case 'play': {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-4 * u, -8 * u);
                        ctx.lineTo(8 * u, 0);
                        ctx.lineTo(-4 * u, 8 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'pause': {
                        ctx.fillStyle = '#ffffff';
                        drawRoundRect(ctx, -7 * u, -8 * u, 5.5 * u, 16 * u, 2.4 * u);
                        ctx.fill();
                        drawRoundRect(ctx, 1.5 * u, -8 * u, 5.5 * u, 16 * u, 2.4 * u);
                        ctx.fill();
                        break;
                    }
                    case 'speaker': {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-8 * u, -4 * u);
                        ctx.lineTo(-3 * u, -4 * u);
                        ctx.lineTo(2 * u, -9 * u);
                        ctx.lineTo(2 * u, 9 * u);
                        ctx.lineTo(-3 * u, 4 * u);
                        ctx.lineTo(-8 * u, 4 * u);
                        ctx.closePath();
                        ctx.fill();
                        // 声波
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath(); ctx.arc(3 * u, 0, 5 * u, -0.9, 0.9); ctx.stroke();
                        ctx.beginPath(); ctx.arc(3 * u, 0, 8.5 * u, -0.9, 0.9); ctx.stroke();
                        break;
                    }
                    case 'speakerOff': {
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-8 * u, -4 * u);
                        ctx.lineTo(-3 * u, -4 * u);
                        ctx.lineTo(2 * u, -9 * u);
                        ctx.lineTo(2 * u, 9 * u);
                        ctx.lineTo(-3 * u, 4 * u);
                        ctx.lineTo(-8 * u, 4 * u);
                        ctx.closePath();
                        ctx.fill();
                        ctx.strokeStyle = '#fca5a5';
                        ctx.lineWidth = 2.6 * u;
                        ctx.beginPath();
                        ctx.moveTo(5 * u, -5 * u); ctx.lineTo(11 * u, 5 * u);
                        ctx.moveTo(11 * u, -5 * u); ctx.lineTo(5 * u, 5 * u);
                        ctx.stroke();
                        break;
                    }
                    case 'restart': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3 * u;
                        ctx.beginPath();
                        ctx.arc(0, 0, 7.5 * u, -0.6, Math.PI * 1.35);
                        ctx.stroke();
                        // 箭头
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(9.5 * u, -6 * u);
                        ctx.lineTo(4 * u, -8.5 * u);
                        ctx.lineTo(7.5 * u, -2.5 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'fullscreen': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 3 * u;
                        const corner = (sx, sy) => {
                            ctx.beginPath();
                            ctx.moveTo(sx * 9 * u, sy * 5.5 * u);
                            ctx.lineTo(sx * 9 * u, sy * 9 * u);
                            ctx.lineTo(sx * 5.5 * u, sy * 9 * u);
                            ctx.stroke();
                        };
                        corner(-1, -1); corner(1, -1); corner(-1, 1); corner(1, 1);
                        break;
                    }
                    case 'flag': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.4 * u;
                        ctx.beginPath();
                        ctx.moveTo(-5 * u, -9 * u); ctx.lineTo(-5 * u, 10 * u);
                        ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-5 * u, -9 * u);
                        ctx.lineTo(8 * u, -5.5 * u);
                        ctx.lineTo(-5 * u, -2 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'trophy': {
                        // 杯身
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.moveTo(-6 * u, -9 * u);
                        ctx.lineTo(6 * u, -9 * u);
                        ctx.lineTo(4 * u, 2 * u);
                        ctx.quadraticCurveTo(0, 4 * u, -4 * u, 2 * u);
                        ctx.closePath();
                        ctx.fill();
                        // 杯耳
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath(); ctx.arc(-7.5 * u, -5 * u, 3 * u, Math.PI * 0.4, Math.PI * 1.5); ctx.stroke();
                        ctx.beginPath(); ctx.arc(7.5 * u, -5 * u, 3 * u, Math.PI * 1.5, Math.PI * 0.6); ctx.stroke();
                        // 底座
                        ctx.fillRect(-2 * u, 4 * u, 4 * u, 3 * u);
                        ctx.fillRect(-5 * u, 7 * u, 10 * u, 2.6 * u);
                        break;
                    }
                    case 'puzzle': {
                        ctx.fillStyle = '#ffffff';
                        drawRoundRect(ctx, -9 * u, -9 * u, 18 * u, 18 * u, 3 * u);
                        ctx.fill();
                        // 拼图凸起与凹槽，用透明挖空形成轮廓
                        ctx.globalCompositeOperation = 'destination-out';
                        ctx.beginPath(); ctx.arc(0, -9 * u, 3.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(0, 9 * u, 3.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(-9 * u, 0, 3.6 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(9 * u, 0, 3.6 * u, 0, Math.PI * 2); ctx.fill();
                        break;
                    }
                    case 'target': {
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.4 * u;
                        circle(8.5, null);
                        ctx.beginPath(); ctx.arc(0, 0, 8.5 * u, 0, Math.PI * 2); ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(0, 0, 4.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = 'rgba(0,0,0,0.25)';
                        ctx.beginPath(); ctx.arc(0, 0, 2 * u, 0, Math.PI * 2); ctx.fill();
                        break;
                    }
                    case 'monster': {
                        // 小怪兽头
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath();
                        ctx.arc(0, 1 * u, 8 * u, 0, Math.PI * 2);
                        ctx.fill();
                        // 角
                        ctx.beginPath();
                        ctx.moveTo(-6 * u, -5 * u); ctx.lineTo(-8 * u, -11 * u); ctx.lineTo(-2 * u, -7 * u);
                        ctx.moveTo(6 * u, -5 * u); ctx.lineTo(8 * u, -11 * u); ctx.lineTo(2 * u, -7 * u);
                        ctx.fill();
                        // 眼睛
                        ctx.fillStyle = 'rgba(0,0,0,0.35)';
                        ctx.beginPath(); ctx.arc(-3 * u, 0, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.beginPath(); ctx.arc(3 * u, 0, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        // 嘴
                        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
                        ctx.lineWidth = 1.8 * u;
                        ctx.beginPath(); ctx.arc(0, 3 * u, 3 * u, 0.3, Math.PI - 0.3); ctx.stroke();
                        break;
                    }
                    case 'rotate': {
                        // 手机旋转
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.4 * u;
                        drawRoundRect(ctx, -6 * u, -9 * u, 12 * u, 18 * u, 2.5 * u);
                        ctx.stroke();
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(0, 6.5 * u, 1.4 * u, 0, Math.PI * 2); ctx.fill();
                        // 旋转箭头
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2.2 * u;
                        ctx.beginPath();
                        ctx.arc(0, 0, 13 * u, -2.4, -0.9);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(12.5 * u, -4.5 * u);
                        ctx.lineTo(13.5 * u, -11 * u);
                        ctx.lineTo(7 * u, -9 * u);
                        ctx.closePath();
                        ctx.fill();
                        break;
                    }
                    case 'help': {
                        // 问号：帮助
                        ctx.fillStyle = '#ffffff';
                        ctx.beginPath(); ctx.arc(0, 0, 11 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillStyle = '#2e9e5b';
                        ctx.font = `900 ${17 * u}px 'Fredoka', sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('?', 0, 1 * u);
                        break;
                    }
                    case 'lock': {
                        // 锁体
                        ctx.fillStyle = '#64748b';
                        drawRoundRect(ctx, -7 * u, -2 * u, 14 * u, 11 * u, 3 * u);
                        ctx.fill();
                        ctx.fillStyle = '#475569';
                        drawRoundRect(ctx, -7 * u, -2 * u, 14 * u, 4 * u, 3 * u);
                        ctx.fill();
                        // 锁梁
                        ctx.strokeStyle = '#cbd5e1';
                        ctx.lineWidth = 3 * u;
                        ctx.beginPath(); ctx.arc(0, -2 * u, 5 * u, Math.PI, 0); ctx.stroke();
                        // 钥匙孔
                        ctx.fillStyle = '#f8fafc';
                        ctx.beginPath(); ctx.arc(0, 2.5 * u, 1.8 * u, 0, Math.PI * 2); ctx.fill();
                        ctx.fillRect(-0.9 * u, 2.5 * u, 1.8 * u, 3.4 * u);
                        break;
                    }
                    case 'angry': {
                        // 怒气青筋（动漫式）
                        ctx.strokeStyle = '#ef4444';
                        ctx.lineWidth = 3.2 * u;
                        const bump = (cx, cy, r) => {
                            ctx.beginPath(); ctx.arc(cx * u, cy * u, r * u, 0, Math.PI * 2); ctx.stroke();
                        };
                        bump(-3.4, -2.4, 3.4); bump(3.4, -2.4, 3.4);
                        bump(-3.4, 3.6, 3.4); bump(3.4, 3.6, 3.4);
                        break;
                    }
                    case 'star': {
                        ctx.fillStyle = '#facc15';
                        ctx.strokeStyle = '#b45309';
                        ctx.lineWidth = 1.4 * u;
                        ctx.beginPath();
                        for (let i = 0; i < 10; i++) {
                            const r = (i % 2 === 0 ? 10 : 4.4) * u;
                            const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
                            const px = Math.cos(a) * r, py = Math.sin(a) * r;
                            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.closePath(); ctx.fill(); ctx.stroke();
                        shine(-2.4, -3, 1.6, 0.6);
                        break;
                    }
                    case 'water': {
                        ctx.fillStyle = '#38bdf8';
                        ctx.beginPath();
                        ctx.moveTo(0, -10 * u);
                        ctx.bezierCurveTo(6 * u, -2 * u, 8 * u, 3 * u, 8 * u, 6 * u);
                        ctx.bezierCurveTo(8 * u, 10 * u, 4 * u, 11.5 * u, 0, 11.5 * u);
                        ctx.bezierCurveTo(-4 * u, 11.5 * u, -8 * u, 10 * u, -8 * u, 6 * u);
                        ctx.bezierCurveTo(-8 * u, 3 * u, -6 * u, -2 * u, 0, -10 * u);
                        ctx.fill();
                        shine(-2.6, 3.4, 1.8, 0.55);
                        break;
                    }
                    case 'wind': {
                        ctx.strokeStyle = '#7dd3fc';
                        ctx.lineWidth = 2.4 * u;
                        const gust = (yOff, len) => {
                            ctx.beginPath();
                            ctx.moveTo(-9 * u, yOff * u);
                            ctx.bezierCurveTo(-3 * u, (yOff - 3) * u, 3 * u, (yOff + 3) * u, (len) * u, yOff * u);
                            ctx.stroke();
                        };
                        gust(-5, 7); gust(0, 9); gust(5, 6);
                        break;
                    }
                    case 'swirl': {
                        ctx.strokeStyle = '#c4b5fd';
                        ctx.lineWidth = 2.6 * u;
                        ctx.beginPath();
                        for (let a = 0; a < Math.PI * 3.4; a += 0.15) {
                            const r = (1 + a * 1.9) * u;
                            const px = Math.cos(a) * r, py = Math.sin(a) * r;
                            if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.stroke();
                        break;
                    }
                }
                ctx.restore();
            }

            drawRainbowBolts() {
                const ctx = this.ctx;
                for (let i = this.rainbowBolts.length - 1; i >= 0; i--) {
                    const b = this.rainbowBolts[i];
                    b.life--;
                    if (b.life <= 0) {
                        this.rainbowBolts.splice(i, 1);
                        continue;
                    }
                    ctx.save();
                    ctx.globalAlpha = b.life / b.maxLife;
                    ctx.strokeStyle = b.color;
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.moveTo(b.x1, b.y1);
                    const mx = (b.x1 + b.x2) / 2 + (Math.random() - 0.5) * 28;
                    const my = (b.y1 + b.y2) / 2 + (Math.random() - 0.5) * 28;
                    ctx.lineTo(mx, my);
                    ctx.lineTo(b.x2, b.y2);
                    ctx.stroke();
                    ctx.restore();
                }
            }

            drawParticlesAndTexts() {
                const ctx = this.ctx;

                for (let i = this.particles.length - 1; i >= 0; i--) {
                    const pt = this.particles[i];
                    pt.x += pt.vx;
                    pt.y += pt.vy;
                    pt.life--;

                    if (pt.life <= 0) {
                        this.particles.splice(i, 1);
                        continue;
                    }

                    const lifeRatio = pt.life / pt.maxLife;
                    ctx.globalAlpha = lifeRatio;

                    if (pt.ring) {
                        const rr = pt.ringMax * (1 - lifeRatio) + 6;
                        ctx.strokeStyle = pt.color;
                        ctx.lineWidth = 3 * lifeRatio;
                        ctx.beginPath();
                        ctx.arc(pt.x, pt.y, rr, 0, Math.PI * 2);
                        ctx.stroke();
                        continue;
                    }

                    ctx.fillStyle = pt.color;
                    ctx.beginPath();
                    ctx.arc(pt.x, pt.y, pt.radius * lifeRatio, 0, Math.PI * 2);
                    ctx.fill();
                }

                if (this.particles.length > 420) {
                    this.particles.splice(0, this.particles.length - 420);
                }

                for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
                    const ft = this.floatingTexts[i];
                    ft.y -= 0.8;
                    ft.life--;

                    if (ft.life <= 0) {
                        this.floatingTexts.splice(i, 1);
                        continue;
                    }

                    ctx.globalAlpha = Math.min(1, (ft.life / ft.maxLife) * 1.5);
                    ctx.font = `900 ${ft.fontSize || 15}px "Fredoka", "Noto Sans SC", sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 4;
                    ctx.strokeText(ft.text, ft.x, ft.y);
                    ctx.fillStyle = ft.color;
                    ctx.fillText(ft.text, ft.x, ft.y);
                }

                ctx.globalAlpha = 1.0;
            }
    }

    global.drawRoundRect = drawRoundRect;
    global.GameRenderMixin = GameRenderMixin;
})(typeof window !== 'undefined' ? window : globalThis);
