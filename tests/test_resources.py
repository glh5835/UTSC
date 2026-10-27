from copy import deepcopy
from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import shutil

import pytest

from utsc_nav.analysis import canonical, digest
from utsc_nav.resources import (DEFAULT_CATALOG, CatalogFailure, load_catalog, resource_state,
                                filter_resources, catalog_summary, opportunity_state)

ROOT = Path(__file__).resolve().parents[1]
EVENTS = json.loads((ROOT/"tests/fixtures/mvp04_opportunities.json").read_bytes())
CLOCK = datetime.fromisoformat(EVENTS["reference_clock"].replace("Z", "+00:00"))


@pytest.fixture
def catalog():
    return load_catalog()


def test_real_resource_counts_are_separate_from_entries_projects_and_events(catalog):
    assert catalog_summary(catalog, CLOCK) == {"verified_official_resources": 15, "project_exercises": 2,
        "pending_resources": 6, "verified_mappings": 4, "pending_mappings": 1, "opportunities": 0}
    assert len(catalog["resources"]) == 23
    assert all(r["offered_status"] == "UNKNOWN" and r["offered_term"] is None for r in catalog["resources"] if r["resource_type"] == "COURSE")
    assert all(r["verified_by"] == "AGENT" for r in catalog["resources"] if r["resource_type"] == "COURSE")
    assert catalog["manifest"]["human_review_status"] == "NOT_PERFORMED"
    assert not catalog["manifest"]["action_generation_enabled"]


@pytest.mark.parametrize("skill,ids", [("sql", {"CSCC43H3", "PROJECT-SQL"}), ("python", {"CSCA08H3", "PROJECT-PYTHON"})])
def test_only_evidenced_skill_relationships_pass_filter(catalog, skill, ids):
    assert {r["resource_id"] for r in filter_resources(catalog, skill=skill, now=CLOCK)} == ids
    assert "CSCB20H3" not in {r["resource_id"] for r in filter_resources(catalog, skill=skill, include_pending=True, now=CLOCK)}


def test_filters_type_level_pending_and_empty(catalog):
    assert len(filter_resources(catalog, resource_type="COURSE", now=CLOCK)) == 15
    assert len(filter_resources(catalog, resource_type="PROJECT_EXERCISE", now=CLOCK)) == 2
    assert len(filter_resources(catalog, resource_type="OFFICIAL_ENTRY", now=CLOCK)) == 0
    assert len(filter_resources(catalog, resource_type="OFFICIAL_ENTRY", include_pending=True, now=CLOCK)) == 6
    assert filter_resources(catalog, skill="sql", level="BEGINNER", resource_type="COURSE", now=CLOCK) == []
    assert len(filter_resources(catalog, resource_type="COURSE", level="BEGINNER", now=CLOCK)) == 4


def test_summaries_filters_never_mutate_data_and_do_not_duplicate_multi_skill_resources(catalog):
    original = deepcopy(catalog)
    catalog_summary(catalog, CLOCK)
    filter_resources(catalog, skill="sql", now=CLOCK)
    assert catalog == original
    extra = deepcopy(catalog["mappings"][0]); extra["skill_id"] = "sql"
    catalog["mappings"].append(extra)
    assert catalog_summary(catalog, CLOCK)["verified_official_resources"] == 15


@pytest.mark.parametrize("filters", [{"skill": "r"}, {"resource_type": "FAKE"}, {"level": "SENIOR"}])
def test_invalid_filter_rejected(catalog, filters):
    with pytest.raises(ValueError): filter_resources(catalog, **filters)


def test_recheck_is_calendar_date_with_ninety_day_cap(catalog):
    r = deepcopy(catalog["resources"][0])
    r.update(verified_at="2026-01-01T05:01:00Z", recheck_due_at="2026-04-30")
    assert resource_state(r, datetime.fromisoformat("2026-04-01T23:00:00-04:00")) == "AGENT_VERIFIED"
    assert resource_state(r, datetime.fromisoformat("2026-04-02T00:00:00-04:00")) == "NEEDS_RECHECK"


def test_stale_sources_remove_skill_matches_without_hiding_offline_existence(catalog):
    future = CLOCK+timedelta(days=91)
    summary = catalog_summary(catalog, future)
    assert summary["verified_official_resources"] == summary["verified_mappings"] == 0
    assert len(filter_resources(catalog, include_pending=True, now=future)) == 23
    assert filter_resources(catalog, skill="sql", include_pending=True, now=future) == []


def reseal(folder):
    m = json.loads((folder/"manifest.json").read_bytes()); m.pop("catalog_id")
    for name in m["files"]:
        content = (folder/name).read_bytes()
        m["files"][name] = {"bytes": len(content), "sha256": hashlib.sha256(content).hexdigest()}
    m["catalog_id"] = "resource-catalog-"+digest(m)[:24]
    (folder/"manifest.json").write_bytes(canonical(m)+b"\n")


def test_corrupt_file_is_rejected_without_overwriting(tmp_path):
    folder = tmp_path/"catalog"; shutil.copytree(DEFAULT_CATALOG, folder)
    target = folder/"resources.json"; target.write_bytes(target.read_bytes()+b" ")
    before = target.read_bytes()
    with pytest.raises(CatalogFailure): load_catalog(folder)
    assert target.read_bytes() == before


def test_changed_source_does_not_silently_reapprove_old_mapping(tmp_path):
    folder = tmp_path/"catalog"; shutil.copytree(DEFAULT_CATALOG, folder)
    sources = json.loads((folder/"sources.json").read_bytes())
    source = next(s for s in sources if s["source_id"] == "source-cscc43h3")
    source["evidence_summary"] = "Changed content needs another check."
    source.pop("content_hash"); source["content_hash"] = digest(source)
    (folder/"sources.json").write_bytes(canonical(sources)+b"\n"); reseal(folder)
    with pytest.raises(CatalogFailure): load_catalog(folder)


def test_unsupported_skill_cannot_be_injected_into_mapping(tmp_path):
    folder = tmp_path/"catalog"; shutil.copytree(DEFAULT_CATALOG, folder)
    mappings = json.loads((folder/"mappings.json").read_bytes())
    mappings[0]["skill_id"] = "invented_skill"
    mappings[0].pop("content_hash"); mappings[0]["content_hash"] = digest(mappings[0])
    (folder/"mappings.json").write_bytes(canonical(mappings)+b"\n"); reseal(folder)
    with pytest.raises(CatalogFailure): load_catalog(folder)


@pytest.mark.parametrize("case", EVENTS["cases"], ids=lambda c: c["name"])
def test_opportunity_independent_expected_states_and_no_registration_action(case):
    item = {**EVENTS["base"], **case["changes"]}
    status = opportunity_state(item, CLOCK)
    assert status["time_status"] == case["expected"]
    assert status["registration_status"] == item["registration_status"]
    assert not status["registration_action_available"]


def test_seven_day_review_boundary_and_missing_review_are_independent_of_dates():
    r = {**EVENTS["base"], "verified_at": "2026-10-14T12:00:00Z"}
    assert opportunity_state(r, CLOCK)["review_status"] == "AGENT_VERIFIED"
    r["verified_at"] = "2026-10-13T12:00:00Z"
    assert opportunity_state(r, CLOCK)["review_status"] == "NEEDS_RECHECK"
    r["verified_at"] = None
    assert opportunity_state(r, CLOCK)["time_status"] == "UPCOMING"
    assert opportunity_state(r, CLOCK)["review_status"] == "NEEDS_RECHECK"


def test_toronto_calendar_date_changes_at_local_midnight_not_utc_midnight():
    event = {**EVENTS["base"], "start_at": "2026-10-20", "end_at": "2026-10-20", "deadline_at": None}
    assert opportunity_state(event, datetime.fromisoformat("2026-10-21T03:59:00+00:00"))["time_status"] == "TIME_UNCONFIRMED"
    assert opportunity_state(event, datetime.fromisoformat("2026-10-21T04:00:00+00:00"))["time_status"] == "EXPIRED"
