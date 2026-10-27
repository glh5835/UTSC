"""Author a new, explicit-title synthetic input; never change existing raw or answers."""

from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DESTINATION = ROOT / "data/synthetic/inputs/mvp02-v1"


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2)+"\n").encode("utf-8")


def main():
    if DESTINATION.exists():
        raise SystemExit("MVP-02 input already exists; no existing input was overwritten.")
    original = ROOT / "data/synthetic"
    records = [json.loads(line) for line in (original/"raw/jobs-v1.jsonl").read_bytes().splitlines()]
    # These are newly authored title inputs. The processor never reads fixture_expected_*.
    titles = {"01": "Junior Data Analyst", "02": "Junior Data Analyst", "03": "Junior Data Analyst",
              "04": "Junior Data Analyst", "05": "Junior Data Analyst", "06": "Junior Data Analyst",
              "07": "Junior Business Intelligence Analyst", "08": "Junior Business Intelligence Analyst",
              "09": "Junior Business Intelligence Analyst", "10": "Junior Business Intelligence Analyst"}
    for record in records:
        record["title"] = titles[record["source_job_id"]]
        record["batch_id"] = "syn-mvp02-input-v1"
        record.pop("fixture_expected_role", None)
        record.pop("fixture_expected_stage", None)
    raw = b"".join((json.dumps(item, ensure_ascii=False)+"\n").encode("utf-8") for item in records)
    common = {"contract_version": "utsc-contract-1.0", "data_mode": "SYNTHETIC"}
    rules = {**common, "scope": "DECLARED_NOT_EXECUTED", "execution_profile": "utsc-analysis-1",
             "description_min_chars": 100, "max_age_days": 35, "alphabetic_min_ratio": .35,
             "template_patterns": [r"(?:description unavailable[.\s]*)+", r"(?:no description provided[.\s]*)+"],
             "country_aliases": {"ca": "CA", "canada": "CA"}, "province_aliases": {"ontario": "ON", "quebec": "QC"},
             "area_map": {"CA|ON|Toronto": "TORONTO_GTA", "CA|QC|Montreal": "MONTREAL_METRO"}, "area_map_scope": "TEST_FIXTURE_ONLY",
             "blocking_reasons": ["INVALID_COLLECTION_TIME", "DUPLICATE_CONFLICT", "ID_MISMATCH", "UNKNOWN_COUNTRY", "UNKNOWN_AREA", "ROLE_AMBIGUOUS", "ROLE_UNCLASSIFIED", "STAGE_AMBIGUOUS", "STAGE_UNCLASSIFIED", "SENIOR_TITLE", "EXPERIENCE_CONFLICT"],
             "role_rules": {"DATA_ANALYST": [r"\bdata\s+analyst\b"], "BUSINESS_ANALYST": [r"\bbusiness\s+analyst\b"],
                            "BI": [r"\bbusiness\s+intelligence\b", r"\bBI\s+(?:analyst|developer)\b"],
                            "DATA_SCIENTIST": [r"\bdata\s+(?:scientist|science)\b"], "DATA_ENGINEER": [r"\bdata\s+engineer\b"]},
             "stage_rules": {"INTERNSHIP_COOP": [r"\b(?:internship|intern|co[- ]?op)\b"],
                             "NEW_GRADUATE": [r"\b(?:new\s+grad(?:uate)?|recent\s+grad(?:uate)?|graduate)\b"],
                             "ENTRY_LEVEL": [r"\b(?:entry[- ]level|junior|jr\b\.?)\b"]},
             "senior_pattern": r"\b(?:senior|sr\b\.?|lead|manager|director|principal|staff)\b",
             "experience_pattern": r"\b(\d+)(?:\s*[-–]\s*\d+)?\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:relevant\s+)?(?:work\s+)?experience\b",
             "experience_conflict_min": 3}
    rules["out_of_scope_role_rules"] = [r"\b(?:product|operations?|risk|financial|finance)\s+analyst\b"]
    dictionary = json.loads((original/"config/skills.json").read_text(encoding="utf-8"))
    rules_bytes, skills_bytes = encode(rules), encode(dictionary)
    sha = lambda data: hashlib.sha256(data).hexdigest()
    prefix = "inputs/mvp02-v1/"
    def ref(version, dictionary=False):
        return {"version": version, "path": prefix+("skills.json" if dictionary else "rules.json"), "sha256": sha(skills_bytes if dictionary else rules_bytes)}
    manifest = deepcopy(json.loads((original/"snapshots/syn-mvp01-v1/manifest.json").read_text(encoding="utf-8")))
    manifest.update(snapshot_id="syn-mvp02-v1", built_at=datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"), policy=rules,
                    source_batches=[{"batch_id": "syn-mvp02-input-v1", "provider": "Independent explicit-title SYNTHETIC examples", "source_ref": "New artificial titles; existing MVP-01 raw and independent answers preserved", "path": prefix+"jobs.jsonl", "format": "jsonl", "bytes": len(raw), "sha256": sha(raw)}],
                    versions={"cleaning": ref("text-clean-1"), "classification": ref("title-classification-2"), "dictionary": ref("synthetic-skills-1", True),
                              "matching": ref("literal-word-matching-1"), "areas": ref("synthetic-area-map-2"), "statistics": ref("utsc-statistics-1")})
    manifest["usage"]["evidence_ref"] = "Independently authored MVP-02 fixture, not a real employer dataset or human review"
    DESTINATION.mkdir(parents=True)
    for name, value in (("jobs.jsonl", raw), ("rules.json", rules_bytes), ("skills.json", skills_bytes), ("manifest.json", encode(manifest))):
        with (DESTINATION/name).open("xb") as output: output.write(value)
    print("Created a new explicit-title SYNTHETIC input outside the read-only raw directory.")


if __name__ == "__main__":
    main()
