"""Read fixed inputs without modifying them or performing analysis/network I/O."""

from dataclasses import dataclass, field
from datetime import datetime
import hashlib
import json
from pathlib import Path
from typing import Any

CONTRACT_VERSION = "utsc-contract-1.0"
MODES = ("SYNTHETIC", "HISTORICAL")
VERSION_KEYS = ("cleaning", "classification", "dictionary", "matching", "areas", "statistics")
JOB_TEXT_FIELDS = (
    "job_id", "source_job_id", "title", "employer", "country_code", "province_code",
    "city", "market_area", "description_raw", "description_clean", "source_url",
    "posted_at", "posted_precision", "posted_timezone", "collected_at", "collection_timezone",
)


class ImportFailure(ValueError):
    """A safe, locatable error; never includes the input's free text."""

    def __init__(self, code: str, location: str, message: str):
        self.code = code
        self.location = location
        self.message = message
        super().__init__(f"{code} · {location}: {message}")


@dataclass(frozen=True)
class ImportedBatch:
    manifest: dict[str, Any]
    manifest_sha256: str
    records: tuple[dict[str, Any], ...]
    sources: tuple[dict[str, Any], ...]
    configurations: dict[str, Any] = field(default_factory=dict)


def _require(condition: bool, location: str, message: str, code: str = "SCHEMA_ERROR") -> None:
    if not condition:
        raise ImportFailure(code, location, message)


def _object(value: Any, location: str, required: tuple[str, ...]) -> dict:
    _require(isinstance(value, dict), location, "Expected a JSON object.")
    missing = [key for key in required if key not in value]
    _require(not missing, location, "Missing fields: " + ", ".join(missing))
    return value


def _string(value: Any, location: str) -> str:
    _require(isinstance(value, str) and bool(value.strip()), location, "Expected non-empty text.")
    return value


def _timestamp(value: Any, location: str) -> None:
    _string(value, location)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        _require(parsed.utcoffset() is not None, location, "An explicit timezone is required.")
    except ValueError as exc:
        if isinstance(exc, ImportFailure):
            raise
        raise ImportFailure("SCHEMA_ERROR", location, "Invalid ISO 8601 timestamp.") from None


def _resolve(root: Path, relative: str) -> Path:
    _string(relative, "file path")
    try:
        path = Path(relative)
        _require(not path.is_absolute() and not path.drive, relative, "Use a relative path.", "PATH_REJECTED")
        result = (root / path).resolve()
        _require(result.is_relative_to(root.resolve()), relative, "Path leaves the selected mode directory.", "PATH_REJECTED")
        return result
    except (OSError, ValueError) as exc:
        if isinstance(exc, ImportFailure):
            raise
        raise ImportFailure("PATH_REJECTED", "file path", "Invalid local path.") from None


def _read(root: Path, relative: str, limit: int = 10 * 1024 * 1024) -> bytes:
    path = _resolve(root, relative)
    try:
        _require(path.is_file(), relative, "Fixed data file not found; no data was substituted.", "FILE_MISSING")
        _require(path.stat().st_size <= limit, relative, "File exceeds the local import size limit.", "FILE_TOO_LARGE")
        content = path.read_bytes()
        _require(len(content) <= limit, relative, "File exceeds the local import size limit.", "FILE_TOO_LARGE")
        return content
    except OSError:
        raise ImportFailure("FILE_UNREADABLE", relative, "Cannot read this local file.") from None


def _pairs(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON key")
        result[key] = value
    return result


def _invalid_constant(value: str) -> None:
    raise ValueError("Non-finite JSON number")


def _json(content: bytes, location: str) -> Any:
    try:
        return json.loads(content.decode("utf-8-sig"), object_pairs_hook=_pairs, parse_constant=_invalid_constant)
    except (UnicodeDecodeError, ValueError):
        raise ImportFailure("JSON_INVALID", location, "Invalid UTF-8 JSON or duplicate keys.") from None


def _verified_file(root: Path, reference: dict, location: str) -> tuple[bytes, str]:
    _object(reference, location, ("path", "sha256"))
    path = _string(reference["path"], location + ".path")
    expected = _string(reference["sha256"], location + ".sha256")
    _require(len(expected) == 64 and all(ch in "0123456789abcdef" for ch in expected), location, "Expected a lowercase SHA-256 hash.")
    content = _read(root, path)
    actual = hashlib.sha256(content).hexdigest()
    _require(actual == expected, path, "SHA-256 does not match the manifest.", "HASH_MISMATCH")
    return content, actual


def load_snapshot(data_root: Path, mode: str, manifest_path: str) -> ImportedBatch:
    """Validate and return raw input rows; no cleaning, deduplication, or publication."""
    _require(mode in MODES, "data_mode", "Unsupported mode.", "MODE_MISMATCH")
    root = data_root / mode.lower()
    manifest_bytes = _read(root, manifest_path, 2 * 1024 * 1024)
    manifest = _object(_json(manifest_bytes, manifest_path), manifest_path, (
        "snapshot_id", "data_mode", "contract_version", "input_schema", "source_batches",
        "usage", "collected_start", "collected_end", "collection_timezone", "time_basis",
        "built_at", "posted_range", "versions", "policy", "counts", "quality_ref",
    ))
    _require(manifest["data_mode"] == mode, manifest_path, "Manifest mode differs from the selected mode.", "MODE_MISMATCH")
    _require(manifest["contract_version"] == CONTRACT_VERSION, manifest_path, "Unsupported contract version.")
    _require(manifest["input_schema"] == "utsc-job-input-1", manifest_path, "Unsupported input schema.")
    _string(manifest["snapshot_id"], "snapshot_id")
    for key in ("collected_start", "collected_end", "built_at"):
        _timestamp(manifest[key], key)
    _require(datetime.fromisoformat(manifest["collected_start"].replace("Z", "+00:00")) <= datetime.fromisoformat(manifest["collected_end"].replace("Z", "+00:00")), "collected_end", "Collection interval is reversed.")
    _string(manifest["collection_timezone"], "collection_timezone")
    _require(manifest["time_basis"] == ("FIXTURE" if mode == "SYNTHETIC" else "SOURCE_COLLECTION"), "time_basis", "Incorrect time basis for this mode.", "MODE_MISMATCH")
    usage = _object(manifest["usage"], "usage", ("code_use_status", "data_use_status", "internal_demo_status", "redistribution_status", "evidence_ref", "confirmed_by", "confirmed_date", "attribution"))
    for key in ("code_use_status", "data_use_status", "internal_demo_status", "redistribution_status"):
        _require(usage[key] in ("UNKNOWN", "ALLOWED", "DENIED"), "usage." + key, "Invalid usage status.")
    _require(usage["data_use_status"] == usage["internal_demo_status"] == "ALLOWED", "usage", "Data use and internal demonstration scope must be explicit.", "USAGE_UNCONFIRMED")
    for key in ("evidence_ref", "confirmed_by", "confirmed_date", "attribution"):
        _string(usage[key], "usage." + key)
    _object(manifest["policy"], "policy", ("description_min_chars", "max_age_days", "blocking_reasons", "area_map", "scope"))
    _require(manifest["policy"]["scope"] == "DECLARED_NOT_EXECUTED", "policy.scope", "MVP-01 imports raw data only.")
    versions = _object(manifest["versions"], "versions", VERSION_KEYS)
    configurations = {}
    for key in VERSION_KEYS:
        reference = _object(versions[key], "versions." + key, ("version", "path", "sha256"))
        _string(reference["version"], "versions." + key + ".version")
        content, _ = _verified_file(root, reference, "versions." + key)
        config = _object(_json(content, reference["path"]), reference["path"], ("data_mode", "contract_version"))
        _require(config["data_mode"] == mode, reference["path"], "Configuration mode differs.", "MODE_MISMATCH")
        _require(config["contract_version"] == CONTRACT_VERSION, reference["path"], "Configuration contract differs.")
        configurations[key] = {"version": reference["version"], "sha256": reference["sha256"], "content": config}
    batches = manifest["source_batches"]
    _require(isinstance(batches, list) and bool(batches), "source_batches", "At least one source batch reference is required.")
    records = []
    sources = []
    batch_ids = set()
    for index, batch in enumerate(batches):
        location = f"source_batches[{index}]"
        _object(batch, location, ("batch_id", "provider", "source_ref", "path", "bytes", "sha256", "format"))
        batch_id = _string(batch["batch_id"], location + ".batch_id")
        _require(batch_id not in batch_ids, location, "Duplicate batch_id.")
        batch_ids.add(batch_id)
        _require(batch["format"] == "jsonl", location, "Only fixed JSONL is supported.")
        for key in ("provider", "source_ref"):
            _string(batch[key], location + "." + key)
        content, digest = _verified_file(root, batch, location)
        _require(type(batch["bytes"]) is int and len(content) == batch["bytes"], batch["path"], "Source byte length differs from manifest.")
        for line_number, line in enumerate(content.splitlines(), 1):
            if not line.strip():
                continue
            position = f"{batch['path']}:{line_number}"
            record = _object(_json(line, position), position, ("contract_version", "data_mode", "source_namespace", "batch_id") + JOB_TEXT_FIELDS)
            _require(record["data_mode"] == mode, position, "Record belongs to another mode.", "MODE_MISMATCH")
            _require(record["contract_version"] == CONTRACT_VERSION, position, "Record contract differs.")
            _require(record["batch_id"] == batch_id, position, "Record batch_id differs from source reference.")
            _string(record["source_namespace"], position + ".source_namespace")
            for field in JOB_TEXT_FIELDS:
                _require(record[field] is None or isinstance(record[field], str), position + "." + field, "Expected text or null.")
            job_id = record["job_id"]
            if job_id:
                _require(job_id.startswith("SYN:") == (mode == "SYNTHETIC"), position + ".job_id", "ID namespace conflicts with data mode.", "MODE_MISMATCH")
            raw_ref = {"path": batch["path"], "sha256": digest, "line": line_number, "batch_id": batch_id}
            records.append({"input": record, "raw_ref": raw_ref, "source_occurrences": [dict(raw_ref)]})
        sources.append({**batch, "hash_verified": True})
    counts = _object(manifest["counts"], "counts", ("input_rows", "candidate_jobs", "formal_jobs", "analyzable_descriptions", "pending_jobs", "excluded_jobs"))
    _require(type(counts["input_rows"]) is int and counts["input_rows"] == len(records), "counts.input_rows", "Declared input rows differ from parsed rows.")
    _require(all(counts[key] is None for key in counts if key != "input_rows"), "counts", "Analysis counts must remain null in an MVP-01 input manifest.")
    return ImportedBatch(manifest, hashlib.sha256(manifest_bytes).hexdigest(), tuple(records), tuple(sources), configurations)
