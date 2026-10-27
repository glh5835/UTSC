"""In-memory, explicitly downloaded exports. No file or logging operations."""
import csv
import io
import json
import re
import unicodedata
from datetime import datetime, timezone

from .market import comparison_result
from .next_steps import generation_key, generate_next_steps


class ExportFailure(ValueError):
    pass


def csv_cell(value):
    if value is None: return "N/A"
    if not isinstance(value, str): return value
    # Spreadsheet applications may ignore leading whitespace/control characters.
    probe = value.lstrip("\ufeff")
    probe = "".join(c for c in probe if not (c.isspace() or unicodedata.category(c).startswith("C")))
    return "'"+value if probe.startswith(("=", "+", "-", "@")) else value


def comparison_csv(receipt, result, *, left_role, right_role, area, stage):
    current = comparison_result(receipt, left_role=left_role, right_role=right_role, area=area, stage=stage)
    if not receipt.get("release_id") or current != result:
        raise ExportFailure("EXPORT_STALE: recalculate against the loaded complete release.")
    p, release = receipt["payload"], receipt["release_manifest"]
    common = {"data_mode": p["data_mode"], "release_id": receipt["release_id"], "release_published_at": release["published_at"],
              "analysis_snapshot_id": result["snapshot_id"], "resource_version": release["resource_version"],
              "mapping_version": release["mapping_version"], "review_version": release["review_version"],
              "posted_interval_start": p["input_dates"]["posted_range"]["start"], "posted_interval_end": p["input_dates"]["posted_range"]["end"],
              "posted_interval_precision": p["input_dates"]["posted_range"]["precision"],
              "collection_start": p["input_dates"]["collected_start"], "collection_end": p["input_dates"]["collected_end"],
              "area": area, "stage": stage or "ALL", "left_role": left_role, "right_role": right_role,
              "left_F": result["left"]["formal_jobs"], "left_D": result["left"]["analyzable_descriptions"],
              "right_F": result["right"]["formal_jobs"], "right_D": result["right"]["analyzable_descriptions"],
              "notice": "Fixed sample; not live openings or career-exclusive skills. F or D below 20 is exploratory."}
    rows = []
    for s in current["skills"]:
        rows.append({**common, "record_type": "SKILL", "skill_id": s["skill_id"], "skill_name": s["display_name"],
                     "left_M": s["left"]["count"], "left_rate": s["left"]["rate"],
                     "right_M": s["right"]["count"], "right_rate": s["right"]["rate"], "difference_pp": s["difference_pp"], "detected": s["detected"]})
    for side in ("left", "right"):
        for item in current[side+"_jobs"]:
            job = item["job"]
            rows.append({**common, "record_type": "JOB_SOURCE", "side": side, "job_id": item["job_id"],
                         **{k: job.get(k) for k in ("title", "employer", "source_url", "posted_at", "posted_precision", "posted_timezone", "collected_at", "collection_timezone")}})
    columns = list(common)+["record_type", "skill_id", "skill_name", "left_M", "left_rate", "right_M", "right_rate", "difference_pp", "detected",
                           "side", "job_id", "title", "employer", "source_url", "posted_at", "posted_precision", "posted_timezone", "collected_at", "collection_timezone"]
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns, lineterminator="\r\n")
    writer.writeheader()
    for row in rows: writer.writerow({k: csv_cell(row.get(k)) for k in columns})
    return output.getvalue().encode("utf-8-sig")


def _literal(value):
    text = "Not provided (unknown)" if value is None or value == "" else str(value)
    longest = max((len(s) for s in re.findall(r"`+", text)), default=0)
    fence = "`"*max(3, longest+1)
    return fence+"text\n"+text+"\n"+fence


def action_markdown(profile, receipt, catalog, result, *, area, mode, dirty, now=None):
    now = now or datetime.now(timezone.utc)
    if dirty or not receipt or not receipt.get("release_id") or result["key"] != generation_key(profile, receipt, catalog, area=area, mode=mode, now=now):
        raise ExportFailure("EXPORT_STALE: generate next steps with current inputs and the loaded release first.")
    # Recompute from current inputs before exporting. All bytes stay in RAM.
    current = generate_next_steps(profile, receipt, catalog, area=area, mode=mode, now=now)
    release, dates = receipt["release_manifest"], receipt["payload"]["input_dates"]
    lines = ["# UTSC Career Navigator — next steps", "", "Personal session download. Do not treat self-report as assessed ability.",
             "", "Data mode: "+mode, "Release: "+receipt["release_id"], "Release published at: "+release["published_at"],
             "Exported at: "+now.isoformat(), "Analysis: "+current["analysis_snapshot_id"],
             "Resource version: "+release["resource_version"], "Mapping version: "+release["mapping_version"], "Review version: "+release["review_version"],
             "Posting interval (original precision): "+json.dumps(dates["posted_range"], ensure_ascii=False),
             "Original collection interval: "+dates["collected_start"]+" → "+dates["collected_end"],
             "Fixed historical/fixture dates; no current vacancy claim. SYNTHETIC is artificial data.",
             "", "Target role: "+profile["target_role"], "Target stage: "+(profile["target_stage"] or "ALL"), "Area: "+area,
             "Profile revision: "+str(profile["profile_revision"]), "Basis: "+current["stats_basis"],
             "Policy: "+current["policy"], "", "## User self-report", "", "Missing means unknown. Studied does not mean mastered. Free text is not used to infer skills."]
    for s in current["comparison"]:
        sample = s["sample"]
        rate = str(sample["rate"]) if sample and sample["rate"] is not None else "N/A"
        lines.append(f"- {s['skill_id']}: {s['experience_state']}; wants practice: {s['wants_practice']}; M/D: "+(f"{sample['count']}/{sample['denominator']}" if sample else "N/A")+"; rate: "+rate)
    for field,label in (("courses_text", "Courses studied (optional context)"),("experience_text", "Projects or volunteering (optional context)")):
        lines += ["", "### "+label, "", _literal(profile[field])]
    stats = current["statistics"]
    lines += ["", "## Sample basis", "", f"F={stats['formal_jobs']}; D={stats['analyzable_descriptions']}" if stats else "No sample available.",
              "Exploratory when F or D <20. D=0 gives N/A, not 0%. No overall score or hiring probability.", "", "## Actions", ""]
    if not current["actions"]: lines.append(current["no_actions_reason"])
    for i,a in enumerate(current["actions"],1):
        lines += [f"### {i}. {a['resource_id']}", "", _literal(a["name"]),
                  "Type / origin: "+a["action_type"]+" / "+a["origin_kind"],
                  "Skills: "+", ".join(a["target_skill_ids"]), "Reason: "+a["reason"],
                  "First step: "+a["first_step"], "Expected output: "+a["expected_output"],
                  "Eligibility: "+a["eligibility_status"]+" (verify before enrolment)",
                  "Conditions: "+json.dumps(a["conditions"],ensure_ascii=False),
                  "Source URL: "+(a["source_refs"]["url"] or "No external URL; PROJECT DESIGNED local material"),
                  "Local/evidence references: "+", ".join(a["source_refs"]["evidence"]),
                  "Resource content hash: "+a["source_refs"]["resource_content_hash"], ""]
        if a["source_refs"]["url"]:
            lines += ["[Resource source]("+a["source_refs"]["url"]+")", ""]
        else:
            for ref in a["source_refs"]["evidence"]:
                if ref.startswith("exercises/"):
                    path = catalog["directory"]/ref
                    lines += ["[Local project material](<"+path.as_posix()+">)", ""]
    return ("\n".join(lines)+"\n").encode("utf-8")
