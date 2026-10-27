import hashlib
import json
from pathlib import Path
import shutil

import pytest

from utsc_nav.importer import ImportFailure, load_snapshot

PROJECT = Path(__file__).resolve().parents[1]
MANIFEST = "snapshots/syn-mvp01-v1/manifest.json"


@pytest.fixture
def local_data(tmp_path):
    shutil.copytree(PROJECT / "data/synthetic", tmp_path / "synthetic")
    return tmp_path


def read_manifest(root):
    return json.loads((root / "synthetic" / MANIFEST).read_text(encoding="utf-8"))


def write_manifest(root, manifest):
    (root / "synthetic" / MANIFEST).write_text(json.dumps(manifest), encoding="utf-8")


def rewrite_raw(root, data):
    path = root / "synthetic/raw/jobs-v1.jsonl"
    path.write_bytes(data)
    manifest = read_manifest(root)
    manifest["source_batches"][0].update(sha256=hashlib.sha256(data).hexdigest(), bytes=len(data))
    write_manifest(root, manifest)


def fingerprint(root):
    return {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.rglob("*") if p.is_file()}


def test_raw_import_preserves_repeats_missing_and_source_positions(local_data):
    before = fingerprint(local_data)
    batch = load_snapshot(local_data, "SYNTHETIC", MANIFEST)
    assert len(batch.records) == 12
    assert batch.records[5]["input"]["description_raw"] is None
    assert len(batch.records[4]["input"]["description_raw"]) == 99
    assert len(batch.records[9]["input"]["description_raw"]) == 100
    assert batch.records[0]["input"]["job_id"] == batch.records[10]["input"]["job_id"] == batch.records[11]["input"]["job_id"]
    assert batch.records[11]["raw_ref"]["line"] == 12
    assert batch.records[11]["raw_ref"]["sha256"] == batch.sources[0]["sha256"]
    assert batch.manifest["counts"]["formal_jobs"] is None
    assert fingerprint(local_data) == before


@pytest.mark.parametrize("case,code", [
    ("missing_file", "FILE_MISSING"), ("bad_manifest", "JSON_INVALID"),
    ("duplicate_key", "JSON_INVALID"), ("missing_field", "SCHEMA_ERROR"),
    ("manifest_mode", "MODE_MISMATCH"), ("hash", "HASH_MISMATCH"),
    ("bytes", "SCHEMA_ERROR"), ("usage", "USAGE_UNCONFIRMED"),
    ("count", "SCHEMA_ERROR"), ("config_hash", "HASH_MISMATCH"),
])
def test_rejects_bad_manifest_without_writing(local_data, case, code):
    manifest = read_manifest(local_data)
    path = local_data / "synthetic" / MANIFEST
    if case == "missing_file":
        path.unlink()
    elif case == "bad_manifest":
        path.write_text("{broken", encoding="utf-8")
    elif case == "duplicate_key":
        path.write_text('{"data_mode":"SYNTHETIC","data_mode":"HISTORICAL"}', encoding="utf-8")
    else:
        if case == "missing_field": del manifest["snapshot_id"]
        if case == "manifest_mode": manifest["data_mode"] = "HISTORICAL"
        if case == "hash": manifest["source_batches"][0]["sha256"] = "0" * 64
        if case == "bytes": manifest["source_batches"][0]["bytes"] += 1
        if case == "usage": manifest["usage"]["internal_demo_status"] = "UNKNOWN"
        if case == "count": manifest["counts"]["input_rows"] = 999
        if case == "config_hash": manifest["versions"]["dictionary"]["sha256"] = "0" * 64
        write_manifest(local_data, manifest)
    before = fingerprint(local_data)
    with pytest.raises(ImportFailure) as failure:
        load_snapshot(local_data, "SYNTHETIC", MANIFEST)
    assert failure.value.code == code
    assert fingerprint(local_data) == before


@pytest.mark.parametrize("case,code,location", [
    ("bad_jsonl", "JSON_INVALID", "jobs-v1.jsonl:2"),
    ("missing_field", "SCHEMA_ERROR", "jobs-v1.jsonl:1"),
    ("wrong_type", "SCHEMA_ERROR", "description_raw"),
    ("record_mode", "MODE_MISMATCH", "jobs-v1.jsonl:1"),
    ("namespace", "MODE_MISMATCH", "job_id"),
])
def test_rejects_bad_records_with_location(local_data, case, code, location):
    lines = (local_data / "synthetic/raw/jobs-v1.jsonl").read_bytes().splitlines()
    record = json.loads(lines[0])
    if case == "bad_jsonl":
        lines[1] = b"{broken"
    else:
        if case == "missing_field": del record["title"]
        if case == "wrong_type": record["description_raw"] = 42
        if case == "record_mode": record["data_mode"] = "HISTORICAL"
        if case == "namespace": record["job_id"] = "REAL:01"
        lines[0] = json.dumps(record).encode()
    rewrite_raw(local_data, b"\n".join(lines) + b"\n")
    with pytest.raises(ImportFailure) as failure:
        load_snapshot(local_data, "SYNTHETIC", MANIFEST)
    assert failure.value.code == code
    assert location in str(failure.value)


def test_path_cannot_escape_mode_root(local_data):
    with pytest.raises(ImportFailure, match="PATH_REJECTED"):
        load_snapshot(local_data, "SYNTHETIC", "../synthetic/../../outside.json")


def test_missing_historical_data_does_not_fall_back(local_data):
    with pytest.raises(ImportFailure, match="FILE_MISSING"):
        load_snapshot(local_data, "HISTORICAL", MANIFEST)


def test_verified_empty_input_is_distinct_from_failure(local_data):
    rewrite_raw(local_data, b"")
    manifest = read_manifest(local_data)
    manifest["counts"]["input_rows"] = 0
    write_manifest(local_data, manifest)
    batch = load_snapshot(local_data, "SYNTHETIC", MANIFEST)
    assert batch.records == ()
    assert batch.manifest["counts"]["formal_jobs"] is None
