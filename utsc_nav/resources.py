"""Offline, verified resource reading and time states; no enrolment or recommendations."""

from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import re
from zoneinfo import ZoneInfo

from .analysis import digest

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CATALOG = ROOT/"data/resources/utsc-resources-v1"
SKILLS = ROOT/"data/synthetic/inputs/mvp02-v1/skills.json"
LEVELS = ("BEGINNER", "INTERMEDIATE", "ADVANCED", "UNKNOWN")
TYPES = ("COURSE", "PRACTICE_PROGRAM", "OFFICIAL_ENTRY", "PROJECT_EXERCISE")
CHECKED = {"AGENT_VERIFIED", "PROJECT_AUTHORED", "LOCAL_VERIFIED"}


class CatalogFailure(ValueError):
    pass


def load_catalog(directory=DEFAULT_CATALOG, *, dictionary_path=SKILLS):
    """Fail closed on a changed file, record, dictionary or evidence binding."""
    try:
        directory = Path(directory).resolve()
        manifest = json.loads((directory/"manifest.json").read_bytes())
        identity = {k: v for k, v in manifest.items() if k != "catalog_id"}
        if manifest["catalog_id"] != "resource-catalog-"+digest(identity)[:24]: raise ValueError()
        dictionary_bytes = Path(dictionary_path).read_bytes()
        dictionary = json.loads(dictionary_bytes)
        if hashlib.sha256(dictionary_bytes).hexdigest() != manifest["skill_dictionary_sha256"]: raise ValueError()
        skill_ids = {s["skill_id"] for s in dictionary["skills"]}
        if set(manifest["skill_ids"]) != skill_ids or manifest["skill_dictionary_version"] != dictionary["dictionary_version"]: raise ValueError()
        values = {}
        for name, ref in manifest["files"].items():
            path = (directory/name).resolve()
            if not path.is_relative_to(directory): raise ValueError()
            content = path.read_bytes()
            if len(content) != ref["bytes"] or hashlib.sha256(content).hexdigest() != ref["sha256"]: raise ValueError()
            values[name] = content
        if not {"resources.json", "mappings.json", "sources.json", "opportunities.json"} <= values.keys(): raise ValueError()
        data = {k: json.loads(values[k+".json"]) for k in ("resources", "mappings", "sources", "opportunities")}
        for key in ("resources", "mappings", "sources", "opportunities"):
            for item in data[key]:
                if item["content_hash"] != digest({k: v for k, v in item.items() if k != "content_hash"}): raise ValueError()
        records = {r["resource_id"]: r for r in data["resources"]}
        sources = {s["source_id"]: s for s in data["sources"]}
        if len(records) != len(data["resources"]) or len(sources) != len(data["sources"]): raise ValueError()
        for r in records.values():
            if r["resource_type"] not in TYPES or r["entry_level"] not in LEVELS: raise ValueError()
            if r["origin_kind"] not in ("OFFICIAL", "PROJECT_DESIGNED", "TEST_FIXTURE"): raise ValueError()
            if r["origin_kind"] == "OFFICIAL" and r["review_status"] in CHECKED:
                if not r["verified_at"] or not r["source_url"] or not r["source_evidence"]: raise ValueError()
                if any(sources[s]["access_status"] != "READ" for s in r["source_evidence"]): raise ValueError()
            for ref in r["source_evidence"]:
                if ref not in sources and ref not in values: raise ValueError()
        seen = set()
        for m in data["mappings"]:
            pair = (m["resource_id"], m["skill_id"])
            if pair in seen or m["skill_id"] not in skill_ids or m["relation"] not in {"TEACHES", "PRACTICES", "INTRODUCES"}: raise ValueError()
            seen.add(pair)
            r = records[m["resource_id"]]
            if m["resource_content_hash"] != r["content_hash"]: raise ValueError()
            ref = m["evidence_ref"]
            expected = sources[ref]["content_hash"] if ref in sources else hashlib.sha256(values[ref]).hexdigest()
            if m["evidence_hash"] != expected: raise ValueError()
            if m["review_status"] in CHECKED and (not m["verified_at"] or not m["evidence_text"]): raise ValueError()
        return {"manifest": manifest, **data, "directory": directory,
                "exercise_texts": {k: v.decode("utf-8") for k, v in values.items() if k.endswith(".md")},
                "exercise_inputs": {k: v.decode("utf-8") for k, v in values.items() if k.endswith(".csv")},
                "skill_names": {s["skill_id"]: s["display_name"] for s in dictionary["skills"]}}
    except (ValueError, KeyError, TypeError, OSError, AttributeError):
        raise CatalogFailure("CATALOG_INVALID: local resource bundle, dictionary or evidence failed validation. No substitute catalog loaded.") from None


def resource_state(resource, now=None):
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None: raise ValueError("An aware reference clock is required.")
    if resource["review_status"] not in CHECKED: return "NEEDS_RECHECK"
    try:
        local = now.astimezone(ZoneInfo(resource["timezone"])).date()
        verified = datetime.fromisoformat(resource["verified_at"].replace("Z", "+00:00"))
        if verified.tzinfo is None: return "NEEDS_RECHECK"
        checked_day = verified.astimezone(ZoneInfo(resource["timezone"])).date()
        due = min(date.fromisoformat(resource["recheck_due_at"]), checked_day+timedelta(days=90))
        if local < checked_day or local > due: return "NEEDS_RECHECK"
        return resource["review_status"]
    except (ValueError, TypeError, KeyError, AttributeError):
        return "NEEDS_RECHECK"


def verified_mappings(catalog, now=None):
    records = {r["resource_id"]: r for r in catalog["resources"]}
    return [m for m in catalog["mappings"] if m["review_status"] in CHECKED
            and resource_state(records[m["resource_id"]], now) in CHECKED]


def catalog_summary(catalog, now=None):
    fresh = [r for r in catalog["resources"] if resource_state(r, now) in CHECKED]
    official = [r for r in fresh if r["origin_kind"] == "OFFICIAL" and r["resource_type"] in {"COURSE", "PRACTICE_PROGRAM"}]
    return {"verified_official_resources": len(official), "project_exercises": sum(r["origin_kind"] == "PROJECT_DESIGNED" for r in fresh),
            "pending_resources": len(catalog["resources"])-len(fresh), "verified_mappings": len(verified_mappings(catalog, now)),
            "pending_mappings": len(catalog["mappings"])-len(verified_mappings(catalog, now)), "opportunities": len(catalog["opportunities"])}


def filter_resources(catalog, *, skill=None, resource_type=None, level=None, include_pending=False, now=None):
    if skill is not None and skill not in catalog["skill_names"]: raise ValueError("Unsupported skill filter")
    if resource_type is not None and resource_type not in TYPES: raise ValueError("Unsupported type filter")
    if level is not None and level not in LEVELS: raise ValueError("Unsupported level filter")
    mapped = {m["resource_id"] for m in verified_mappings(catalog, now) if m["skill_id"] == skill}
    return sorted([r for r in catalog["resources"] if (include_pending or resource_state(r, now) in CHECKED)
                   and (not skill or r["resource_id"] in mapped)
                   and (not resource_type or r["resource_type"] == resource_type)
                   and (not level or r["entry_level"] == level)], key=lambda r: r["resource_id"])


def _moment(value, precision, zone):
    if precision == "DATE":
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value): raise ValueError()
        return date.fromisoformat(value)
    if precision != "DATETIME": raise ValueError()
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None: raise ValueError()  # Never guess an offset, including DST folds/gaps.
    local = result.astimezone(zone)
    if result.utcoffset() != timedelta(0) and result.replace(tzinfo=None) != local.replace(tzinfo=None): raise ValueError()
    return local


def opportunity_state(item, now=None):
    """Current dates, independent registration state; no enrolment action is generated."""
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None: raise ValueError("An aware reference clock is required.")
    result = {"time_status": "DATE_UNKNOWN", "review_status": "NEEDS_RECHECK",
              "registration_status": item.get("registration_status") or "UNKNOWN", "registration_action_available": False}
    if result["registration_status"] == "CANCELLED":
        result["time_status"] = "CANCELLED"
        return result
    try:
        zone = ZoneInfo(item["timezone"])
        try:
            checked = datetime.fromisoformat(item["verified_at"].replace("Z", "+00:00"))
            if checked.tzinfo and checked <= now and (now.astimezone(zone).date()-checked.astimezone(zone).date()).days <= 7 and item.get("review_status") in {"AGENT_VERIFIED", "LOCAL_VERIFIED"}:
                result["review_status"] = item["review_status"]
        except (KeyError, TypeError, ValueError, AttributeError):
            pass
        precision = item["date_precision"]
        start = _moment(item["start_at"], precision, zone)
        end = _moment(item["end_at"], precision, zone) if item.get("end_at") else None
        deadline = _moment(item["deadline_at"], precision, zone) if item.get("deadline_at") else None
        if end and end < start: raise ValueError()
        current = now.astimezone(zone).date() if precision == "DATE" else now.astimezone(zone)
        if any(value < current or (precision == "DATETIME" and value == current) for value in (end, deadline) if value is not None):
            status = "EXPIRED"
        elif precision == "DATE" and current in (start, end, deadline): status = "TIME_UNCONFIRMED"
        elif start > current: status = "UPCOMING"
        elif end is None: status = "PAST_START_END_UNKNOWN"
        else: status = "IN_PROGRESS"
        result["time_status"] = status
    except (KeyError, TypeError, ValueError, AttributeError):
        pass
    return result
