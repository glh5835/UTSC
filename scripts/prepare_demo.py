"""Explicitly prepare a synthetic runtime for a fresh checkout; never replace state."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from utsc_nav.releases import load_current, save_draft, publish, ReleaseFailure


def prepare(state_root):
    state_root = Path(state_root).resolve()
    if not state_root.is_relative_to(ROOT) or state_root == ROOT:
        raise ValueError("Runtime state must be a subdirectory of this checkout.")
    existing = load_current(state_root, "SYNTHETIC")
    if existing:
        return {"status": "REUSED", "data_mode": "SYNTHETIC", "release_id": existing["manifest"]["release_id"]}
    if state_root.exists() and any(state_root.iterdir()):
        raise ValueError("Existing unpublished state is preserved. Select a new empty --state-root; no records were replaced.")
    analysis = ROOT / "data/synthetic/analyses/synthetic-analysis-c7459431a5c4655471e84a71"
    catalog = ROOT / "data/resources/utsc-resources-v1"
    save_draft(state_root, "SYNTHETIC", analysis, catalog)
    result = publish(state_root, "SYNTHETIC", reason="Explicit fresh-checkout synthetic demonstration; no human approval or real recruitment data")
    stats = result["receipt"]["payload"]["statistics"]
    return {"status": "PREPARED", "data_mode": "SYNTHETIC", "release_id": result["manifest"]["release_id"],
            "formal_jobs": stats["formal_jobs"], "analyzable_descriptions": stats["analyzable_descriptions"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state-root", type=Path, default=ROOT / "state/local")
    args = parser.parse_args()
    try:
        print(json.dumps(prepare(args.state_root), ensure_ascii=False))
    except (ValueError, ReleaseFailure) as error:
        parser.exit(1, str(error) + "\n")


if __name__ == "__main__":
    main()
