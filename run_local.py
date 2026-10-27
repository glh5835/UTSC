"""Start the prototype on loopback only, without changing user configuration."""

import argparse
import os
from pathlib import Path
import socket
import subprocess
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Start UTSC Career Navigator locally.")
    parser.add_argument("--port", type=int, default=8510)
    parser.add_argument("--maintenance", action="store_true", help="Enable public local editing; not account security.")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("port must be between 1024 and 65535")
    root = Path(__file__).resolve().parent
    try:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", args.port))
    except OSError:
        print(f"Port {args.port} is already in use. Choose another --port; no process was stopped.", file=sys.stderr)
        return 1
    env = dict(os.environ)
    env["STREAMLIT_BROWSER_GATHER_USAGE_STATS"] = "false"
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["UTSC_MAINTENANCE"] = "1" if args.maintenance else "0"
    print(f"UTSC Career Navigator · MVP-07\nOpen http://127.0.0.1:{args.port}\nMaintenance: {args.maintenance} (not account security)\nCtrl+C stops the local server.", flush=True)
    command = [sys.executable, "-m", "streamlit", "run", str(root / "app.py"),
               "--server.address=127.0.0.1", f"--server.port={args.port}",
               "--server.headless=true", "--browser.gatherUsageStats=false",
               "--server.fileWatcherType=none", "--server.enableStaticServing=false"]
    try:
        return subprocess.call(command, cwd=root, env=env)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
