"""Deterministic fixed-input analysis. No files, APIs, expected answers, or reviews."""

from collections import Counter, defaultdict
from datetime import date, datetime
from html.parser import HTMLParser
import hashlib
import json
import re
import unicodedata
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .importer import ImportedBatch

ENGINE_VERSION = "utsc-analysis-1"
ROLES = ("DATA_ANALYST", "BUSINESS_ANALYST", "BI", "DATA_SCIENTIST", "DATA_ENGINEER")
STAGES = ("INTERNSHIP_COOP", "NEW_GRADUATE", "ENTRY_LEVEL")
AREAS = ("TORONTO_GTA", "MONTREAL_METRO", "OTHER_CANADA")


class AnalysisFailure(ValueError):
    pass


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def text(value):
    return re.sub(r"\s+", " ", value).strip() or None if isinstance(value, str) else None


class BodyParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style"):
            self.hidden += 1
        if tag in ("p", "div", "br", "li", "section", "tr") and not self.hidden:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.hidden = max(0, self.hidden - 1)
        if tag in ("p", "div", "li", "section", "tr") and not self.hidden:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def clean_body(value):
    if value is None:
        return None
    parser = BodyParser()
    parser.feed(value.replace("\r\n", "\n").replace("\r", "\n"))
    parser.close()
    body = "".join(ch for ch in "".join(parser.parts) if ch in "\n\t" or not unicodedata.category(ch).startswith("C"))
    return text(body)


def body_status(body, rules):
    if not body:
        return False, "DESCRIPTION_MISSING"
    if len(body) < rules["description_min_chars"]:
        return False, "DESCRIPTION_SHORT"
    if re.fullmatch(r"(?:https?://\S+\s*)+", body):
        return False, "DESCRIPTION_URL_ONLY"
    if any(re.fullmatch(pattern, body, re.I) for pattern in rules["template_patterns"]):
        return False, "DESCRIPTION_TEMPLATE"
    if sum(ch.isalpha() for ch in body) / len(body) < rules["alphabetic_min_ratio"] or body.count("\ufffd") / len(body) > .05:
        return False, "DESCRIPTION_UNVERIFIED"
    return True, None


def aware(value):
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return result if result.utcoffset() is not None else None
    except (ValueError, TypeError, AttributeError, OverflowError):
        return None


def zone(value):
    try:
        return ZoneInfo(value) if value else None
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return None


def configuration(batch):
    try:
        rules = batch.configurations["classification"]["content"]
        dictionary = batch.configurations["dictionary"]["content"]
        if rules["execution_profile"] != ENGINE_VERSION:
            raise KeyError("execution_profile")
        if set(rules["role_rules"]) != set(ROLES) or set(rules["stage_rules"]) != set(STAGES):
            raise ValueError("Controlled classifications differ")
        if rules["description_min_chars"] != 100 or rules["max_age_days"] != 35:
            raise ValueError("Contract thresholds differ")
        for field in ("description_min_chars", "max_age_days", "area_map"):
            if rules[field] != batch.manifest["policy"][field]:
                raise ValueError("Manifest policy differs from rules")
        for key in ("cleaning", "classification", "matching", "areas", "statistics"):
            if batch.configurations[key]["sha256"] != batch.configurations["classification"]["sha256"]:
                raise ValueError("Processing references must share one frozen rules file")
        if dictionary["dictionary_version"] != batch.configurations["dictionary"]["version"]:
            raise ValueError("Dictionary version differs")
        for patterns in list(rules["role_rules"].values()) + list(rules["stage_rules"].values()):
            for pattern in patterns:
                re.compile(pattern, re.I)
        for pattern in [rules["senior_pattern"], rules["experience_pattern"]] + rules["template_patterns"] + rules.get("out_of_scope_role_rules", []):
            re.compile(pattern, re.I)
        skills = dictionary["skills"]
        if not skills or len({s["skill_id"] for s in skills}) != len(skills):
            raise ValueError("Empty or duplicate skill IDs")
        alias_owners = {}
        for skill in skills:
            if not skill["skill_id"] or not skill["display_name"] or not skill["aliases"]:
                raise ValueError("Incomplete skill")
            if skill["match_rules"] != ["case-insensitive word boundary"]:
                raise ValueError("Unsupported skill matching rule")
            for alias in skill["aliases"]:
                if not text(alias):
                    raise ValueError("Empty alias")
                owner = alias_owners.setdefault(alias.casefold(), skill["skill_id"])
                if owner != skill["skill_id"]:
                    raise ValueError("Conflicting alias owners")
        return rules, skills
    except (KeyError, TypeError, ValueError, re.error):
        raise AnalysisFailure("ANALYSIS_CONFIG_UNSUPPORTED: executable rules, dictionary or policy are incomplete/inconsistent; raw input was not changed.") from None


def classification(job, rules):
    evidence = []
    proposals = []
    pending = []
    title = job.get("title") or ""
    for axis, choices in (("role", rules["role_rules"]), ("stage", rules["stage_rules"])):
        hits = []
        for label, patterns in choices.items():
            for pattern in patterns:
                for match in re.finditer(pattern, title, re.I):
                    hits.append(label)
                    evidence.append({"field": "title", "axis": axis, "label": label, "pattern": pattern,
                                     "matched_text": match.group(), "start": match.start(), "end": match.end(), "snippet": title})
        labels = sorted(set(hits))
        proposals.append(labels[0] if len(labels) == 1 else None)
        if len(labels) != 1:
            pending.append(axis.upper() + ("_AMBIGUOUS" if labels else "_UNCLASSIFIED"))
    senior = re.search(rules["senior_pattern"], title, re.I)
    if senior:
        pending.append("SENIOR_TITLE")
        evidence.append({"field": "title", "axis": "seniority", "matched_text": senior.group(), "start": senior.start(), "end": senior.end(), "snippet": title})
    experience = []
    body = job.get("description_clean") or ""
    for match in re.finditer(rules["experience_pattern"], body, re.I):
        experience.append(int(match.group(1)))
        evidence.append({"field": "description_clean", "axis": "experience", "matched_text": match.group(), "start": match.start(), "end": match.end(), "snippet": body[max(0, match.start()-35):match.end()+35]})
    if proposals[1] and experience and max(experience) >= rules["experience_conflict_min"]:
        pending.append("EXPERIENCE_CONFLICT")
    return proposals[0], proposals[1], pending, evidence


def normalize(raw, rules):
    result = {key: text(raw.get(key)) for key in (
        "job_id", "source_namespace", "source_job_id", "title", "employer", "province_code", "city", "source_url",
        "posted_at", "posted_precision", "posted_timezone", "collected_at", "collection_timezone")}
    country = text(raw.get("country_code"))
    result["country_code"] = rules["country_aliases"].get((country or "").casefold(), country.upper() if country and re.fullmatch("[A-Za-z]{2}", country) else None)
    province = result["province_code"]
    result["province_code"] = rules["province_aliases"].get((province or "").casefold(), province.upper() if province else None)
    result["description_raw"] = raw.get("description_raw")
    result["description_clean"] = clean_body(raw.get("description_raw"))
    key = "|".join(result.get(k) or "" for k in ("country_code", "province_code", "city"))
    result["market_area"] = rules["area_map"].get(key, "UNKNOWN")
    return result


def date_reasons(job, rules):
    excluded, pending, age = [], [], None
    collected = aware(job["collected_at"])
    collected_zone = zone(job["collection_timezone"])
    if not collected or not collected_zone:
        return excluded, ["INVALID_COLLECTION_TIME"], age
    posted = job["posted_at"]
    if not posted:
        return ["MISSING_POSTED_DATE"], pending, age
    posted_zone = zone(job["posted_timezone"])
    if not posted_zone:
        return excluded, ["UNKNOWN_POSTED_TIMEZONE"], age
    try:
        if job["posted_precision"] == "DATE":
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", posted):
                raise ValueError()
            posted_day = date.fromisoformat(posted)
            collected_day = collected.astimezone(posted_zone).date()
        elif job["posted_precision"] == "DATETIME":
            posted_time = aware(posted)
            if not posted_time:
                raise ValueError()
            if posted_time > collected:
                excluded.append("FUTURE_POSTED_DATE")
            posted_day = posted_time.astimezone(collected_zone).date()
            collected_day = collected.astimezone(collected_zone).date()
        else:
            raise ValueError()
        age = (collected_day - posted_day).days
        if age < 0:
            excluded.append("FUTURE_POSTED_DATE")
        elif age > rules["max_age_days"]:
            excluded.append("POSTED_TOO_OLD")
    except (ValueError, OverflowError):
        excluded.append("INVALID_POSTED_DATE")
    return excluded, pending, age


def mentions_for(job, skills, versions):
    if job["classification"]["disposition"] != "FORMAL" or not job["description_usable"]:
        return []
    body = job["job"]["description_clean"]
    result = []
    for skill in skills:
        matches = []
        seen = set()
        for alias in skill["aliases"]:
            for match in re.finditer(r"(?<!\w)" + re.escape(alias) + r"(?!\w)", body, re.I):
                position = (match.start(), match.end())
                if position in seen:
                    continue
                seen.add(position)
                matches.append({"alias": alias, "matched_text": match.group(), "start": match.start(), "end": match.end(), "snippet": body[max(0, match.start()-32):match.end()+32]})
        if matches:
            result.append({"job_id": job["job_id"], "skill_id": skill["skill_id"], "matches": sorted(matches, key=lambda m: (m["start"], m["end"])),
                           "dictionary_version": versions["dictionary"], "matcher_version": versions["matching"], "content_hash": job["classification"]["content_hash"]})
    return result


def statistics(jobs, mentions, skills, *, role=None, stage=None, area="ALL_CANADA"):
    """Pure statistics; unassignable candidates remain visible separately."""
    if role not in (None,) + ROLES or stage not in (None,) + STAGES or area not in ("ALL_CANADA",) + AREAS:
        raise AnalysisFailure("INVALID_FILTER: unsupported controlled role, stage or area.")
    selected, unassignable = [], 0
    for item in jobs:
        label = item["classification"]
        values = ((label["role_effective"] if label["disposition"] == "FORMAL" else label["role_proposed"]),
                  (label["stage_effective"] if label["disposition"] == "FORMAL" else label["stage_proposed"]), item["job"]["market_area"])
        if (role and not values[0]) or (stage and not values[1]) or values[2] == "UNKNOWN":
            unassignable += 1
            continue
        if (role and values[0] != role) or (stage and values[1] != stage) or (area != "ALL_CANADA" and values[2] != area):
            continue
        selected.append(item)
    formal = [item for item in selected if item["classification"]["disposition"] == "FORMAL"]
    denominator = {item["job_id"] for item in formal if item["description_usable"]}
    detected = defaultdict(set)
    for mention in mentions:
        if mention["job_id"] in denominator:
            detected[mention["skill_id"]].add(mention["job_id"])
    D, F = len(denominator), len(formal)
    return {"filters": {"role": role, "stage": stage, "area": area}, "filterable_candidates": len(selected),
            "unassignable_candidates": unassignable, "formal_jobs": F, "analyzable_descriptions": D,
            "description_insufficient": F-D, "exploratory": F < 20 or D < 20,
            "skills": [{"skill_id": skill["skill_id"], "display_name": skill["display_name"], "count": len(detected[skill["skill_id"]]),
                        "denominator": D, "rate": len(detected[skill["skill_id"]])/D if D else None} for skill in sorted(skills, key=lambda s: s["skill_id"])]}


def analyze(batch: ImportedBatch):
    rules, skills = configuration(batch)
    versions = {key: value["version"] for key, value in batch.configurations.items()}
    versions["engine"] = ENGINE_VERSION
    groups = defaultdict(list)
    isolated = []
    for item in batch.records:
        raw = item["input"]
        if not text(raw.get("job_id")) or not text(raw.get("source_job_id")):
            isolated.append({"raw_ref": item["raw_ref"], "reason": "MISSING_ID", "disposition": "QUARANTINED_INPUT"})
        else:
            groups[(text(raw["source_namespace"]), text(raw["job_id"]))].append(item)
    jobs, all_mentions, occurrences = [], [], []
    for (namespace, job_id), items in sorted(groups.items()):
        items = sorted(items, key=lambda i: (i["raw_ref"]["path"], i["raw_ref"]["line"]))
        timed = [(aware(i["input"]["collected_at"]), i) for i in items]
        group_pending = []
        if any(t is None or zone(i["input"]["collection_timezone"]) is None for t, i in timed):
            group_pending.append("INVALID_COLLECTION_TIME")
        valid = [(t, i) for t, i in timed if t is not None]
        selected = max(valid, key=lambda pair: pair[0])[1] if valid else items[0]
        at_time = defaultdict(set)
        for timestamp, item in valid:
            raw = item["input"]
            at_time[timestamp].add(digest({key: raw.get(key) for key in ("title", "employer", "country_code", "province_code", "city", "description_raw", "posted_at", "posted_precision", "posted_timezone", "source_url")}))
        if any(len(values) > 1 for values in at_time.values()):
            group_pending.append("DUPLICATE_CONFLICT")
        job = normalize(selected["input"], rules)
        if job_id != f"{namespace}:{job['source_job_id']}":
            group_pending.append("ID_MISMATCH")
        pending, excluded = [], []
        for field in ("title", "employer", "source_url"):
            if not job[field]: pending.append("MISSING_" + field.upper())
        try:
            source = urlparse(job["source_url"] or "")
            if job["source_url"] and (source.scheme not in ("http", "https") or not source.netloc):
                pending.append("INVALID_SOURCE_URL")
        except ValueError:
            pending.append("INVALID_SOURCE_URL")
        if not job["country_code"]:
            pending.append("UNKNOWN_COUNTRY")
        elif job["country_code"] != "CA":
            excluded.append("NON_CANADA")
        if job["market_area"] == "UNKNOWN": pending.append("UNKNOWN_AREA")
        date_excluded, date_pending, age = date_reasons(job, rules)
        excluded.extend(date_excluded); pending.extend(date_pending)
        role, stage, class_pending, evidence = classification(job, rules)
        if role is None and "ROLE_AMBIGUOUS" not in class_pending:
            for pattern in rules.get("out_of_scope_role_rules", []):
                match = re.search(pattern, job["title"] or "", re.I)
                if match:
                    excluded.append("OUT_OF_SCOPE_ROLE")
                    evidence.append({"field": "title", "axis": "role_scope", "pattern": pattern, "matched_text": match.group(), "start": match.start(), "end": match.end(), "snippet": job["title"]})
                    break
        pending.extend(class_pending)
        usable, description_reason = body_status(job["description_clean"], rules)
        if group_pending:
            disposition, primary = "PENDING", group_pending[0]
        elif excluded:
            disposition, primary = "EXCLUDED", excluded[0]
        elif pending:
            disposition, primary = "PENDING", pending[0]
        else:
            disposition, primary = "FORMAL", "ACCEPTED"
        reasons = sorted(set(group_pending + excluded + pending + ([description_reason] if description_reason else [])))
        content_hash = digest({"business_content": job, "source_hashes": sorted({i["raw_ref"]["sha256"] for i in items}),
                               "role_proposed": role, "stage_proposed": stage, "rules": versions})
        label = {"job_id": job_id, "role_proposed": role, "stage_proposed": stage,
                 "role_effective": role if disposition == "FORMAL" else None,
                 "stage_effective": stage if disposition == "FORMAL" else None,
                 "evidence": evidence, "review_status": "NEEDS_REVIEW" if disposition == "PENDING" else "NOT_REVIEWED",
                 "disposition": disposition, "reason_codes": reasons, "primary_reason": primary,
                 "rule_version": versions["classification"], "content_hash": content_hash}
        observations = []
        for timestamp, item in timed:
            if item is selected: selection = "SELECTED"
            elif timestamp is None: selection = "INVALID_COLLECTION_TIME"
            elif group_pending and "DUPLICATE_CONFLICT" in group_pending: selection = "CONFLICT_GROUP"
            elif timestamp == aware(selected["input"]["collected_at"]): selection = "DUPLICATE_SAME_TIME"
            else: selection = "SUPERSEDED"
            occurrence = {"job_id": job_id, "raw_ref": item["raw_ref"], "collected_at": item["input"]["collected_at"], "selection": selection}
            observations.append(occurrence); occurrences.append(occurrence)
        record = {"job_id": job_id, "data_mode": batch.manifest["data_mode"], "contract_version": batch.manifest["contract_version"],
                  "job": job, "raw_ref": selected["raw_ref"], "source_occurrences": [i["raw_ref"] for i in items],
                  "observations": observations, "classification": label, "description_usable": usable,
                  "description_reason": description_reason, "description_characters": len(job["description_clean"] or ""), "age_days_at_collection": age}
        jobs.append(record)
        all_mentions.extend(mentions_for(record, skills, versions))
    counts = Counter(item["classification"]["disposition"] for item in jobs)
    quality = {"data_mode": batch.manifest["data_mode"], "input_rows": len(batch.records), "C": len(jobs),
               "F": counts["FORMAL"], "Q": counts["PENDING"], "E": counts["EXCLUDED"],
               "isolated_input_rows": len(isolated), "duplicate_observations": len(batch.records)-len(jobs)-len(isolated),
               "primary_reasons": dict(sorted(Counter(item["classification"]["primary_reason"] for item in jobs).items())),
               "description_warnings": dict(sorted(Counter(item["description_reason"] for item in jobs if item["description_reason"]).items())),
               "isolated_inputs": isolated, "occurrences": occurrences,
               "human_review": {"status": "NOT_PERFORMED", "reviewed_records": None, "role_agreement": None, "stage_agreement": None}}
    assert quality["C"] == quality["F"] + quality["Q"] + quality["E"]
    stats = statistics(jobs, all_mentions, skills)
    payload = {"data_mode": batch.manifest["data_mode"], "contract_version": batch.manifest["contract_version"],
               "input_snapshot_id": batch.manifest["snapshot_id"], "input_manifest_sha256": batch.manifest_sha256,
               "source_batches": list(batch.sources), "configuration_refs": {key: {"version": item["version"], "sha256": item["sha256"]} for key, item in batch.configurations.items()},
               "input_dates": {key: batch.manifest[key] for key in ("posted_range", "collected_start", "collected_end", "time_basis", "built_at")},
               "rule_versions": versions, "rules": rules, "skills": skills, "jobs": jobs, "skill_mentions": all_mentions, "quality": quality, "statistics": stats}
    return {"analysis_snapshot_id": batch.manifest["data_mode"].lower() + "-analysis-" + digest(payload)[:24], "payload": payload}
