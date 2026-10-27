"""Presentation-only bilingual text; canonical data and widget values stay unchanged."""
import json
from pathlib import Path
import re
from string import Formatter

import streamlit as st

CATALOG = json.loads((Path(__file__).with_name("locales") / "zh_CN.json").read_text(encoding="utf-8"))
MESSAGES = CATALOG["messages"]


def _compile(template):
    pieces = []
    for literal, field, _, _ in Formatter().parse(template):
        pieces.append(re.escape(literal))
        if field is not None:
            pieces.append("(?P<" + field + ">.+?)")
    return re.compile("".join(pieces), re.DOTALL)


TEMPLATES = [(_compile(source), target) for source, target in CATALOG["templates"].items()]
PREFIXES = sorted(((k, v) for k, v in MESSAGES.items() if k.endswith(": ")), key=lambda p: -len(p[0]))


def language():
    selected = st.session_state.get("ui_language", st.query_params.get("lang", "zh"))
    return selected if selected in {"zh", "en"} else "zh"


def translate(value, *, lang=None):
    """Translate known UI messages only. Unknown text, IDs and URLs are preserved."""
    lang = lang or language()
    if lang != "zh" or not isinstance(value, str):
        return value
    if value in MESSAGES:
        return MESSAGES[value]
    for pattern, target in TEMPLATES:
        match = pattern.fullmatch(value)
        if match:
            return target.format(**{k: translate(v, lang=lang) for k, v in match.groupdict().items()})
    for source, target in PREFIXES:
        if value.startswith(source):
            return target + translate(value[len(source):], lang=lang)
    if " · " in value:
        return " · ".join(translate(part, lang=lang) for part in value.split(" · "))
    return value


def translated_options(formatter=None):
    # Streamlit retains the formatter to serialize a widget after this run.
    # Bind its language so a later toggle cannot change that old serializer.
    lang = language()
    return lambda value: translate(formatter(value) if formatter else value, lang=lang)


def translated_labels(values):
    return [translate(value) for value in values]


def translated_frame(frame):
    """Translate headers/categories on a copy, preserving source titles and evidence."""
    if language() == "en":
        return frame
    result = frame.copy(deep=True)
    categories = {"Role", "Stage", "Type", "Origin", "Level", "Review", "Status", "Disposition", "Resource", "Proposed role", "Proposed stage",
                  "Effective role", "Effective stage", "Detected in", "Your self-report", "Want practice", "Sample mentions M/D",
                  "Primary reason", "Description status"}
    for column in result.columns:
        if column in categories:
            result[column] = result[column].map(translate)
    return result.rename(columns=translate)


def translated_figure(figure):
    if language() == "en":
        return figure
    import plotly.graph_objects as go
    result = go.Figure(figure)
    for axis in (result.layout.xaxis, result.layout.yaxis):
        if axis.title.text:
            axis.title.text = translate(axis.title.text)
    for trace in result.data:
        if trace.name:
            trace.name = translate(trace.name)
        if trace.y is not None:
            trace.y = [translate(item) for item in trace.y]
    result.update_layout(font=dict(family="Arial, Microsoft YaHei, sans-serif"))
    return result


def _toggle_language():
    previous = language()
    # Selectbox/radio messages contain display strings. Materialize their values
    # using the old serializer, then explicitly seed the new-language widgets.
    # Stable canonical IDs remain the values passed to all application logic.
    keys = {"area", "stage", "overview_role", "selected_mode", "page", "_left_role", "_right_role",
            "resource_skill", "resource_type", "resource_level", "resource_pending"}
    prefixes = ("pf_", "resource_detail_", "job_", "quality_job_", "skill_job_", "maint_", "review_", "reviewer_", "pending_only_", "publication_reason_", "rollback_")
    values = {key: st.session_state[key] for key in list(st.session_state) if key in keys or key.startswith(prefixes)}
    st.session_state["ui_language"] = "en" if previous == "zh" else "zh"
    for key, value in values.items():
        st.session_state[key] = value
    st.query_params["lang"] = st.session_state["ui_language"]


def language_button():
    st.session_state.setdefault("ui_language", language())
    st.button("English" if language() == "zh" else "中文", key="global_language_toggle", on_click=_toggle_language,
              help="Switch the entire interface / 一键切换全站语言", width="stretch")


def translated_markdown_download(payload):
    """Translate report labels outside literal blocks; keep all personal text verbatim."""
    if language() == "en":
        return payload
    lines, fence = [], None
    for line in payload.decode("utf-8").splitlines():
        marker = re.match(r"^(`{3,})", line)
        if marker:
            if fence is None:
                fence = marker.group(1)
            elif line == fence:
                fence = None
            lines.append(line)
        elif fence:
            lines.append(line)
        else:
            heading = re.match(r"^(#{1,6} )(.*)$", line)
            lines.append(heading.group(1) + translate(heading.group(2)) if heading else translate(line))
    return ("\n".join(lines) + "\n").encode("utf-8")
