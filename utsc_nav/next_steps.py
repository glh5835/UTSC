"""Pure session exploration policy. No text inference, scoring, storage or enrolment."""

from datetime import datetime, timezone

from .analysis import ROLES, STAGES, digest, statistics
from .resources import resource_state, verified_mappings

POLICY = "session-exploration-1"
EXPERIENCE = ("NOT_PROVIDED", "STUDIED", "PRACTICED")


def blank_profile(skill_ids):
    return {"target_role": "DATA_ANALYST", "target_stage": None, "market_area": "TORONTO_GTA", "skill_states": {
        s: {"experience_state": "NOT_PROVIDED", "wants_practice": None} for s in sorted(skill_ids)},
        "courses_text": "", "experience_text": "", "profile_revision": 0}


def validate_profile(profile, skill_ids):
    if profile["target_role"] not in ROLES or profile["target_stage"] not in (None, *STAGES):
        raise ValueError("Unsupported profile selection.")
    if set(profile["skill_states"]) != set(skill_ids): raise ValueError("Unsupported profile skills.")
    for state in profile["skill_states"].values():
        if state["experience_state"] not in EXPERIENCE or state["wants_practice"] not in (None, True, False):
            raise ValueError("Unsupported self-report state.")
    if not all(isinstance(profile[k], str) and len(profile[k]) <= 4000 for k in ("courses_text", "experience_text")):
        raise ValueError("Optional context must contain at most 4000 characters per field.")


def generation_key(profile, receipt, catalog, *, area, mode, now=None):
    now = now or datetime.now(timezone.utc)
    return digest({"profile": profile, "area": area, "mode": mode, "policy": POLICY,
        "release": receipt.get("release_id") if receipt else catalog.get("release_id"),
        "analysis": receipt["manifest"]["analysis_snapshot_id"] if receipt else None,
        "catalog": catalog["manifest"]["catalog_id"],
        "resource_states": [(r["resource_id"], r["content_hash"], resource_state(r, now),
                             r.get("eligibility_status", "UNKNOWN"), r["availability_status"]) for r in catalog["resources"]],
        "mappings": [(m["resource_id"], m["skill_id"], m["review_status"], m["content_hash"]) for m in catalog["mappings"]]})


def generate_next_steps(profile, receipt, catalog, *, area="TORONTO_GTA", mode="SYNTHETIC", now=None):
    now = now or datetime.now(timezone.utc)
    validate_profile(profile, catalog["skill_names"])
    if profile["market_area"] != area: raise ValueError("Profile area differs from current shared area.")
    if receipt and receipt["payload"]["data_mode"] != mode: raise ValueError("Analysis mode differs from current mode.")
    stats = None
    if receipt:
        p = receipt["payload"]
        stats = statistics(p["jobs"], p["skill_mentions"], p["skills"], role=profile["target_role"], stage=profile["target_stage"], area=area)
    market_available = bool(stats and stats["analyzable_descriptions"] > 0)
    basis = "SAMPLE_EXPLORATION" if market_available else "GENERAL_EXPLORATION"
    sample = {s["skill_id"]: s for s in stats["skills"]} if stats else {}
    wanted = [s for s, v in profile["skill_states"].items() if v["wants_practice"] is True]
    candidates = wanted or [s for s, v in profile["skill_states"].items() if v["experience_state"] != "PRACTICED"
                             and (not market_available or sample.get(s, {}).get("count", 0) > 0)]
    candidates = sorted(candidates, key=lambda s: (-(sample[s]["count"] if market_available and s in sample else 0), s))
    mappings = verified_mappings(catalog, now)
    resources = {r["resource_id"]: r for r in catalog["resources"]}
    options = {}
    for skill_rank, skill in enumerate(candidates):
        for m in mappings:
            if m["skill_id"] != skill: continue
            r = resources[m["resource_id"]]
            if r["origin_kind"] not in {"OFFICIAL", "PROJECT_DESIGNED"}: continue
            if r.get("eligibility_status") == "INELIGIBLE" or r["availability_status"] in {"CLOSED", "CANCELLED", "EXPIRED", "INELIGIBLE"}: continue
            # Levels guide exploration only; no academic eligibility is inferred.
            level = r["entry_level"]
            practiced = profile["skill_states"][skill]["experience_state"] == "PRACTICED"
            level_rank = ({"INTERMEDIATE": 0, "BEGINNER": 1, "ADVANCED": 1}.get(level, 2) if practiced
                          else {"BEGINNER": 0, "INTERMEDIATE": 1, "ADVANCED": 2}.get(level, 3))
            local = r["origin_kind"] == "PROJECT_DESIGNED"
            rank = (skill_rank, level_rank, 0 if local else 1, r["resource_id"])
            entry = options.setdefault(r["resource_id"], {"resource": r, "skills": [], "rank": rank})
            entry["skills"].append(skill)
            entry["rank"] = min(entry["rank"], rank)
    actions = []
    for entry in sorted(options.values(), key=lambda x: x["rank"])[:3]:
        r, skills = entry["resource"], entry["skills"]
        local = r["origin_kind"] == "PROJECT_DESIGNED"
        reasons = []
        for s in skills:
            if s in wanted: reasons.append("You explicitly want to practise "+catalog["skill_names"][s]+".")
            elif market_available:
                mention = sample[s]
                reasons.append(f"{catalog['skill_names'][s]} appears in {mention['count']}/{mention['denominator']} usable descriptions in this fixed sample; this suggests exploration, not a personal skill deficit.")
            else: reasons.append("General exploration of "+catalog["skill_names"][s]+" using checked resources; no market gap has been calculated.")
        actions.append({"action_id": "session-action-"+digest({"resource": r["resource_id"], "skills": skills, "policy": POLICY})[:16],
            "resource_id": r["resource_id"], "name": r["name"], "target_skill_ids": skills,
            "action_type": "OPTIONAL_LOCAL_EXERCISE" if local else "READ_AND_VERIFY",
            "reason": " ".join(reasons),
            "first_step": r["first_step"] if local else "Read the saved course description, then check its listed prerequisites and current timetable before considering enrolment.",
            "expected_output": r["expected_output"] if local else "A short list of prerequisites and offering details that still need confirmation; no completed course or skill mastery is assumed.",
            "conditions": {"prerequisites": r["prerequisites_text"], "eligibility": r["eligibility_conditions"],
                           "offered_status": r["offered_status"], "availability": r["availability_status"], "exclusions": r["exclusions_text"]},
            "eligibility_status": "NOT_ASSESSED" if local else "UNKNOWN", "origin_kind": r["origin_kind"],
            "review_status": resource_state(r, now), "source_refs": {"url": r["source_url"], "evidence": r["source_evidence"],
                "catalog_id": catalog["manifest"]["catalog_id"], "resource_content_hash": r["content_hash"]},
            "data_mode": mode, "release_id": receipt.get("release_id") if receipt else catalog.get("release_id"), "analysis_snapshot_id": receipt["manifest"]["analysis_snapshot_id"] if receipt else None,
            "profile_revision": profile["profile_revision"], "market_area": area, "target_role": profile["target_role"],
            "target_stage": profile["target_stage"], "generated_at": now.isoformat(), "stats_basis": basis})
    comparison = [{"skill_id": s, "display_name": name, **profile["skill_states"][s],
                   "sample": sample.get(s)} for s, name in sorted(catalog["skill_names"].items())]
    return {"key": generation_key(profile, receipt, catalog, area=area, mode=mode, now=now), "stats_basis": basis,
            "statistics": stats, "comparison": comparison, "candidate_skills": candidates, "actions": actions,
            "no_actions_reason": ("No checked, current resource matches these exploration choices. Broaden your choices or review the resource catalog." if candidates else
                                  "No additional exploration selected. Self-reported practice is not a score; choose a skill you want to practise to request an action.") if not actions else None,
            "policy": POLICY, "catalog_id": catalog["manifest"]["catalog_id"], "data_mode": mode,
            "analysis_snapshot_id": receipt["manifest"]["analysis_snapshot_id"] if receipt else None,
            "release_id": receipt.get("release_id") if receipt else catalog.get("release_id")}
