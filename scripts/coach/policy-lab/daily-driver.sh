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
revision="$(git rev-parse HEAD)"
baseline=7bde4654aa80c1d4e42bb2f54804a39675962550
remote_root="/Users/joelloyd/tmp/bb7-policy-lab-${revision:0:12}"
ssh -o BatchMode=yes daily-driver mkdir -p "$remote_root/candidate" "$remote_root/frozen"
git archive --format=tar.gz HEAD | ssh daily-driver "tee '$remote_root/candidate-source.tar.gz' | tar -xz -C '$remote_root/candidate'"
git archive --format=tar.gz "$baseline" | ssh daily-driver "tee '$remote_root/frozen-source.tar.gz' | tar -xz -C '$remote_root/frozen'"
ssh daily-driver bash -s -- "$remote_root" "$revision" "$baseline" "$mode" <<'REMOTE'
set -euo pipefail
export PATH="/Users/joelloyd/.nvm/versions/node/v24.3.0/bin:$PATH"
lab_root="$1"; revision="$2"; baseline="$3"; mode="$4"
cd "$lab_root/candidate"
for source_root in "$lab_root/candidate" "$lab_root/frozen"; do
  if ! test -d "$source_root/node_modules"; then
    (cd "$source_root" && pnpm install --frozen-lockfile --ignore-scripts > "$lab_root/install-$(basename "$source_root").log" 2>&1)
  fi
done
pnpm exec tsx scripts/coach/policy-lab/gate.ts "$lab_root/contracts"
confirmation_seed=$((31000000 + 16#${revision:0:6} * 100))
persistent_seed=$((confirmation_seed + 1000000))
common=(--lab --baseline "$lab_root/frozen" --baseline-revision "$baseline" --revision "$revision" --workers 8)
pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" --smoke --blocks 24 --out "$lab_root/pilot"
python3 scripts/coach/policy-study/report.py --run "$lab_root/pilot" --out "$lab_root/reports/pilot"
# Acquisition quality is a gate. Strength is measured, never required to be positive.
python3 scripts/coach/policy-lab/check.py "$lab_root/reports/pilot"
python3 scripts/coach/policy-lab/report.py "$lab_root"
if test "$mode" = full; then
  pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" --seed-base "$confirmation_seed" --out "$lab_root/confirmation"
  cp "$lab_root/"*-source.tar.gz "$lab_root/confirmation/"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/confirmation" --out "$lab_root/reports/confirmation"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/confirmation" --require-natural-pass
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/confirmation"
  # Persistent fixtures test preservation without claiming to simulate a career.
  pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" --league --base-only --seed-base "$persistent_seed" --out "$lab_root/persistent"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/persistent" --out "$lab_root/reports/persistent"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/persistent"
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/persistent"
fi
python3 scripts/coach/policy-lab/report.py "$lab_root"
printf 'Saved lab evidence: %s\n' "$lab_root"
REMOTE
