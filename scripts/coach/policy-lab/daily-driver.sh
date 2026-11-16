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
baseline=7bde4654aa80c1d4e42bb2f54804a39675962550
remote_root="/Users/joelloyd/tmp/bb7-policy-lab-${revision:0:12}"
ssh -o BatchMode=yes daily-driver mkdir -p "$remote_root/candidate" "$remote_root/frozen"
git archive --format=tar.gz HEAD | ssh daily-driver "tee '$remote_root/candidate-source.tar.gz' | tar -xz -C '$remote_root/candidate'"
git archive --format=tar.gz "$baseline" | ssh daily-driver "tee '$remote_root/frozen-source.tar.gz' | tar -xz -C '$remote_root/frozen'"
ssh daily-driver bash -s -- "$remote_root" "$revision" "$baseline" "$mode" "$reuse_root" "$confirmation_override" "$heuristic_override" <<'REMOTE'
set -euo pipefail
export PATH="/Users/joelloyd/.nvm/versions/node/v24.3.0/bin:$PATH"
lab_root="$1"; revision="$2"; baseline="$3"; mode="$4"; reuse_root="$5"
cd "$lab_root/candidate"
for source_root in "$lab_root/candidate" "$lab_root/frozen"; do
  if ! test -d "$source_root/node_modules"; then
    (cd "$source_root" && pnpm install --frozen-lockfile --ignore-scripts > "$lab_root/install-$(basename "$source_root").log" 2>&1)
  fi
done
pnpm exec tsx scripts/coach/policy-lab/gate.ts "$lab_root/contracts"
confirmation_seed="${6:-$((31000000 + 16#${revision:0:6} * 100))}"
heuristic_seed="${7:-$((confirmation_seed + 2000000))}"
reuse_args=()
reuse_for() {
  reuse_args=()
  if test -n "$reuse_root" && test -f "$reuse_root/$1/manifest.json"; then
    reuse_args=(--reuse-run "$reuse_root/$1" --reuse-source "$reuse_root/candidate")
  fi
}
persistent_seed=$((confirmation_seed + 1000000))
common=(--lab --baseline "$lab_root/frozen" --baseline-revision "$baseline" --revision "$revision" --workers 8)
reuse_for pilot
pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" "${reuse_args[@]}" --smoke --blocks 24 --out "$lab_root/pilot"
python3 scripts/coach/policy-study/report.py --run "$lab_root/pilot" --out "$lab_root/reports/pilot"
# Acquisition quality is a gate. Strength is measured, never required to be positive.
python3 scripts/coach/policy-lab/check.py "$lab_root/reports/pilot"
python3 scripts/coach/policy-lab/report.py "$lab_root"
if test "$mode" = full; then
  reuse_for confirmation
  pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" "${reuse_args[@]}" --seed-base "$confirmation_seed" --out "$lab_root/confirmation"
  cp "$lab_root/"*-source.tar.gz "$lab_root/confirmation/"
  if test -n "$reuse_root"; then cp "$reuse_root/candidate-source.tar.gz" "$lab_root/confirmation/recovered-policy-source.tar.gz"; fi
  python3 scripts/coach/policy-study/report.py --run "$lab_root/confirmation" --out "$lab_root/reports/confirmation"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/confirmation" --require-natural-pass
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/confirmation"
  # Persistent fixtures test preservation without claiming to simulate a career.
  reuse_for persistent
  pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" "${reuse_args[@]}" --league --base-only --seed-base "$persistent_seed" --out "$lab_root/persistent"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/persistent" --out "$lab_root/reports/persistent"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/persistent"
  pnpm exec tsx scripts/coach/policy-lab/outcomes.ts "$lab_root/persistent"
  reuse_for heuristic
  pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" "${reuse_args[@]}" --base-only --blocks 54 --opponent heuristic --seed-base "$heuristic_seed" --out "$lab_root/heuristic"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/heuristic" --out "$lab_root/reports/heuristic"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/heuristic"
  reuse_for hard-sentinel
  pnpm exec tsx scripts/coach/policy-study/run.ts "${common[@]}" "${reuse_args[@]}" --base-only --smoke --blocks 2 --opponent hard --out "$lab_root/hard-sentinel"
  python3 scripts/coach/policy-study/report.py --run "$lab_root/hard-sentinel" --out "$lab_root/reports/hard-sentinel"
  python3 scripts/coach/policy-lab/check.py "$lab_root/reports/hard-sentinel"
fi
python3 scripts/coach/policy-lab/report.py "$lab_root"
printf 'Saved lab evidence: %s\n' "$lab_root"
REMOTE
