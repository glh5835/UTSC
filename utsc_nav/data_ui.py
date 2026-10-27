"""Preserved MVP-02 input and read-only quality views."""

import pandas as pd
import streamlit as st
from .quality_ui import quality_view, skill_view


def data_view(loaded, analysis_receipt):
    manifest = loaded.manifest
    details, preview, provenance, quality_tab, skill_tab = st.tabs(["Batch & dates", "Input preview", "Source integrity", "Quality report", "Skill audit"])
    with details:
        st.subheader("Loaded snapshot")
        st.write("Snapshot ID:", manifest["snapshot_id"])
        st.write("Data mode:", manifest["data_mode"])
        st.write("Contract:", manifest["contract_version"])
        st.write("Publication version: Not published")
        st.write("Posting date range:", manifest["posted_range"])
        st.write("Original collection / fixture interval:", manifest["collected_start"], "→", manifest["collected_end"])
        st.write("Time basis:", manifest["time_basis"], "·", manifest["collection_timezone"])
        st.write("Snapshot built at:", manifest["built_at"])
        st.caption("Fixture timestamps describe invented input, not a real collection. Build time is not the posting date or current vacancy status.")
        st.subheader("Usage scope")
        st.json(manifest["usage"], expanded=False)
        if analysis_receipt:
            st.write("Analysis snapshot ID:", analysis_receipt["manifest"]["analysis_snapshot_id"])
            st.write("Analysis built at:", analysis_receipt["manifest"]["built_at"])
            st.write("Derived bundle:", analysis_receipt["directory"])
        else:
            st.info("Admission and skill statistics have not been computed. Select Build analysis snapshot to inspect them.")
        st.caption("Resource verification and human classification review have not been performed.")
    with preview:
        st.subheader("Original input rows")
        st.caption("This tab preserves raw observations and missing values, including repeated IDs. Derived results are shown separately in Quality report and Skill audit.")
        rows = []
        for item in loaded.records:
            record = item["input"]
            rows.append({
                "Line": item["raw_ref"]["line"], "Job ID": record["job_id"], "Title": record["title"],
                "Organization": record["employer"], "City": record["city"], "Posted": record["posted_at"],
                "Collected / fixture time": record["collected_at"],
                "Description": record["description_raw"],
            })
        if rows:
            st.dataframe(pd.DataFrame(rows), hide_index=True, width="stretch")
        else:
            st.info("The verified input file contains no rows. No market statistics are available.")
    with provenance:
        st.subheader("Verified local sources")
        st.write("Manifest SHA-256:")
        st.code(loaded.manifest_sha256, language=None)
        for source in loaded.sources:
            st.write("Batch:", source["batch_id"])
            st.write("File:", source["path"])
            st.write("Provider:", source["provider"])
            st.write("Source reference:", source["source_ref"])
            st.write("Bytes:", source["bytes"])
            st.code(source["sha256"], language=None)
        with st.expander("Inspect the first row's source position"):
            st.json(loaded.records[0]["raw_ref"] if loaded.records else {"state": "No input rows"})
        with st.expander("Input configuration versions"):
            st.json(manifest["versions"])
        if analysis_receipt:
            with st.expander("Processing versions used"):
                st.json(analysis_receipt["payload"]["rule_versions"])

    with quality_tab:
        quality_view(analysis_receipt)
    with skill_tab:
        skill_view(analysis_receipt)
