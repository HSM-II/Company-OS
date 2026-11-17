#!/usr/bin/env python3
"""Run SDK contracts, unit tests and examples against an owned local fixture."""

from __future__ import annotations

from http.server import ThreadingHTTPServer
import os
from pathlib import Path
import subprocess
import sys
import threading

from sdk_example_server import Handler


ROOT = Path(__file__).resolve().parents[1]


def run_smoke(command_runner=subprocess.run) -> None:
    env = {**os.environ, "PYTHONPATH": str(ROOT / "python")}

    def run(args: list[str]) -> None:
        command_runner(args, cwd=ROOT, env=env, check=True)

    run([sys.executable, "scripts/check_contract.py"])
    run([sys.executable, "-m", "unittest", "discover", "-s", "scripts", "-p", "test_*.py"])

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, name="sdk-example-fixture")
    thread.start()
    try:
        env["HSM_COMPANY_API_URL"] = f"http://127.0.0.1:{server.server_address[1]}"
        env["HSM_COMPANY_API_TOKEN"] = "fixture-token"
        print(f"sdk fixture listening on {env['HSM_COMPANY_API_URL']}", flush=True)
        run([sys.executable, "examples/python_quickstart.py"])
        run(["npm", "--prefix", "typescript", "install", "--package-lock=false"])
        run(["npm", "--prefix", "typescript", "run", "build"])
        node_tests = [str(path.relative_to(ROOT)) for path in sorted((ROOT / "scripts").glob("*.test.mjs"))]
        run(["node", "--test", *node_tests])
        run(["node", "examples/typescript-quickstart.mjs"])
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


def main() -> int:
    try:
        run_smoke()
    except subprocess.CalledProcessError as error:
        return error.returncode
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
