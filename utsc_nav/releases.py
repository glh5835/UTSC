"""Local public reviews and atomic complete releases. Never accepts a profile.

SQLite transactions contain the current pointer and its history. Packages are
immutable directories; readers validate all members before returning one bundle.
This is a single-machine maintenance tool, not an account/security system.
"""
from collections import Counter
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sqlite3
import uuid

from .analysis import (ROLES, STAGES, AREAS, canonical, digest, mentions_for,
                       statistics, date_reasons, AnalysisFailure)
from .snapshot_store import read_snapshot
from .resources import load_catalog, CatalogFailure, SKILLS, CHECKED

VERSION = "local-release-1"
MODES = {"SYNTHETIC", "HISTORICAL"}
STATUSES = {"DRAFT", "APPROVED", "REJECTED", "NEEDS_RECHECK"}
FIELDS = {
    "classification": ("role", "stage", "disposition"),
    "resource": ("availability_status", "offered_status", "prerequisites_text", "eligibility_conditions"),
    "mapping": ("relation", "evidence_text"),
    "opportunity": ("registration_status", "start_at", "end_at", "deadline_at", "date_precision", "timezone"),
}


class ReleaseFailure(ValueError):
    pass


def utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _mode(mode):
    if mode not in MODES: raise ReleaseFailure("MODE_INVALID: no substitute mode was used.")


@contextmanager
def _db(root, write=False):
    path = Path(root).resolve()/"public.sqlite3"
    if write:
        path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(path, timeout=5)
        db.executescript("""
            CREATE TABLE IF NOT EXISTS drafts(mode TEXT PRIMARY KEY, revision INTEGER, value TEXT);
            CREATE TABLE IF NOT EXISTS reviews(id INTEGER PRIMARY KEY, mode TEXT, value TEXT);
            CREATE TABLE IF NOT EXISTS current(mode TEXT PRIMARY KEY, release_id TEXT);
            CREATE TABLE IF NOT EXISTS history(id INTEGER PRIMARY KEY, mode TEXT, value TEXT);
        """)
    else:
        if not path.exists():
            yield None
            return
        db = sqlite3.connect(path.as_uri()+"?mode=ro", uri=True, timeout=5)
    try:
        if write: db.execute("BEGIN IMMEDIATE")
        yield db
        if write: db.commit()
    except BaseException:
        if write: db.rollback()
        raise
    finally:
        db.close()


def public_state(root, mode):
    _mode(mode)
    try:
        with _db(root) as db:
            if db is None: return {"draft": None, "revision": 0, "reviews": [], "current": None, "history": []}
            row = db.execute("SELECT revision,value FROM drafts WHERE mode=?", (mode,)).fetchone()
            pointer = db.execute("SELECT release_id FROM current WHERE mode=?", (mode,)).fetchone()
            return {"draft": json.loads(row[1]) if row else None, "revision": row[0] if row else 0,
                    "reviews": [json.loads(r[0]) for r in db.execute("SELECT value FROM reviews WHERE mode=? ORDER BY id", (mode,))],
                    "current": pointer[0] if pointer else None,
                    "history": [json.loads(r[0]) for r in db.execute("SELECT value FROM history WHERE mode=? ORDER BY id", (mode,))]}
    except (sqlite3.Error, ValueError, OSError):
        raise ReleaseFailure("PUBLIC_STATE_INVALID: public store could not be read; no fallback release was loaded.") from None


def save_draft(root, mode, analysis_directory, catalog_directory):
    """Pin public source identities, without changing a student release."""
    _mode(mode)
    try:
        receipt = read_snapshot(Path(analysis_directory).resolve())
        catalog = load_catalog(catalog_directory)
        if receipt["payload"]["data_mode"] != mode: raise ValueError()
        if receipt["payload"]["rule_versions"]["dictionary"] != catalog["manifest"]["skill_dictionary_version"]: raise ValueError()
        value = {"analysis_directory": receipt["directory"], "catalog_directory": str(catalog["directory"]),
                 "analysis_snapshot_id": receipt["manifest"]["analysis_snapshot_id"],
                 "catalog_id": catalog["manifest"]["catalog_id"], "saved_at": utc_now()}
        with _db(root, True) as db:
            row = db.execute("SELECT revision FROM drafts WHERE mode=?", (mode,)).fetchone()
            revision = (row[0] if row else 0)+1
            db.execute("INSERT OR REPLACE INTO drafts VALUES(?,?,?)", (mode, revision, canonical(value).decode()))
        return revision
    except (AnalysisFailure, CatalogFailure, ValueError, OSError, sqlite3.Error):
        raise ReleaseFailure("DRAFT_SAVE_FAILED: source validation or public-store write failed. Previous draft and release were preserved.") from None


def _sources(state, mode):
    draft = state["draft"]
    if not draft: raise ReleaseFailure("DRAFT_MISSING: save validated public sources first.")
    try:
        receipt = read_snapshot(Path(draft["analysis_directory"]))
        catalog = load_catalog(draft["catalog_directory"])
        if (receipt["payload"]["data_mode"] != mode or receipt["manifest"]["analysis_snapshot_id"] != draft["analysis_snapshot_id"]
                or catalog["manifest"]["catalog_id"] != draft["catalog_id"]): raise ValueError()
        return receipt, catalog
    except (AnalysisFailure, CatalogFailure, ValueError):
        raise ReleaseFailure("DRAFT_SOURCE_CHANGED: saved source failed validation or identity check. The current release and saved edits were preserved.") from None


def review_objects(receipt, catalog, kind):
    if kind == "classification":
        return {j["job_id"]: {"content_hash": j["classification"]["content_hash"],
                "value": {"role": j["classification"]["role_proposed"], "stage": j["classification"]["stage_proposed"],
                          "disposition": j["classification"]["disposition"]}} for j in receipt["payload"]["jobs"]}
    key = {"resource": "resources", "mapping": "mappings", "opportunity": "opportunities"}.get(kind)
    if not key: raise ReleaseFailure("REVIEW_KIND_INVALID")
    result = {}
    for item in catalog[key]:
        identifier = (item["resource_id"]+"::"+item["skill_id"] if kind == "mapping" else item[kind+"_id"])
        result[identifier] = {"content_hash": item["content_hash"], "value": {k: item.get(k) for k in FIELDS[kind]}}
    return result


def draft_objects(root, mode, kind):
    state = public_state(root, mode)
    receipt, catalog = _sources(state, mode)
    return review_objects(receipt, catalog, kind)


def _validate_change(kind, value):
    if kind not in FIELDS or not isinstance(value, dict) or set(value) != set(FIELDS[kind]): raise ReleaseFailure("REVIEW_FIELDS_INVALID")
    if any(not isinstance(v, (str, type(None))) for v in value.values()): raise ReleaseFailure("REVIEW_VALUE_TYPES_INVALID")
    if kind == "classification":
        if value["role"] not in (None, *ROLES) or value["stage"] not in (None, *STAGES) or value["disposition"] not in {"FORMAL", "PENDING", "EXCLUDED"}: raise ReleaseFailure("CLASSIFICATION_INVALID")
        if value["disposition"] == "FORMAL" and (not value["role"] or not value["stage"]): raise ReleaseFailure("FORMAL_LABELS_MISSING")
    elif kind == "mapping":
        if value["relation"] not in {"TEACHES", "PRACTICES", "INTRODUCES"} or not isinstance(value["evidence_text"], str) or not value["evidence_text"].strip(): raise ReleaseFailure("MAPPING_EVIDENCE_REQUIRED")
    elif kind == "resource":
        if value["availability_status"] not in {"UNKNOWN", "OPEN", "CLOSED", "CANCELLED", "EXPIRED", "INELIGIBLE", "LOCAL_EXERCISE"}: raise ReleaseFailure("AVAILABILITY_INVALID")
        if value["offered_status"] not in {"UNKNOWN", "OFFERED", "NOT_OFFERED", "NOT_APPLICABLE"}: raise ReleaseFailure("OFFERING_INVALID")
        if not all(isinstance(value[k], (str, type(None))) for k in FIELDS[kind]): raise ReleaseFailure("RESOURCE_FIELDS_INVALID")
    else:
        if value["registration_status"] not in {"UNKNOWN", "OPEN", "CLOSED", "CANCELLED"}: raise ReleaseFailure("REGISTRATION_INVALID")
        if value["date_precision"] not in {"DATE", "DATETIME", "UNKNOWN"}: raise ReleaseFailure("DATE_PRECISION_INVALID")
        # Unknown/invalid dates remain non-actionable; never invent missing years/offsets.
        if not all(isinstance(v, (str, type(None))) for v in value.values()): raise ReleaseFailure("OPPORTUNITY_FIELDS_INVALID")
    if len(canonical(value)) > 16000: raise ReleaseFailure("REVIEW_TOO_LARGE")


def save_review(root, mode, kind, object_id, new_value, *, status, reason, reviewer_id, expected_hash):
    """Append a public review, not a student publication. No arbitrary profile fields."""
    _mode(mode)
    _validate_change(kind, new_value)
    if status not in STATUSES: raise ReleaseFailure("REVIEW_STATUS_INVALID")
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000: raise ReleaseFailure("REVIEW_REASON_REQUIRED")
    if not isinstance(reviewer_id, str) or not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", reviewer_id): raise ReleaseFailure("LOCAL_REVIEWER_INVALID")
    state = public_state(root, mode)
    objects = draft_objects(root, mode, kind)
    obj = objects.get(object_id)
    if not obj or obj["content_hash"] != expected_hash: raise ReleaseFailure("REVIEW_BASE_CHANGED: re-open the current public object before saving.")
    previous = next((r for r in reversed(state["reviews"]) if r["object_type"] == kind and r["object_id"] == object_id), None)
    value = {"review_id": "local-review-"+uuid.uuid4().hex, "object_type": kind, "object_id": object_id,
             "base_content_hash": expected_hash, "old_value": previous["new_value"] if previous and previous["base_content_hash"] == expected_hash else obj["value"],
             "new_value": new_value, "reason": reason.strip(), "reviewer_id": reviewer_id,
             "review_method": "LOCAL_MAINTENANCE", "reviewed_at": utc_now(), "status": status,
             "rule_version": VERSION, "supersedes_review_id": previous["review_id"] if previous else None}
    try:
        with _db(root, True) as db:
            row = db.execute("SELECT revision FROM drafts WHERE mode=?", (mode,)).fetchone()
            if not row or row[0] != state["revision"]: raise ReleaseFailure("DRAFT_CHANGED: reopen before saving.")
            db.execute("INSERT INTO reviews(mode,value) VALUES(?,?)", (mode, canonical(value).decode()))
            db.execute("UPDATE drafts SET revision=revision+1 WHERE mode=?", (mode,))
        return value
    except (sqlite3.Error, OSError):
        raise ReleaseFailure("REVIEW_SAVE_FAILED: edits were not published; previous records remain.") from None


def _apply(receipt, catalog, reviews):
    payload, catalog = deepcopy(receipt["payload"]), deepcopy(catalog)
    latest = {}
    review_order = {r["review_id"]: index for index,r in enumerate(reviews)}
    for r in reviews:
        if r["status"] != "DRAFT": latest[(r["object_type"], r["object_id"])] = r
    for (kind, identifier), review in latest.items():
        # Mapping resource bindings may change later in this pass; content review
        # always binds the original source record, never an opportunistic rebase.
        original = review_objects(receipt, load_catalog(catalog["directory"]), kind).get(identifier)
        if not original or original["content_hash"] != review["base_content_hash"]: raise ReleaseFailure("REVIEW_STALE: content changed; a new review is required.")
        value = review["new_value"]
        _validate_change(kind, value)
        approved = review["status"] == "APPROVED"
        if kind == "classification":
            item = next(j for j in payload["jobs"] if j["job_id"] == identifier)
            label = item["classification"]
            label["original_rule_values"] = {k: deepcopy(label[k]) for k in ("role_proposed", "stage_proposed", "role_effective", "stage_effective", "disposition", "primary_reason", "reason_codes")}
            disposition = value["disposition"] if approved else "PENDING"
            if disposition == "FORMAL":
                exc, pending, _ = date_reasons(item["job"], payload["rules"])
                blockers = {"DUPLICATE_CONFLICT", "INVALID_COLLECTION_TIME", "ID_MISMATCH", "MISSING_TITLE", "MISSING_EMPLOYER", "MISSING_SOURCE_URL", "INVALID_SOURCE_URL", "UNKNOWN_COUNTRY", "UNKNOWN_AREA"}
                if exc or pending or item["job"]["country_code"] != "CA" or item["job"]["market_area"] not in AREAS or blockers.intersection(label["reason_codes"]): raise ReleaseFailure("REVIEW_ADMISSION_BLOCKED: labels cannot repair invalid source facts.")
            # Preserve extraction proposals. Effective values drive formal stats.
            label.update(role_effective=value["role"] if disposition == "FORMAL" else None,
                         stage_effective=value["stage"] if disposition == "FORMAL" else None,
                         disposition=disposition, review_status=review["status"], review_id=review["review_id"],
                         primary_reason="LOCAL_REVIEW", reason_codes=["LOCAL_REVIEW", *label["reason_codes"]])
        else:
            key = {"resource": "resources", "mapping": "mappings", "opportunity": "opportunities"}[kind]
            def item_id(item):
                return item["resource_id"]+"::"+item["skill_id"] if kind == "mapping" else item[kind+"_id"]
            item = next(i for i in catalog[key] if item_id(i) == identifier)
            if approved:
                # A maintenance approval cannot upgrade unverified source content.
                if item["review_status"] not in CHECKED or not item.get("verified_at"):
                    raise ReleaseFailure("SOURCE_NOT_CHECKED: local approval needs existing checked evidence; re-verify source content first.")
                item.update(value)
                item["review_status"] = "LOCAL_VERIFIED"
            else:
                item["review_status"] = "NEEDS_RECHECK"
            item["local_review_id"] = review["review_id"]
            item["content_hash"] = digest({k: v for k, v in item.items() if k != "content_hash"})
    resource_by_id = {r["resource_id"]: r for r in catalog["resources"]}
    for mapping in catalog["mappings"]:
        new_hash = resource_by_id[mapping["resource_id"]]["content_hash"]
        if mapping["resource_content_hash"] != new_hash:
            mapping["resource_content_hash"] = new_hash
            # Resource edits invalidate old mapping approval unless explicitly
            # reviewed together in this publication against the original evidence.
            review = latest.get(("mapping", mapping["resource_id"]+"::"+mapping["skill_id"]))
            resource_review = latest.get(("resource", mapping["resource_id"]))
            joint_review = (review and review["status"] == "APPROVED" and resource_review
                            and review_order[review["review_id"]] > review_order[resource_review["review_id"]]
                            and resource_by_id[mapping["resource_id"]]["review_status"] in CHECKED)
            if not joint_review: mapping["review_status"] = "NEEDS_RECHECK"
            mapping["content_hash"] = digest({k: v for k, v in mapping.items() if k != "content_hash"})
    payload["skill_mentions"] = [m for item in payload["jobs"] for m in mentions_for(item, payload["skills"], payload["rule_versions"])]
    counts = Counter(j["classification"]["disposition"] for j in payload["jobs"])
    payload["quality"].update(F=counts["FORMAL"], Q=counts["PENDING"], E=counts["EXCLUDED"],
        primary_reasons=dict(sorted(Counter(j["classification"]["primary_reason"] for j in payload["jobs"]).items())))
    payload["statistics"] = statistics(payload["jobs"], payload["skill_mentions"], payload["skills"])
    payload["local_review_version"] = "reviews-"+digest(reviews)[:24]
    return payload, catalog


def _ref(content):
    return {"sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)}


def _release_path(root, mode, release_id):
    _mode(mode)
    if not isinstance(release_id, str) or not re.fullmatch(mode.lower()+r"-release-[a-f0-9]{24}", release_id): raise ReleaseFailure("RELEASE_ID_INVALID")
    return Path(root).resolve()/mode.lower()/"releases"/release_id


def read_release(root, mode, release_id, *, directory=None):
    """Validate every byte, mode, version and semantic link; return all at once."""
    path = Path(directory) if directory else _release_path(root, mode, release_id)
    try:
        manifest = json.loads((path/"manifest.json").read_bytes())
        identity = {k: v for k, v in manifest.items() if k != "release_id"}
        if manifest["release_id"] != mode.lower()+"-release-"+digest(identity)[:24] or manifest["release_id"] != release_id: raise ValueError()
        if manifest["data_mode"] != mode or manifest["status"] != "PUBLISHED": raise ValueError()
        required = {"analysis.json", "dictionary.json", "reviews.json", "validation.json", "catalog/manifest.json"}
        if not required <= manifest["bundle_files"].keys(): raise ValueError()
        actual = {p.relative_to(path).as_posix() for p in path.rglob("*") if p.is_file()}
        if actual != set(manifest["bundle_files"]) | {"manifest.json"}: raise ValueError()
        for name, reference in manifest["bundle_files"].items():
            if PurePosixPath(name).is_absolute() or ".." in PurePosixPath(name).parts or "\\" in name: raise ValueError()
            member = (path/name).resolve()
            if not member.is_relative_to(path.resolve()) or member.is_symlink(): raise ValueError()
            if _ref(member.read_bytes()) != reference: raise ValueError()
        p = json.loads((path/"analysis.json").read_bytes())
        catalog = load_catalog(path/"catalog", dictionary_path=path/"dictionary.json")
        reviews = json.loads((path/"reviews.json").read_bytes())
        dictionary = json.loads((path/"dictionary.json").read_bytes())
        analysis_id = mode.lower()+"-analysis-"+digest(p)[:24]
        if len({j["job_id"] for j in p["jobs"]}) != len(p["jobs"]): raise ValueError()
        for item in p["jobs"]:
            label = item["classification"]
            if item["data_mode"] != mode or label["disposition"] not in {"FORMAL", "PENDING", "EXCLUDED"}: raise ValueError()
            if label["disposition"] == "FORMAL" and (label["role_effective"] not in ROLES or label["stage_effective"] not in STAGES): raise ValueError()
        if p["data_mode"] != mode or p["contract_version"] != manifest["contract_version"] or analysis_id != manifest["snapshot_id"]: raise ValueError()
        if p["skills"] != dictionary["skills"] or p["rule_versions"]["dictionary"] != manifest["dictionary_version"]: raise ValueError()
        if manifest["resource_version"] != catalog["manifest"]["catalog_id"] or manifest["mapping_version"] != "mappings-"+digest(catalog["mappings"])[:24]: raise ValueError()
        if manifest["review_version"] != "reviews-"+digest(reviews)[:24] or p["local_review_version"] != manifest["review_version"]: raise ValueError()
        if p["rule_versions"] != manifest["rule_versions"]: raise ValueError()
        if statistics(p["jobs"], p["skill_mentions"], p["skills"]) != p["statistics"]: raise ValueError()
        if [m for j in p["jobs"] for m in mentions_for(j, p["skills"], p["rule_versions"])] != p["skill_mentions"]: raise ValueError()
        counts = Counter(j["classification"]["disposition"] for j in p["jobs"])
        q = p["quality"]
        if q["C"] != len(p["jobs"]) or any(q[k] != counts[v] for k,v in (("F","FORMAL"),("Q","PENDING"),("E","EXCLUDED"))) or q["C"] != q["F"]+q["Q"]+q["E"]: raise ValueError()
        for r in reviews:
            if r["status"] not in STATUSES or not r["reason"] or r["review_method"] != "LOCAL_MAINTENANCE": raise ValueError()
            _validate_change(r["object_type"], r["new_value"])
        if json.loads((path/"validation.json").read_bytes())["status"] != "VALIDATED": raise ValueError()
        receipt = {"manifest": {"analysis_snapshot_id": analysis_id}, "payload": p, "release_id": release_id,
                   "release_manifest": manifest, "directory": str(path)}
        catalog["release_id"] = release_id
        return {"manifest": manifest, "receipt": receipt, "catalog": catalog, "reviews": reviews, "directory": str(path)}
    except (ValueError, KeyError, TypeError, OSError, CatalogFailure, AnalysisFailure):
        raise ReleaseFailure("RELEASE_INVALID: complete package validation failed; no partial version was loaded.") from None


def _switch(root, mode, target, *, reason, expected_revision=None, expected_current=None, operation="PUBLISH"):
    if not isinstance(reason, str) or not reason.strip() or len(reason) > 2000: raise ReleaseFailure("PUBLICATION_REASON_REQUIRED")
    # Full target validation is also mandatory for rollback.
    bundle = read_release(root, mode, target)
    try:
        with _db(root, True) as db:
            row = db.execute("SELECT revision FROM drafts WHERE mode=?", (mode,)).fetchone()
            old = db.execute("SELECT release_id FROM current WHERE mode=?", (mode,)).fetchone()
            previous = old[0] if old else None
            if expected_revision is not None and (not row or row[0] != expected_revision or previous != expected_current): raise ReleaseFailure("PUBLIC_STATE_CHANGED: publish again from the current draft.")
            event = {"operation": operation, "previous_release_id": previous, "release_id": target,
                     "reason": reason.strip(), "changed_at": utc_now()}
            db.execute("INSERT OR REPLACE INTO current VALUES(?,?)", (mode, target))
            db.execute("INSERT INTO history(mode,value) VALUES(?,?)", (mode, canonical(event).decode()))
        return bundle
    except (sqlite3.Error, OSError):
        raise ReleaseFailure("POINTER_WRITE_FAILED: current pointer and history transaction was rolled back.") from None


def publish(root, mode, *, reason):
    state = public_state(root, mode)
    receipt, source_catalog = _sources(state, mode)
    payload, catalog = _apply(receipt, source_catalog, state["reviews"])
    try:
        files = {"analysis.json": canonical(payload)+b"\n", "dictionary.json": SKILLS.read_bytes(),
                 "reviews.json": canonical(state["reviews"])+b"\n",
                 "validation.json": canonical({"status": "VALIDATED", "validator": VERSION,
                     "checks": ["hashes", "mode", "dictionary", "evidence", "reviews", "mentions", "statistics", "quality"]})+b"\n"}
        cm = deepcopy(catalog["manifest"])
        for name in cm["files"]:
            if name in {"resources.json", "mappings.json", "opportunities.json"}:
                content = canonical(catalog[name[:-5]])+b"\n"
            else:
                content = (source_catalog["directory"]/name).read_bytes()
            files["catalog/"+name] = content
            cm["files"][name] = _ref(content)
        cm["catalog_id"] = "resource-catalog-"+digest({k:v for k,v in cm.items() if k != "catalog_id"})[:24]
        files["catalog/manifest.json"] = canonical(cm)+b"\n"
        manifest = {"data_mode": mode, "contract_version": payload["contract_version"], "snapshot_id": mode.lower()+"-analysis-"+digest(payload)[:24],
                    "manifest_hash": payload["input_manifest_sha256"], "resource_version": cm["catalog_id"],
                    "mapping_version": "mappings-"+digest(catalog["mappings"])[:24], "review_version": payload["local_review_version"],
                    "dictionary_version": payload["rule_versions"]["dictionary"], "rule_versions": payload["rule_versions"],
                    "bundle_files": {name: _ref(content) for name,content in files.items()}, "previous_release_id": state["current"],
                    "published_at": utc_now(), "status": "PUBLISHED", "validation_ref": "validation.json", "publisher_version": VERSION,
                    "draft_revision": state["revision"], "action_policy": "session-exploration-1", "scope": "LOCAL_ONLY"}
        release_id = mode.lower()+"-release-"+digest(manifest)[:24]
        manifest["release_id"] = release_id
        target = _release_path(root, mode, release_id)
        target.parent.mkdir(parents=True, exist_ok=True)
        staging = target.parent/(".building-"+uuid.uuid4().hex)
        staging.mkdir()
        for name, content in files.items():
            member = staging/name
            member.parent.mkdir(parents=True, exist_ok=True)
            with member.open("xb") as output: output.write(content)
        (staging/"manifest.json").write_bytes(canonical(manifest)+b"\n")
        read_release(root, mode, release_id, directory=staging)
        staging.rename(target)
        return _switch(root, mode, release_id, reason=reason, expected_revision=state["revision"], expected_current=state["current"])
    except (OSError, sqlite3.Error, CatalogFailure, ValueError) as error:
        if isinstance(error, ReleaseFailure): raise
        # Retain this call's .building directory for failure diagnosis; never
        # expose it through current, never remove someone else's files.
        raise ReleaseFailure("PUBLICATION_FAILED: complete-package write/validation failed; previous current release and saved edits remain.") from None


def rollback(root, mode, release_id, *, reason):
    state = public_state(root, mode)
    if release_id not in {h["release_id"] for h in state["history"]}: raise ReleaseFailure("ROLLBACK_TARGET_UNKNOWN")
    return _switch(root, mode, release_id, reason=reason, operation="ROLLBACK")


def load_current(root, mode):
    state = public_state(root, mode)
    return read_release(root, mode, state["current"]) if state["current"] else None
