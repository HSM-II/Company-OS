#!/usr/bin/env python3
"""Compile a Company OS extension manifest into an admission descriptor.

This command never signs, stages, or enables an extension.  It only performs
local contract validation and emits the hashes that the governed admission
endpoint will verify again.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

from company_os_sdk.extensions import compile_manifest  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--package", type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    package = args.package.read_bytes() if args.package else None
    print(json.dumps(compile_manifest(manifest, package_bytes=package), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
