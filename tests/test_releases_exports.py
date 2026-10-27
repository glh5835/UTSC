"""Independent expectations for local public state, atomic releases and exports."""
from copy import deepcopy
from datetime import datetime, timezone, timedelta
import csv
import io
import json
from pathlib import Path
import shutil
import sqlite3

import pytest
from utsc_nav.analysis import canonical, digest, statistics
from utsc_nav.releases import (ReleaseFailure, save_draft, save_review, public_state,
    draft_objects, publish, rollback, load_current, read_release)
from utsc_nav.resources import load_catalog, verified_mappings, opportunity_state
from utsc_nav.snapshot_store import read_snapshot
from utsc_nav.market import comparison_result, result_key
from utsc_nav.next_steps import blank_profile, generate_next_steps, generation_key
from utsc_nav.exports import comparison_csv, action_markdown, csv_cell, ExportFailure

ROOT = Path(__file__).resolve().parents[1]
ANALYSIS = ROOT/"data/synthetic/analyses/synthetic-analysis-c7459431a5c4655471e84a71"
CATALOG = ROOT/"data/resources/utsc-resources-v1"
MODE = "SYNTHETIC"
CLOCK = datetime(2026,10,21,18,tzinfo=timezone.utc)
FILTERS = dict(left_role="DATA_ANALYST",right_role="BI",area="TORONTO_GTA",stage=None)


@pytest.fixture
def workspace(tmp_path):
    catalog = tmp_path/"catalog"
    shutil.copytree(CATALOG,catalog)
    root = tmp_path/"state"
    save_draft(root,MODE,ANALYSIS,catalog)
    return root,catalog


def review(root,kind,identifier,*,change=None,status="APPROVED",reason="Independent synthetic review"):
    obj = draft_objects(root,MODE,kind)[identifier]
    value = {**obj["value"],**(change or {})}
    return save_review(root,MODE,kind,identifier,value,status=status,reason=reason,reviewer_id="synthetic-tester",expected_hash=obj["content_hash"])


def job_id(root): return next(iter(draft_objects(root,MODE,"classification")))


def test_save_reopen_old_new_reason_and_supersession_without_publication(workspace):
    root,_ = workspace
    first = review(root,"classification",job_id(root),change={"disposition":"EXCLUDED"})
    second = review(root,"classification",job_id(root),change={"role":"BI"})
    reopened = public_state(Path(str(root)),MODE)
    assert reopened["current"] is None and reopened["history"] == []
    assert reopened["reviews"] == [first,second]
    assert second["supersedes_review_id"] == first["review_id"]
    assert second["old_value"]["disposition"] == "EXCLUDED"
    assert second["review_method"] == "LOCAL_MAINTENANCE" and second["reviewed_at"]


def test_full_package_is_self_contained_and_not_a_source_directory_alias(workspace):
    root,catalog = workspace
    bundle = publish(root,MODE,reason="Synthetic baseline")
    receipt = bundle["receipt"]
    assert (receipt["payload"]["quality"]["F"],receipt["payload"]["statistics"]["analyzable_descriptions"]) == (10,8)
    assert receipt["release_id"] == bundle["catalog"]["release_id"]
    assert bundle["manifest"]["review_version"] == receipt["payload"]["local_review_version"]
    (catalog/"resources.json").write_text("broken",encoding="utf-8")
    loaded = load_current(root,MODE)
    assert loaded["manifest"] == bundle["manifest"] and len(loaded["catalog"]["resources"]) == 23
    assert loaded["receipt"]["payload"]["quality"]["human_review"]["reviewed_records"] is None


def test_save_publish_reload_and_whole_bundle_rollback(workspace):
    root,_ = workspace
    first = publish(root,MODE,reason="baseline")
    frozen = deepcopy(first)
    review(root,"classification",job_id(root),change={"disposition":"EXCLUDED"})
    review(root,"resource","PROJECT-SQL",change={"availability_status":"CLOSED"})
    assert load_current(root,MODE)["manifest"] == first["manifest"]
    second = publish(root,MODE,reason="label and resource together")
    assert second["receipt"]["payload"]["quality"]["F"] == 9
    assert first == frozen
    assert second["manifest"]["previous_release_id"] == first["manifest"]["release_id"]
    assert all(second["manifest"][k] != first["manifest"][k] for k in ("snapshot_id","resource_version","mapping_version","review_version"))
    assert next(r for r in second["catalog"]["resources"] if r["resource_id"] == "PROJECT-SQL")["availability_status"] == "CLOSED"
    rollback(root,MODE,first["manifest"]["release_id"],reason="restore full baseline")
    assert load_current(root,MODE)["manifest"] == first["manifest"]
    assert len(public_state(root,MODE)["reviews"]) == 2
    assert [h["operation"] for h in public_state(root,MODE)["history"]] == ["PUBLISH","PUBLISH","ROLLBACK"]


def test_effective_role_overrides_preserve_extraction_and_recalculate(workspace):
    root,_ = workspace
    identifier = job_id(root)
    review(root,"classification",identifier,change={"role":"BI"})
    bundle = publish(root,MODE,reason="role correction")
    item = next(j for j in bundle["receipt"]["payload"]["jobs"] if j["job_id"] == identifier)
    assert item["classification"]["role_proposed"] == "DATA_ANALYST"
    assert item["classification"]["role_effective"] == "BI"
    result = comparison_result(bundle["receipt"],**FILTERS)
    assert result["left"]["formal_jobs"] == 5 and result["right"]["formal_jobs"] == 5
    assert result["left"]["analyzable_descriptions"] == 3 and result["right"]["analyzable_descriptions"] == 5


@pytest.mark.parametrize("status",["DRAFT","NEEDS_RECHECK","REJECTED"])
def test_review_status_has_explicit_effect(workspace,status):
    root,_ = workspace
    review(root,"classification",job_id(root),change={"disposition":"EXCLUDED"},status=status)
    b = publish(root,MODE,reason="test status")
    q = b["receipt"]["payload"]["quality"]
    assert q["F"] == (10 if status == "DRAFT" else 9)
    assert q["Q"] == (0 if status == "DRAFT" else 1)


def test_resource_edit_invalidates_mapping_until_explicit_joint_review(workspace):
    root,_ = workspace
    review(root,"resource","PROJECT-SQL",change={"availability_status":"CLOSED"})
    first = publish(root,MODE,reason="source changed")
    m = next(m for m in first["catalog"]["mappings"] if m["resource_id"] == "PROJECT-SQL")
    assert m["review_status"] == "NEEDS_RECHECK"
    review(root,"mapping","PROJECT-SQL::sql")
    second = publish(root,MODE,reason="joint mapping review")
    assert next(m for m in second["catalog"]["mappings"] if m["resource_id"] == "PROJECT-SQL")["review_status"] == "LOCAL_VERIFIED"


def test_pending_source_cannot_be_laundered_to_checked(workspace):
    root,_ = workspace
    obj = draft_objects(root,MODE,"mapping")["CSCB20H3::sql"]
    review(root,"mapping","CSCB20H3::sql")
    with pytest.raises(ReleaseFailure,match="SOURCE_NOT_CHECKED"): publish(root,MODE,reason="must fail")
    assert public_state(root,MODE)["current"] is None


def test_mapping_approval_before_later_resource_edit_is_not_reused(workspace):
    root,_ = workspace
    review(root,"mapping","PROJECT-SQL::sql")
    review(root,"resource","PROJECT-SQL",change={"prerequisites_text":"Independent revised synthetic prerequisite"})
    b = publish(root,MODE,reason="later resource change invalidates earlier mapping approval")
    assert next(m for m in b["catalog"]["mappings"] if m["resource_id"] == "PROJECT-SQL")["review_status"] == "NEEDS_RECHECK"
    review(root,"mapping","PROJECT-SQL::sql",reason="Explicit re-review after resource edit")
    b = publish(root,MODE,reason="re-reviewed current relationship")
    assert next(m for m in b["catalog"]["mappings"] if m["resource_id"] == "PROJECT-SQL")["review_status"] == "LOCAL_VERIFIED"
    review(root,"resource","PROJECT-SQL",change={"prerequisites_text":"Another independent synthetic change"})
    b = publish(root,MODE,reason="newer edit invalidates it again")
    assert next(m for m in b["catalog"]["mappings"] if m["resource_id"] == "PROJECT-SQL")["review_status"] == "NEEDS_RECHECK"


@pytest.mark.parametrize("invalid",[{}, {"role":"FAKE","stage":"ENTRY_LEVEL","disposition":"FORMAL"}, {"role":None,"stage":None,"disposition":"FORMAL"},
    {"role":"DATA_ANALYST","stage":"ENTRY_LEVEL","disposition":[]}, {"role":"DATA_ANALYST","stage":{},"disposition":"FORMAL"}])
def test_invalid_review_fields_never_save(workspace,invalid):
    root,_ = workspace
    obj = draft_objects(root,MODE,"classification")[job_id(root)]
    with pytest.raises(ReleaseFailure): save_review(root,MODE,"classification",job_id(root),invalid,status="APPROVED",reason="test",reviewer_id="tester",expected_hash=obj["content_hash"])
    assert public_state(root,MODE)["reviews"] == []


def test_blank_reason_and_stale_base_fail_without_losing_old_review(workspace):
    root,_ = workspace
    first = review(root,"classification",job_id(root))
    obj = draft_objects(root,MODE,"classification")[job_id(root)]
    for reason,sha in (("",obj["content_hash"]),("reason","0"*64)):
        with pytest.raises(ReleaseFailure): save_review(root,MODE,"classification",job_id(root),obj["value"],status="APPROVED",reason=reason,reviewer_id="tester",expected_hash=sha)
    assert public_state(root,MODE)["reviews"] == [first]


def test_mode_isolation_and_bad_input_preserve_current_and_draft(workspace):
    root,catalog = workspace
    good = publish(root,MODE,reason="baseline")
    old = public_state(root,MODE)
    assert load_current(root,"HISTORICAL") is None
    with pytest.raises(ReleaseFailure): save_draft(root,"HISTORICAL",ANALYSIS,catalog)
    assert public_state(root,MODE) == old
    (catalog/"mappings.json").write_text("bad",encoding="utf-8")
    with pytest.raises(ReleaseFailure,match="DRAFT_SOURCE_CHANGED"): publish(root,MODE,reason="bad input")
    assert public_state(root,MODE) == old and load_current(root,MODE)["manifest"] == good["manifest"]


@pytest.mark.parametrize("member",["analysis.json","catalog/resources.json","catalog/mappings.json","reviews.json","dictionary.json","manifest.json"])
def test_corrupt_complete_package_fails_closed_and_rollback_validates(workspace,member):
    root,_ = workspace
    first = publish(root,MODE,reason="baseline")
    second = publish(root,MODE,reason="second")
    path = Path(first["directory"])/member
    path.write_bytes(b"broken")
    with pytest.raises(ReleaseFailure): read_release(root,MODE,first["manifest"]["release_id"])
    with pytest.raises(ReleaseFailure): rollback(root,MODE,first["manifest"]["release_id"],reason="bad target")
    assert load_current(root,MODE)["manifest"] == second["manifest"]


def test_pointer_and_history_transaction_failure_recovers(workspace):
    root,_ = workspace
    first = publish(root,MODE,reason="baseline")
    review(root,"classification",job_id(root),change={"disposition":"EXCLUDED"})
    before = public_state(root,MODE)
    with sqlite3.connect(root/"public.sqlite3") as db:
        db.execute("CREATE TRIGGER injected_failure BEFORE INSERT ON history BEGIN SELECT RAISE(ABORT,'synthetic injected failure'); END")
    with pytest.raises(ReleaseFailure,match="POINTER_WRITE_FAILED"): publish(root,MODE,reason="fail")
    assert public_state(root,MODE) == before and load_current(root,MODE)["manifest"] == first["manifest"]
    with sqlite3.connect(root/"public.sqlite3") as db: db.execute("DROP TRIGGER injected_failure")
    assert publish(root,MODE,reason="recover")["receipt"]["payload"]["quality"]["F"] == 9


def test_package_write_failure_keeps_old_pointer_and_reviews(workspace,monkeypatch):
    root,_ = workspace
    publish(root,MODE,reason="baseline")
    review(root,"classification",job_id(root),change={"disposition":"EXCLUDED"})
    before = public_state(root,MODE)
    original = Path.write_bytes
    def fail(path,content):
        if path.name == "manifest.json" and path.parent.name.startswith(".building-"): raise OSError("synthetic disk failure")
        return original(path,content)
    monkeypatch.setattr(Path,"write_bytes",fail)
    with pytest.raises(ReleaseFailure,match="PUBLICATION_FAILED"): publish(root,MODE,reason="fail")
    assert public_state(root,MODE) == before


def test_review_write_failure_keeps_previous_record(workspace):
    root,_ = workspace
    first = review(root,"classification",job_id(root))
    with sqlite3.connect(root/"public.sqlite3") as db:
        db.execute("CREATE TRIGGER injected_failure BEFORE INSERT ON reviews BEGIN SELECT RAISE(ABORT,'synthetic injected failure'); END")
    with pytest.raises(ReleaseFailure,match="REVIEW_SAVE_FAILED"): review(root,"classification",job_id(root),change={"role":"BI"})
    assert public_state(root,MODE)["reviews"] == [first]


@pytest.mark.parametrize("value",["=1+1","+SUM(1,2)","-cmd","@SUM(A1)"," \t=1","\r\n+1","\ufeff=1","\x00@thing"])
def test_csv_formula_text_is_neutralized(value):
    assert csv_cell(value) == "'"+value
    assert csv_cell(-25.0) == -25.0
    assert csv_cell(None) == "N/A"


def test_csv_parses_independent_counts_dates_sources_and_missing_zero_denominator(workspace):
    root,_ = workspace
    b = publish(root,MODE,reason="baseline")
    r = b["receipt"]
    rows = list(csv.DictReader(io.StringIO(comparison_csv(r,comparison_result(r,**FILTERS),**FILTERS).decode("utf-8-sig"))))
    skill = next(row for row in rows if row["skill_id"] == "python")
    assert (skill["left_M"],skill["left_D"],skill["right_M"],skill["right_D"],skill["difference_pp"]) == ("2","4","1","4","25.0")
    sources = [row for row in rows if row["record_type"] == "JOB_SOURCE"]
    assert len(sources) == 10 and all(row["source_url"] and row["posted_at"] == "2026-09-30" and row["collected_at"] for row in sources)
    assert all(row["release_id"] == b["manifest"]["release_id"] for row in rows)
    filters = {**FILTERS,"right_role":"DATA_ENGINEER"}
    rows = list(csv.DictReader(io.StringIO(comparison_csv(r,comparison_result(r,**filters),**filters).decode("utf-8-sig"))))
    skill = rows[0]
    assert skill["right_D"] == "0" and skill["right_rate"] == "N/A" and skill["difference_pp"] == "N/A"


def test_csv_refuses_stale_filter_and_same_analysis_new_release(workspace):
    root,_ = workspace
    a = publish(root,MODE,reason="first")["receipt"]
    result = comparison_result(a,**FILTERS)
    with pytest.raises(ExportFailure): comparison_csv(a,result,**{**FILTERS,"area":"MONTREAL_METRO"})
    b = publish(root,MODE,reason="second")["receipt"]
    assert a["manifest"] == b["manifest"] and result_key(a) != result_key(b)
    with pytest.raises(ExportFailure): comparison_csv(b,result,**FILTERS)


def test_markdown_is_private_explicit_self_report_with_current_sources_and_versions(workspace):
    root,_ = workspace
    b = publish(root,MODE,reason="baseline")
    p = blank_profile(("python","sql"))
    p.update(courses_text="SYNTHETIC_PRIVATE_中文\n```\n# not a heading",experience_text="=SYNTHETIC_PRIVATE_project")
    result = generate_next_steps(p,b["receipt"],b["catalog"],now=CLOCK)
    content = action_markdown(p,b["receipt"],b["catalog"],result,area="TORONTO_GTA",mode=MODE,dirty=False,now=CLOCK).decode()
    assert p["courses_text"] in content and p["experience_text"] in content and "````text" in content
    assert "M/D: 2/4" in content and "NOT_PROVIDED" in content and "https://utsc.calendar.utoronto.ca/" in content
    assert b["manifest"]["release_id"] in content and "2026-09-30" in content and "2026-10-01T12:00:00Z" in content
    assert "SYNTHETIC_PRIVATE" not in json.dumps(public_state(root,MODE))
    assert all(b"SYNTHETIC_PRIVATE" not in path.read_bytes() for path in root.rglob("*") if path.is_file())


@pytest.mark.parametrize("change",["input","release","resource_time","dirty"])
def test_stale_actions_cannot_be_exported(workspace,change):
    root,_ = workspace
    b = publish(root,MODE,reason="baseline")
    p = blank_profile(("python","sql"))
    result = generate_next_steps(p,b["receipt"],b["catalog"],now=CLOCK)
    now = CLOCK
    if change == "input": p["courses_text"] = "new context"
    if change == "release": b = publish(root,MODE,reason="new version")
    if change == "resource_time": now += timedelta(days=100)
    with pytest.raises(ExportFailure): action_markdown(p,b["receipt"],b["catalog"],result,area="TORONTO_GTA",mode=MODE,dirty=change == "dirty",now=now)


def rewrite_catalog(catalog, name, value):
    content = canonical(value)+b"\n"
    (catalog/name).write_bytes(content)
    import hashlib
    manifest = json.loads((catalog/"manifest.json").read_bytes())
    manifest["files"][name] = {"sha256":hashlib.sha256(content).hexdigest(),"bytes":len(content)}
    manifest["catalog_id"] = "resource-catalog-"+digest({k:v for k,v in manifest.items() if k != "catalog_id"})[:24]
    (catalog/"manifest.json").write_bytes(canonical(manifest)+b"\n")


@pytest.mark.parametrize("date_changes,expected",[
    ({"start_at":"11-01","end_at":None,"deadline_at":None},"DATE_UNKNOWN"),
    ({"start_at":"2026-10-01","end_at":"2026-10-02","deadline_at":None},"EXPIRED")])
def test_opportunity_review_persists_and_never_upgrades_unknown_or_expired_dates(workspace,date_changes,expected):
    root,catalog = workspace
    item = json.loads((ROOT/"tests/fixtures/mvp04_opportunities.json").read_bytes())["base"]
    item.update(date_changes)
    item["content_hash"] = digest(item)
    rewrite_catalog(catalog,"opportunities.json",[item])
    save_draft(root,MODE,ANALYSIS,catalog)
    review(root,"opportunity","SYN:EVENT",change={"registration_status":"CLOSED"})
    bundle = publish(root,MODE,reason="isolated synthetic opportunity review")
    loaded = load_current(root,MODE)
    event = loaded["catalog"]["opportunities"][0]
    state = opportunity_state(event,now=CLOCK)
    assert state["time_status"] == expected and state["registration_status"] == "CLOSED"
    assert state["registration_action_available"] is False
    assert event["timezone"] == "America/Toronto" and event["date_precision"] == "DATE"
    assert public_state(root,MODE)["reviews"][0]["old_value"]["registration_status"] == "UNKNOWN"


def test_changed_source_hash_requires_new_review_and_preserves_current(workspace):
    root,catalog = workspace
    review(root,"resource","PROJECT-SQL")
    first = publish(root,MODE,reason="baseline")
    resources = json.loads((catalog/"resources.json").read_bytes())
    target = next(r for r in resources if r["resource_id"] == "PROJECT-SQL")
    target["description"] += " Independent synthetic source revision."
    target["content_hash"] = digest({k:v for k,v in target.items() if k != "content_hash"})
    mappings = json.loads((catalog/"mappings.json").read_bytes())
    for m in mappings:
        if m["resource_id"] == "PROJECT-SQL":
            m["resource_content_hash"] = target["content_hash"]
            m["review_status"] = "NEEDS_RECHECK"
            m["content_hash"] = digest({k:v for k,v in m.items() if k != "content_hash"})
    rewrite_catalog(catalog,"resources.json",resources)
    rewrite_catalog(catalog,"mappings.json",mappings)
    save_draft(root,MODE,ANALYSIS,catalog)
    with pytest.raises(ReleaseFailure,match="REVIEW_STALE"): publish(root,MODE,reason="stale decision must fail")
    assert load_current(root,MODE)["manifest"] == first["manifest"]
    review(root,"resource","PROJECT-SQL",reason="Explicit replacement review for new source hash")
    assert publish(root,MODE,reason="new source review")["manifest"]["resource_version"] != first["manifest"]["resource_version"]


def test_no_sample_and_no_resource_markdown_are_honest(workspace):
    root,catalog = workspace
    rewrite_catalog(catalog,"resources.json",[])
    rewrite_catalog(catalog,"mappings.json",[])
    save_draft(root,MODE,ANALYSIS,catalog)
    b = publish(root,MODE,reason="empty isolated catalog")
    p = blank_profile(("python","sql"))
    p["target_role"] = "DATA_ENGINEER"
    result = generate_next_steps(p,b["receipt"],b["catalog"],now=CLOCK)
    content = action_markdown(p,b["receipt"],b["catalog"],result,area="TORONTO_GTA",mode=MODE,dirty=False,now=CLOCK).decode()
    assert result["actions"] == [] and "GENERAL_EXPLORATION" in content and "F=0; D=0" in content
    assert "rate: N/A" in content and "No checked, current resource" in content


def test_analysis_and_dictionary_remain_intact_after_reviews(workspace):
    root,_ = workspace
    before = {p:p.read_bytes() for folder in (ANALYSIS,CATALOG,ROOT/"data/synthetic/raw") for p in folder.rglob("*") if p.is_file()}
    review(root,"classification",job_id(root),change={"role":"BI","disposition":"EXCLUDED"})
    publish(root,MODE,reason="isolation check")
    assert all(path.read_bytes() == data for path,data in before.items())
