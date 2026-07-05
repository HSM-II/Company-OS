#!/usr/bin/env python3
from __future__ import annotations

import ast
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TS_KIT = ROOT / "typescript" / "src" / "kit.ts"
TS_INDEX = ROOT / "typescript" / "src" / "index.ts"
PY_KIT = ROOT / "python" / "company_os_sdk" / "kit.py"
PY_INIT = ROOT / "python" / "company_os_sdk" / "__init__.py"
README = ROOT / "README.md"
DOC = ROOT / "docs" / "developer-kit.md"
EXAMPLES = (
    ROOT / "examples" / "typescript_developer_kit.mjs",
    ROOT / "examples" / "python_developer_kit.py",
)

CORE_HOOKS = (
    "before_invocation",
    "before_model_call",
    "after_model_call",
    "before_tool_call",
    "after_tool_call",
    "before_agent_route",
    "after_agent_route",
    "before_bead_transition",
    "after_bead_transition",
)

HOOK_CAPABILITIES = (
    "block",
    "retry",
    "rewriteParams",
    "approvalRequired",
    "receipts",
)

REQUIRED_TS_CONCEPTS = (
    "Agent",
    "CompanyOSHookBus",
    "CompanyOSHookBlockedError",
    "A2AAgentCard",
    "remoteA2AAgentAsTool",
    "a2aAgentCardToExternalAdapter",
    "CompanyOSGraphBuilder",
    "CompanyOSSessionManager",
    "MemorySessionStore",
    "RealtimeVoiceAgent",
    "EvalExperimentGenerator",
    "companyOSToolCatalog",
    "companyOSSkillStoreCatalog",
)

REQUIRED_PY_CONCEPTS = (
    "Agent",
    "CompanyOSHookBus",
    "CompanyOSHookBlockedError",
    "A2AAgentCard",
    "remote_a2a_agent_as_tool",
    "a2a_agent_card_to_external_adapter",
    "CompanyOSGraphBuilder",
    "CompanyOSSessionManager",
    "MemorySessionStore",
    "FileSessionStore",
    "RealtimeVoiceAgent",
    "EvalExperimentGenerator",
    "company_os_tool_catalog",
    "company_os_skill_store_catalog",
)


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    errors: list[str] = []
    ts = read(TS_KIT)
    py = read(PY_KIT)
    py_init = read(PY_INIT)
    readme = read(README)
    doc = read(DOC)

    ast.parse(py)
    require('export * from "./kit.js"' in read(TS_INDEX), "TypeScript SDK must re-export kit.ts", errors)

    for concept in REQUIRED_TS_CONCEPTS:
        require(re.search(rf"\b{re.escape(concept)}\b", ts) is not None, f"TypeScript kit missing {concept}", errors)
    for concept in REQUIRED_PY_CONCEPTS:
        require(re.search(rf"\b{re.escape(concept)}\b", py) is not None, f"Python kit missing {concept}", errors)
        require(re.search(rf'"{re.escape(concept)}"', py_init) is not None, f"Python __all__ missing {concept}", errors)

    for hook in CORE_HOOKS:
        require(hook in ts, f"TypeScript kit missing core hook {hook}", errors)
        require(hook in py, f"Python kit missing core hook {hook}", errors)
        require(hook in doc, f"developer-kit doc missing core hook {hook}", errors)

    for capability in HOOK_CAPABILITIES:
        require(capability in ts, f"TypeScript hook result missing {capability}", errors)
    for capability in ("block", "retry", "rewriteParams", "approvalRequired", "receipts"):
        require(capability in doc, f"developer-kit doc missing hook capability {capability}", errors)

    for phrase in (
        "A2A",
        "external adapter",
        "GraphBuilder",
        "Beads",
        "EvalGrader",
        "CanaryDetection",
        "realtime",
        "Tool/Skill Store",
        "Capability cards",
        "reputation",
        "health check",
        "Attach to agent",
    ):
        require(phrase in doc or phrase in readme, f"docs missing {phrase}", errors)

    for path in EXAMPLES:
        text = read(path)
        for concept in ("CompanyOSGraphBuilder", "EvalExperimentGenerator", "RealtimeVoiceAgent"):
            require(concept in text, f"{path.name} missing {concept}", errors)

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("developer kit contract: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
