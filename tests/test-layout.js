'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
const GAME = fs.readFileSync(path.join(ROOT, 'js', 'game.js'), 'utf8');

// 提取从 startIndex（某个选择器 + '{' 起始）到下一个匹配层级的 '}' 之间的文本
function blockFrom(css, startIndex) {
    const open = css.indexOf('{', startIndex);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') {
            depth--;
            if (depth === 0) return css.slice(open + 1, i);
        }
    }
    return '';
}

// 提取 <div id="canvasWrapper" ...> 的整段平衡 HTML，用于判断内部包含哪些元素
function extractCanvasWrapper(html) {
    const start = html.indexOf('<div id="canvasWrapper"');
    if (start < 0) return '';
    // 找到该 div 的 '>' 作为标签结束
    const tagEnd = html.indexOf('>', start);
    let depth = 0;
    for (let i = tagEnd; i < html.length; i++) {
        if (html.startsWith('<div', i)) depth++;
        else if (html.startsWith('</div>', i)) {
            depth--;
            if (depth === 0) return html.slice(start, i + '</div>'.length);
        }
    }
    return '';
}

test('布局：教学 HUD 已移入文档流（位于 header 之后、棋盘之前），不再 fixed 覆盖顶部', () => {
    const topHeader = HTML.indexOf('id="topHeader"');
    const tutorialHud = HTML.indexOf('id="tutorialHud"');
    const stageArea = HTML.indexOf('id="stageArea"');
    assert.ok(topHeader > 0 && tutorialHud > 0 && stageArea > 0, '缺少关键节点');
    assert.ok(tutorialHud > topHeader, '教学 HUD 必须在 #topHeader 之后');
    assert.ok(tutorialHud < stageArea, '教学 HUD 必须在 #stageArea（棋盘）之前');

    const block = blockFrom(CSS, CSS.indexOf('#tutorialHud {'));
    assert.ok(block.length > 0, '找不到 #tutorialHud 的 CSS 规则');
    assert.ok(!block.includes('position: fixed'), '教学 HUD 仍为 fixed 覆盖层（应改为文档流）');
    assert.ok(!block.includes('z-index'), '教学 HUD 不应再带高 z-index 覆盖层');
});

test('布局：普通 Toast 区已移出棋盘（不在 #canvasWrapper 内），且一次只显示一条', () => {
    const wrapper = extractCanvasWrapper(HTML);
    assert.ok(wrapper.length > 0, '找不到 #canvasWrapper');
    assert.ok(!wrapper.includes('id="gameToasts"'), '普通 Toast 仍位于棋盘 #canvasWrapper 内部，会覆盖棋盘');

    const block = blockFrom(CSS, CSS.indexOf('#gameToasts {'));
    assert.ok(block.length > 0, '找不到 #gameToasts 的 CSS 规则');
    assert.ok(!block.includes('position: absolute'), '普通 Toast 仍为 absolute 定位（应改为文档流）');
    // Toast 区必须固定高度占位：空时折叠（:empty display:none）会导致 Toast 出现/消失
    // 挤压 flex-1 棋盘区，触发 ResizeObserver 反复重算画布——表现为游戏面板跳动、变大变小
    assert.ok(!CSS.includes('#gameToasts:empty { display: none; }'), 'Toast 区 :empty 折叠会挤压棋盘导致画布跳动');
    assert.ok(/height:\s*[\d.]+rem/.test(block), 'Toast 区必须固定高度占位，防止画布随 Toast 显隐跳动');
    assert.ok(block.includes('flex: none'), 'Toast 区必须 flex: none，不参与 flex 伸缩');
});

test('布局：教学卡含独立的“步骤反馈”行，步骤完成反馈不与当前指令互相覆盖', () => {
    assert.ok(HTML.includes('id="tutorialFeedback"'), '缺少独立的 #tutorialFeedback 反馈行元素');
    assert.ok(HTML.includes('id="tutorialText"'), '缺少 #tutorialText 指令行元素');
    // 反馈行与指令行是兄弟（同处 .tutorial-body 内），不应是同一个元素
    assert.notStrictEqual(
        HTML.indexOf('id="tutorialFeedback"'),
        HTML.indexOf('id="tutorialText"'),
        '反馈行与指令行必须是两个独立元素'
    );
});

test('调度：关卡横幅 / 连杀播报互斥与延后逻辑已被接入（防回归）', () => {
    assert.ok(GAME.includes('setTutorialFeedback('), '缺少 setTutorialFeedback 方法');
    assert.ok(GAME.includes('this.bannerActive'), '缺少 bannerActive 状态（横幅优先/互斥）');
    assert.ok(GAME.includes('_pendingCombo'), '缺少 _pendingCombo（连杀延后补播）');
    // 教学模式下普通 Toast 应改为写入教学反馈，而非在棋盘弹窗
    assert.ok(
        GAME.includes('if (this.tutorial && this.tutorial.active)') &&
        GAME.includes('this.setTutorialFeedback(text)'),
        '教学模式下未将普通 Toast 重定向到教学卡反馈'
    );
});

test('底部操作区：窄屏媒体查询已存在，防止摇杆/按钮被挤压不可用', () => {
    assert.ok(CSS.includes('@media (max-width: 400px)'), '缺少 ≤400px 窄屏适配');
    assert.ok(CSS.includes('@media (max-width: 360px)'), '缺少 ≤360px 超窄屏适配');
    // 窄屏把棋盘外提示与操作行分离（footer 为纵向），避免横向争夺空间
    assert.ok(HTML.includes('id="mobileHintBox"'), '缺少 mobileHintBox（窄屏提示）');
});
