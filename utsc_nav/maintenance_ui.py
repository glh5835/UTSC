"""Trusted-machine editing; not an account or authentication boundary."""
import json
from pathlib import Path
import streamlit as st
from .i18n import translate as tr, translated_options, translated_labels, translated_frame, translated_figure
from .analysis import analyze, AnalysisFailure
from .importer import load_snapshot, ImportFailure
from .snapshot_store import save_snapshot
from .releases import (ReleaseFailure, public_state, save_draft, draft_objects,
                       save_review, publish, rollback, FIELDS)


def maintenance_view(root, mode, data_root, resource_root, project_root, *, enabled):
    if not enabled:
        st.error(tr("Local maintenance is disabled. Restart with --maintenance."))
        return
    st.header(tr("Local maintenance"))
    st.warning(tr("Local startup switch only. This is not an account, authentication or security boundary. Use on a trusted machine; server listens on loopback."))
    st.caption(tr("Public source data and review reasons only. Never paste personal profiles or student text into these persistent records."))
    try:
        state = public_state(root, mode)
        st.write(tr("Current published version: "+(state["current"] or "None")))
        st.write(tr(f"Saved draft revision: {state['revision']} · Persistent reviews: {len(state['reviews'])}"))
        with st.expander(tr("Prepare fixed input analysis")):
            manifest = st.text_input(tr("Input manifest"), "inputs/mvp02-v1/manifest.json" if mode == "SYNTHETIC" else "snapshots/manifest.json", key="maint_input_"+mode)
            if st.button(tr("Import and build fixed analysis")):
                try:
                    receipt = save_snapshot(analyze(load_snapshot(data_root, mode, manifest)), data_root)
                    st.session_state["maint_analysis_"+mode] = receipt["directory"]
                    st.success(tr("Analysis saved. Student publications did not change."))
                except (AnalysisFailure, ImportFailure) as error: st.error(tr(str(error)))
        default = str(data_root/mode.lower()/"analyses"/"synthetic-analysis-c7459431a5c4655471e84a71") if mode == "SYNTHETIC" else ""
        analysis_path = st.text_input(tr("Draft analysis directory"), state["draft"]["analysis_directory"] if state["draft"] else default, key="maint_analysis_"+mode)
        catalog_path = st.text_input(tr("Draft catalog directory"), state["draft"]["catalog_directory"] if state["draft"] else str(resource_root), key="maint_catalog_"+mode)
        if st.button(tr("Save draft sources")):
            try:
                if any(not Path(p).resolve().is_relative_to(project_root) for p in (analysis_path,catalog_path)): raise ReleaseFailure("SOURCE_PATH_OUTSIDE_WORKSPACE")
                save_draft(root, mode, analysis_path, catalog_path)
                st.success(tr("Draft sources saved. Student versions did not change."))
                state = public_state(root, mode)
            except ReleaseFailure as error: st.error(tr(str(error)))
        if state["draft"]:
            st.subheader(tr("Review a public object"))
            kind = st.selectbox(tr("Review object type"), list(FIELDS), key="review_kind_"+mode, format_func=translated_options())
            objects = draft_objects(root, mode, kind)
            pending = st.checkbox(tr("Only objects without an approved local review"), key="pending_only_"+mode)
            if pending:
                latest = {r["object_id"]:r for r in state["reviews"] if r["object_type"] == kind and r["status"] != "DRAFT"}
                objects = {k:v for k,v in objects.items() if latest.get(k,{}).get("status") != "APPROVED"}
            if not objects:
                st.info(tr("No objects in this category. No opportunity or mapping has been invented."))
            else:
                identifier = st.selectbox(tr("Review object"), list(objects), key="review_object_"+mode+kind+str(pending), format_func=translated_options())
                obj = objects[identifier]
                previous = next((r for r in reversed(state["reviews"]) if r["object_type"] == kind and r["object_id"] == identifier),None)
                st.caption(tr("Source content SHA-256: "+obj["content_hash"]))
                st.json({"original_source_value":obj["value"],"latest_saved_review":previous})
                key = "review_edit_"+mode+kind+identifier+str(state["revision"])
                value = st.text_area(tr("New public value (JSON)"),json.dumps(previous["new_value"] if previous and previous["base_content_hash"] == obj["content_hash"] else obj["value"],ensure_ascii=False,indent=2),height=210,key=key)
                status = st.selectbox(tr("Saved review decision"),["DRAFT","APPROVED","NEEDS_RECHECK","REJECTED"],key="review_status_"+mode, format_func=translated_options())
                reviewer = st.text_input(tr("Local reviewer label"),"local-maintainer",key="reviewer_"+mode)
                reason = st.text_area(tr("Public review reason"),max_chars=2000,key="review_reason_"+mode)
                st.caption(tr("Method: LOCAL_MAINTENANCE. Not HUMAN agreement measurement or a new official-source verification."))
                if st.button(tr("Save review")):
                    try:
                        record = save_review(root,mode,kind,identifier,json.loads(value),status=status,reason=reason,reviewer_id=reviewer,expected_hash=obj["content_hash"])
                        st.success(tr("Review saved: "+record["review_id"]+". Not published."))
                        state = public_state(root,mode)
                    except (ReleaseFailure,ValueError): st.error(tr("REVIEW_SAVE_FAILED: check fields, reason and source binding. Editor retained; published version unchanged."))
            st.subheader(tr("Publish a complete local version"))
            st.caption(tr("DRAFT reviews do not change effective data. REJECTED / NEEDS_RECHECK withhold the object. Full-package validation is mandatory."))
            reason = st.text_input(tr("Publication / rollback reason"),key="publication_reason_"+mode)
            if st.button(tr("Publish complete version"),type="primary"):
                try:
                    bundle = publish(root,mode,reason=reason)
                    st.success(tr("Complete local version published: "+bundle["manifest"]["release_id"]+". Students must explicitly reload."))
                    state = public_state(root,mode)
                except ReleaseFailure as error: st.error(tr(str(error)))
            targets = list(dict.fromkeys(h["release_id"] for h in reversed(state["history"])))
            if targets:
                target = st.selectbox(tr("Rollback target"),targets,key="rollback_"+mode, format_func=translated_options())
                if st.button(tr("Rollback complete version")):
                    try:
                        rollback(root,mode,target,reason=reason)
                        st.success(tr("Complete version pointer restored. Students must explicitly reload."))
                        state = public_state(root,mode)
                    except ReleaseFailure as error: st.error(tr(str(error)))
        with st.expander(tr("Persistent public reviews and publication history")):
            st.json(state)
    except ReleaseFailure as error: st.error(tr(str(error)))
