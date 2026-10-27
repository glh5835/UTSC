"""Presentation results derived only from one frozen analysis and its statistics."""

from .analysis import AnalysisFailure, ROLES, digest, statistics

ROLE_NAMES = {"DATA_ANALYST": "Data Analyst", "BUSINESS_ANALYST": "Business Analyst",
              "BI": "Business Intelligence", "DATA_SCIENTIST": "Data Scientist", "DATA_ENGINEER": "Data Engineer"}
AREA_NAMES = {"TORONTO_GTA": "Toronto GTA", "MONTREAL_METRO": "Montreal Metro",
              "OTHER_CANADA": "Other Canada", "ALL_CANADA": "All Canada"}
STAGE_NAMES = {None: "All stages", "INTERNSHIP_COOP": "Internship or Co-op",
               "NEW_GRADUATE": "New Graduate", "ENTRY_LEVEL": "Entry Level"}


def result_key(receipt, **filters):
    return digest({"mode": receipt["payload"]["data_mode"], "release": receipt.get("release_id"),
                   "snapshot": receipt["manifest"]["analysis_snapshot_id"], **filters})


def _stats(payload, **filters):
    return statistics(payload["jobs"], payload["skill_mentions"], payload["skills"], **filters)


def _jobs(payload, stats):
    """Mirror the controlled effective filters for details, never calculate UI totals."""
    f = stats["filters"]
    rows = [item for item in payload["jobs"] if item["classification"]["disposition"] == "FORMAL"
            and item["job"]["market_area"] != "UNKNOWN"
            and (not f["role"] or item["classification"]["role_effective"] == f["role"])
            and (not f["stage"] or item["classification"]["stage_effective"] == f["stage"])
            and (f["area"] == "ALL_CANADA" or item["job"]["market_area"] == f["area"])]
    if len(rows) != stats["formal_jobs"] or sum(item["description_usable"] for item in rows) != stats["analyzable_descriptions"]:
        raise AnalysisFailure("DETAILS_INCONSISTENT: source details and statistics differ.")
    return rows


def overview_result(receipt, *, area="TORONTO_GTA", stage=None, role=None):
    p = receipt["payload"]
    summary = _stats(p, area=area, stage=stage, role=role)
    groups = {role: summary} if role else {r: _stats(p, area=area, stage=stage, role=r) for r in ROLES}
    return {"key": result_key(receipt, area=area, stage=stage, role=role),
            "snapshot_id": receipt["manifest"]["analysis_snapshot_id"], "mode": p["data_mode"],
            "statistics": summary, "role_statistics": groups, "jobs": _jobs(p, summary)}


def comparison_result(receipt, *, left_role, right_role, area="TORONTO_GTA", stage=None):
    if left_role == right_role:
        raise AnalysisFailure("SAME_ROLE: Choose two different roles to compare.")
    if left_role not in ROLES or right_role not in ROLES:
        raise AnalysisFailure("INVALID_FILTER: unsupported comparison role.")
    p = receipt["payload"]
    left = _stats(p, area=area, stage=stage, role=left_role)
    right = _stats(p, area=area, stage=stage, role=right_role)
    right_skills = {s["skill_id"]: s for s in right["skills"]}
    rows = []
    for a in left["skills"]:
        b = right_skills[a["skill_id"]]
        detected = "Both samples" if a["count"] and b["count"] else (
            "Left sample only" if a["count"] else "Right sample only" if b["count"] else "Neither sample")
        rows.append({"skill_id": a["skill_id"], "display_name": a["display_name"], "left": a, "right": b,
                     "difference_pp": 100*(a["rate"]-b["rate"]) if a["rate"] is not None and b["rate"] is not None else None,
                     "detected": detected})
    return {"key": result_key(receipt, area=area, stage=stage, left_role=left_role, right_role=right_role),
            "snapshot_id": receipt["manifest"]["analysis_snapshot_id"], "mode": p["data_mode"],
            "left": left, "right": right, "skills": rows,
            "left_jobs": _jobs(p, left), "right_jobs": _jobs(p, right)}


def rate_text(value):
    return "N/A" if value is None else f"{value*100:.1f}%"


def difference_text(value):
    return "N/A" if value is None else f"{value:+.1f} pp"
