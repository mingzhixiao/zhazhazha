#!/usr/bin/env bash
# 真机浏览器验证主脚本 v2（修复轮询匹配：剥离引号 + 子串匹配）
set -u
cd /d/test/zhazhazha
AB="agent-browser"
SS="docs/qa-screenshots"
URL="http://127.0.0.1:8123/index.html"
HELPERS="$(cat qa/helpers.js)"
OUT=qa/results.txt
: > "$OUT"

say() { echo "== $*" | tee -a "$OUT"; }
# 执行 eval 并剥离结果的 JSON 引号
q() { local v; v="$($AB eval "$1" 2>/dev/null || true)"; echo "${v//\"/}"; }
# 等待 eval 结果包含子串
waitfor() { # expr substr maxsec
  local expr="$1" sub="$2" max="${3:-20}" i=0 v=""
  while [ $i -lt $((max*3)) ]; do
    v="$(q "$expr")"
    case "$v" in *"$sub"*) echo "$v"; return 0;; esac
    sleep 0.33; i=$((i+1))
  done
  echo "TIMEOUT[$sub] last=$v"; return 1
}
# 等待页面内 __qa.result 出现任一匹配前缀
waitresult() { # maxsec
  local max="${1:-60}" i=0 v=""
  while [ $i -lt $((max*3)) ]; do
    v="$(q "window.__qa.result || ''")"
    case "$v" in
      gameover|cleared|clear-failed|done*|timeout*|no-*|stuck*|arrived) echo "$v"; return 0;;
    esac
    sleep 0.33; i=$((i+1))
  done
  echo "TIMEOUT result=$v"; return 1
}

say "PHASE-1 desktop-1280x800"
$AB set viewport 1280 800 >/dev/null
$AB open "$URL" >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
q "localStorage.clear(); 'cleared'" >/dev/null
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
$AB console --clear >/dev/null

rec() { echo "$1: $2" | tee -a "$OUT"; }

rec "P1.0-first-run" "$(q "JSON.stringify({state:window.game.state, tutorialDone:window.game.tutorialDone()})")"
$AB screenshot "$SS/01-desktop-home.png" >/dev/null

$AB click "#startGameBtn" >/dev/null
sleep 0.6
rec "P1.1-tutorial-offer" "$(q "JSON.stringify({offerShown:!document.getElementById('tutorialOffer').classList.contains('hidden'), state:window.game.state})")"
$AB screenshot "$SS/02-tutorial-offer.png" >/dev/null

$AB click "#tutorialSkipOfferBtn" >/dev/null
waitfor "window.game.state" "PLAYING" 10 >/dev/null
sleep 1.2
rec "P1.2-level1" "$(q "window.__qaApi.state()")"
$AB screenshot "$SS/03-desktop-level1.png" >/dev/null

$AB click "#btnPause" >/dev/null
sleep 0.5
rec "P1.3-paused" "$(q "window.game.state")"
$AB screenshot "$SS/04-desktop-paused.png" >/dev/null
$AB click "#btnPause" >/dev/null
sleep 0.5
rec "P1.3-resumed" "$(q "window.game.state")"

q "window.__qaApi.kd('ArrowRight'); 'h'" >/dev/null
sleep 0.8
q "window.__qaApi.ku('ArrowRight'); 'r'" >/dev/null
PX1="$(q "Math.round(window.game.player.x)")"
rec "P1.4-keyboard-move" "px=$PX1 (从90移动)"

q "window.__qaApi.walkTo(1,1).then(r=>window.__qa.result=r); 'w'" >/dev/null
WB="$(waitresult 15)"
rec "P1.4b-walk-back" "$WB"

q "window.__qaApi.kd('Space'); 'kd'" >/dev/null
sleep 0.12
q "window.__qaApi.ku('Space'); 'ku'" >/dev/null
sleep 0.25
rec "P1.5-bomb-placed" "$(q "JSON.stringify({bombs:window.game.bombs.length, state:window.game.state})")"
$AB screenshot "$SS/05-desktop-bomb.png" >/dev/null

# 死亡循环：原地反复放弹（新手背心15s后开始掉命，含一次复活）
q "window.__qa.result=null; window.__qaApi.deathLoop().then(r=>window.__qa.result=r); 'started'" >/dev/null
DL="$(waitresult 170)"
rec "P1.6-death-loop" "$DL state=$(q "window.game.state")"
$AB screenshot "$SS/06-desktop-gameover.png" >/dev/null
rec "P1.6-gameover-modal" "$(q "JSON.stringify({modalShown:!document.getElementById('overlayModal').classList.contains('hidden'), title:document.getElementById('modalTitle').textContent, best:window.game.save.data.bestScore})")"

$AB click "#modalActionBtn" >/dev/null
waitfor "window.game.state" "PLAYING" 10 >/dev/null
sleep 1
rec "P1.7-restart" "$(q "window.__qaApi.state()")"

# 通关：辅助清怪 + 真实走到传送门
q "window.__qa.result=null; window.__qaApi.clearLevel().then(r=>window.__qa.result=r); 'started'" >/dev/null
CL="$(waitresult 60)"
rec "P1.8-level-clear" "$CL assisted=$(q "window.__qa.assisted") state=$(q "window.game.state")"
$AB screenshot "$SS/07-desktop-levelclear.png" >/dev/null

$AB click "#modalActionBtn" >/dev/null
waitfor "document.getElementById('shopModal').classList.contains('hidden')" "false" 10 >/dev/null
q "window.game.coins = 60; window.game.renderShop(); 'assisted-coins'" >/dev/null
sleep 0.4
$AB screenshot "$SS/08-desktop-shop.png" >/dev/null
rec "P1.9-shop-open" "$(q "JSON.stringify({coins:window.game.coins, items:document.querySelectorAll('#shopItems .shop-item').length, buyable:document.querySelectorAll('#shopItems .shop-item.buyable').length, level:window.game.level})")"
q "(function(){ var b=document.querySelector('#shopItems .shop-item.buyable'); if(!b) return 'no-buyable'; window.__shopKey=b.getAttribute('data-key'); window.__lv0=window.game.save.data.upgrades[window.__shopKey]||0; b.click(); return 'clicked-'+window.__shopKey; })()" >/dev/null
sleep 0.6
rec "P1.9-shop-buy" "$(q "JSON.stringify({key:window.__shopKey, lv0:window.__lv0, lv1:window.game.save.data.upgrades[window.__shopKey], coins:window.game.coins})")"
$AB screenshot "$SS/09-desktop-shop-bought.png" >/dev/null
$AB click "#shopContinueBtn" >/dev/null
waitfor "window.game.state" "PLAYING" 10 >/dev/null
sleep 1.2
rec "P1.10-next-level" "$(q "window.__qaApi.state()")"
$AB screenshot "$SS/10-desktop-level2.png" >/dev/null

rec "P1.11-save-before" "$(q "JSON.stringify({best:window.game.save.data.bestScore, upgrades:window.game.save.data.upgrades, cleared:window.game.save.data.totalLevelsCleared})")"
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 0.8
rec "P1.11-save-after-reload" "$(q "JSON.stringify({best:window.game.save.data.bestScore, upgrades:window.game.save.data.upgrades, cleared:window.game.save.data.totalLevelsCleared, state:window.game.state})")"
rec "P1.12-console-errors" "$($AB errors 2>/dev/null | head -3)"

say "PHASE-2 tutorial-6-steps"
$AB click "#startDiffPill" >/dev/null
sleep 0.4
$AB click "[data-diff='4']" >/dev/null
sleep 0.5
rec "P2.0-diff-selected" "$(q "JSON.stringify({diff:window.game.difficultyIdx, state:window.game.state})")"
q "localStorage.removeItem('zhazhazha-save-v1'); 'note-not-used'" >/dev/null
# 教学完成标记在存档内，不重置：直接用 tutorialOffer 入口（当前存档 tutorialDone=true 则无 offer）
$AB click "#startGameBtn" >/dev/null
sleep 0.6
OFFER="$(q "!document.getElementById('tutorialOffer').classList.contains('hidden')")"
rec "P2.0b-offer-shown" "$OFFER"
if [ "$OFFER" != "true" ]; then
  # 首次运行标记被跳过教学置位？重置存档后重来
  q "window.game.save.reset(); location.reload(); 'resetting'" >/dev/null
  $AB reload >/dev/null
  $AB wait --load load >/dev/null
  $AB eval "$HELPERS" >/dev/null
  sleep 0.8
  $AB click "#startDiffPill" >/dev/null
  sleep 0.4
  $AB click "[data-diff='4']" >/dev/null
  sleep 0.5
  $AB click "#startGameBtn" >/dev/null
  sleep 0.6
fi
$AB click "#tutorialStartBtn" >/dev/null
waitfor "window.game.tutorial && window.game.tutorial.active" "true" 10 >/dev/null
sleep 0.8
rec "P2.1-tutorial-started" "$(q "JSON.stringify({active:window.game.tutorial.active, sandboxDiff:window.game.difficultyIdx, gridR:window.game.grid.length, gridC:window.game.grid[0].length, stepLabel:document.getElementById('tutorialStepLabel').textContent})")"
$AB screenshot "$SS/11-tutorial-step1.png" >/dev/null
q "window.__qa.result=null; window.__qa.tutorialRun().then(r=>window.__qa.result=r); 'started'" >/dev/null
for i in $(seq 1 240); do
  R="$(q "window.__qa.result || ''")"
  case "$R" in done*|timeout*|no-*|stuck*) break;; esac
  case $i in 40|90|140|190) $AB screenshot "$SS/12-tutorial-progress-$i.png" >/dev/null;; esac
  sleep 1
done
rec "P2.2-tutorial-result" "$R"
rec "P2.2-tutorial-log" "$(q "window.__qa.log.join(',')")"
rec "P2.3-after-tutorial" "$(q "window.__qaApi.state()")"
$AB screenshot "$SS/13-tutorial-done.png" >/dev/null
rec "P2.4-cleanup" "$(q "JSON.stringify({hudHidden:document.getElementById('tutorialHud').classList.contains('hidden'), frozenEnemies:window.game.enemies.filter(function(e){return e.tutorialFrozen}).length, highlight:document.getElementById('btnPlaceBomb').classList.contains('tutorial-highlight')})")"

say "PHASE-3 mobile-viewports"
for SIZE in "390 844 390x844" "320 640 320x640" "360 780 360x780"; do
  set -- $SIZE
  $AB set viewport $1 $2 >/dev/null
  $AB reload >/dev/null
  $AB wait --load load >/dev/null
  $AB eval "$HELPERS" >/dev/null
  sleep 0.8
  $AB click "#startGameBtn" >/dev/null
  sleep 0.8
  waitfor "window.game.state" "PLAYING" 8 >/dev/null || true
  sleep 1
  rec "P3-$3-layout" "$(q "window.__qaApi.layoutCheck()")"
  $AB screenshot "$SS/14-mobile-$3.png" >/dev/null
done

$AB set viewport 844 390 >/dev/null
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 0.8
$AB click "#startGameBtn" >/dev/null
sleep 0.8
waitfor "window.game.state" "PLAYING" 8 >/dev/null || true
sleep 1
rec "P3-844x390-layout" "$(q "window.__qaApi.layoutCheck()")"
rec "P3-844x390-mode" "$(q "JSON.stringify({mobaMode:document.body.classList.contains('moba-mode'), rotateMode:document.body.classList.contains('rotate-mode')})")"
$AB screenshot "$SS/15-mobile-landscape.png" >/dev/null

$AB set viewport 390 844 >/dev/null
sleep 0.5
$AB click "#btnRotate" >/dev/null
sleep 0.8
rec "P3-rotate-mode" "$(q "JSON.stringify({rotate:document.body.classList.contains('rotate-mode'), state:window.game.state})")"
$AB screenshot "$SS/16-mobile-rotate-mode.png" >/dev/null
$AB click "#btnRotate" >/dev/null

rec "P3-visibility-pause" "$(q "window.__qaApi.visibilityPauseTest()")"
rec "P3-blur-clears-keys" "$(q "window.__qaApi.blurClearsKeysTest()")"
rec "P3-console-errors" "$($AB errors 2>/dev/null | head -3)"

say "PHASE-4 perf-and-offline"
$AB set viewport 1280 800 >/dev/null
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 0.5
$AB click "#startDiffPill" >/dev/null
sleep 0.4
$AB click "[data-diff='4']" >/dev/null
sleep 1
$AB click "#startGameBtn" >/dev/null
waitfor "window.game.state" "PLAYING" 10 >/dev/null || true
sleep 1
rec "P4.0-hard2" "$(q "JSON.stringify({state:window.game.state, enemies:window.game.enemies.length, gridR:window.game.grid.length, gridC:window.game.grid[0].length})")"
q "window.__qa.result=null; window.__qaApi.fpsSample(3000).then(r=>window.__qa.result=r); 'sampling'" >/dev/null
FPS="$(waitresult 15)"
rec "P4.1-fps-3s-desktop" "$FPS"
$AB screenshot "$SS/17-desktop-hard2.png" >/dev/null

$AB set offline on >/dev/null
$AB reload >/dev/null
$AB wait --load load >/dev/null
sleep 1
rec "P4.2-offline" "$(q "JSON.stringify({state:window.game.state, title:document.title, font:getComputedStyle(document.body).fontFamily.slice(0,60)})")"
$AB screenshot "$SS/18-offline-home.png" >/dev/null
rec "P4.3-offline-errors" "$($AB errors 2>/dev/null | head -3)"
$AB set offline off >/dev/null

say "DONE"
