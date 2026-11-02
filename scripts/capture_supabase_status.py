"""Capture local Supabase status as redacted QA evidence, never raw output.

Run from the repository root:
    python -X utf8 scripts/capture_supabase_status.py --output artifacts/<new-run>/supabase-status-env.log

The output and adjacent .redaction.json file must both be new paths. The local
stack is only queried; configuration, credentials and database rows are unchanged.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone


REDACTED = "[REDACTED]"
ASSIGNMENT = re.compile(r"^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$")
SENSITIVE_NAME = re.compile(r"(?:KEY|SECRET|PASSWORD|PASSWD|TOKEN|CREDENTIAL)(?:_|$)", re.I)
URL_USERINFO = re.compile(r"([A-Za-z][A-Za-z0-9+.-]*://)([^\s/\"'<>]+)@")
JWT = re.compile(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b")
SUPABASE_KEY = re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b")


def redact_status(raw: str) -> tuple[str, list[str]]:
    """Keep status structure while removing credential assignments and tokens."""
    fields: set[str] = set()
    lines: list[str] = []
    for line in raw.splitlines(keepends=True):
        body = line.rstrip("\r\n")
        ending = line[len(body):]
        match = ASSIGNMENT.match(body)
        if match and SENSITIVE_NAME.search(match.group(2)):
            fields.add(match.group(2))
            value = match.group(4).strip()
            quote = value[0] if value[:1] in ('"', "'") and value[-1:] == value[:1] else ""
            body = "".join(match.group(i) for i in (1, 2, 3)) + quote + REDACTED + quote
        else:
            if URL_USERINFO.search(body):
                fields.add(match.group(2) if match else "URL_USERINFO")
                body = URL_USERINFO.sub(lambda item: item.group(1) + REDACTED + "@", body)
            if JWT.search(body):
                fields.add(match.group(2) if match else "JWT_TOKEN")
                body = JWT.sub(REDACTED, body)
            if SUPABASE_KEY.search(body):
                fields.add(match.group(2) if match else "SUPABASE_KEY")
                body = SUPABASE_KEY.sub(REDACTED, body)
        lines.append(body + ending)
    return "".join(lines), sorted(fields)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="New redacted log path; existing files are refused.")
    args = parser.parse_args()
    output = args.output.resolve()
    metadata_path = output.with_suffix(output.suffix + ".redaction.json")
    if output.exists() or metadata_path.exists():
        print("Refusing to overwrite existing QA evidence.", file=sys.stderr)
        return 2
    executable = shutil.which("npx.cmd") or shutil.which("npx")
    if executable is None:
        print("npx is unavailable; no status evidence was written.", file=sys.stderr)
        return 2
    try:
        result = subprocess.run(
            [executable, "--no-install", "supabase", "status", "-o", "env"],
            cwd=Path(__file__).resolve().parents[1],
            capture_output=True, text=True, encoding="utf-8", errors="replace", check=False,
        )
    except OSError:
        print("Could not query Supabase; no status evidence was written.", file=sys.stderr)
        return 2
    raw = result.stdout + result.stderr
    redacted, fields = redact_status(raw)
    # No raw output is printed, saved, or placed in exception messages.
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("x", encoding="utf-8", newline="") as handle:
        handle.write(redacted)
    metadata = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "command": "npx --no-install supabase status -o env",
        "exit_code": result.returncode,
        "output": str(output),
        "sha256_before_redaction": hashlib.sha256(raw.encode("utf-8")).hexdigest(),
        "sha256_after_redaction": hashlib.sha256(output.read_bytes()).hexdigest(),
        "redacted_fields": fields,
        "raw_output_saved": False,
    }
    with metadata_path.open("x", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"path": str(output), "exit_code": result.returncode, "redacted_fields": fields}))
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
