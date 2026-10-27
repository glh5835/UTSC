from copy import deepcopy
from pathlib import Path

import pytest

from utsc_nav.analysis import AnalysisFailure
from utsc_nav.market import overview_result, comparison_result, result_key, rate_text, difference_text
from utsc_nav.snapshot_store import read_snapshot

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def receipt():
    return read_snapshot(ROOT/"data/synthetic/analyses/synthetic-analysis-c7459431a5c4655471e84a71")


def compare(receipt, **filters):
    return comparison_result(receipt, left_role="DATA_ANALYST", right_role="BI", **filters)


def test_overview_matches_independent_counts_and_details(receipt):
    r = overview_result(receipt)
    assert (r["statistics"]["formal_jobs"], r["statistics"]["analyzable_descriptions"]) == (10, 8)
    assert {k: v["formal_jobs"] for k, v in r["role_statistics"].items()} == {
        "DATA_ANALYST": 6, "BUSINESS_ANALYST": 0, "BI": 4, "DATA_SCIENTIST": 0, "DATA_ENGINEER": 0}
    assert len(r["jobs"]) == 10
    assert {s["skill_id"]: (s["count"], s["denominator"], s["rate"]) for s in r["statistics"]["skills"]} == {
        "sql": (4, 8, .5), "python": (3, 8, .375)}


def test_selected_role_distribution_reuses_summary(receipt):
    r = overview_result(receipt, role="DATA_ANALYST", stage="ENTRY_LEVEL")
    assert r["role_statistics"]["DATA_ANALYST"] is r["statistics"]
    assert (r["statistics"]["formal_jobs"], r["statistics"]["analyzable_descriptions"]) == (6, 4)
    assert {j["job_id"] for j in r["jobs"]} == {f"SYN:{i:02}" for i in range(1, 7)}


def test_pair_has_independent_denominators_and_unrounded_pp(receipt):
    r = compare(receipt)
    assert (r["left"]["formal_jobs"], r["left"]["analyzable_descriptions"]) == (6, 4)
    assert (r["right"]["formal_jobs"], r["right"]["analyzable_descriptions"]) == (4, 4)
    skills = {s["skill_id"]: s for s in r["skills"]}
    assert skills["python"]["difference_pp"] == 25
    assert skills["sql"]["difference_pp"] == 0
    assert skills["python"]["left"] is r["left"]["skills"][0]
    assert all(s["detected"] == "Both samples" for s in r["skills"])
    reverse = comparison_result(receipt, left_role="BI", right_role="DATA_ANALYST")
    assert reverse["skills"][0]["difference_pp"] == -25


def test_pair_calls_statistics_exactly_once_for_each_side(receipt, monkeypatch):
    from utsc_nav import market
    original, calls = market.statistics, []
    def record(*args, **kwargs):
        calls.append(kwargs)
        return original(*args, **kwargs)
    monkeypatch.setattr(market, "statistics", record)
    compare(receipt, area="ALL_CANADA", stage="ENTRY_LEVEL")
    assert calls == [{"area": "ALL_CANADA", "stage": "ENTRY_LEVEL", "role": "DATA_ANALYST"},
                     {"area": "ALL_CANADA", "stage": "ENTRY_LEVEL", "role": "BI"}]


@pytest.mark.parametrize("filters", [{"area": "MONTREAL_METRO"}, {"area": "OTHER_CANADA"},
                                      {"stage": "INTERNSHIP_COOP"}, {"stage": "NEW_GRADUATE"}])
def test_no_sample_keeps_rates_unavailable(receipt, filters):
    r = compare(receipt, **filters)
    assert r["left_jobs"] == r["right_jobs"] == []
    assert r["left"]["formal_jobs"] == r["right"]["analyzable_descriptions"] == 0
    assert all(s["left"]["rate"] is None and s["difference_pp"] is None for s in r["skills"])
    assert r["left"]["exploratory"] and r["right"]["exploratory"]


def test_one_side_zero_has_no_difference_or_false_absence(receipt):
    r = comparison_result(receipt, left_role="DATA_ANALYST", right_role="DATA_ENGINEER")
    assert r["right"]["formal_jobs"] == 0
    assert all(s["difference_pp"] is None and s["detected"] == "Left sample only" for s in r["skills"])


def test_formal_jobs_with_no_bodies_are_not_zero_percent(receipt):
    receipt = deepcopy(receipt)
    for j in receipt["payload"]["jobs"]:
        j["description_usable"] = False
    r = compare(receipt)
    assert (r["left"]["formal_jobs"], r["left"]["analyzable_descriptions"], r["left"]["description_insufficient"]) == (6, 0, 6)
    assert all(s["left"]["rate"] is None and s["difference_pp"] is None for s in r["skills"])


def test_nonzero_denominator_zero_mentions_and_one_sided_detection(receipt):
    receipt = deepcopy(receipt)
    p = receipt["payload"]
    p["skill_mentions"] = [m for m in p["skill_mentions"] if m["skill_id"] != "python" or m["job_id"] not in {"SYN:07", "SYN:08", "SYN:09", "SYN:10"}]
    r = compare(receipt)
    s = r["skills"][0]
    assert s["right"]["denominator"] == 4 and s["right"]["rate"] == 0
    assert s["difference_pp"] == 50 and s["detected"] == "Left sample only"


def test_same_role_rejected_before_statistics(receipt):
    with pytest.raises(AnalysisFailure, match="SAME_ROLE"):
        comparison_result(receipt, left_role="BI", right_role="BI")


@pytest.mark.parametrize("filters", [{"area": "UNKNOWN"}, {"stage": "SENIOR"}, {"role": "OTHER"}])
def test_invalid_filters_rejected(receipt, filters):
    with pytest.raises(AnalysisFailure, match="INVALID_FILTER"):
        overview_result(receipt, **filters)


def test_keys_include_snapshot_mode_and_every_filter(receipt):
    base = result_key(receipt, area="TORONTO_GTA", stage=None, role=None)
    assert base != result_key(receipt, area="ALL_CANADA", stage=None, role=None)
    assert base != result_key(receipt, area="TORONTO_GTA", stage="ENTRY_LEVEL", role=None)
    assert base != result_key(receipt, area="TORONTO_GTA", stage=None, role="BI")
    changed = deepcopy(receipt)
    changed["manifest"]["analysis_snapshot_id"] += "-different"
    assert base != result_key(changed, area="TORONTO_GTA", stage=None, role=None)
    changed = deepcopy(receipt)
    changed["payload"]["data_mode"] = "HISTORICAL"
    assert base != result_key(changed, area="TORONTO_GTA", stage=None, role=None)
    assert compare(receipt)["key"] != comparison_result(receipt, left_role="BI", right_role="DATA_ANALYST")["key"]


def test_results_do_not_mutate_frozen_input_and_format_null(receipt):
    before = deepcopy(receipt)
    overview_result(receipt)
    compare(receipt)
    assert receipt == before
    assert rate_text(None) == difference_text(None) == "N/A"
    assert rate_text(0) == "0.0%" and difference_text(0) == "+0.0 pp"


@pytest.mark.parametrize("F,D,exploratory", [(19, 19, True), (20, 19, True), (20, 20, False)])
def test_exploratory_threshold_uses_both_counts(receipt, F, D, exploratory):
    p = receipt["payload"]
    template = deepcopy(p["jobs"][0])
    p["jobs"] = []
    p["skill_mentions"] = []
    for i in range(F):
        item = deepcopy(template)
        item["job_id"] = f"SYN:THRESHOLD-{i}"
        item["description_usable"] = i < D
        p["jobs"].append(item)
    r = overview_result(receipt)
    assert r["statistics"]["exploratory"] is exploratory


def test_pp_is_calculated_before_display_rounding(receipt):
    for item in receipt["payload"]["jobs"]:
        if item["job_id"] == "SYN:04":
            item["description_usable"] = False
    skill = compare(receipt)["skills"][0]
    assert skill["left"]["rate"] == 2/3
    assert skill["difference_pp"] == 100*(2/3-1/4)
    assert skill["difference_pp"] != 66.7-25
