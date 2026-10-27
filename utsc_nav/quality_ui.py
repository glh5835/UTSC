"""Read-only diagnostic views; no market explorer, review editor, or publication."""

import pandas as pd
import streamlit as st
from .i18n import translate as tr, translated_options, translated_labels, translated_frame, translated_figure


def quality_view(receipt):
    if not receipt:
        st.info(tr("Build an analysis snapshot to inspect admission decisions and source evidence."))
        return
    payload = receipt["payload"]
    quality, stats = payload["quality"], payload["statistics"]
    st.subheader(tr("Read-only quality report"))
    st.caption(tr("Rule-based results on artificial inputs. No human classification review has been performed."))
    columns = st.columns(4)
    for column, name, value in zip(columns, ("Candidates C", "Formal F", "Pending Q", "Excluded E"), (quality["C"], quality["F"], quality["Q"], quality["E"])):
        column.metric(tr(name), value)
    columns = st.columns(3)
    for column, name, value in zip(columns, ("Analyzable descriptions D", "Insufficient descriptions", "Isolated input rows"), (stats["analyzable_descriptions"], stats["description_insufficient"], quality["isolated_input_rows"])):
        column.metric(tr(name), value)
    st.write(tr(f"Input rows: {quality['input_rows']} · Repeated / superseded observations: {quality['duplicate_observations']}"))
    st.caption(tr("C = F + Q + E. Rows without an identifiable ID are isolated before C; repeated observations are counted separately."))
    if stats["exploratory"]:
        st.info(tr(f"Exploratory sample · F={stats['formal_jobs']}, D={stats['analyzable_descriptions']}; either value is below 20."))
    st.write(tr("Human review: NOT PERFORMED · Role agreement: unavailable · Stage agreement: unavailable"))
    rows = []
    for item in payload["jobs"]:
        label = item["classification"]
        rows.append({"Job ID": item["job_id"], "Disposition": label["disposition"], "Proposed role": label["role_proposed"],
                     "Proposed stage": label["stage_proposed"], "Effective role": label["role_effective"], "Effective stage": label["stage_effective"],
                     "Review": label["review_status"], "Primary reason": label["primary_reason"],
                     "All reasons": ", ".join(label["reason_codes"]), "Body characters": item["description_characters"],
                     "Usable body": item["description_usable"], "Age at collection (days)": item["age_days_at_collection"],
                     "Source observations": len(item["source_occurrences"])})
    if rows:
        st.dataframe(translated_frame(pd.DataFrame(rows)), hide_index=True, width="stretch")
        identifier = st.selectbox(tr("Inspect job evidence"), [item["job_id"] for item in payload["jobs"]], key="quality_job_"+receipt["manifest"]["analysis_snapshot_id"], format_func=translated_options())
        item = next(item for item in payload["jobs"] if item["job_id"] == identifier)
        st.write(tr("Decision:"), item["classification"]["disposition"], tr("·"), item["classification"]["primary_reason"])
        st.write(tr("Description status:"), item["description_reason"] or "USABLE")
        st.write(tr("Content SHA-256:"))
        st.code(item["classification"]["content_hash"], language=None)
        with st.expander(tr("Classification evidence"), expanded=True):
            if item["classification"]["evidence"]:
                st.dataframe(translated_frame(pd.DataFrame(item["classification"]["evidence"])), hide_index=True, width="stretch")
            else:
                st.write(tr("No unambiguous title evidence was found; the record has not been assumed to fit a role or stage."))
        with st.expander(tr("All source positions and observation decisions")):
            st.json(item["observations"])
        with st.expander(tr("Original and cleaned description")):
            st.write(tr("Original:"))
            st.text(item["job"]["description_raw"] or tr("Missing"))
            st.write(tr("Cleaned:"))
            st.text(item["job"]["description_clean"] or tr("Missing"))
    else:
        st.info(tr("No identifiable candidate records. Admission and skill-rate results are unavailable."))
    with st.expander(tr("Isolated input rows and primary-reason totals")):
        st.json({"isolated_inputs": quality["isolated_inputs"], "primary_reasons": quality["primary_reasons"], "description_warnings": quality["description_warnings"]})
    st.caption(tr("This student view is read-only. Local reviews preserve original extraction values; this page uses the loaded complete version."))


def skill_view(receipt):
    if not receipt:
        st.info(tr("Build an analysis snapshot to audit skill counts and their denominator."))
        return
    payload = receipt["payload"]
    stats = payload["statistics"]
    st.subheader(tr("Skill-count audit"))
    st.write(tr(f"Denominator D = {stats['analyzable_descriptions']} usable descriptions among F = {stats['formal_jobs']} formal jobs."))
    st.caption(tr("Same-job repeats and aliases count once. These are description mentions in the selected synthetic snapshot, not required skills or market estimates."))
    rows = [{"Skill": skill["display_name"], "Skill ID": skill["skill_id"], "Mentioned jobs M": skill["count"],
             "Denominator D": skill["denominator"], "Mention rate": f"{100*skill['rate']:.1f}%" if skill["rate"] is not None else "N/A"} for skill in stats["skills"]]
    st.dataframe(translated_frame(pd.DataFrame(rows)), hide_index=True, width="stretch")
    for skill in stats["skills"]:
        rate = f"{100*skill['rate']:.1f}%" if skill["rate"] is not None else "N/A"
        st.caption(tr(f"{skill['display_name']}: {skill['count']}/{skill['denominator']} ({rate})"))
    if stats["analyzable_descriptions"] == 0:
        st.info(tr("No analyzable descriptions. Rates are unavailable, rather than 0%."))
    identifiers = [item["job_id"] for item in payload["jobs"]]
    if identifiers:
        selected = st.selectbox(tr("Inspect skill evidence"), identifiers, key="skill_job_"+receipt["manifest"]["analysis_snapshot_id"], format_func=translated_options())
        evidence = []
        for mention in payload["skill_mentions"]:
            if mention["job_id"] == selected:
                for match in mention["matches"]:
                    evidence.append({"Skill ID": mention["skill_id"], **match, "Dictionary": mention["dictionary_version"], "Matcher": mention["matcher_version"]})
        if evidence:
            st.dataframe(translated_frame(pd.DataFrame(evidence)), hide_index=True, width="stretch")
        else:
            st.write(tr("No counted skill evidence for this record. Check its admission and description status in Quality report."))
    st.caption(tr("Offsets use Unicode character positions in the cleaned description, from zero with an exclusive end."))
