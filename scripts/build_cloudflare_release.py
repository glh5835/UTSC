"""Verify an approved artifact, then build the full account website from it."""

import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zipfile import BadZipFile, ZipFile


ROOT = Path(__file__).resolve().parents[1]
MAX_ARCHIVE = 64 * 1024 * 1024
MAX_PACKAGE = 64 * 1024 * 1024
PIN = ROOT / "web/deployment/production-release.json"
DATA_REPOSITORY = "wangzhuxirou-svg/Canadian-Early-Career-Data-Analytics-Job-Market"


def require(condition, message):
    if not condition:
        raise ValueError(message)


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, stream, code, message, headers, url):
        return None


def matches(value, pattern):
    return isinstance(value, str) and re.fullmatch(pattern, value) is not None


def unpack_verified_archive(archive, pin, directory):
    require(len(archive) <= MAX_ARCHIVE, "Release ZIP exceeds the size limit")
    require(hashlib.sha256(archive).hexdigest() == pin["archiveSha256"], "Release ZIP SHA-256 mismatch")
    with ZipFile(io.BytesIO(archive)) as release:
        entries = release.infolist()
        names = [item.filename for item in entries]
        require(0 < len(entries) <= 30 and len(names) == len(set(names)), "Unexpected or duplicate ZIP entries")
        require(sum(item.file_size for item in entries) <= MAX_PACKAGE, "Extracted package exceeds the size limit")
        for item in entries:
            mode = stat.S_IFMT(item.external_attr >> 16)
            require(mode in (0, stat.S_IFREG) and not item.is_dir() and
                    matches(item.filename, r"(?:[a-z][a-z0-9_.-]*\.json|SHA256SUMS\.txt)"),
                    "ZIP must contain flat, regular D7 files only")
        require("SHA256SUMS.txt" in names, "ZIP is missing the checksum inventory")
        inventory = release.read("SHA256SUMS.txt")
        require(hashlib.sha256(inventory).hexdigest() == pin["inventorySha256"], "Checksum inventory SHA-256 mismatch")
        for item in entries:
            with (directory / item.filename).open("xb") as entry:
                entry.write(release.read(item))


def read_download(opener, request):
    with opener.open(request, timeout=60) as response:
        return response.read(MAX_ARCHIVE + 1)


def fetch_github_release(asset_id):
    require(type(asset_id) is int and 0 < asset_id <= 2**53 - 1, "Invalid approved GitHub Release asset ID")
    opener = build_opener(NoRedirect())
    request = Request(f"https://api.github.com/repos/{DATA_REPOSITORY}/releases/assets/{asset_id}", headers={
        "Accept": "application/octet-stream", "X-GitHub-Api-Version": "2026-03-10",
    })
    try:
        return read_download(opener, request)
    except HTTPError as exc:
        destination = urlsplit(exc.headers.get("Location", ""))
        require(exc.code == 302 and destination.scheme == "https" and destination.netloc in {
            "release-assets.githubusercontent.com", "objects.githubusercontent.com",
        }, "Approved GitHub Release asset was unavailable or redirected outside its download hosts")
    return read_download(opener, Request(destination.geturl()))


def fetch_controlled_release(pin, environment):
    origin = urlsplit(environment.get("UTSC_RELEASE_ARTIFACT_ORIGIN", ""))
    token = environment.get("UTSC_RELEASE_ARTIFACT_TOKEN", "")
    require(origin.scheme == "https" and origin.hostname and origin.path in ("", "/") and
            not (origin.username or origin.password or origin.query or origin.fragment),
            "Configure the authorized HTTPS release artifact origin")
    require(matches(token, r"[!-~]+"), "Configure the artifact-read token as a build secret")
    path = f"/approved/{pin['datasetVersion']}/{pin['inventorySha256']}.zip"
    request = Request(f"https://{origin.netloc}{path}", headers={
        "Authorization": f"Bearer {token}", "Accept": "application/zip",
    })
    return read_download(build_opener(NoRedirect()), request)


def fetch_release(pin, environment):
    try:
        if "githubReleaseAssetId" in pin:
            return fetch_github_release(pin["githubReleaseAssetId"])
        return fetch_controlled_release(pin, environment)
    except (URLError, TimeoutError):
        raise ValueError("Approved release ZIP could not be downloaded from the configured origin") from None


def build(target, local_zip):
    require(PIN.is_file(), "An approved release pin is required before a Cloudflare build")
    pin = json.loads(PIN.read_text(encoding="utf-8"))
    require(isinstance(pin, dict) and matches(pin.get("datasetVersion"), r"[1-9][0-9]*\.[0-9]+\.[0-9]+") and
            all(matches(pin.get(name), r"[0-9a-f]{64}") for name in ("archiveSha256", "inventorySha256")),
            "The release pin must contain the dataset version and archive and inventory digests")
    environment = dict(os.environ)
    origins = pin.get("supabaseOrigins")
    require(isinstance(origins, dict) and set(origins) == {"production", "staging"} and
            all(matches(origin, r"https://[a-z0-9]{20}\.supabase\.co") for origin in origins.values()) and
            origins["production"] != origins["staging"], "Pin distinct production and staging Supabase project origins")
    supabase_origin = origins[target]
    require(environment.get("VITE_SUPABASE_URL", "").rstrip("/") == supabase_origin,
            "The Supabase URL does not match the selected deployment target")
    require(matches(environment.get("VITE_SUPABASE_PUBLISHABLE_KEY"), r"sb_publishable_[a-zA-Z0-9_-]+"),
            "Configure the selected target's Supabase publishable key")
    commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    if environment.get("WORKERS_CI") == "1":
        require(local_zip is None and environment.get("WORKERS_CI_COMMIT_SHA") == commit and
                environment.get("WORKERS_CI_BRANCH") == f"release/{target}",
                "Workers Builds must use the pinned commit on the matching protected release branch")
    archive = fetch_release(pin, environment) if local_zip is None else local_zip.read_bytes()
    environment.pop("UTSC_RELEASE_ARTIFACT_TOKEN", None)
    environment.pop("UTSC_RELEASE_ARTIFACT_ORIGIN", None)
    environment.update(UTSC_DEPLOY_TARGET=target, UTSC_BUILD_COMMIT=commit)
    npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
    require(npm is not None, "npm is required to build the website")
    with tempfile.TemporaryDirectory(prefix="utsc-approved-release-") as directory:
        unpack_verified_archive(archive, pin, Path(directory))
        environment["UTSC_RELEASE_PACKAGE_DIR"] = directory
        subprocess.run([npm, "--prefix", "web", "ci"], cwd=ROOT, env=environment, check=True)
        subprocess.run([npm, "run", "build:production"], cwd=ROOT, env=environment, check=True)
    print(f"Cloudflare {target} build passed for {commit} and the approved inventory pin.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("target", choices=["staging", "production"])
    parser.add_argument("--local-zip", type=Path, help="Rehearse on a local copy of the approved ZIP")
    args = parser.parse_args()
    try:
        build(args.target, args.local_zip)
    except (ValueError, OSError, RuntimeError, subprocess.SubprocessError, BadZipFile) as exc:
        print(f"Cloudflare build refused: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
