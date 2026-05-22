#!/usr/bin/env python3
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OPENAPI = ROOT / "openapi" / "company-os.openapi.yaml"
IMPORTANT = ROOT / "contract" / "important-endpoints.txt"
PY_CLIENT = ROOT / "python" / "company_os_sdk" / "client.py"
TS_CLIENT = ROOT / "typescript" / "src" / "index.ts"

PY_METHODS = {
    "GET /api/company/health": "health",
    "GET /api/company/companies": "list_companies",
    "POST /api/company/companies": "create_company",
    "GET /api/company/companies/{company_id}": "get_company",
    "PATCH /api/company/companies/{company_id}": "update_company",
    "DELETE /api/company/companies/{company_id}": "delete_company",
    "GET /api/company/companies/{company_id}/api-catalog": "api_catalog",
    "GET /api/company/companies/{company_id}/dashboard": "dashboard",
    "GET /api/company/companies/{company_id}/board": "board",
    "GET /api/company/companies/{company_id}/board/columns": "board_columns",
    "GET /api/company/companies/{company_id}/board/presence": "board_presence",
    "GET /api/company/companies/{company_id}/goals": "list_goals",
    "POST /api/company/companies/{company_id}/goals": "create_goal",
    "PATCH /api/company/companies/{company_id}/goals/{goal_id}": "update_goal",
    "GET /api/company/companies/{company_id}/tasks": "list_tasks",
    "POST /api/company/companies/{company_id}/tasks": "create_task",
    "DELETE /api/company/companies/{company_id}/tasks/{task_id}": "delete_task",
    "PATCH /api/company/tasks/{task_id}/state": "update_task_state",
    "POST /api/company/tasks/{task_id}/decision": "decide_task",
    "POST /api/company/tasks/{task_id}/requires-human": "set_task_requires_human",
    "GET /api/company/companies/{company_id}/agents": "list_agents",
    "POST /api/company/companies/{company_id}/agents": "create_agent",
    "PATCH /api/company/companies/{company_id}/agents/{agent_id}": "update_agent",
    "DELETE /api/company/companies/{company_id}/agents/{agent_id}": "delete_agent",
    "GET /api/company/companies/{company_id}/memory": "list_memory",
    "POST /api/company/companies/{company_id}/memory": "create_memory",
    "POST /api/company/companies/{company_id}/agent-chat": "agent_chat",
    "GET /api/company/companies/{company_id}/runtime/daemons": "list_runtime_daemons",
    "POST /api/company/companies/{company_id}/runtime/daemons/register": "register_runtime_daemon",
    "POST /api/company/companies/{company_id}/runtime/daemons/{device_id}/heartbeat": "heartbeat_runtime_daemon",
    "POST /api/company/companies/{company_id}/runtime/daemons/{device_id}/deregister": "deregister_runtime_daemon",
    "GET /api/company/companies/{company_id}/dead-star/contributors": "list_dead_star_contributors",
    "POST /api/company/companies/{company_id}/dead-star/contributors": "create_dead_star_contributor",
    "PATCH /api/company/companies/{company_id}/dead-star/contributors/{contributor_id}": "update_dead_star_contributor",
    "POST /api/company/companies/{company_id}/dead-star/contributors/{contributor_id}/review": "review_with_dead_star_contributor",
    "POST /api/company/companies/{company_id}/dead-star/contributors/{contributor_id}/accrue": "accrue_dead_star_royalty",
    "GET /api/company/companies/{company_id}/dead-star/royalty-ledger": "list_dead_star_royalty_ledger",
    "POST /api/company/dead-star/royalty-events/{event_id}/settle": "settle_dead_star_royalty_event",
}

TS_METHODS = {
    key: "".join(part.capitalize() if i else part for i, part in enumerate(value.split("_")))
    for key, value in PY_METHODS.items()
}
TS_METHODS.update({
    "POST /api/company/companies/{company_id}/agent-chat": "agentChat",
})


def parse_openapi_operations() -> set[str]:
    operations: set[str] = set()
    current_path: str | None = None
    for line in OPENAPI.read_text().splitlines():
        path_match = re.match(r"^  (/api/company[^:]+):$", line)
        if path_match:
            current_path = path_match.group(1)
            continue
        method_match = re.match(r"^    (get|post|patch|delete|put):$", line)
        if current_path and method_match:
            operations.add(f"{method_match.group(1).upper()} {current_path}")
    return operations


def parse_important_operations() -> list[str]:
    return [
        line.strip()
        for line in IMPORTANT.read_text().splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def parse_python_methods() -> set[str]:
    tree = ast.parse(PY_CLIENT.read_text())
    methods: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef) and node.name == "CompanyOSClient":
            methods.update(child.name for child in node.body if isinstance(child, ast.FunctionDef))
    return methods


def parse_typescript_methods() -> set[str]:
    text = TS_CLIENT.read_text()
    return set(re.findall(r"^\s{2}([A-Za-z_][A-Za-z0-9_]*)<[^>]*>\(", text, re.MULTILINE))


def main() -> int:
    errors: list[str] = []
    openapi_ops = parse_openapi_operations()
    important_ops = parse_important_operations()

    missing_openapi = sorted(set(important_ops) - openapi_ops)
    if missing_openapi:
        errors.append("OpenAPI missing important operations:\n  " + "\n  ".join(missing_openapi))

    py_methods = parse_python_methods()
    for operation, method in sorted(PY_METHODS.items()):
        if operation in important_ops and method not in py_methods:
            errors.append(f"Python client missing {method} for {operation}")

    ts_methods = parse_typescript_methods()
    for operation, method in sorted(TS_METHODS.items()):
        if operation in important_ops and method not in ts_methods:
            errors.append(f"TypeScript client missing {method} for {operation}")

    if errors:
        print("\n\n".join(errors), file=sys.stderr)
        return 1

    print(f"contract ok: {len(important_ops)} important operations covered")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
