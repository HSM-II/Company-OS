#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

python3 scripts/check_contract.py

python3 scripts/sdk_example_server.py &
server_pid=$!
trap 'kill "$server_pid" >/dev/null 2>&1 || true' EXIT

for _ in $(seq 1 50); do
  if python3 - <<'PY'
import urllib.request
urllib.request.urlopen("http://127.0.0.1:18765/api/company/health", timeout=0.2).read()
PY
  then
    break
  fi
  sleep 0.1
done

export HSM_COMPANY_API_URL="http://127.0.0.1:18765"
export HSM_COMPANY_API_TOKEN="fixture-token"
PYTHONPATH="$ROOT/python" python3 examples/python_quickstart.py

npm --prefix typescript install --package-lock=false
npm --prefix typescript run build
node examples/typescript-quickstart.mjs
