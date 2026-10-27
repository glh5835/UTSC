"""Explicit offline processing command; creates only immutable derived bundles."""

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from utsc_nav.analysis import analyze
from utsc_nav.importer import load_snapshot
from utsc_nav.snapshot_store import save_snapshot


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["SYNTHETIC", "HISTORICAL"], default="SYNTHETIC")
    parser.add_argument("--manifest", default="inputs/mvp02-v1/manifest.json")
    args = parser.parse_args()
    batch = load_snapshot(ROOT/"data", args.mode, args.manifest)
    receipt = save_snapshot(analyze(batch), ROOT/"data")
    print(json.dumps({"directory": receipt["directory"], "analysis_snapshot_id": receipt["manifest"]["analysis_snapshot_id"],
                      "data_mode": args.mode, "quality": receipt["payload"]["quality"], "statistics": receipt["payload"]["statistics"]}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
