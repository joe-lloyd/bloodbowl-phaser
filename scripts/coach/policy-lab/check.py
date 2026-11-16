"""Fail acquisition quality gates; do not require a favourable strength result."""
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
s = json.loads((root / "summary.json").read_text())
valid = s["scheduled"] == s["saved"] == s["included"] and not s["excluded_blocks"] and s["engine_findings"] == 0
if "--require-natural-pass" in sys.argv:
    valid = valid and s["accepted_candidate_passes"] > 0
receipt = {"stage": root.name, "passed": valid, "games": s["included"], "engine_findings": s["engine_findings"],
           "excluded_blocks": s["excluded_blocks"], "accepted_passes": s["accepted_candidate_passes"]}
(root / "stage-gate.json").write_text(json.dumps(receipt, indent=2))
print(json.dumps(receipt))
if not valid:
    raise SystemExit("Acquisition gate failed; inspect excluded blocks and game findings")
