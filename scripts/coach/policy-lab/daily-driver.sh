#!/usr/bin/env bash
# Export immutable revisions, run gates and acquire replay-verified matches on Daily Driver.
set -euo pipefail
mode="${1:-full}"
case "$mode" in full|pilot) ;; *) echo 'Usage: daily-driver.sh [full|pilot]' >&2; exit 2;; esac
cd "$(git rev-parse --show-toplevel)"
if ! git diff --quiet HEAD || test -n "$(git ls-files --others --exclude-standard)"; then
  echo 'Commit acquisition inputs before exporting them.' >&2
  exit 2
fi
reuse_root="${BB7_REUSE_ROOT:-}"
confirmation_override="${BB7_CONFIRMATION_SEED_BASE:-}"
heuristic_override="${BB7_HEURISTIC_SEED_BASE:-}"
case "$reuse_root" in *[!a-zA-Z0-9/_.-]*) echo 'Invalid recovery path' >&2; exit 2;; esac
for seed in "$confirmation_override" "$heuristic_override"; do
  case "$seed" in *[!0-9]*) echo 'Seed overrides must be nonnegative integers' >&2; exit 2;; esac
done
revision="$(git rev-parse HEAD)"
# The incumbent: main before this branch. Override to compare another frozen policy.
baseline="${BB7_BASELINE:-53a1c8dd611832f3dc8221664ad07e277ecb87dd}"
case "$baseline" in *[!0-9a-f]*) echo 'BB7_BASELINE must be a full commit hash' >&2; exit 2;; esac
remote_root="/Users/joelloyd/tmp/bb7-policy-lab-${revision:0:12}-vs-${baseline:0:12}"
ssh -o BatchMode=yes daily-driver mkdir -p "$remote_root/candidate" "$remote_root/frozen"
git archive --format=tar.gz HEAD | ssh daily-driver "tee '$remote_root/candidate-source.tar.gz' | tar -xz -C '$remote_root/candidate'"
git archive --format=tar.gz "$baseline" | ssh daily-driver "tee '$remote_root/frozen-source.tar.gz' | tar -xz -C '$remote_root/frozen'"
ssh daily-driver bash -s -- "$remote_root" "$revision" "$baseline" "$mode" "${reuse_root:--}" "${confirmation_override:-auto}" "${heuristic_override:-auto}" <<'REMOTE'
set -euo pipefail
export PATH="/Users/joelloyd/.nvm/versions/node/v24.3.0/bin:$PATH"
lab_root="$1"; revision="$2"; baseline="$3"; mode="$4"; reuse_root="$5"
if test "$reuse_root" = -; then reuse_root=""; fi
cd "$lab_root/candidate"
for source_root in "$lab_root/candidate" "$lab_root/frozen"; do
  if ! test -d "$source_root/node_modules"; then
    (cd "$source_root" && pnpm install --frozen-lockfile --ignore-scripts > "$lab_root/install-$(basename "$source_root").log" 2>&1)
  fi
done
pnpm exec tsx scripts/coach/policy-lab/gate.ts "$lab_root/contracts"
confirmation_seed="$6"
if test "$confirmation_seed" = auto; then confirmation_seed=$((31000000 + 16#${revision:0:6} * 100)); fi
heuristic_seed="$7"
if test "$heuristic_seed" = auto; then heuristic_seed=$((confirmation_seed + 2000000)); fi
run_stage() {
  local stage="$1"
  shift
  if test -n "$reuse_root" && test -f "$reuse_root/$stage/manifest.json"; then
    pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" --reuse-run "$reuse_root/$stage" --reuse-source "$reuse_root/candidate" "$@"
  else
    pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" "$@"
  fi
}
persistent_seed=$((confirmation_seed + 1000000))
standard_seed=$((confirmation_seed + 3000000))
# Which plays each policy chose and what followed, with watchable moments and fouls.
plays() {
  pnpm exec tsx scripts/coach/policy-lab/usage.ts "$lab_root/$1"
  pnpm exec tsx scripts/coach/policy-lab/moments.ts "$lab_root/$1"
  pnpm exec tsx scripts/coach/policy-lab/fouls.ts "$lab_root/$1"
  rm -rf "$lab_root/reports/$1/moments"
  cp -R "$lab_root/$1/moments" "$lab_root/reports/$1/moments"
}
common=(--lab --baseline "$lab_root/frozen" --baseline-revision "$baseline" --revision "$revision" --workers 8)
run_stage pilot --smoke --blocks 24 --out "$lab_root/pilot"
python3 scripts/coach/policy-study/report.py --run "$lab_root/pilot" --out "$lab_root/reports/pilot"
# Acquisition quality is a gate. Strength is measured, never required to be positive.
python3 scripts/coach/policy-lab/check.py "$lab_root/reports/pilot"
plays pilot
python3 scripts/coach/policy-lab/report.py "$lab_root"
if test "$mode" = full; then
  run_stage confirmation --seed-base "$confirmation_seed" --out "$lab_root/confirmation"
  cp "$lab_root/"*-source.tar.gz "$lab_root/confirmation/"
  if test -n "$reuse_root"; then cp "$reuse_root/candidate-source.tar.gz" "$lab_root/confirmation/recovered-policy-source.tar.gz"; fi
  python3 scripts/coach/policy-study/report.py --run "$lab_root/confirmation" --out "$lab_root/reports/confirmation"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/confirmation" --require-natural-pass
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/confirmation"
  plays confirmation
  # Standard plays the same schedule with its game plans and close-call variety.
  run_stage standard --candidate standard --seed-base "$standard_seed" --out "$lab_root/standard"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/standard" --out "$lab_root/reports/standard"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/standard"
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/standard"
  plays standard
  # Persistent fixtures test preservation without claiming to simulate a career.
  run_stage persistent --league --base-only --seed-base "$persistent_seed" --out "$lab_root/persistent"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/persistent" --out "$lab_root/reports/persistent"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/persistent"
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/persistent"
  run_stage heuristic --base-only --blocks 54 --opponent heuristic --seed-base "$heuristic_seed" --out "$lab_root/heuristic"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/heuristic" --out "$lab_root/reports/heuristic"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/heuristic"
  run_stage hard-sentinel --base-only --smoke --blocks 2 --opponent hard --out "$lab_root/hard-sentinel"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/hard-sentinel" --out "$lab_root/reports/hard-sentinel"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/hard-sentinel"
fi
python3 scripts/coach/policy-lab/report.py "$lab_root"
printf 'Saved lab evidence: %s\n' "$lab_root"
REMOTE
