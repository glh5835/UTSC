"""Atomic immutable analysis bundles; no raw writes, releases, or current pointer."""

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile

from .analysis import AnalysisFailure, canonical, digest

FILES = {"analysis.json", "jobs.jsonl", "skill_mentions.jsonl", "quality.json", "statistics.json", "rules.json"}


def read_snapshot(directory: Path):
    try:
        manifest = json.loads((directory / "manifest.json").read_text(encoding="utf-8"))
        if set(manifest["files"]) != FILES:
            raise ValueError("Unexpected bundle files")
        values = {}
        for name, reference in manifest["files"].items():
            content = (directory / name).read_bytes()
            if hashlib.sha256(content).hexdigest() != reference["sha256"] or len(content) != reference["bytes"]:
                raise ValueError("File hash differs")
            values[name] = content
        payload = json.loads(values["analysis.json"])
        identifier = payload["data_mode"].lower() + "-analysis-" + digest(payload)[:24]
        if manifest["analysis_snapshot_id"] != identifier or directory.name != identifier or digest(payload) != manifest["payload_sha256"]:
            raise ValueError("Snapshot identity differs")
        if manifest["data_mode"] != payload["data_mode"] or manifest["contract_version"] != payload["contract_version"]:
            raise ValueError("Mode or contract differs")
        for name, key in (("quality.json", "quality"), ("statistics.json", "statistics"), ("rules.json", "rules")):
            if json.loads(values[name]) != payload[key]: raise ValueError("Derived member differs")
        for name, key in (("jobs.jsonl", "jobs"), ("skill_mentions.jsonl", "skill_mentions")):
            if [json.loads(line) for line in values[name].splitlines() if line.strip()] != payload[key]:
                raise ValueError("Derived rows differ")
        return {"directory": str(directory), "manifest": manifest, "payload": payload}
    except (OSError, KeyError, TypeError, ValueError):
        raise AnalysisFailure("SNAPSHOT_CORRUPT: analysis bundle failed validation; existing files were not rewritten.") from None


def save_snapshot(analysis, data_root: Path):
    payload = analysis["payload"]
    identifier = analysis["analysis_snapshot_id"]
    expected = payload["data_mode"].lower() + "-analysis-" + digest(payload)[:24]
    if identifier != expected or not re.fullmatch(r"(?:synthetic|historical)-analysis-[a-f0-9]{24}", identifier):
        raise AnalysisFailure("SNAPSHOT_ID_INVALID: refusing an inconsistent snapshot identity.")
    parent = data_root.resolve() / payload["data_mode"].lower() / "analyses"
    target = parent / identifier
    if target.exists():
        return read_snapshot(target)
    parent.mkdir(parents=True, exist_ok=True)
    staging = Path(tempfile.mkdtemp(prefix=".building-", dir=parent))
    try:
        files = {"analysis.json": canonical(payload)+b"\n",
                 "jobs.jsonl": b"".join(canonical(item)+b"\n" for item in payload["jobs"]),
                 "skill_mentions.jsonl": b"".join(canonical(item)+b"\n" for item in payload["skill_mentions"]),
                 "quality.json": canonical(payload["quality"])+b"\n", "statistics.json": canonical(payload["statistics"])+b"\n",
                 "rules.json": canonical(payload["rules"])+b"\n"}
        manifest = {"analysis_snapshot_id": identifier, "data_mode": payload["data_mode"], "contract_version": payload["contract_version"],
                    "input_snapshot_id": payload["input_snapshot_id"], "input_manifest_sha256": payload["input_manifest_sha256"],
                    "built_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                    "payload_sha256": digest(payload), "publication_status": "NOT_PUBLISHED",
                    "files": {name: {"sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content)} for name, content in files.items()}}
        for name, content in files.items():
            with (staging / name).open("xb") as output: output.write(content)
        (staging / "manifest.json").write_bytes(canonical(manifest)+b"\n")
        # Validate the bytes before exposing a completed directory. Identity is checked
        # after rename because the staging name deliberately differs from the final ID.
        for name, reference in manifest["files"].items():
            if hashlib.sha256((staging/name).read_bytes()).hexdigest() != reference["sha256"]:
                raise AnalysisFailure("SNAPSHOT_WRITE_FAILED: staged file failed verification.")
        try:
            staging.rename(target)
        except FileExistsError:
            return read_snapshot(target)
        return read_snapshot(target)
    except OSError:
        raise AnalysisFailure("SNAPSHOT_WRITE_FAILED: the previous completed snapshot was preserved.") from None
    finally:
        # Only remove this call's own temporary directory, within the checked parent.
        if staging.exists() and staging.resolve().parent == parent.resolve() and staging.name.startswith(".building-"):
            shutil.rmtree(staging)
