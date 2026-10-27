from copy import deepcopy
import hashlib
import json
from pathlib import Path
import shutil

import pytest

from utsc_nav.analysis import AnalysisFailure, analyze, clean_body, statistics
from utsc_nav.importer import load_snapshot
from utsc_nav.snapshot_store import read_snapshot, save_snapshot

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = "inputs/mvp02-v1/manifest.json"
EXPECTED = json.loads((ROOT/"tests/fixtures/mvp02_expected.json").read_text(encoding="utf-8"))


@pytest.fixture
def case_root(tmp_path):
    shutil.copytree(ROOT/"data/synthetic/inputs/mvp02-v1", tmp_path/"synthetic/inputs/mvp02-v1")
    return tmp_path


def write_case(root, change=None, rules_change=None):
    folder = root/"synthetic/inputs/mvp02-v1"
    manifest = json.loads((folder/"manifest.json").read_text(encoding="utf-8"))
    records = [json.loads(line) for line in (folder/"jobs.jsonl").read_bytes().splitlines()]
    if change:
        change(records)
    raw = b"".join((json.dumps(item, ensure_ascii=False)+"\n").encode("utf-8") for item in records)
    (folder/"jobs.jsonl").write_bytes(raw)
    manifest["source_batches"][0].update(sha256=hashlib.sha256(raw).hexdigest(), bytes=len(raw))
    manifest["counts"]["input_rows"] = len(records)
    if rules_change:
        rules = json.loads((folder/"rules.json").read_text(encoding="utf-8"))
        rules_change(rules)
        content = json.dumps(rules).encode()
        (folder/"rules.json").write_bytes(content)
        for key, value in manifest["versions"].items():
            if key != "dictionary": value["sha256"] = hashlib.sha256(content).hexdigest()
        manifest["policy"] = rules
    (folder/"manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return load_snapshot(root, "SYNTHETIC", MANIFEST)


def change_job(records, identifier="SYN:04", **changes):
    for item in records:
        if item["job_id"] == identifier:
            item.update(changes)


def process(root, change=None, rules_change=None):
    return analyze(write_case(root, change, rules_change))["payload"]


def find(payload, job_id="SYN:04"):
    return next(item for item in payload["jobs"] if item["job_id"] == job_id)


def test_base_independent_counts_and_prior_answers(case_root):
    payload = process(case_root)
    for key in ("input_rows", "C", "F", "Q", "E", "duplicate_observations"):
        assert payload["quality"][key] == EXPECTED["base"][key]
    assert payload["statistics"]["analyzable_descriptions"] == EXPECTED["base"]["D"]
    prior = json.loads((ROOT/"data/synthetic/expected-mvp02.json").read_text(encoding="utf-8"))["future_expected"]
    assert {k: payload["quality"][k] for k in ("C", "F", "Q", "E")} == {k: prior[k] for k in ("C", "F", "Q", "E")}
    for skill in payload["statistics"]["skills"]:
        assert {k: skill[k] for k in ("count", "denominator", "rate")} == EXPECTED["skills"][skill["skill_id"]]
    assert payload["quality"]["human_review"] == {"status": "NOT_PERFORMED", "reviewed_records": None, "role_agreement": None, "stage_agreement": None}


@pytest.mark.parametrize("identifier", list(EXPECTED["jobs"]))
def test_ten_independent_job_answers(case_root, identifier):
    payload = process(case_root)
    item, answer = find(payload, identifier), EXPECTED["jobs"][identifier]
    assert item["classification"]["disposition"] == "FORMAL"
    assert item["classification"]["role_effective"] == answer["role"]
    assert item["classification"]["stage_effective"] == answer["stage"]
    assert item["description_usable"] == answer["usable"]
    assert sorted(m["skill_id"] for m in payload["skill_mentions"] if m["job_id"] == identifier) == answer["skills"]


def test_evidence_positions_aliases_and_all_source_occurrences(case_root):
    payload = process(case_root)
    assert len(find(payload, "SYN:01")["source_occurrences"]) == 3
    assert {x["selection"] for x in find(payload, "SYN:01")["observations"]} == {"SELECTED", "SUPERSEDED", "DUPLICATE_SAME_TIME"}
    mention = next(m for m in payload["skill_mentions"] if m["job_id"] == "SYN:01")
    assert len(mention["matches"]) == 3
    for mention in payload["skill_mentions"]:
        body = find(payload, mention["job_id"])["job"]["description_clean"]
        for match in mention["matches"]:
            assert body[match["start"]:match["end"]] == match["matched_text"]
            assert match["matched_text"] in match["snippet"]
    for job in payload["jobs"]:
        for evidence in job["classification"]["evidence"]:
            original = job["job"][evidence["field"]]
            assert original[evidence["start"]:evidence["end"]] == evidence["matched_text"]


def test_expected_metadata_cannot_supply_classification(case_root):
    payload = process(case_root, lambda rows: change_job(rows, fixture_expected_role="DATA_ENGINEER", fixture_expected_stage="NEW_GRADUATE"))
    assert find(payload)["classification"]["role_effective"] == "DATA_ANALYST"
    assert find(payload)["classification"]["stage_effective"] == "ENTRY_LEVEL"


def test_old_placeholder_manifest_is_not_silently_treated_as_executable():
    batch = load_snapshot(ROOT/"data", "SYNTHETIC", "snapshots/syn-mvp01-v1/manifest.json")
    with pytest.raises(AnalysisFailure, match="ANALYSIS_CONFIG_UNSUPPORTED"):
        analyze(batch)


@pytest.mark.parametrize("value,expected", [
    (None, None), ("", None), ("<p>SQL &amp; <b>Python</b></p><script>fabricated()</script>", "SQL & Python"),
    ("  First\r\n second\tthird \x00", "First second third"), ("中文课程 <b>SQL</b> 与 Python", "中文课程 SQL 与 Python"),
])
def test_cleaning_independent_text_answers(value, expected):
    assert clean_body(value) == expected


@pytest.mark.parametrize("body", ["MySQL PostgreSQL pythonic. "+"Routine duties. "*15, "Routine team duties. "*15])
def test_substrings_and_unmentioned_skills_are_not_invented(case_root, body):
    payload = process(case_root, lambda rows: change_job(rows, title="Junior Data Analyst SQL", description_raw=body))
    assert not [m for m in payload["skill_mentions"] if m["job_id"] == "SYN:04"]


def test_unicode_offsets_and_html_cleaning(case_root):
    body = "<p>课程与练习 SQL &amp; Python。</p>" + "团队实践与日常工作。"*20
    payload = process(case_root, lambda rows: change_job(rows, description_raw=body))
    clean = find(payload)["job"]["description_clean"]
    for mention in [m for m in payload["skill_mentions"] if m["job_id"] == "SYN:04"]:
        assert mention["matches"][0]["start"] == clean.index(mention["matches"][0]["matched_text"])


@pytest.mark.parametrize("posted,precision,disposition,reason", [
    ("2026-08-27", "DATE", "FORMAL", None), ("2026-08-26", "DATE", "EXCLUDED", "POSTED_TOO_OLD"),
    (None, "DATE", "EXCLUDED", "MISSING_POSTED_DATE"), ("2026-02-30", "DATE", "EXCLUDED", "INVALID_POSTED_DATE"),
    ("2026-10-02", "DATE", "EXCLUDED", "FUTURE_POSTED_DATE"),
    ("2026-10-01T12:00:01Z", "DATETIME", "EXCLUDED", "FUTURE_POSTED_DATE"),
    ("2026-10-01T12:00:00Z", "DATETIME", "FORMAL", None),
])
def test_date_boundaries_use_original_collection(case_root, posted, precision, disposition, reason):
    payload = process(case_root, lambda rows: change_job(rows, posted_at=posted, posted_precision=precision))
    job = find(payload)
    assert job["classification"]["disposition"] == disposition
    if reason: assert reason in job["classification"]["reason_codes"]
    if posted == "2026-08-27": assert job["age_days_at_collection"] == 35


def test_calendar_age_uses_declared_timezone(case_root):
    payload = process(case_root, lambda rows: change_job(rows, collected_at="2026-10-02T00:30:00Z", collection_timezone="America/Toronto", posted_at="2026-08-27", posted_timezone="America/Toronto"))
    assert find(payload)["age_days_at_collection"] == 35
    assert find(payload)["classification"]["disposition"] == "FORMAL"


@pytest.mark.parametrize("changes,reason,state", [
    ({"country_code": None}, "UNKNOWN_COUNTRY", "PENDING"),
    ({"country_code": "US"}, "NON_CANADA", "EXCLUDED"),
    ({"city": "Unmapped City", "market_area": "TORONTO_GTA"}, "UNKNOWN_AREA", "PENDING"),
    ({"title": "Senior Data Analyst"}, "SENIOR_TITLE", "PENDING"),
    ({"title": "Junior Data Analyst / Business Analyst"}, "ROLE_AMBIGUOUS", "PENDING"),
    ({"title": "Junior Data Analyst Internship"}, "STAGE_AMBIGUOUS", "PENDING"),
    ({"title": "Data Analyst"}, "STAGE_UNCLASSIFIED", "PENDING"),
    ({"description_raw": "3+ years of experience required. "+"Routine duties. "*20}, "EXPERIENCE_CONFLICT", "PENDING"),
    ({"posted_timezone": None}, "UNKNOWN_POSTED_TIMEZONE", "PENDING"),
    ({"employer": None}, "MISSING_EMPLOYER", "PENDING"),
    ({"source_url": "http://[malformed"}, "INVALID_SOURCE_URL", "PENDING"),
    ({"title": "Junior Product Analyst"}, "OUT_OF_SCOPE_ROLE", "EXCLUDED"),
])
def test_blocking_and_exclusion_reasons(case_root, changes, reason, state):
    payload = process(case_root, lambda rows: change_job(rows, **changes))
    label = find(payload)["classification"]
    assert label["disposition"] == state and reason in label["reason_codes"]
    assert label["role_effective"] is None
    q = payload["quality"]
    assert q["C"] == q["F"]+q["Q"]+q["E"]


@pytest.mark.parametrize("title,role", [("Data Analyst", "DATA_ANALYST"), ("Business Analyst", "BUSINESS_ANALYST"), ("BI Analyst", "BI"), ("Data Scientist", "DATA_SCIENTIST"), ("Data Engineer", "DATA_ENGINEER")])
@pytest.mark.parametrize("prefix,stage", [("Junior ", "ENTRY_LEVEL"), ("New Graduate ", "NEW_GRADUATE"), ("Intern ", "INTERNSHIP_COOP")])
def test_five_roles_three_stages(case_root, title, role, prefix, stage):
    payload = process(case_root, lambda rows: change_job(rows, title=prefix+title))
    label = find(payload)["classification"]
    assert label["disposition"] == "FORMAL"
    assert (label["role_effective"], label["stage_effective"]) == (role, stage)


def test_missing_id_is_isolated_not_generated(case_root):
    payload = process(case_root, lambda rows: change_job(rows, job_id=None))
    quality = payload["quality"]
    assert (quality["input_rows"], quality["C"], quality["isolated_input_rows"]) == (12, 9, 1)
    assert quality["isolated_inputs"][0]["reason"] == "MISSING_ID"


def test_invalid_collection_observation_blocks_group_without_fallback(case_root):
    def mutate(rows): rows[10]["collected_at"] = "invalid"
    payload = process(case_root, mutate)
    assert "INVALID_COLLECTION_TIME" in find(payload, "SYN:01")["classification"]["reason_codes"]
    assert find(payload, "SYN:01")["classification"]["disposition"] == "PENDING"


def test_equal_time_conflict_isolates_whole_id(case_root):
    def mutate(rows): rows[11]["title"] = "Junior Data Engineer"
    payload = process(case_root, mutate)
    job = find(payload, "SYN:01")
    assert job["classification"]["disposition"] == "PENDING"
    assert "DUPLICATE_CONFLICT" in job["classification"]["reason_codes"]
    assert len(job["source_occurrences"]) == 3
    assert (payload["quality"]["F"], payload["quality"]["Q"]) == (9, 1)


@pytest.mark.parametrize("changes,state", [({"description_raw": None}, "FORMAL"), ({"posted_at": "2026-10-03"}, "EXCLUDED")])
def test_latest_observation_never_falls_back_to_old_good_value(case_root, changes, state):
    def mutate(rows): rows.append({**rows[0], "collected_at": "2026-10-01T13:00:00Z", **changes})
    payload = process(case_root, mutate)
    job = find(payload, "SYN:01")
    assert job["raw_ref"]["line"] == 13
    assert job["classification"]["disposition"] == state
    assert len(job["source_occurrences"]) == 4
    assert not [m for m in payload["skill_mentions"] if m["job_id"] == "SYN:01"]


def test_zero_denominator_and_empty_role_are_unavailable(case_root):
    def mutate(rows):
        for row in rows: row["description_raw"] = None
    payload = process(case_root, mutate)
    stats = payload["statistics"]
    assert stats["formal_jobs"] == 10 and stats["analyzable_descriptions"] == 0
    assert all(s["rate"] is None for s in stats["skills"])
    empty = statistics(payload["jobs"], payload["skill_mentions"], payload["skills"], role="DATA_ENGINEER")
    assert empty["formal_jobs"] == empty["analyzable_descriptions"] == 0
    assert all(s["rate"] is None for s in empty["skills"])


def test_positive_denominator_without_mentions_is_a_real_zero(case_root):
    def mutate(rows):
        for row in rows: row["description_raw"] = "Routine duties and team communication. "*5
    payload = process(case_root, mutate)
    assert payload["statistics"]["analyzable_descriptions"] == 10
    assert all(s["count"] == 0 and s["rate"] == 0.0 for s in payload["statistics"]["skills"])


@pytest.mark.parametrize("role,F,D,sql,python", [("DATA_ANALYST", 6, 4, 2, 2), ("BI", 4, 4, 2, 1)])
def test_pure_filtered_statistics(case_root, role, F, D, sql, python):
    p = process(case_root)
    stats = statistics(p["jobs"], p["skill_mentions"], p["skills"], role=role)
    assert (stats["formal_jobs"], stats["analyzable_descriptions"]) == (F, D)
    actual = {x["skill_id"]: x["count"] for x in stats["skills"]}
    assert actual == {"sql": sql, "python": python} and stats["exploratory"]


@pytest.mark.parametrize("body,reason", [(None, "DESCRIPTION_MISSING"), ("x"*99, "DESCRIPTION_SHORT"), ("https://example.invalid/"+"a"*120, "DESCRIPTION_URL_ONLY"), ("!"*120, "DESCRIPTION_UNVERIFIED"), ("description unavailable. "*10, "DESCRIPTION_TEMPLATE")])
def test_description_warnings_do_not_remove_formal_job(case_root, body, reason):
    payload = process(case_root, lambda rows: change_job(rows, description_raw=body))
    item = find(payload)
    assert item["classification"]["disposition"] == "FORMAL"
    assert not item["description_usable"] and item["description_reason"] == reason


def test_bad_executable_config_is_not_silently_used(case_root):
    with pytest.raises(AnalysisFailure, match="ANALYSIS_CONFIG_UNSUPPORTED"):
        process(case_root, rules_change=lambda rules: rules.update(description_min_chars=101))


def test_invalid_scope_pattern_is_a_controlled_configuration_failure(case_root):
    with pytest.raises(AnalysisFailure, match="ANALYSIS_CONFIG_UNSUPPORTED"):
        process(case_root, rules_change=lambda rules: rules.update(out_of_scope_role_rules=["["]))


def test_processing_is_deterministic_and_does_not_mutate_batch(case_root):
    batch = write_case(case_root)
    before = deepcopy(batch)
    assert analyze(batch) == analyze(batch)
    assert batch == before


def test_immutable_store_idempotence_and_tamper_detection(case_root):
    analysis = analyze(write_case(case_root))
    first = save_snapshot(analysis, case_root)
    directory = Path(first["directory"])
    before = {p.name: p.read_bytes() for p in directory.iterdir()}
    assert save_snapshot(analysis, case_root)["manifest"] == first["manifest"]
    assert before == {p.name: p.read_bytes() for p in directory.iterdir()}
    (directory/"quality.json").write_text("{}", encoding="utf-8")
    with pytest.raises(AnalysisFailure, match="SNAPSHOT_CORRUPT"): read_snapshot(directory)
    with pytest.raises(AnalysisFailure, match="SNAPSHOT_CORRUPT"): save_snapshot(analysis, case_root)
    assert (directory/"quality.json").read_text(encoding="utf-8") == "{}"


def test_write_failure_preserves_previous_snapshot(case_root, monkeypatch):
    first = save_snapshot(analyze(write_case(case_root)), case_root)
    directory = Path(first["directory"])
    before = {p.name: p.read_bytes() for p in directory.iterdir()}
    next_analysis = analyze(write_case(case_root, lambda rows: change_job(rows, description_raw=None)))
    def fail_rename(*args, **kwargs): raise OSError("Injected failure")
    monkeypatch.setattr(Path, "rename", fail_rename)
    with pytest.raises(AnalysisFailure, match="SNAPSHOT_WRITE_FAILED"):
        save_snapshot(next_analysis, case_root)
    assert before == {p.name: p.read_bytes() for p in directory.iterdir()}
    assert not list(directory.parent.glob(".building-*"))
