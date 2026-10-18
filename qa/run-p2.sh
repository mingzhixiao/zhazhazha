#!/usr/bin/env bash
# Phase-2：新手教学 6 步真机流程
set -u
cd /d/test/zhazhazha
AB="agent-browser"
SS="docs/qa-screenshots"
URL="http://127.0.0.1:8123/index.html"
HELPERS="$(cat qa/helpers.js)"
OUT=qa/results-p2.txt
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
q "localStorage.clear(); 'ok'" >/dev/null
$AB reload >/dev/null
$AB wait --load load >/dev/null
$AB eval "$HELPERS" >/dev/null
$AB console --clear >/dev/null

$AB click "#startDiffPill" >/dev/null
sleep 0.4
$AB click "[data-diff='4']" >/dev/null
sleep 0.6
rec "P2.0-diff-selected" "$(q "JSON.stringify({diff:window.game.difficultyIdx, state:window.game.state})")"

$AB click "#startGameBtn" >/dev/null
sleep 0.8
rec "P2.0b-offer" "$(q "JSON.stringify({offer:!document.getElementById('tutorialOffer').classList.contains('hidden'), state:window.game.state})")"
$AB click "#tutorialStartBtn" >/dev/null
waitfor "window.game.tutorial && window.game.tutorial.active" "true" 10 >/dev/null
sleep 0.8
rec "P2.1-tutorial-started" "$(q "JSON.stringify({active:window.game.tutorial.active, sandboxDiff:window.game.difficultyIdx, gridR:window.game.grid.length, gridC:window.game.grid[0].length, stepLabel:document.getElementById('tutorialStepLabel').textContent, savedDiff:window.game._tutorialSavedDifficulty})")"
$AB screenshot "$SS/11-tutorial-step1.png" >/dev/null

q "window.__qa.result=null; window.__qaApi.tutorialRun().then(r=>window.__qa.result=r); 'started'" >/dev/null
R=""
for i in $(seq 1 300); do
  R="$(q "window.__qa.result || ''")"
  case "$R" in done*|timeout*|no-*|stuck*) break;; esac
  case $i in 40|90|140|190|240) $AB screenshot "$SS/12-tutorial-progress-$i.png" >/dev/null;; esac
  sleep 1
done
rec "P2.2-tutorial-result" "$R"
rec "P2.2-tutorial-log" "$(q "window.__qa.log.join(',')")"
rec "P2.3-after-tutorial" "$(q "window.__qaApi.state()")"
$AB screenshot "$SS/13-tutorial-done.png" >/dev/null
rec "P2.4-cleanup" "$(q "JSON.stringify({hudHidden:document.getElementById('tutorialHud').classList.contains('hidden'), frozenEnemies:window.game.enemies.filter(function(e){return e.tutorialFrozen}).length, highlight:document.getElementById('btnPlaceBomb').classList.contains('tutorial-highlight')})")"
rec "P2.5-console-errors" "$($AB errors 2>/dev/null | head -3)"
say "DONE-P2"
