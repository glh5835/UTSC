"""Offline browsing of public resource summaries and independently labelled exercises."""

from datetime import datetime, timezone
import pandas as pd
import streamlit as st
from .i18n import translate as tr, translated_options, translated_labels, translated_frame, translated_figure

from .analysis import digest
from .resources import (CatalogFailure, load_catalog, catalog_summary, filter_resources,
                        resource_state, verified_mappings, opportunity_state, LEVELS, TYPES)

TYPE_NAMES = {"COURSE": "Course", "PRACTICE_PROGRAM": "Practice program", "OFFICIAL_ENTRY": "Official entry", "PROJECT_EXERCISE": "Project exercise"}
LEVEL_NAMES = {"BEGINNER": "Beginner", "INTERMEDIATE": "Intermediate", "ADVANCED": "Advanced", "UNKNOWN": "Unknown"}


def opportunities_view(items, now):
    st.subheader(tr("Selected opportunities"))
    st.caption(tr("Manually selected only. Dates are evaluated now, independently of the recruitment snapshot. No registration action or eligibility decision is generated here."))
    if not items:
        st.info(tr("No verified selected opportunities are available. No event dates or openings have been invented."))
        st.write(tr("Official place to check: https://www.utsc.utoronto.ca/aacc/"))
        st.caption(tr("This is a navigation link, not a verified open event. External pages require a network connection."))
    for item in items:
        status = opportunity_state(item, now)
        with st.container(border=True):
            st.markdown(tr("#### "+item["name"]))
            if item.get("origin_kind") == "TEST_FIXTURE":
                st.warning(tr("TEST FIXTURE · Invented event for isolated state checks. Not a real opportunity."))
            st.write(tr("Time status: "+status["time_status"]))
            st.write(tr("Review status: "+status["review_status"]+" · Registration: "+status["registration_status"]))
            st.write(tr("Timezone:"), item.get("timezone") or "UNKNOWN", tr("· Date precision:"), item.get("date_precision") or "UNKNOWN")
            for field, label in (("start_at", "Start"), ("end_at", "End"), ("deadline_at", "Deadline")):
                st.write(tr(label+": "+(item.get(field) or "UNKNOWN")))
            st.write(tr("Source:"), item.get("source_url") or "UNKNOWN")
            st.caption(tr("Dates alone do not confirm registration or personal eligibility. DATE_UNKNOWN, expired or cancelled entries are not current enrolment opportunities."))


def resources_view(directory, *, catalog=None):
    st.header(tr("Courses & practice"))
    st.caption(tr("Public resource summaries and independent local exercises. This catalog is separate from recruitment mode and sample filters."))
    try:
        catalog = catalog if catalog is not None else load_catalog(directory)
    except CatalogFailure as error:
        st.error(tr(str(error)))
        return
    now = datetime.now(timezone.utc)
    manifest = catalog["manifest"]
    st.write(tr("Catalog: "+manifest["catalog_id"]))
    st.caption(tr("AGENT / local source checks · Human review NOT PERFORMED · "+(catalog.get("release_id") or "NOT PUBLISHED")))
    st.info(tr("Course existence, current-term offering, open seats and your eligibility are separate. This catalog verifies descriptions and listed conditions; current offerings and personal eligibility remain unknown."))
    summary = catalog_summary(catalog, now)
    cols = st.columns(4)
    for col, label, field in zip(cols, ("Verified official resources", "Project exercises", "Pending entries", "Selected opportunities"),
                                 ("verified_official_resources", "project_exercises", "pending_resources", "opportunities")):
        col.metric(tr(label), summary[field])
    st.caption(tr("The official-resource count includes checked courses/practice programs only. Navigation entries, project exercises and test fixtures do not fill the minimum of 10."))
    cols = st.columns(3)
    skill_value = cols[0].selectbox(tr("Resource skill"), ["ALL", *catalog["skill_names"]], format_func=translated_options(lambda k: catalog["skill_names"].get(k, "All skills")), key="resource_skill")
    type_value = cols[1].selectbox(tr("Resource type"), ["ALL", *TYPES], format_func=translated_options(lambda k: TYPE_NAMES.get(k, "All resource types")), key="resource_type")
    level_value = cols[2].selectbox(tr("Learning level"), ["ALL", *LEVELS], format_func=translated_options(lambda k: LEVEL_NAMES.get(k, "All levels")), key="resource_level")
    include_pending = st.checkbox(tr("Show entries awaiting verification"), key="resource_pending")
    st.caption(tr("Learning levels are project browsing labels, not official enrolment stages. Only checked skill relationships match the skill filter; pending mappings do not."))
    filters = {"skill": None if skill_value == "ALL" else skill_value, "resource_type": None if type_value == "ALL" else type_value,
               "level": None if level_value == "ALL" else level_value, "include_pending": include_pending}
    rows = filter_resources(catalog, now=now, **filters)
    st.write(tr(f"Matching resources: {len(rows)}"))
    mappings = verified_mappings(catalog, now)
    if rows:
        st.dataframe(translated_frame(pd.DataFrame([{"ID": r["resource_id"], "Resource": r["name"], "Type": TYPE_NAMES[r["resource_type"]],
                                  "Origin": r["origin_kind"], "Level": LEVEL_NAMES[r["entry_level"]], "Review": resource_state(r, now)} for r in rows])), hide_index=True, width="stretch")
        key = digest({"catalog": manifest["catalog_id"], **filters})
        selected = st.selectbox(tr("Inspect resource"), [r["resource_id"] for r in rows], key="resource_detail_"+key, format_func=translated_options())
        r = next(r for r in rows if r["resource_id"] == selected)
        with st.container(border=True):
            st.subheader(tr(r["name"]))
            st.write(r["description"])
            st.write(tr("Origin: "+r["origin_kind"]+" · "+resource_state(r, now)))
            if r["origin_kind"] == "PROJECT_DESIGNED":
                st.warning(tr("PROJECT DESIGNED · Independent local exercise. Not an official UTSC course, event or credit."))
            if resource_state(r, now) == "NEEDS_RECHECK":
                st.warning(tr("Needs verification. This entry is not counted as a verified resource or an open opportunity."))
            st.write(tr("Catalog exists:"), "UNKNOWN" if r["catalog_exists"] is None else "Yes" if r["catalog_exists"] else "Not a university catalog entry")
            st.write(tr("Current-term offering: "+r["offered_status"]+" · Term: "+(r["offered_term"] or "UNKNOWN")))
            st.write(tr("Availability: "+r["availability_status"]+" · Personal eligibility: UNKNOWN"))
            st.write(tr("Audience and conditions: "+r["eligibility_conditions"]))
            st.write(tr("Prerequisites: "+(r["prerequisites_text"] or "UNKNOWN")))
            st.write(tr("Exclusions / sequencing: "+(r["exclusions_text"] or "Not established; check the source.")))
            st.caption(tr("Checked: "+(r.get("verified_at") or r.get("checked_at") or "UNKNOWN")+" · Recheck due (America/Toronto): "+(r["recheck_due_at"] or "UNKNOWN")))
            st.write(tr("Original URL:"))
            st.code(r["source_url"] or "Project-authored local material; no external source URL", language=None, wrap_lines=True)
            with st.expander(tr("Source and skill evidence"), expanded=True):
                for reference in r["source_evidence"]:
                    source = next((s for s in catalog["sources"] if s["source_id"] == reference), None)
                    if source:
                        st.write(tr("Access: "+source["access_status"]+" · Method: "+source["method"]+" · Reviewer: "+source["checked_by"]))
                        st.write(source["evidence_summary"])
                        st.caption(tr(source["scope"]))
                linked = [m for m in mappings if m["resource_id"] == selected]
                if not linked:
                    st.write(tr("No verified mapping to the current SQL/Python dictionary. Other course value is not ruled out."))
                for m in linked:
                    st.write(tr(catalog["skill_names"][m["skill_id"]]+" · "+m["relation"]+" · "+m["review_status"]))
                    st.write(m["evidence_text"])
                proposed = [m for m in catalog["mappings"] if m["resource_id"] == selected and m not in mappings]
                for m in proposed:
                    st.warning(tr("Unverified / stale mapping: "+m["skill_id"]))
                    st.write(m["evidence_text"])
            if r.get("exercise_path"):
                st.markdown(tr(catalog["exercise_texts"][r["exercise_path"]]))
                with st.expander(tr("Invented exercise input")):
                    st.code(catalog["exercise_inputs"]["exercises/sample.csv"], language="csv")
    else:
        st.info(tr("No resources match these filters. Broaden the skill, type or learning level. Pending entries never satisfy a verified skill filter."))
    opportunities_view(catalog["opportunities"], now)
    with st.expander(tr("Coverage and verification limits")):
        saved_courses = sum(r["resource_type"] == "COURSE" and r["review_status"] == "AGENT_VERIFIED" for r in catalog["resources"])
        st.write(tr(f"Saved checked course descriptions: {saved_courses}. Currently checked skill mappings: {summary['verified_mappings']}. Recheck dates affect current validity."))
        st.write(tr("These shared foundations can be explored for Data Analyst, Business Analyst, BI, Data Scientist and Data Engineer. That context is project-authored, not a university-endorsed career path or a personalized recommendation."))
        st.write(tr("Program Pathways and practice entries remain pending after public-page access failures. No current-term timetable, seat availability, protected system or individual eligibility was checked."))
        st.write(tr("Official courses without SQL/Python evidence remain visible under All skills. They are not forced into the two-skill dictionary."))
