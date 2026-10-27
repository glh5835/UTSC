"""Read-only market and comparison pages. All chart values come from result objects."""

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
from .i18n import translate as tr, translated_options, translated_labels, translated_frame, translated_figure

from .market import ROLE_NAMES, STAGE_NAMES, rate_text, difference_text

COLORS = ["#17695f", "#416c99"]


def plot(figure, key):
    figure.update_layout(template="plotly_white", height=320, margin=dict(l=8, r=12, t=15, b=24),
                         font=dict(color="#153247", size=13), paper_bgcolor="rgba(0,0,0,0)",
                         legend=dict(orientation="h", y=1.15, x=0), bargap=.35)
    st.plotly_chart(translated_figure(figure), width="stretch", config={"displayModeBar": False, "responsive": True}, key=key)


def sample_notice(stats, label="Current sample"):
    F, D = stats["formal_jobs"], stats["analyzable_descriptions"]
    if stats["exploratory"]:
        st.info(tr(f"Exploratory · {label}: F={F}, D={D}. At least one is below 20; this sample cannot support market-wide conclusions."))
    if D == 0:
        st.warning(tr(f"{label}: no analyzable descriptions. Mention rates and dependent differences are N/A."))
    if stats["description_insufficient"]:
        st.caption(tr(f"{stats['description_insufficient']} admitted jobs have missing or insufficient descriptions; they count in F, not in D."))


def metrics(stats, prefix=""):
    columns = st.columns(3)
    for column, label, field in zip(columns, ("Admitted jobs F", "Usable descriptions D", "Insufficient descriptions"),
                                    ("formal_jobs", "analyzable_descriptions", "description_insufficient")):
        column.metric(tr(prefix+label), stats[field])


def job_details(receipt, jobs, scope, key):
    st.subheader(tr("Job samples" if scope == "Overview" else scope+" job samples"))
    if not jobs:
        st.info(tr("No admitted jobs match these filters in this snapshot."))
        return
    rows = []
    for item in jobs:
        j, c = item["job"], item["classification"]
        rows.append({"Job ID": item["job_id"], "Title": j["title"], "Organization": j["employer"],
                     "Area": j["market_area"], "Stage": STAGE_NAMES[c["stage_effective"]],
                     "Posted": j["posted_at"], "Status": c["disposition"], "Usable description": item["description_usable"]})
    st.dataframe(translated_frame(pd.DataFrame(rows)), hide_index=True, width="stretch")
    identifier = st.selectbox(tr("Inspect "+scope.lower()+" job"), [j["job_id"] for j in jobs], key="job_"+key+scope, format_func=translated_options())
    item = next(j for j in jobs if j["job_id"] == identifier)
    j = item["job"]
    with st.expander(tr("Source and dates · "+identifier)):
        st.write(tr("Original source URL:"))
        st.code(j["source_url"] or "Not supplied", language=None, wrap_lines=True)
        st.write(tr("Posted:"), j["posted_at"], tr("· Precision:"), j["posted_precision"], tr("· Timezone:"), j["posted_timezone"])
        st.write(tr("Original collection / fixture time:"), j["collected_at"])
        st.write(tr("Age at collection (days):"), item["age_days_at_collection"])
        st.write(tr("Admission:"), item["classification"]["disposition"], tr("·"), item["classification"]["primary_reason"])
        st.write(tr("Description status:"), item["description_reason"] or "USABLE")
        st.caption(tr("Fixed input dates do not establish that a vacancy is currently open. SYNTHETIC dates and URLs are invented."))
        st.json({"selected_source": item["raw_ref"], "all_source_observations": item["observations"]}, expanded=False)
    with st.expander(tr("Matched skill text · "+identifier)):
        mentions = [m for m in receipt["payload"]["skill_mentions"] if m["job_id"] == identifier]
        if not mentions:
            st.write(tr("No counted skill matches. This can mean no dictionary match or an unusable description; it does not establish absence of a skill."))
        for mention in mentions:
            for match in mention["matches"]:
                st.write(tr(f"{mention['skill_id']} · matched: {match['matched_text']} · [{match['start']}, {match['end']})"))
                st.text(match["snippet"])
            st.caption(tr("Dictionary: "+mention["dictionary_version"]+" · Matcher: "+mention["matcher_version"]))
        st.caption(tr("Positions are zero-based Unicode offsets in the cleaned description, with an exclusive end. Repeats and aliases count once per job."))
    with st.expander(tr("Saved description · "+identifier)):
        st.text(j["description_clean"] or tr("No description supplied."))


def overview_view(receipt, result):
    stats = result["statistics"]
    st.header(tr("Market overview"))
    st.write(tr("Explore description mentions in a fixed sample."))
    metrics(stats)
    sample_notice(stats)
    if stats["formal_jobs"] == 0:
        st.info(tr("No sample for these filters. Reset filters to explore the bundled Toronto examples."))
    st.subheader(tr("Role distribution"))
    groups = result["role_statistics"]
    role_rows = [{"Role": ROLE_NAMES[r], "Admitted jobs F": s["formal_jobs"], "Usable descriptions D": s["analyzable_descriptions"]} for r, s in groups.items()]
    fig = go.Figure(go.Bar(y=[r["Role"] for r in role_rows], x=[r["Admitted jobs F"] for r in role_rows], orientation="h",
                           marker_color=COLORS[0], text=[r["Admitted jobs F"] for r in role_rows], textposition="auto"))
    fig.update_xaxes(title="Admitted jobs F", rangemode="tozero", dtick=1)
    plot(fig, "roles_"+result["key"])
    with st.expander(tr("Role counts table")):
        st.dataframe(translated_frame(pd.DataFrame(role_rows)), hide_index=True, width="stretch")
    st.subheader(tr("Skill mentions"))
    st.caption(tr("M = unique admitted jobs mentioning a skill. D = admitted jobs with usable descriptions. Mentions do not mean required skills."))
    skills = stats["skills"]
    if stats["analyzable_descriptions"]:
        fig = go.Figure(go.Bar(y=[s["display_name"] for s in skills], x=[100*s["rate"] for s in skills], orientation="h", marker_color=COLORS[0],
                               text=[f"{s['count']}/{s['denominator']} · {rate_text(s['rate'])}" for s in skills], textposition="auto"))
        fig.update_xaxes(title="Mention rate (%)", range=[0, 100])
        plot(fig, "skills_"+result["key"])
    else:
        st.info(tr("Skill chart unavailable because D=0."))
    st.dataframe(translated_frame(pd.DataFrame([{"Skill": s["display_name"], "Mentioned jobs M": s["count"], "Denominator D": s["denominator"],
                                "Mention rate": rate_text(s["rate"])} for s in skills])), hide_index=True, width="stretch")
    for s in skills:
        st.caption(tr(f"{s['display_name']}: {s['count']}/{s['denominator']} ({rate_text(s['rate'])})"))
    job_details(receipt, result["jobs"], "Overview", result["key"])


def comparison_view(receipt, result):
    left, right = result["left"], result["right"]
    for stats, label in ((left, "Left"), (right, "Right")):
        st.subheader(tr(label+" · "+ROLE_NAMES[stats["filters"]["role"]]))
        metrics(stats, label+" · ")
        sample_notice(stats, label+" sample")
    st.subheader(tr("Skill comparison"))
    st.caption(tr("Difference = left mention rate − right mention rate, in percentage points. Each side uses its own D. N/A means unavailable."))
    if left["analyzable_descriptions"] or right["analyzable_descriptions"]:
        fig = go.Figure()
        for side, stats, color in (("left", left, COLORS[0]), ("right", right, COLORS[1])):
            if not stats["analyzable_descriptions"]:
                continue
            skills = [s[side] for s in result["skills"]]
            fig.add_bar(name=ROLE_NAMES[stats["filters"]["role"]], y=[s["display_name"] for s in skills],
                        x=[100*s["rate"] for s in skills], orientation="h", marker_color=color,
                        text=[f"{s['count']}/{s['denominator']}" for s in skills], textposition="auto")
        fig.update_layout(barmode="group")
        fig.update_xaxes(title="Mention rate (%)", range=[0, 100])
        plot(fig, "compare_"+result["key"])
    else:
        st.info(tr("Comparison chart unavailable because both denominators are zero."))
    rows = []
    for skill in result["skills"]:
        a, b = skill["left"], skill["right"]
        rows.append({"Skill": skill["display_name"], "Left M": a["count"], "Left D": a["denominator"], "Left rate": rate_text(a["rate"]),
                     "Right M": b["count"], "Right D": b["denominator"], "Right rate": rate_text(b["rate"]),
                     "Left − right": difference_text(skill["difference_pp"]), "Detected in": skill["detected"]})
        st.caption(tr(f"{skill['display_name']}: left {a['count']}/{a['denominator']} ({rate_text(a['rate'])}) · right {b['count']}/{b['denominator']} ({rate_text(b['rate'])}) · difference {difference_text(skill['difference_pp'])}"))
    st.dataframe(translated_frame(pd.DataFrame(rows)), hide_index=True, width="stretch")
    for category in ("Both samples", "Left sample only", "Right sample only", "Neither sample"):
        names = [s["display_name"] for s in result["skills"] if s["detected"] == category]
        st.write(tr(category+": "+(", ".join(names) if names else "None detected")))
    st.caption(tr("Detected on one side means only detected in this sample under these rules. It does not establish a skill unique to a career. Zero denominators provide no evidence of absence."))
    job_details(receipt, result["left_jobs"], "Left", result["key"])
    job_details(receipt, result["right_jobs"], "Right", result["key"])
