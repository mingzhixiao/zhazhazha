#!/usr/bin/env bash
# Phase-5 补测：PLAYING 态 FPS / 切后台暂停 / 旋转模式 / 商店继续按钮
set -u
cd /d/test/zhazhazha
AB="agent-browser"
SS="docs/qa-screenshots"
URL="http://127.0.0.1:8123/index.html"
HELPERS="$(cat qa/helpers.js)"
OUT=qa/results-p5.txt
: > "$OUT"
say() { echo "== $*" | tee -a "$OUT"; }
rec() { echo "$1: $2" | tee -a "$OUT"; }
q() { local v; v="$($AB eval "$1" 2>/dev/null || true)"; echo "${v//\"/}"; }
waitfor() {
  local expr="$1" sub="$2" max="${3:-20}" i=0 v=""
  while [ $i -lt $((max*3)) ]; do
    v="$(q "$expr")"
    case "$v" in *"$sub"*) echo "$v"; return 0;; esac
    sleep 0.33; i=$((i+1))
  done
  echo "TIMEOUT[$sub] last=$v"; return 1
}

$AB set viewport 1280 800 >/dev/null
$AB open "$URL" >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
q "window.game.save.data.tutorialDone = true; window.game.save.save(); 'ok'" >/dev/null
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 1

# 进入游戏并确认 PLAYING
$AB click "#startGameBtn" >/dev/null
sleep 1.5
rec "P5.0-entry" "$(q "JSON.stringify({state:window.game.state, offer:!document.getElementById('tutorialOffer').classList.contains('hidden')})")"
if [ "$(q "!document.getElementById('tutorialOffer').classList.contains('hidden')")" = "true" ]; then
  $AB click "#tutorialSkipOfferBtn" >/dev/null
  sleep 1.2
fi

# 切后台自动暂停
rec "P5.1-visibility-pause" "$(q "window.__qaApi.visibilityPauseTest()")"
sleep 0.6
rec "P5.1-after" "$(q "window.game.state")"
# 继续游戏
q "if(window.game.state==='PAUSED'){ window.game.togglePause(); } 'resume'" >/dev/null
sleep 0.6

# 旋转模式（PLAYING 态）
q "window.game.setRotateMode(true); 'rot'" >/dev/null
sleep 0.8
rec "P5.2-rotate-on" "$(q "JSON.stringify({rotate:document.body.classList.contains('rotate-mode'), state:window.game.state})")"
$AB screenshot "$SS/16-mobile-rotate-mode.png" >/dev/null
q "window.game.setRotateMode(false); 'unrot'" >/dev/null
sleep 0.5

# 困难2 + PLAYING 态 FPS
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 1
$AB click "#startDiffPill" >/dev/null
sleep 0.4
$AB click "[data-diff='4']" >/dev/null
sleep 1.5
rec "P5.3-hard2-state" "$(q "JSON.stringify({state:window.game.state, enemies:window.game.enemies.length, grid:window.game.grid.length+'x'+window.game.grid[0].length})")"
if [ "$(q "window.game.state")" != "PLAYING" ]; then
  $AB click "#startGameBtn" >/dev/null
  sleep 1.5
fi
# 先让玩家动起来（真实按键），再采样
q "window.__qaApi.kd('ArrowRight'); 'go'" >/dev/null
q "window.__qa.result=null; window.__qaApi.fpsSample(3000).then(r=>window.__qa.result=r); 'sampling'" >/dev/null
FPS=""
for i in $(seq 1 45); do
  FPS="$(q "window.__qa.result || ''")"
  case "$FPS" in *.*|timeout*) break;; esac
  sleep 0.33
done
q "window.__qaApi.ku('ArrowRight'); 'stop'" >/dev/null
rec "P5.4-hard2-fps-playing" "$FPS / state=$(q "window.game.state") / enemies=$(q "window.game.enemies.length")"
$AB screenshot "$SS/17-desktop-hard2.png" >/dev/null
rec "P5.5-perf-panel" "$(q "JSON.stringify({perfEnabled:!document.getElementById('perfPanel').classList.contains('hidden')})")"

# 商店继续按钮复测
q "window.game.state='LEVEL_CLEAR'; window.game.showModal('第 1 关完美通关！','测试','进入强化商店','star'); 'modal'" >/dev/null
sleep 0.8
$AB click "#modalActionBtn" >/dev/null
sleep 1
rec "P5.6-shop-open" "$(q "JSON.stringify({state:window.game.state, shopVisible:!document.getElementById('shopModal').classList.contains('hidden'), items:document.querySelectorAll('#shopItems .shop-item').length})")"
q "window.game.coins=60; window.game.renderShop(); 'c'" >/dev/null
sleep 0.5
q "var b=document.querySelector('#shopItems .shop-item.buyable'); var k=b.getAttribute('data-key'); b.click(); 'buy-'+k" >/dev/null
sleep 0.8
$AB click "#shopContinueBtn" >/dev/null
sleep 1.5
rec "P5.7-shop-continue" "$(q "JSON.stringify({state:window.game.state, level:window.game.level, shopVisible:!document.getElementById('shopModal').classList.contains('hidden'), err:window.__lastErr||null})")"
$AB screenshot "$SS/10-desktop-level2.png" >/dev/null
rec "P5.8-errors" "$($AB errors 2>/dev/null | head -5)"
say "DONE-P5"
