/**
 * sprites.js — 预渲染贴图工厂
 *
 * 设计目的：
 *   1. 质感：地板/墙体/木箱/爆炸从"每帧几何绘制"改为"一次预渲染 + drawImage"，
 *      因此可以放心叠加多层光影、描边、噪点，不会拖慢帧率。
 *   2. 性能：主循环里每格只做一次 drawImage（原来每格十几次路径 + 渐变）。
 *
 * 所有贴图按 2x 分辨率绘制，绘制时缩放到逻辑尺寸，保证高分屏下边缘锐利。
 */
(function (global) {
    'use strict';

    const TAU = Math.PI * 2;
    const cache = new Map();
    const floorKeys = [];        // 地板贴图按 LRU 淘汰：大地图单张可达 2460×2100
    const FLOOR_CACHE_MAX = 2;
    const SPRITE_SCALE = 2;      // 方块/爆炸贴图超采样倍数
    const TILE = 60;             // 与 config.js 的 TILE_SIZE 保持一致

    function makeCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w));
        c.height = Math.max(1, Math.round(h));
        return c;
    }

    // 确定性随机：同一张图每次生成结果一致，避免刷新后纹理跳变
    function rngFrom(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function rr(ctx, x, y, w, h, r) {
        const rad = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rad, y);
        ctx.arcTo(x + w, y, x + w, y + h, rad);
        ctx.arcTo(x + w, y + h, x, y + h, rad);
        ctx.arcTo(x, y + h, x, y, rad);
        ctx.arcTo(x, y, x + w, y, rad);
        ctx.closePath();
    }

    // ============================================================
    // 地板：四种主题
    // ============================================================
    const FLOOR_STYLES = {
        // 青青草原
        grass: {
            top: '#c6f486', mid: '#b6ec6d', bottom: '#a4de58',
            checkA: 'rgba(255,255,255,0.075)', checkB: 'rgba(45,110,28,0.05)',
            shade: 'rgba(46,100,24,0.12)',
            paint: function (ctx, x, y, t, rnd) {
                const blades = rnd() < 0.62 ? 1 + Math.floor(rnd() * 3) : 0;
                for (let i = 0; i < blades; i++) {
                    const bx = x + 7 + rnd() * (t - 14);
                    const by = y + 12 + rnd() * (t - 18);
                    const len = 5 + rnd() * 7;
                    const lean = (rnd() - 0.5) * 7;
                    const bright = rnd();
                    ctx.strokeStyle = bright > 0.55
                        ? 'rgba(116,183,64,0.8)'
                        : 'rgba(74,146,44,0.72)';
                    ctx.lineWidth = 1.4 + rnd() * 0.9;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(bx, by);
                    ctx.quadraticCurveTo(bx + lean * 0.4, by - len * 0.62, bx + lean, by - len);
                    ctx.stroke();
                }
                // 偶尔一朵小花
                if (rnd() < 0.07) {
                    const fx = x + 12 + rnd() * (t - 24);
                    const fy = y + 14 + rnd() * (t - 26);
                    ctx.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,0.92)' : 'rgba(253,224,71,0.95)';
                    for (let p = 0; p < 5; p++) {
                        const a = (p / 5) * TAU;
                        ctx.beginPath();
                        ctx.arc(fx + Math.cos(a) * 2.4, fy + Math.sin(a) * 2.4, 1.7, 0, TAU);
                        ctx.fill();
                    }
                    ctx.fillStyle = 'rgba(251,191,36,0.9)';
                    ctx.beginPath();
                    ctx.arc(fx, fy, 1.3, 0, TAU);
                    ctx.fill();
                }
            }
        },
        // 金色沙漠
        sand: {
            top: '#f7dc9a', mid: '#f0cd7c', bottom: '#e3bb63',
            checkA: 'rgba(255,248,220,0.10)', checkB: 'rgba(160,110,40,0.055)',
            shade: 'rgba(150,105,35,0.12)',
            paint: function (ctx, x, y, t, rnd) {
                // 沙纹：横向缓弧
                const lines = 1 + Math.floor(rnd() * 2);
                for (let i = 0; i < lines; i++) {
                    const ly = y + 14 + rnd() * (t - 24);
                    ctx.strokeStyle = 'rgba(186,132,52,0.22)';
                    ctx.lineWidth = 1.6;
                    ctx.lineCap = 'round';
                    ctx.beginPath();
                    ctx.moveTo(x + 6, ly);
                    ctx.quadraticCurveTo(x + t * 0.5, ly - 5 + rnd() * 4, x + t - 6, ly + 1);
                    ctx.stroke();
                }
                // 小石子
                if (rnd() < 0.16) {
                    const px = x + 12 + rnd() * (t - 24);
                    const py = y + 16 + rnd() * (t - 28);
                    ctx.fillStyle = 'rgba(160,134,92,0.55)';
                    ctx.beginPath();
                    ctx.ellipse(px, py, 2.6, 1.8, rnd() * 3, 0, TAU);
                    ctx.fill();
                    ctx.fillStyle = 'rgba(255,255,255,0.35)';
                    ctx.beginPath();
                    ctx.ellipse(px - 0.6, py - 0.7, 1.2, 0.8, 0, 0, TAU);
                    ctx.fill();
                }
            }
        },
        // 冰封雪原
        snow: {
            top: '#e8f6ff', mid: '#d8efff', bottom: '#c2e4fb',
            checkA: 'rgba(255,255,255,0.16)', checkB: 'rgba(70,140,190,0.05)',
            shade: 'rgba(60,130,180,0.10)',
            paint: function (ctx, x, y, t, rnd) {
                // 冰面反光斜条
                if (rnd() < 0.35) {
                    ctx.save();
                    ctx.beginPath();
                    ctx.rect(x, y, t, t);
                    ctx.clip();
                    ctx.fillStyle = 'rgba(255,255,255,0.42)';
                    ctx.beginPath();
                    const ox = x + rnd() * t;
                    ctx.moveTo(ox, y + t);
                    ctx.lineTo(ox + 8, y);
                    ctx.lineTo(ox + 14, y);
                    ctx.lineTo(ox + 6, y + t);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                }
                // 雪粒
                const dots = 1 + Math.floor(rnd() * 3);
                for (let i = 0; i < dots; i++) {
                    ctx.fillStyle = 'rgba(255,255,255,0.85)';
                    ctx.beginPath();
                    ctx.arc(x + 8 + rnd() * (t - 16), y + 8 + rnd() * (t - 16), 0.9 + rnd() * 1.1, 0, TAU);
                    ctx.fill();
                }
            }
        },
        // 烈焰火山
        lava: {
            top: '#4a1d86', mid: '#401875', bottom: '#351060',
            checkA: 'rgba(167,139,250,0.09)', checkB: 'rgba(0,0,0,0.14)',
            shade: 'rgba(0,0,0,0.22)',
            paint: function (ctx, x, y, t, rnd) {
                // 岩缝裂纹
                if (rnd() < 0.55) {
                    ctx.strokeStyle = 'rgba(24,8,48,0.55)';
                    ctx.lineWidth = 1.8;
                    ctx.beginPath();
                    const sx = x + 8 + rnd() * (t - 16);
                    const sy = y + 8;
                    ctx.moveTo(sx, sy);
                    let cx2 = sx, cy2 = sy;
                    for (let k = 1; k <= 3; k++) {
                        cx2 += (rnd() - 0.5) * 16;
                        cy2 += (t - 16) / 3;
                        ctx.lineTo(cx2, cy2);
                    }
                    ctx.stroke();
                }
                // 熔岩微光
                if (rnd() < 0.28) {
                    const gx = x + 12 + rnd() * (t - 24);
                    const gy = y + 12 + rnd() * (t - 24);
                    const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, 9);
                    gr.addColorStop(0, 'rgba(251,146,60,0.55)');
                    gr.addColorStop(0.5, 'rgba(239,68,68,0.22)');
                    gr.addColorStop(1, 'rgba(239,68,68,0)');
                    ctx.fillStyle = gr;
                    ctx.beginPath();
                    ctx.arc(gx, gy, 9, 0, TAU);
                    ctx.fill();
                }
            }
        }
    };

    // 关卡主题名 -> 贴图风格名
    const THEME_ALIAS = {
        '青青草原': 'grass',
        '金色沙漠': 'sand',
        '冰封雪原': 'snow',
        '烈焰火山': 'lava'
    };

    function resolveStyle(name) {
        if (THEME_ALIAS[name]) return THEME_ALIAS[name];
        if (FLOOR_STYLES[name]) return name;
        return 'grass';
    }

    function buildFloor(themeName, cols, rows, tile) {
        const styleKey = resolveStyle(themeName);
        const style = FLOOR_STYLES[styleKey];
        const key = 'floor:' + styleKey + ':' + cols + ':' + rows + ':' + tile;
        if (cache.has(key)) return cache.get(key);

        const t = tile || TILE;
        const W = cols * t;
        const H = rows * t;
        const cv = makeCanvas(W, H);
        const ctx = cv.getContext('2d');
        const rnd = rngFrom(9173 + cols * 131 + rows * 17 + (themeName || '').length * 7);

        // 1) 底色渐变（整体光照：上方略亮）
        const base = ctx.createLinearGradient(0, 0, 0, H);
        base.addColorStop(0, style.top);
        base.addColorStop(0.5, style.mid);
        base.addColorStop(1, style.bottom);
        ctx.fillStyle = base;
        ctx.fillRect(0, 0, W, H);

        // 2) 逐格：棋盘格 + 柔光 + 厚度阴影 + 主题装饰
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x = c * t;
                const y = r * t;
                const even = (r + c) % 2 === 0;

                ctx.fillStyle = even ? style.checkA : style.checkB;
                ctx.fillRect(x, y, t, t);

                // 左上柔光
                const lg = ctx.createRadialGradient(
                    x + t * 0.28, y + t * 0.24, 1,
                    x + t * 0.28, y + t * 0.24, t * 0.78
                );
                lg.addColorStop(0, 'rgba(255,255,255,0.10)');
                lg.addColorStop(0.55, 'rgba(255,255,255,0.03)');
                lg.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.fillStyle = lg;
                ctx.fillRect(x, y, t, t);

                // 底部厚度
                const bg = ctx.createLinearGradient(0, y + t * 0.74, 0, y + t);
                bg.addColorStop(0, 'rgba(0,0,0,0)');
                bg.addColorStop(1, style.shade);
                ctx.fillStyle = bg;
                ctx.fillRect(x, y + t * 0.74, t, t * 0.26);

                style.paint(ctx, x, y, t, rnd);
            }
        }

        // 3) 全局柔光：模拟左上主光源
        const sheen = ctx.createRadialGradient(W * 0.28, H * 0.12, 10, W * 0.28, H * 0.12, Math.max(W, H) * 0.95);
        sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
        sheen.addColorStop(0.45, 'rgba(255,255,255,0.04)');
        sheen.addColorStop(1, 'rgba(0,0,0,0.035)');
        ctx.fillStyle = sheen;
        ctx.fillRect(0, 0, W, H);

        cache.set(key, cv);

        // LRU：切难度/换主题会生成不同尺寸的地板，无上限缓存会累积几十 MB 位图
        floorKeys.push(key);
        while (floorKeys.length > FLOOR_CACHE_MAX) {
            const old = floorKeys.shift();
            const oldCv = cache.get(old);
            if (oldCv) {
                oldCv.width = 0;   // 主动释放位图内存
                oldCv.height = 0;
                cache.delete(old);
            }
        }
        return cv;
    }

    // ============================================================
    // 方块贴图
    // ============================================================
    function drawStoneWall(ctx, s) {
        const pad = 2;
        const w = s - pad * 2;
        const h = s - pad * 2;

        // 落地投影
        ctx.fillStyle = 'rgba(15,23,42,0.24)';
        rr(ctx, pad + 0.5, pad + 5, w, h - 2, 11);
        ctx.fill();

        // 外轮廓（深色描边，让方块从地板里"立起来"）
        ctx.fillStyle = '#54697f';
        rr(ctx, pad, pad, w, h - 2, 11);
        ctx.fill();

        // 石面
        const g = ctx.createLinearGradient(0, pad, 0, pad + h);
        g.addColorStop(0, '#c2d0dc');
        g.addColorStop(0.4, '#a1b2c2');
        g.addColorStop(1, '#7f93a6');
        ctx.fillStyle = g;
        rr(ctx, pad + 2, pad + 2, w - 4, h - 8, 9);
        ctx.fill();

        // 砖块分区（错位砌法）
        ctx.save();
        rr(ctx, pad + 2, pad + 2, w - 4, h - 8, 9);
        ctx.clip();

        const rows = 3;
        const rh = (h - 8) / rows;
        ctx.strokeStyle = 'rgba(58,76,94,0.34)';
        ctx.lineWidth = 1.6;
        for (let i = 1; i < rows; i++) {
            const yy = pad + 2 + rh * i;
            ctx.beginPath();
            ctx.moveTo(pad + 2, yy);
            ctx.lineTo(pad + w - 2, yy);
            ctx.stroke();
        }
        for (let i = 0; i < rows; i++) {
            const yy = pad + 2 + rh * i;
            const offset = i % 2 === 0 ? w * 0.5 : w * 0.26;
            ctx.beginPath();
            ctx.moveTo(pad + offset, yy);
            ctx.lineTo(pad + offset, yy + rh);
            ctx.stroke();
        }

        // 每块砖的明暗差（打破平整感）
        const blockLight = ['rgba(255,255,255,0.14)', 'rgba(255,255,255,0.06)', 'rgba(30,50,70,0.06)'];
        for (let i = 0; i < rows; i++) {
            const yy = pad + 2 + rh * i;
            ctx.fillStyle = blockLight[i % blockLight.length];
            ctx.fillRect(pad + 2, yy, w - 4, rh);
        }

        // 顶部受光
        const hl = ctx.createLinearGradient(0, pad + 2, 0, pad + 12);
        hl.addColorStop(0, 'rgba(255,255,255,0.55)');
        hl.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = hl;
        ctx.fillRect(pad + 2, pad + 2, w - 4, 10);

        // 底部内侧阴影
        const is = ctx.createLinearGradient(0, pad + h - 16, 0, pad + h - 4);
        is.addColorStop(0, 'rgba(28,45,62,0)');
        is.addColorStop(1, 'rgba(28,45,62,0.28)');
        ctx.fillStyle = is;
        ctx.fillRect(pad + 2, pad + h - 16, w - 4, 14);
        ctx.restore();

        // 铆钉
        [[pad + 8, pad + 9], [pad + w - 8, pad + 9]].forEach(function (p) {
            ctx.fillStyle = 'rgba(70,92,112,0.7)';
            ctx.beginPath();
            ctx.arc(p[0], p[1], 2.1, 0, TAU);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath();
            ctx.arc(p[0] - 0.6, p[1] - 0.6, 0.9, 0, TAU);
            ctx.fill();
        });
    }

    function drawWoodCrate(ctx, s, variant) {
        const pad = 2;
        const w = s - pad * 2;
        const h = s - pad * 2;
        const rnd = rngFrom(4200 + variant * 31);

        // 投影
        ctx.fillStyle = 'rgba(60,30,5,0.24)';
        rr(ctx, pad + 0.5, pad + 5, w, h - 2, 10);
        ctx.fill();

        // 箱体深色轮廓
        ctx.fillStyle = '#8a4c0f';
        rr(ctx, pad, pad, w, h - 2, 10);
        ctx.fill();

        // 箱面
        const g = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
        g.addColorStop(0, '#e3a856');
        g.addColorStop(0.45, '#d08e35');
        g.addColorStop(1, '#b1711f');
        ctx.fillStyle = g;
        rr(ctx, pad + 2.5, pad + 2.5, w - 5, h - 8, 8);
        ctx.fill();

        ctx.save();
        rr(ctx, pad + 2.5, pad + 2.5, w - 5, h - 8, 8);
        ctx.clip();

        // 竖向木纹
        for (let i = 0; i < 4; i++) {
            const lx = pad + 8 + ((w - 16) / 3.4) * i + rnd() * 3;
            ctx.strokeStyle = i % 2 ? 'rgba(126,72,16,0.30)' : 'rgba(255,224,170,0.26)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(lx, pad);
            ctx.bezierCurveTo(lx + 2.2, pad + h * 0.33, lx - 2.2, pad + h * 0.66, lx, pad + h);
            ctx.stroke();
        }

        // 横向加强板
        [0.30, 0.66].forEach(function (ratio, idx) {
            const yy = pad + 2.5 + (h - 8) * ratio;
            ctx.fillStyle = 'rgba(122,68,9,0.34)';
            ctx.fillRect(pad + 2.5, yy, w - 5, 4.5);
            ctx.fillStyle = 'rgba(255,224,170,0.22)';
            ctx.fillRect(pad + 2.5, yy, w - 5, 1.5);
        });

        // 顶部受光
        const hl = ctx.createLinearGradient(0, pad + 2.5, 0, pad + 13);
        hl.addColorStop(0, 'rgba(255,240,200,0.50)');
        hl.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.fillStyle = hl;
        ctx.fillRect(pad + 2.5, pad + 2.5, w - 5, 11);

        // 底部内侧阴影
        const is = ctx.createLinearGradient(0, pad + h - 18, 0, pad + h - 4);
        is.addColorStop(0, 'rgba(96,50,6,0)');
        is.addColorStop(1, 'rgba(96,50,6,0.30)');
        ctx.fillStyle = is;
        ctx.fillRect(pad + 2.5, pad + h - 18, w - 5, 15);
        ctx.restore();

        // 四角铁件
        const corner = function (cx, cy, sx, sy) {
            ctx.fillStyle = 'rgba(140,146,152,0.95)';
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + sx * 11, cy);
            ctx.lineTo(cx + sx * 11, cy + sy * 3.4);
            ctx.lineTo(cx + sx * 3.4, cy + sy * 3.4);
            ctx.lineTo(cx + sx * 3.4, cy + sy * 11);
            ctx.lineTo(cx, cy + sy * 11);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fillRect(cx + (sx > 0 ? 1 : -2), cy + (sy > 0 ? 1 : -2), 2 * sx, 1.5 * sy);
        };
        corner(pad + 3, pad + 3, 1, 1);
        corner(pad + w - 3, pad + 3, -1, 1);
        corner(pad + 3, pad + h - 5, 1, -1);
        corner(pad + w - 3, pad + h - 5, -1, -1);
    }

    function drawFrostCrate(ctx, s, variant) {
        // 先画木箱，再覆冰壳（碎裂后露出的仍是木箱）
        drawWoodCrate(ctx, s, variant);

        const pad = 2;
        const w = s - pad * 2;
        const h = s - pad * 2;

        const g = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
        g.addColorStop(0, 'rgba(224,246,255,0.88)');
        g.addColorStop(0.5, 'rgba(147,213,247,0.86)');
        g.addColorStop(1, 'rgba(96,186,235,0.88)');
        ctx.fillStyle = g;
        rr(ctx, pad, pad, w, h - 2, 10);
        ctx.fill();

        // 冰壳描边
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.lineWidth = 2.2;
        rr(ctx, pad + 1.4, pad + 1.4, w - 2.8, h - 5, 9);
        ctx.stroke();

        ctx.save();
        rr(ctx, pad, pad, w, h - 2, 10);
        ctx.clip();

        // 斜向高光
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.beginPath();
        ctx.moveTo(pad + 8, pad);
        ctx.lineTo(pad + 20, pad);
        ctx.lineTo(pad + 8, pad + 24);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(pad + 26, pad);
        ctx.lineTo(pad + 33, pad);
        ctx.lineTo(pad + 12, pad + 36);
        ctx.lineTo(pad + 8, pad + 32);
        ctx.closePath();
        ctx.fill();

        // 冰裂纹
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(pad + w - 6, pad + 6);
        ctx.lineTo(pad + w * 0.55, pad + h * 0.42);
        ctx.lineTo(pad + w * 0.72, pad + h * 0.55);
        ctx.moveTo(pad + w * 0.55, pad + h * 0.42);
        ctx.lineTo(pad + w * 0.38, pad + h * 0.62);
        ctx.stroke();
        ctx.restore();

        // 中央雪花
        const cx = s / 2;
        const cy = s / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.strokeStyle = 'rgba(255,255,255,0.95)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * TAU;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
            ctx.lineTo(Math.cos(a + 0.5) * 9, Math.sin(a + 0.5) * 9);
            ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
            ctx.lineTo(Math.cos(a - 0.5) * 9, Math.sin(a - 0.5) * 9);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawVineTile(ctx, s) {
        const pad = 3;
        const w = s - pad * 2;

        ctx.fillStyle = 'rgba(15,70,30,0.18)';
        rr(ctx, pad, pad + 3, w, w, 12);
        ctx.fill();

        const g = ctx.createLinearGradient(pad, pad, pad + w, pad + w);
        g.addColorStop(0, 'rgba(74,160,74,0.42)');
        g.addColorStop(1, 'rgba(34,120,58,0.5)');
        ctx.fillStyle = g;
        rr(ctx, pad, pad, w, w, 12);
        ctx.fill();

        ctx.strokeStyle = 'rgba(22,101,52,0.9)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, 16, 0.5, TAU - 0.4);
        ctx.stroke();
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, 10, Math.PI * 0.8, TAU + 0.6);
        ctx.stroke();

        // 叶片
        const leaf = function (lx, ly, rot) {
            ctx.save();
            ctx.translate(lx, ly);
            ctx.rotate(rot);
            const lg = ctx.createLinearGradient(0, -6, 0, 6);
            lg.addColorStop(0, 'rgba(134,239,172,0.95)');
            lg.addColorStop(1, 'rgba(34,150,74,0.95)');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.ellipse(0, 0, 4.2, 7, 0, 0, TAU);
            ctx.fill();
            ctx.strokeStyle = 'rgba(20,90,44,0.6)';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(0, -5.5);
            ctx.lineTo(0, 5.5);
            ctx.stroke();
            ctx.restore();
        };
        leaf(s / 2 - 13, s / 2 - 11, -0.7);
        leaf(s / 2 + 14, s / 2 + 9, 0.9);
        leaf(s / 2 + 12, s / 2 - 13, 0.4);
    }

    const TILE_PAINTERS = {
        wall: drawStoneWall,
        crate: drawWoodCrate,
        frost: drawFrostCrate,
        vine: drawVineTile
    };

    function buildTile(kind, variant) {
        const key = 'tile:' + kind + ':' + (variant || 0);
        if (cache.has(key)) return cache.get(key);
        const painter = TILE_PAINTERS[kind] || TILE_PAINTERS.wall;
        const cv = makeCanvas(TILE * SPRITE_SCALE, TILE * SPRITE_SCALE);
        const ctx = cv.getContext('2d');
        ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
        painter(ctx, TILE, variant || 0);
        cache.set(key, cv);
        return cv;
    }

    function drawTileSprite(ctx, kind, variant, x, y, size) {
        const cv = buildTile(kind, variant);
        ctx.drawImage(cv, x, y, size || TILE, size || TILE);
    }

    // ============================================================
    // 爆炸：预渲染火焰帧
    // ============================================================
    const EXPLOSION_FRAMES = 7;

    function buildExplosionFrames() {
        if (cache.has('boom')) return cache.get('boom');
        const frames = [];
        const S = 96;
        for (let f = 0; f < EXPLOSION_FRAMES; f++) {
            const t = f / (EXPLOSION_FRAMES - 1);
            const cv = makeCanvas(S * SPRITE_SCALE, S * SPRITE_SCALE);
            const ctx = cv.getContext('2d');
            ctx.scale(SPRITE_SCALE, SPRITE_SCALE);
            const cx = S / 2;
            const cy = S / 2;

            // 炸弹人的爆炸是"瞬间炸满 -> 保持 -> 末尾淡出"，不是从 0 慢慢长大。
            // 第 0 帧略微超尺寸（炸开的冲击感），中段维持满格，末段轻微收缩并淡出。
            const grow = t < 0.16
                ? 1.14 - (t / 0.16) * 0.14
                : (t > 0.76 ? 1 - ((t - 0.76) / 0.24) * 0.16 : 1);
            const fade = t > 0.68 ? 1 - (t - 0.68) / 0.32 : 1;

            // 外层红焰（不规则轮廓）
            const blob = function (baseR, wobAmp, seed, stops) {
                const pts = 34;
                const path = new Path2D();
                for (let i = 0; i <= pts; i++) {
                    const a = (i / pts) * TAU;
                    const wob = 1
                        + wobAmp * Math.sin(a * 3 + seed + f * 0.8)
                        + wobAmp * 0.55 * Math.sin(a * 5 - seed * 1.7 + f * 1.1)
                        + wobAmp * 0.3 * Math.sin(a * 9 + seed * 0.6);
                    const r = baseR * wob;
                    const px = cx + Math.cos(a) * r;
                    const py = cy + Math.sin(a) * r;
                    if (i === 0) path.moveTo(px, py);
                    else path.lineTo(px, py);
                }
                path.closePath();
                const grad = ctx.createRadialGradient(cx, cy, baseR * 0.1, cx, cy, baseR * 1.25);
                stops.forEach(function (st) { grad.addColorStop(st[0], st[1]); });
                ctx.fillStyle = grad;
                ctx.fill(path);
            };

            ctx.globalAlpha = fade;

            // 红边
            blob(36 * grow, 0.13, 1.7, [
                [0, 'rgba(255,120,40,0.95)'],
                [0.55, 'rgba(239,68,68,0.82)'],
                [1, 'rgba(190,18,60,0)']
            ]);
            // 橙焰
            blob(27 * grow, 0.15, 3.1, [
                [0, 'rgba(255,205,70,0.98)'],
                [0.5, 'rgba(249,115,22,0.95)'],
                [1, 'rgba(234,88,12,0)']
            ]);
            // 黄焰
            blob(18 * grow, 0.17, 5.3, [
                [0, 'rgba(255,255,225,1)'],
                [0.45, 'rgba(253,224,71,0.98)'],
                [1, 'rgba(250,204,21,0)']
            ]);
            // 白热核心
            const coreR = 12 * grow;
            const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
            core.addColorStop(0, 'rgba(255,255,255,1)');
            core.addColorStop(0.6, 'rgba(255,251,214,0.9)');
            core.addColorStop(1, 'rgba(255,237,160,0)');
            ctx.fillStyle = core;
            ctx.beginPath();
            ctx.arc(cx, cy, coreR, 0, TAU);
            ctx.fill();

            // 飞散火星（用帧号做确定性伪随机）
            const rr2 = rngFrom(7700 + f * 91);
            const sparks = Math.round(7 * (1 - t * 0.5));
            for (let i = 0; i < sparks; i++) {
                const a = rr2() * TAU;
                const dist = (14 + rr2() * 22) * grow;
                const rad = 1 + rr2() * 1.8;
                ctx.fillStyle = 'rgba(255,' + Math.round(190 + rr2() * 60) + ',120,' + (0.75 * fade).toFixed(2) + ')';
                ctx.beginPath();
                ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist, rad, 0, TAU);
                ctx.fill();
            }

            ctx.globalAlpha = 1;

            // 外层暖光晕：让火焰"发亮"而不是"贴纸"
            ctx.globalCompositeOperation = 'lighter';
            const glowR = 40 * grow;
            const glow = ctx.createRadialGradient(cx, cy, glowR * 0.35, cx, cy, glowR);
            glow.addColorStop(0, 'rgba(255,190,80,' + (0.30 * fade).toFixed(3) + ')');
            glow.addColorStop(0.6, 'rgba(255,130,40,' + (0.16 * fade).toFixed(3) + ')');
            glow.addColorStop(1, 'rgba(255,90,20,0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(cx, cy, glowR, 0, TAU);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';

            frames.push(cv);
        }
        cache.set('boom', frames);
        return frames;
    }

    // ============================================================
    // 棋盘内阴影（让棋盘像嵌在底座里）
    // ============================================================
    function buildBoardVignette(w, h) {
        const key = 'vig:' + w + 'x' + h;
        if (cache.has(key)) return cache.get(key);
        const cv = makeCanvas(w, h);
        const ctx = cv.getContext('2d');
        const edge = Math.min(w, h) * 0.075;
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, 'rgba(15,40,25,0.20)');
        g.addColorStop(1, 'rgba(15,40,25,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, edge);
        const g2 = ctx.createLinearGradient(0, h, 0, h - edge);
        g2.addColorStop(0, 'rgba(15,40,25,0.16)');
        g2.addColorStop(1, 'rgba(15,40,25,0)');
        ctx.fillStyle = g2;
        ctx.fillRect(0, h - edge, w, edge);
        const g3 = ctx.createLinearGradient(0, 0, edge, 0);
        g3.addColorStop(0, 'rgba(15,40,25,0.16)');
        g3.addColorStop(1, 'rgba(15,40,25,0)');
        ctx.fillStyle = g3;
        ctx.fillRect(0, 0, edge, h);
        const g4 = ctx.createLinearGradient(w, 0, w - edge, 0);
        g4.addColorStop(0, 'rgba(15,40,25,0.14)');
        g4.addColorStop(1, 'rgba(15,40,25,0)');
        ctx.fillStyle = g4;
        ctx.fillRect(w - edge, 0, edge, h);
        cache.set(key, cv);
        return cv;
    }

    global.TileSprites = {
        TILE: TILE,
        buildFloor: buildFloor,
        buildTile: buildTile,
        drawTileSprite: drawTileSprite,
        buildExplosionFrames: buildExplosionFrames,
        explosionFrameCount: EXPLOSION_FRAMES,
        buildBoardVignette: buildBoardVignette,
        has: function (name) { return !!FLOOR_STYLES[resolveStyle(name)]; }
    };
})(typeof window !== 'undefined' ? window : globalThis);
