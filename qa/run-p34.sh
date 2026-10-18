#!/usr/bin/env bash
# Phase-3/4：移动端视口布局 + 性能 + 断网
set -u
cd /d/test/zhazhazha
AB="agent-browser"
SS="docs/qa-screenshots"
URL="http://127.0.0.1:8123/index.html"
HELPERS="$(cat qa/helpers.js)"
OUT=qa/results-p34.txt
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

say "PHASE-3 mobile-viewports"
for SIZE in "390 844 390x844" "320 640 320x640" "360 780 360x780"; do
  set -- $SIZE
  $AB set viewport $1 $2 >/dev/null
  $AB open "$URL" >/dev/null
  $AB wait --load load >/dev/null
  $AB eval "$HELPERS" >/dev/null
  sleep 0.8
  q "window.game.save.data.tutorialDone = true; window.game.save.save(); 'ok'" >/dev/null
  $AB click "#startGameBtn" >/dev/null
  sleep 1
  waitfor "window.game.state" "PLAYING" 8 >/dev/null || true
  sleep 1
  rec "P3-$3-layout" "$(q "window.__qaApi.layoutCheck()")"
  $AB screenshot "$SS/14-mobile-$3.png" >/dev/null
done

$AB set viewport 844 390 >/dev/null
$AB open "$URL" >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 0.8
q "window.game.save.data.tutorialDone = true; window.game.save.save(); 'ok'" >/dev/null
$AB click "#startGameBtn" >/dev/null
sleep 1
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
$AB open "$URL" >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
sleep 0.5
$AB click "#startDiffPill" >/dev/null
sleep 0.4
$AB click "[data-diff='4']" >/dev/null
sleep 1
$AB click "#startGameBtn" >/dev/null
waitfor "window.game.state" "PLAYING" 10 >/dev/null || true
sleep 1.5
rec "P4.0-hard2" "$(q "JSON.stringify({state:window.game.state, enemies:window.game.enemies.length, gridR:window.game.grid.length, gridC:window.game.grid[0].length})")"
q "window.__qa.result=null; window.__qaApi.fpsSample(3000).then(r=>window.__qa.result=r); 'sampling'" >/dev/null
FPS=""
for i in $(seq 1 45); do
  FPS="$(q "window.__qa.result || ''")"
  case "$FPS" in *.*|timeout*) break;; esac
  sleep 0.33
done
rec "P4.1-fps-3s-desktop" "$FPS"
$AB screenshot "$SS/17-desktop-hard2.png" >/dev/null

$AB set offline on >/dev/null
$AB open "$URL" >/dev/null
$AB wait --load load >/dev/null
sleep 1
rec "P4.2-offline" "$(q "JSON.stringify({state:window.game.state, title:document.title, font:getComputedStyle(document.body).fontFamily.slice(0,60)})")"
$AB screenshot "$SS/18-offline-home.png" >/dev/null
rec "P4.3-offline-errors" "$($AB errors 2>/dev/null | head -3)"
$AB set offline off >/dev/null

say "DONE-P34"
