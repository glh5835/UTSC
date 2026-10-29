# -*- coding: utf-8 -*-
"""A4 round start: freeze the inherited workspace state into the QA evidence dir.

Read-only. Records SHA-256 of the 15 protected contract/rule files, the 11
original D7 candidate payload files, and every inherited uncommitted business
modification, so later checks can prove nothing outside the A4 scope changed.
"""
import hashlib
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(ROOT, "artifacts", "qa-a4-20261029-2151")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    os.makedirs(BASE, exist_ok=True)

    contract_files = [
        "web/public/contracts/schemas/bundle.schema.json",
        "web/public/contracts/schemas/common.schema.json",
        "web/public/contracts/schemas/manifest.schema.json",
        "web/public/contracts/schemas/market-job.schema.json",
        "web/public/contracts/schemas/skill.schema.json",
        "web/public/contracts/schemas/course.schema.json",
        "web/public/contracts/schemas/resource.schema.json",
        "web/public/contracts/schemas/opportunity.schema.json",
        "web/public/contracts/fixtures/valid_bundle.json",
        "web/public/contracts/fixtures/empty_bundle.json",
        "web/public/contracts/fixtures/invalid_bundle.json",
        "web/public/contracts/upstream-contract-README.md",
        "web/public/contracts/rules/experience-skill-extraction.json",
        "web/tests/fixtures/experience-skill-extraction.schema.json",
        "web/tests/fixtures/valid_experience_skill_candidates.json",
    ]
    hashes = {p: sha(os.path.join(ROOT, p)) for p in contract_files}

    d7dir = os.path.join(ROOT, "data", "d7-candidate-20261029-tmg")
    d7 = {}
    for root, _, files in os.walk(d7dir):
        for name in sorted(files):
            path = os.path.join(root, name)
            rel = os.path.relpath(path, d7dir).replace(os.sep, "/")
            d7[rel] = sha(path)

    status = subprocess.run(
        ["git", "status", "--porcelain=v1"], cwd=ROOT, capture_output=True, text=True
    ).stdout
    inherit = {}
    for line in status.splitlines():
        code, raw = line[:2], line[3:]
        path = raw.strip()
        if path.startswith('"'):
            path = path[1:-1].encode("latin1", "backslashreplace").decode("unicode_escape")
        if code.strip() == "M" and os.path.isfile(os.path.join(ROOT, path)):
            inherit[path] = sha(os.path.join(ROOT, path))

    extra = [
        "web/src/data/sources.ts",
        "web/src/features/market/stats.ts",
        "web/src/lib/skillExtraction.ts",
        "web/src/features/profile/personalSkills.ts",
        "web/tests/rls-acceptance.mjs",
        "web/tests/market-stats.test.ts",
        "web/tests/skill-extraction.test.ts",
    ]
    for rel in extra:
        inherit[rel] = sha(os.path.join(ROOT, rel))

    snapshot = {
        "created_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "branch": subprocess.run(
            ["git", "branch", "--show-current"], cwd=ROOT, capture_output=True, text=True
        ).stdout.strip(),
        "head": subprocess.run(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True
        ).stdout.strip(),
        "contract_files_sha256": hashes,
        "d7_candidate_payload_sha256": d7,
        "inherited_modified_files_sha256": inherit,
    }
    out = os.path.join(BASE, "baseline-freeze.json")
    with open(out, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
    print(
        "contract files:", len(hashes),
        "d7 payload:", len(d7),
        "inherited modified:", len(inherit),
    )
    print("branch:", snapshot["branch"], "head:", snapshot["head"][:12])
    print("written:", out)


if __name__ == "__main__":
    sys.exit(main())
