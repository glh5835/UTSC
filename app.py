"""MVP-07 local demo: complete versions and explicit student reload."""
from pathlib import Path
import os
import streamlit as st
from utsc_nav.i18n import translate as tr, translated_options, translated_labels, translated_frame, translated_figure
from utsc_nav.i18n import language_button
from utsc_nav.market import ROLE_NAMES, AREA_NAMES, STAGE_NAMES, result_key, overview_result, comparison_result
from utsc_nav.market_ui import overview_view, comparison_view
from utsc_nav.resource_ui import resources_view
from utsc_nav.resources import DEFAULT_CATALOG
from utsc_nav.profile_ui import profile_view
from utsc_nav.profile_session import handoff_profile
from utsc_nav.quality_ui import quality_view, skill_view
from utsc_nav.releases import ReleaseFailure, public_state, load_current
from utsc_nav.maintenance_ui import maintenance_view
from utsc_nav.exports import comparison_csv, ExportFailure

PROJECT_ROOT = Path(__file__).resolve().parent
DATA_ROOT = Path(os.environ.get("UTSC_DATA_ROOT", str(PROJECT_ROOT/"data"))).resolve()
RESOURCE_ROOT = Path(os.environ.get("UTSC_RESOURCE_ROOT", str(DEFAULT_CATALOG))).resolve()
STATE_ROOT = Path(os.environ.get("UTSC_STATE_ROOT", str(PROJECT_ROOT/"state/local"))).resolve()
if any(not p.is_relative_to(PROJECT_ROOT) for p in (DATA_ROOT,RESOURCE_ROOT,STATE_ROOT)):
    raise RuntimeError("Local source/state paths must stay within this workspace.")
MAINTENANCE = os.environ.get("UTSC_MAINTENANCE") == "1"

def clear_results():
    if st.session_state.get("next_steps_result"):
        st.session_state["next_steps_dirty"] = True
    for key in ("overview_result", "comparison_result", "statistics", "comparison", "actions", "export_payload"):
        st.session_state.pop(key, None)

def reset_filters():
    st.session_state.update(area="TORONTO_GTA", stage="ALL", overview_role="ALL")
    clear_results()

def remember_role(side):
    st.session_state[side+"_role"] = st.session_state["_"+side+"_role"]
    clear_results()

def reload_version(mode):
    try:
        bundle = load_current(STATE_ROOT, mode)
        st.session_state["student_bundle"] = bundle
        st.session_state.pop("release_error", None)
        clear_results()
    except ReleaseFailure as error:
        st.session_state["release_error"] = str(error)

st.set_page_config(page_title=tr("UTSC Career Navigator · Local"), page_icon="🧭", layout="wide", initial_sidebar_state="expanded")
st.markdown(tr("""
<style>
.stApp { background: #f5f7f8; }
[data-testid="stSidebar"] { background: #eaf0f2; }
.block-container { max-width: 1220px; padding-top: 2.8rem; }
h1, h2, h3 { color: #153247; letter-spacing: -.025em; }
[data-testid="stMetric"] { background: white; border: 1px solid #dce5e8; border-radius: 12px; padding: 18px; }
[data-testid="stMetricLabel"] { color: #506873; }
.eyebrow { color: #17695f; font-size: 12px; font-weight: 700; letter-spacing: .13em; }
.subtitle { color: #506873; font-size: 17px; max-width: 760px; }
@media (max-width: 600px) { .block-container { padding-top: 1rem; } h1 { font-size: 2rem !important; } }
</style>
"""), unsafe_allow_html=True)
with st.sidebar:
    language_button()
    st.markdown(tr("### UTSC Career Navigator"))
    st.caption(tr("LOCAL DEMO · MVP-07"))
    mode = st.radio(tr("Data mode"), ["SYNTHETIC", "HISTORICAL"], key="selected_mode", format_func=translated_options())
    if st.session_state.get("active_mode") != mode:
        clear_results()
        st.session_state.pop("student_bundle", None)
        st.session_state.pop("release_error", None)
        st.session_state["active_mode"] = mode
        reload_version(mode)
    st.button(tr("Reload published version"),on_click=reload_version,args=(mode,),width="stretch")
    st.caption(tr("Explicit reload replaces the entire package. Saved maintenance edits are not student publications."))
    st.divider()
    st.subheader(tr("Sample filters"))
    area = st.selectbox(tr("Area"),list(AREA_NAMES),format_func=translated_options(AREA_NAMES.get),key="area",on_change=clear_results)
    stage_value = st.selectbox(tr("Career stage"),["ALL",*[s for s in STAGE_NAMES if s]],format_func=translated_options(lambda s: STAGE_NAMES.get(s,"All stages")),key="stage",on_change=clear_results)
    role_value = st.selectbox(tr("Overview role"),["ALL",*ROLE_NAMES],format_func=translated_options(lambda r: ROLE_NAMES.get(r,"All roles")),key="overview_role",on_change=clear_results)
    stage = None if stage_value == "ALL" else stage_value
    role = None if role_value == "ALL" else role_value
    st.button(tr("Reset filters"),on_click=reset_filters,width="stretch")
    st.caption(tr("All Canada combines mapped groups in this sample. Coverage is incomplete."))
    if MAINTENANCE: st.warning(tr("Local maintenance enabled · trusted-machine tool, not account security."))

st.markdown(tr('<div class="eyebrow">UTSC CAREER NAVIGATOR / FIXED SAMPLE</div>'),unsafe_allow_html=True)
st.title(tr("Explore career directions"))
st.write(tr("Read saved samples, inspect their sources, and explore checked learning resources."))
st.caption(tr("Interface text follows the selected language. Job descriptions, official course names and source evidence remain in their original language."))
if mode == "SYNTHETIC":
    st.warning(tr("SYNTHETIC · Artificial examples for internal testing. These are not real vacancies or market findings."))
else:
    st.info(tr("HISTORICAL · No real recruitment batch has been supplied. No synthetic fallback is used."))
pages = ["Market overview","Compare directions","My skills & next steps","Courses & practice","Data & quality"]
if MAINTENANCE: pages.append("Local maintenance")
page = st.radio(tr("Page"),pages,horizontal=True,key="page", format_func=translated_options())
entering = page == "My skills & next steps" and st.session_state.get("previous_page") != page
st.session_state["previous_page"] = page
if page == "Local maintenance":
    maintenance_view(STATE_ROOT,mode,DATA_ROOT,RESOURCE_ROOT,PROJECT_ROOT,enabled=MAINTENANCE)
    st.stop()
if st.session_state.get("release_error"): st.error(tr(st.session_state["release_error"]))
bundle = st.session_state.get("student_bundle")
try:
    current = public_state(STATE_ROOT,mode)["current"]
    if current != (bundle["manifest"]["release_id"] if bundle else None):
        st.info(tr("A different published version is available. Select Reload published version to switch all data together. This page still uses the loaded version."))
except ReleaseFailure as error: st.error(tr(str(error)))
if not bundle:
    st.subheader(tr("No published version loaded"))
    st.write(tr("A local maintainer must save validated sources and publish a complete package. Then select Reload published version. No hidden sample or partial catalog is substituted."))
    st.stop()
receipt,catalog,manifest = bundle["receipt"],bundle["catalog"],bundle["manifest"]
st.caption(tr("Loaded release: "+manifest["release_id"]+" · Published at: "+manifest["published_at"]+" · LOCAL ONLY"))
st.caption(tr("Analysis: "+manifest["snapshot_id"]+" · Resources: "+manifest["resource_version"]))
st.caption(tr("Mappings: "+manifest["mapping_version"]+" · Reviews: "+manifest["review_version"]))
dates = receipt["payload"]["input_dates"]
st.caption(tr(f"Saved posting interval: {dates['posted_range']['start']} → {dates['posted_range']['end']} · {dates['posted_range']['precision']}"))
st.caption(tr(f"Original collection / fixture interval: {dates['collected_start']} → {dates['collected_end']}. Not live openings. Human classification review NOT PERFORMED."))
if page == "Courses & practice":
    resources_view(RESOURCE_ROOT,catalog=catalog)
elif page == "My skills & next steps":
    profile_view(receipt,RESOURCE_ROOT,area=area,mode=mode,entering=entering,catalog=catalog)
elif page == "Data & quality":
    st.header(tr("Data & quality"))
    st.caption(tr("Entire loaded release. Sample filters apply to exploration pages."))
    tabs = st.tabs(translated_labels(["Quality report","Skill audit","Release & sources"]))
    with tabs[0]: quality_view(receipt)
    with tabs[1]: skill_view(receipt)
    with tabs[2]: st.json({"release":manifest,"input_dates":dates,"source_batches":receipt["payload"]["source_batches"],"configuration_refs":receipt["payload"]["configuration_refs"],"reviews":bundle["reviews"]})
elif page == "Market overview":
    key = result_key(receipt,area=area,stage=stage,role=role)
    if st.session_state.get("overview_result",{}).get("key") != key:
        st.session_state["overview_result"] = overview_result(receipt,area=area,stage=stage,role=role)
    overview_view(receipt,st.session_state["overview_result"])
else:
    st.header(tr("Compare directions"))
    st.caption(tr("Both roles use this loaded release, area and stage. Each has its own description denominator."))
    cols = st.columns(2)
    for col,side,default in ((cols[0],"left","DATA_ANALYST"),(cols[1],"right","BI")):
        if "_"+side+"_role" not in st.session_state:
            st.session_state["_"+side+"_role"] = st.session_state.get(side+"_role",default)
        col.selectbox(tr(side.title()+" role"),list(ROLE_NAMES),format_func=translated_options(ROLE_NAMES.get),key="_"+side+"_role",on_change=remember_role,args=(side,))
    a,b = st.session_state["_left_role"],st.session_state["_right_role"]
    if a == b:
        st.session_state.pop("comparison_result",None)
        st.warning(tr("Choose two different roles to compare. No comparison or download is shown for identical roles."))
    else:
        key = result_key(receipt,area=area,stage=stage,left_role=a,right_role=b)
        if st.session_state.get("comparison_result",{}).get("key") != key:
            st.session_state["comparison_result"] = comparison_result(receipt,area=area,stage=stage,left_role=a,right_role=b)
        result = st.session_state["comparison_result"]
        comparison_view(receipt,result)
        try:
            content = comparison_csv(receipt,result,left_role=a,right_role=b,area=area,stage=stage)
            st.download_button(tr("Download comparison CSV"),content,file_name="utsc-comparison.csv",mime="text/csv",on_click="rerun")
        except ExportFailure as error: st.warning(tr(str(error)))
        st.subheader(tr("Explore one of these roles"))
        cols = st.columns(2)
        for col,side,selected in ((cols[0],"left",a),(cols[1],"right",b)):
            col.button(tr("Use "+side+" role for my next steps"),on_click=handoff_profile,args=(st.session_state,selected,stage),width="stretch")
st.divider()
st.caption(tr("MVP-07 · Complete local version · Session-only personal context · No real-market conclusion"))
