"""Author independent artificial inputs; never reads a recruitment service."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "data" / "synthetic"
CONTRACT = "utsc-contract-1.0"


def json_bytes(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def exact_body(length: int, prefix: str = "") -> str:
    neutral = "This invented example describes routine tasks and team communication. "
    return (prefix + neutral * 5)[:length - 1] + "."


def main() -> None:
    paths = [ROOT / p for p in ("raw/jobs-v1.jsonl", "config/declared-policy.json", "config/skills.json", "expected-mvp02.json", "snapshots/syn-mvp01-v1/manifest.json")]
    if any(path.exists() for path in paths):
        raise SystemExit("Fixture files already exist. No file was overwritten.")
    common = {"contract_version": CONTRACT, "data_mode": "SYNTHETIC"}
    neutral = " This invented example describes routine tasks and team communication."
    bodies = [
        "SQL SQL and Structured Query Language." + neutral * 3,
        "Python and Python." + neutral * 3,
        "SQL and Python." + neutral * 3,
        neutral.strip() * 3,
        exact_body(99, "SQL. "),
        None,
        "SQL." + neutral * 3,
        "Structured Query Language." + neutral * 3,
        "Python." + neutral * 3,
        exact_body(100),
    ]
    records = []
    for i, body in enumerate(bodies, 1):
        identifier = f"{i:02d}"
        records.append({**common, "job_id": "SYN:" + identifier, "source_namespace": "SYN", "source_job_id": identifier,
                        "batch_id": "syn-input-v1", "title": f"Artificial example {identifier}",
                        "employer": f"Fictional organization {identifier}", "country_code": "CA", "province_code": "ON",
                        "city": "Toronto", "market_area": "TORONTO_GTA", "description_raw": body, "description_clean": None,
                        "source_url": f"https://example.invalid/jobs/{identifier}", "posted_at": "2026-09-30",
                        "posted_precision": "DATE", "posted_timezone": "UTC", "collected_at": "2026-10-01T12:00:00Z",
                        "collection_timezone": "UTC", "origin_kind": "TEST_FIXTURE",
                        "fixture_expected_role": "DATA_ANALYST" if i <= 6 else "BI",
                        "fixture_expected_stage": "ENTRY_LEVEL"})
    records.append({**records[0], "collected_at": "2026-10-01T11:00:00Z"})
    records.append(dict(records[0]))
    raw = b"".join((json.dumps(row, ensure_ascii=False) + "\n").encode("utf-8") for row in records)
    policy = {**common, "scope": "DECLARED_NOT_EXECUTED", "description_min_chars": 100, "max_age_days": 35,
              "blocking_reasons": ["DUPLICATE_CONFLICT", "UNKNOWN_COUNTRY", "UNKNOWN_AREA", "ROLE_AMBIGUOUS", "STAGE_AMBIGUOUS", "SENIOR_TITLE", "EXPERIENCE_CONFLICT"],
              "area_map": {"CA|ON|Toronto": "TORONTO_GTA"}, "area_map_scope": "TEST_FIXTURE_ONLY",
              "cleaning": "text-clean-1", "resource_recheck_days": 90, "opportunity_recheck_days": 7,
              "classification": "fixture labels are expectations only", "matching": "case-insensitive word boundaries",
              "statistics": "unique job/skill; usable-description denominator; NOT EXECUTED"}
    dictionary = {**common, "dictionary_version": "synthetic-skills-1", "skills": [
        {"skill_id": "sql", "display_name": "SQL", "aliases": ["SQL", "Structured Query Language"], "match_rules": ["case-insensitive word boundary"]},
        {"skill_id": "python", "display_name": "Python", "aliases": ["Python"], "match_rules": ["case-insensitive word boundary"]},
    ]}
    policy_bytes = json_bytes(policy)
    dictionary_bytes = json_bytes(dictionary)
    expected = {**common, "status": "MVP02_EXPECTATIONS_NOT_EXECUTED", "input_rows": 12,
                "canonical_ids": [f"SYN:{i:02d}" for i in range(1, 11)],
                "future_expected": {"C": 10, "F": 10, "Q": 0, "E": 0, "D": 8, "description_insufficient": 2,
                                    "sql": {"count": 4, "denominator": 8}, "python": {"count": 3, "denominator": 8}},
                "expected_clean_lengths": {"SYN:05": 99, "SYN:10": 100}}
    sha = lambda content: hashlib.sha256(content).hexdigest()
    def version_ref(name: str, dictionary_ref: bool = False) -> dict:
        return {"version": name, "path": "config/skills.json" if dictionary_ref else "config/declared-policy.json",
                "sha256": sha(dictionary_bytes if dictionary_ref else policy_bytes)}
    manifest = {**common, "snapshot_id": "syn-mvp01-v1", "input_schema": "utsc-job-input-1",
                "source_batches": [{"batch_id": "syn-input-v1", "provider": "Locally authored artificial examples",
                                    "source_ref": "Independent fixture designed in plans/验收追踪表.md; no external collection",
                                    "path": "raw/jobs-v1.jsonl", "bytes": len(raw), "sha256": sha(raw), "format": "jsonl"}],
                "usage": {"code_use_status": "ALLOWED", "data_use_status": "ALLOWED", "internal_demo_status": "ALLOWED",
                          "redistribution_status": "ALLOWED", "evidence_ref": "Independent artificial input authored for this workspace; no upstream data or code",
                          "confirmed_by": "Local fixture author (Codex)", "confirmed_date": "2026-10-21", "attribution": "UTSC Career Navigator synthetic fixture; no real employer or vacancy"},
                "collected_start": "2026-10-01T11:00:00Z", "collected_end": "2026-10-01T12:00:00Z",
                "collection_timezone": "UTC", "time_basis": "FIXTURE",
                "built_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "posted_range": {"start": "2026-09-30", "end": "2026-09-30", "precision": "DATE", "basis": "FIXTURE"},
                "versions": {"cleaning": version_ref("text-clean-1"), "classification": version_ref("fixture-classification-1"),
                             "dictionary": version_ref("synthetic-skills-1", True), "matching": version_ref("fixture-matching-1"),
                             "areas": version_ref("fixture-area-map-1"), "statistics": version_ref("utsc-statistics-1")},
                "policy": {key: value for key, value in policy.items() if key not in common},
                "counts": {"input_rows": 12, "candidate_jobs": None, "formal_jobs": None, "analyzable_descriptions": None, "pending_jobs": None, "excluded_jobs": None},
                "quality_ref": None}
    for path, content in zip(paths, [raw, policy_bytes, dictionary_bytes, json_bytes(expected), json_bytes(manifest)]):
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as output:
            output.write(content)
    print("Created independent SYNTHETIC fixture: 12 input rows. No analysis was executed.")


if __name__ == "__main__":
    main()
