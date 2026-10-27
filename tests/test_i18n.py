"""Bilingual presentation must preserve canonical inputs, sources and personal text."""
from copy import deepcopy
from string import Formatter

import pandas as pd
import plotly.graph_objects as go
import pytest

from utsc_nav import i18n


@pytest.fixture(autouse=True)
def chinese(monkeypatch):
    monkeypatch.setattr(i18n, "language", lambda: "zh")


def test_every_template_preserves_its_placeholders():
    fields = lambda value: {field for _, field, _, _ in Formatter().parse(value) if field is not None}
    for source, target in i18n.CATALOG["templates"].items():
        assert fields(source) == fields(target), source


def test_dynamic_warning_translates_without_changing_numbers():
    message = "Exploratory · Current sample: F=10, D=8. At least one is below 20; this sample cannot support market-wide conclusions."
    result = i18n.translate(message)
    assert "当前样本" in result and "F=10，D=8" in result and "整体市场结论" in result
    assert i18n.translate(message, lang="en") == message


def test_labels_do_not_change_values_given_to_option_formatters():
    seen = []
    def formatter(value):
        seen.append(value)
        return {"DATA_ANALYST": "Data Analyst"}[value]
    assert i18n.translated_options(formatter)("DATA_ANALYST") == "数据分析师"
    assert seen == ["DATA_ANALYST"]


def test_unknown_ids_urls_and_evidence_are_preserved():
    for value in ("SYN:01", "https://example.com/Market%20overview", "The original employer wrote this.", None, 10, False):
        assert i18n.translate(value) == value


def test_frame_headers_and_categories_translate_on_copy():
    frame = pd.DataFrame([{"Role": "Data Analyst", "Title": "Data Analyst", "Admitted jobs F": 6}])
    original = frame.copy(deep=True)
    result = i18n.translated_frame(frame)
    assert result.loc[0, "职业方向"] == "数据分析师"
    assert result.loc[0, "职位名称（原文）"] == "Data Analyst"
    assert result.loc[0, "纳入岗位数 F"] == 6
    pd.testing.assert_frame_equal(frame, original)


def test_charts_translate_without_mutating_data_or_original():
    chart = go.Figure(go.Bar(y=["Data Analyst"], x=[6], orientation="h", name="Data Analyst"))
    chart.update_xaxes(title="Admitted jobs F")
    original = deepcopy(chart.to_dict())
    translated = i18n.translated_figure(chart)
    assert list(translated.data[0].x) == [6]
    assert list(translated.data[0].y) == ["数据分析师"]
    assert translated.layout.xaxis.title.text == "纳入岗位数 F"
    assert chart.to_dict() == original


def test_personal_markdown_literal_blocks_are_not_translated():
    personal = "Market overview\nCourses & practice\n```embedded```\n中文自述"
    payload = ("# UTSC Career Navigator — next steps\n## User self-report\n````text\n" + personal + "\n````\n## Actions\n").encode("utf-8")
    result = i18n.translated_markdown_download(payload).decode("utf-8")
    assert "## 用户自述" in result and "## 行动建议" in result
    assert personal in result


def test_english_rendering_is_identity(monkeypatch):
    monkeypatch.setattr(i18n, "language", lambda: "en")
    frame = pd.DataFrame({"Role": ["Data Analyst"]})
    assert i18n.translated_frame(frame) is frame
    payload = b"# UTSC Career Navigator -- personal export\n"
    assert i18n.translated_markdown_download(payload) is payload


def test_option_formatter_keeps_its_original_serialization_language(monkeypatch):
    formatter = i18n.translated_options(lambda key: "Data Analyst")
    monkeypatch.setattr(i18n, "language", lambda: "en")
    assert formatter("DATA_ANALYST") == "数据分析师"
    assert i18n.translated_options(lambda key: "Data Analyst")("DATA_ANALYST") == "Data Analyst"


def test_toggle_reseeds_canonical_widget_values_without_touching_results(monkeypatch):
    from types import SimpleNamespace
    state = {"ui_language": "zh", "area": "MONTREAL_METRO", "page": "My skills & next steps",
             "pf_0_target_role": "DATA_ENGINEER", "next_steps_result": {"key": "saved-result"}}
    original_result = state["next_steps_result"]
    query = {}
    monkeypatch.setattr(i18n, "st", SimpleNamespace(session_state=state, query_params=query))
    i18n._toggle_language()
    assert state["ui_language"] == "en" and query["lang"] == "en"
    assert state["area"] == "MONTREAL_METRO" and state["page"] == "My skills & next steps"
    assert state["pf_0_target_role"] == "DATA_ENGINEER"
    assert state["next_steps_result"] is original_result
