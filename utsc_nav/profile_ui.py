"""Session-only profile and read/verify/exercise actions. No personal-text output logs."""

from datetime import datetime, timezone
import pandas as pd
import streamlit as st
from .i18n import translate as tr, translated_options, translated_labels, translated_frame, translated_figure
from .i18n import translated_markdown_download

from .market import ROLE_NAMES, STAGE_NAMES, AREA_NAMES, rate_text
from .next_steps import generate_next_steps, generation_key
from .profile_session import ensure_profile, sync_widget, clear_profile, hydrate_profile_widgets, set_profile_value
from .resources import CatalogFailure, load_catalog
from .exports import action_markdown, ExportFailure

EXPERIENCE_NAMES = {"NOT_PROVIDED": "Not provided (unknown)", "STUDIED": "Studied (self-report)", "PRACTICED": "Practised (self-report)"}


def _sync(path, key, stage=False):
    sync_widget(st.session_state, path, key, stage)


def profile_view(receipt, directory, *, area, mode, entering=False, catalog=None):
    st.header(tr("My skills & next steps"))
    st.caption(tr("Optional self-report, kept only in this browser session. Missing information means unknown; courses and free text do not establish skills."))
    ensure_profile(st.session_state)
    set_profile_value(st.session_state, ("market_area",), area)
    if entering:
        hydrate_profile_widgets(st.session_state)
    st.button(tr("Clear this profile and results"), on_click=clear_profile, args=(st.session_state,))
    try:
        catalog = catalog if catalog is not None else load_catalog(directory)
    except CatalogFailure as error:
        st.session_state.pop("next_steps_result", None)
        st.error(tr(str(error)))
        st.warning(tr("Resource verification is unavailable. Previous actions cannot be shown as current; you can still clear the profile."))
        return
    profile = st.session_state["profile"]
    epoch = st.session_state["profile_widget_epoch"]
    def key(path, value):
        k = "pf_"+str(epoch)+"_"+"_".join(path)
        if k not in st.session_state: st.session_state[k] = value
        return k
    cols = st.columns(2)
    k = key(("target_role",), profile["target_role"])
    cols[0].selectbox(tr("Target role"), list(ROLE_NAMES), format_func=translated_options(ROLE_NAMES.get), key=k, on_change=_sync, args=(("target_role",), k))
    k = key(("target_stage",), profile["target_stage"] or "ALL")
    cols[1].selectbox(tr("Target career stage"), ["ALL", *[s for s in STAGE_NAMES if s]], format_func=translated_options(lambda s: STAGE_NAMES.get(s, "All stages")), key=k,
                      on_change=_sync, args=(("target_stage",), k, True))
    st.write(tr("Shared area: "+AREA_NAMES[area]))
    st.subheader(tr("Your skill choices"))
    for skill, name in sorted(catalog["skill_names"].items()):
        cols = st.columns(2)
        path = ("skill_states", skill, "experience_state")
        k = key(path, profile["skill_states"][skill]["experience_state"])
        cols[0].selectbox(tr(name+" self-report"), list(EXPERIENCE_NAMES), format_func=translated_options(EXPERIENCE_NAMES.get), key=k, on_change=_sync, args=(path, k))
        path = ("skill_states", skill, "wants_practice")
        k = key(path, bool(profile["skill_states"][skill]["wants_practice"]))
        cols[1].checkbox(tr("I want to practise "+name), key=k, on_change=_sync, args=(path, k))
    for field, label in (("courses_text", "Courses studied (optional)"), ("experience_text", "Projects or volunteering (optional)")):
        k = key((field,), profile[field])
        st.text_area(tr(label), max_chars=4000, key=k, on_change=_sync, args=((field,), k))
    st.caption(tr("Optional text is context only. It is never parsed into skills, copied into action reasons or saved to public files. Studying a course does not confirm mastery."))
    st.button(tr("Refresh resource status"))
    now = datetime.now(timezone.utc)
    profile = st.session_state["profile"]
    current_key = generation_key(profile, receipt, catalog, area=area, mode=mode, now=now)
    if st.button(tr("Generate next steps"), type="primary"):
        st.session_state["next_steps_result"] = generate_next_steps(profile, receipt, catalog, area=area, mode=mode, now=now)
        st.session_state["next_steps_dirty"] = False
    result = st.session_state.get("next_steps_result")
    if not result:
        st.info(tr("No result generated. You may leave every self-report field blank and choose Generate next steps."))
        return
    if result["key"] != current_key:
        st.session_state["next_steps_dirty"] = True
    if st.session_state.get("next_steps_dirty"):
        st.warning(tr("Results need updating. Your inputs, data or resource status changed. Generate next steps again; previous actions are hidden."))
        return
    st.subheader(tr("Self-report and sample mentions"))
    rows = []
    for item in result["comparison"]:
        sample = item["sample"]
        rows.append({"Skill": item["display_name"], "Your self-report": EXPERIENCE_NAMES[item["experience_state"]],
                     "Want practice": "Yes" if item["wants_practice"] is True else "No selection",
                     "Sample mentions M/D": f"{sample['count']}/{sample['denominator']}" if sample else "Unavailable",
                     "Sample mention rate": rate_text(sample["rate"]) if sample else "N/A"})
    st.table(translated_frame(pd.DataFrame(rows)))
    stats = result["statistics"]
    if stats:
        st.write(tr(f"Target sample: F={stats['formal_jobs']}, D={stats['analyzable_descriptions']}. Mode: {mode}."))
        if stats["exploratory"]: st.info(tr("Exploratory sample: F or D is below 20. Mentions describe this fixed sample, not required skills or your ability."))
    else: st.info(tr("No analysis snapshot loaded. Sample mentions are unavailable."))
    if result["stats_basis"] == "GENERAL_EXPLORATION":
        st.warning(tr("GENERAL EXPLORATION · No usable target sample. These are checked learning resources only; no market gap has been calculated."))
    st.subheader(tr("Possible skills to explore"))
    st.write(tr(", ".join(catalog["skill_names"][s] for s in result["candidate_skills"]) or "None selected for additional exploration."))
    st.caption(tr("Explicit practice choices take priority. Otherwise sample mentions guide exploration among skills without a self-report of practice. Unknown never means unable."))
    st.subheader(tr("Next steps"))
    st.write(tr(f"Actions: {len(result['actions'])} / 3 maximum"))
    st.caption(tr("Deterministic read/verify and optional local practice. Content checks do not establish HUMAN approval or enrolment eligibility."))
    for i, action in enumerate(result["actions"], 1):
        with st.container(border=True):
            st.markdown(tr(f"#### {i}. {action['name']}"))
            st.write(tr("Resource ID: "+action["resource_id"]+" · "+action["action_type"]))
            st.write(tr("Reason: "+action["reason"]))
            st.write(tr("First step: "+action["first_step"]))
            st.write(tr("Expected output: "+action["expected_output"]))
            st.write(tr("Eligibility: "+action["eligibility_status"]+" · Offering: "+action["conditions"]["offered_status"]))
            st.write(tr("Conditions: "+(action["conditions"]["prerequisites"] or "UNKNOWN")))
            st.write(action["conditions"]["eligibility"])
            if action["conditions"]["exclusions"]: st.write(tr("Exclusions: "+action["conditions"]["exclusions"]))
            st.write(tr("Source:"))
            st.code(action["source_refs"]["url"] or "Local PROJECT DESIGNED material: "+", ".join(action["source_refs"]["evidence"]), language=None, wrap_lines=True)
            st.caption(tr("Origin: "+action["origin_kind"]+" · "+action["review_status"]+" · "+action["stats_basis"]))
    if not result["actions"]:
        st.info(tr(result["no_actions_reason"]))
        st.write(tr("Open Courses & practice to read sources and verification limits. No substitute resources or extra actions have been invented."))
    st.caption(tr("Analysis: "+(result["analysis_snapshot_id"] or "Unavailable")+" · Catalog: "+result["catalog_id"]+" · "+(result.get("release_id") or "NOT PUBLISHED")))
    if receipt and receipt.get("release_id"):
        try:
            content = action_markdown(profile, receipt, catalog, result, area=area, mode=mode,
                                      dirty=st.session_state.get("next_steps_dirty", False), now=now)
            st.caption(tr("This personal download includes your optional self-report text. It is created in memory only when current results are available."))
            st.download_button(tr("Download actions Markdown"), translated_markdown_download(content), file_name="utsc-next-steps.md", mime="text/markdown", on_click="rerun")
        except ExportFailure as error:
            st.warning(tr(str(error)))
