"""Session-state helpers only. Never persist personal input or log its contents."""

from copy import deepcopy

from .next_steps import blank_profile


def ensure_profile(state, skill_ids=("python", "sql")):
    if "profile" not in state:
        state["profile"] = blank_profile(skill_ids)
        state["profile"]["market_area"] = state.get("area", "TORONTO_GTA")
    if "profile_widget_epoch" not in state: state["profile_widget_epoch"] = 0
    return state["profile"]


def set_profile_value(state, path, value):
    profile = deepcopy(ensure_profile(state))
    target = profile
    for part in path[:-1]: target = target[part]
    if target[path[-1]] != value:
        target[path[-1]] = value
        profile["profile_revision"] += 1
        state["profile"] = profile
        state["next_steps_dirty"] = True
        for key in ("actions", "export_payload", "skill_comparison"):
            state.pop(key, None)


def sync_widget(state, path, key, stage=False):
    # Ignore queued callbacks from widgets destroyed by clear/handoff.
    if not key.startswith("pf_"+str(state.get("profile_widget_epoch", 0))+"_"):
        state.pop(key, None)
        return
    if key not in state:
        return
    value = state[key]
    set_profile_value(state, path, None if stage and value == "ALL" else value)


def hydrate_profile_widgets(state):
    profile = ensure_profile(state)
    prefix = "pf_"+str(state["profile_widget_epoch"])+"_"
    for field in ("target_role", "target_stage", "courses_text", "experience_text"):
        state[prefix+field] = (profile[field] or "ALL") if field == "target_stage" else profile[field]
    for skill, values in profile["skill_states"].items():
        for field, value in values.items():
            state[prefix+"skill_states_"+skill+"_"+field] = bool(value) if field == "wants_practice" else value


def clear_profile(state):
    ids = ensure_profile(state)["skill_states"].keys()
    state["profile"] = blank_profile(ids)
    state["profile"]["market_area"] = state.get("area", "TORONTO_GTA")
    state["profile_widget_epoch"] += 1
    for key in list(state):
        if key.startswith("pf_") or key in ("next_steps_result", "next_steps_dirty", "actions", "export_payload", "skill_comparison", "profile_handoff"):
            state.pop(key, None)


def handoff_profile(state, role, stage):
    set_profile_value(state, ("target_role",), role)
    set_profile_value(state, ("target_stage",), stage)
    # Recreate widget values from the permanent profile on the destination page.
    state["profile_widget_epoch"] += 1
    for key in list(state):
        if key.startswith("pf_"): state.pop(key, None)
    state["page"] = "My skills & next steps"
