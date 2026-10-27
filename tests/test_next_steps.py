from copy import deepcopy
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

import pytest

from utsc_nav.next_steps import blank_profile, generate_next_steps, generation_key
from utsc_nav.profile_session import ensure_profile, set_profile_value, clear_profile, handoff_profile, sync_widget, hydrate_profile_widgets
from utsc_nav.resources import load_catalog
from utsc_nav.snapshot_store import read_snapshot

ROOT = Path(__file__).resolve().parents[1]
CLOCK = datetime(2026, 10, 21, 18, tzinfo=timezone.utc)


@pytest.fixture
def inputs():
    return (blank_profile(("python", "sql")), read_snapshot(ROOT/"data/synthetic/analyses/synthetic-analysis-c7459431a5c4655471e84a71"), load_catalog())


def generate(inputs, **kwargs):
    return generate_next_steps(*inputs, now=CLOCK, **kwargs)


def ids(result): return [a["resource_id"] for a in result["actions"]]


def test_blank_new_student_has_three_distinct_exploration_steps_and_unknown_self_report(inputs):
    result = generate(inputs)
    assert ids(result) == ["PROJECT-PYTHON", "CSCA08H3", "PROJECT-SQL"]
    assert result["stats_basis"] == "SAMPLE_EXPLORATION"
    assert (result["statistics"]["formal_jobs"], result["statistics"]["analyzable_descriptions"]) == (6, 4)
    assert all(c["experience_state"] == "NOT_PROVIDED" for c in result["comparison"])
    for a in result["actions"]:
        assert all(a[k] for k in ("reason", "first_step", "expected_output", "conditions", "source_refs"))
        assert a["release_id"] is None


def test_practised_and_wants_practice_is_valid_and_changes_ranking(inputs):
    inputs[0]["skill_states"]["sql"].update(experience_state="PRACTICED", wants_practice=True)
    result = generate(inputs)
    assert ids(result) == ["PROJECT-SQL", "CSCC43H3"]
    assert result["candidate_skills"] == ["sql"]
    assert all("explicitly want to practise SQL" in a["reason"] for a in result["actions"])


def test_course_and_experience_text_do_not_infer_skills_or_leak_into_actions(inputs):
    before = generate(inputs)
    inputs[0].update(courses_text="SYNTHETIC_PRIVATE_CSCC43_Python", experience_text="SYNTHETIC_PRIVATE_professional SQL experience")
    after = generate(inputs)
    assert ids(before) == ids(after)
    assert before["comparison"] == after["comparison"]
    assert "SYNTHETIC_PRIVATE" not in json.dumps(after)
    assert before["key"] != after["key"]


@pytest.mark.parametrize("field", ["courses_text", "experience_text"])
def test_context_limit_failure_contains_no_input_text(inputs, field):
    inputs[0][field] = "SYNTHETIC_PRIVATE"*300
    with pytest.raises(ValueError) as error: generate(inputs)
    assert "SYNTHETIC_PRIVATE" not in str(error.value)


def test_studied_does_not_mark_practised_or_mastered(inputs):
    inputs[0]["skill_states"]["python"]["experience_state"] = "STUDIED"
    r = generate(inputs)
    assert r["comparison"][0]["experience_state"] == "STUDIED"
    assert "python" in r["candidate_skills"]


def test_no_sample_is_general_exploration_with_no_invented_market_gap(inputs):
    inputs[0]["target_role"] = "DATA_ENGINEER"
    r = generate(inputs)
    assert r["statistics"]["formal_jobs"] == 0 and r["stats_basis"] == "GENERAL_EXPLORATION"
    assert ids(r) == ["PROJECT-PYTHON", "CSCA08H3", "PROJECT-SQL"]
    assert all("General exploration" in a["reason"] and a["stats_basis"] == "GENERAL_EXPLORATION" for a in r["actions"])


def test_no_snapshot_and_zero_usable_body_both_preserve_unavailable_rates(inputs):
    p, receipt, catalog = inputs
    result = generate_next_steps(p, None, catalog, now=CLOCK)
    assert result["statistics"] is None and result["stats_basis"] == "GENERAL_EXPLORATION"
    for j in receipt["payload"]["jobs"]: j["description_usable"] = False
    result = generate(inputs)
    assert result["statistics"]["analyzable_descriptions"] == 0
    assert all(c["sample"]["rate"] is None for c in result["comparison"])


def test_no_resource_does_not_fabricate_actions(inputs):
    inputs[2]["mappings"] = []
    r = generate(inputs)
    assert r["actions"] == [] and r["no_actions_reason"].startswith("No checked")


def test_unknown_eligibility_is_read_verify_not_enrolment(inputs):
    inputs[0]["skill_states"]["sql"]["wants_practice"] = True
    r = generate(inputs)
    action = r["actions"][1]
    assert action["resource_id"] == "CSCC43H3" and action["action_type"] == "READ_AND_VERIFY"
    assert action["eligibility_status"] == action["conditions"]["offered_status"] == "UNKNOWN"
    assert "check" in action["first_step"] and "before considering enrolment" in action["first_step"]


@pytest.mark.parametrize("change", ["stale", "pending_mapping", "closed", "ineligible"])
def test_resource_status_changes_remove_action_and_invalidate_key(inputs, change):
    old = generate(inputs)
    resource = next(r for r in inputs[2]["resources"] if r["resource_id"] == "PROJECT-PYTHON")
    if change == "stale": resource["recheck_due_at"] = "2026-10-20"
    if change == "closed": resource["availability_status"] = "CLOSED"
    if change == "ineligible": resource["eligibility_status"] = "INELIGIBLE"
    if change == "pending_mapping":
        next(m for m in inputs[2]["mappings"] if m["resource_id"] == "PROJECT-PYTHON")["review_status"] = "NEEDS_RECHECK"
    new = generate(inputs)
    assert old["key"] != new["key"] and "PROJECT-PYTHON" not in ids(new)
    assert len(new["actions"]) <= 3


def test_all_stale_resources_leave_no_confirmed_actions(inputs):
    result = generate_next_steps(*inputs, now=CLOCK+timedelta(days=91))
    assert not result["actions"]


def test_resource_deduplication_merges_target_skills_and_stable_id_tie_break(inputs):
    catalog = inputs[2]
    extra = deepcopy(next(m for m in catalog["mappings"] if m["resource_id"] == "PROJECT-PYTHON")); extra["skill_id"] = "sql"
    catalog["mappings"].append(extra)
    result = generate(inputs)
    assert len(ids(result)) == len(set(ids(result)))
    assert next(a for a in result["actions"] if a["resource_id"] == "PROJECT-PYTHON")["target_skill_ids"] == ["python", "sql"]
    catalog["resources"].reverse(); catalog["mappings"].reverse()
    assert ids(result) == ids(generate(inputs))


def test_no_additional_choices_when_all_self_report_practised(inputs):
    for v in inputs[0]["skill_states"].values(): v["experience_state"] = "PRACTICED"
    result = generate(inputs)
    assert result["actions"] == [] and not result["candidate_skills"]


def test_zero_mentions_are_not_missing_skill_and_wanted_choice_still_allowed(inputs):
    inputs[1]["payload"]["skill_mentions"] = []
    result = generate(inputs)
    assert result["stats_basis"] == "SAMPLE_EXPLORATION" and result["actions"] == []
    inputs[0]["skill_states"]["sql"]["wants_practice"] = True
    assert ids(generate(inputs)) == ["PROJECT-SQL", "CSCC43H3"]


def test_input_identity_mode_and_area_are_part_of_freshness(inputs):
    p, r, c = inputs; base = generate(inputs)["key"]
    for kwargs in ({"area": "MONTREAL_METRO"}, {"mode": "HISTORICAL"}):
        assert generation_key(p, r, c, now=CLOCK, area=kwargs.get("area", "TORONTO_GTA"), mode=kwargs.get("mode", "SYNTHETIC")) != base
    with pytest.raises(ValueError, match="mode differs"): generate(inputs, mode="HISTORICAL")
    before = deepcopy(inputs); generate(inputs); assert inputs == before


def test_profile_session_retention_handoff_does_not_fill_skills_and_clear_cleans_every_associated_key():
    state = {}; ensure_profile(state)
    set_profile_value(state, ("courses_text",), "SYNTHETIC_PRIVATE_COURSE")
    set_profile_value(state, ("experience_text",), "SYNTHETIC_PRIVATE_EXPERIENCE")
    handoff_profile(state, "BI", "ENTRY_LEVEL")
    assert state["profile"]["target_role"] == "BI" and state["profile"]["courses_text"] == "SYNTHETIC_PRIVATE_COURSE"
    assert all(v["experience_state"] == "NOT_PROVIDED" for v in state["profile"]["skill_states"].values())
    state.update(next_steps_result={"actions": []}, actions=[1], export_payload="SYNTHETIC_PRIVATE", skill_comparison=[1], pf_old="SYNTHETIC_PRIVATE")
    clear_profile(state)
    assert state["profile"] == blank_profile(("python", "sql"))
    assert not {"next_steps_result", "actions", "export_payload", "skill_comparison", "pf_old", "next_steps_dirty"} & state.keys()
    assert "SYNTHETIC_PRIVATE" not in json.dumps(state)


def test_edit_marks_result_dirty_even_when_value_is_changed_back():
    state = {}; ensure_profile(state); state["next_steps_result"] = {"key": "previous"}
    set_profile_value(state, ("target_role",), "BI")
    set_profile_value(state, ("target_role",), "DATA_ANALYST")
    assert state["next_steps_dirty"] and state["profile"]["profile_revision"] == 2


@pytest.mark.parametrize("queued_value", [None, "SYNTHETIC_PRIVATE_QUEUED"])
def test_clear_rejects_queued_callbacks_from_the_previous_widget_epoch(queued_value):
    state = {}; ensure_profile(state)
    clear_profile(state)
    if queued_value is not None: state["pf_0_courses_text"] = queued_value
    sync_widget(state, ("courses_text",), "pf_0_courses_text")
    assert state["profile"]["courses_text"] == "" and state["profile"]["profile_revision"] == 0
    assert "pf_0_courses_text" not in state


def test_reentering_page_restores_controls_from_permanent_session_profile():
    state = {}; ensure_profile(state)
    set_profile_value(state, ("courses_text",), "SYNTHETIC_PRIVATE_CONTEXT")
    state["pf_0_courses_text"] = ""
    hydrate_profile_widgets(state)
    assert state["pf_0_courses_text"] == "SYNTHETIC_PRIVATE_CONTEXT"
    assert state["pf_0_target_stage"] == "ALL"
