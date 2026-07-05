from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterable, Literal, Optional, Protocol, Union
import json
import re
import time


JsonObject = dict[str, Any]
HookName = Literal[
    "before_invocation",
    "before_model_call",
    "after_model_call",
    "before_tool_call",
    "after_tool_call",
    "before_agent_route",
    "after_agent_route",
    "before_bead_transition",
    "after_bead_transition",
    "after_invocation",
    "before_node_call",
    "after_node_call",
    "before_result",
    "after_result",
    "retry",
    "tool_cancelled",
    "modify_tool_parameters",
]

COMPANY_OS_CORE_HOOKS: tuple[str, ...] = (
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


class CompanyOSHttpClient(Protocol):
    def request(
        self,
        method: str,
        path: str,
        *,
        query: Optional[dict[str, Any]] = None,
        json_body: Any = None,
        headers: Optional[dict[str, str]] = None,
    ) -> JsonObject:
        ...

    def agent_chat(
        self,
        company_id: str,
        *,
        message: str,
        actor: Optional[str] = None,
        thread_id: Optional[str] = None,
    ) -> JsonObject:
        ...

    def create_task(self, company_id: str, *, title: str, **fields: Any) -> JsonObject:
        ...


HookHandler = Callable[[JsonObject], Optional[JsonObject]]


@dataclass
class HookDecision:
    params: JsonObject = field(default_factory=dict)
    metadata: JsonObject = field(default_factory=dict)
    receipts: list[JsonObject] = field(default_factory=list)
    blocked: bool = False
    approval_required: bool = False
    retry: Union[bool, JsonObject] = False
    reasons: list[str] = field(default_factory=list)


class CompanyOSHookBlockedError(RuntimeError):
    def __init__(self, event: JsonObject, decision: HookDecision) -> None:
        suffix = f": {'; '.join(decision.reasons)}" if decision.reasons else ""
        super().__init__(f"Company OS hook blocked {event.get('hook')}{suffix}")
        self.event = event
        self.decision = decision


class CompanyOSHookBus:
    """Lifecycle hook bus for Company OS SDK agents."""

    def __init__(self) -> None:
        self._handlers: dict[str, list[HookHandler]] = {}

    def on(self, hook: HookName, handler: HookHandler) -> "CompanyOSHookBus":
        self._handlers.setdefault(hook, []).append(handler)
        return self

    def emit(self, event: JsonObject) -> HookDecision:
        decision = HookDecision(params=dict(event.get("params") or {}))
        for handler in self._handlers.get(str(event.get("hook")), []):
            decision = merge_hook_decision(decision, handler(event))
        return decision

    def emit_checked(self, event: JsonObject) -> HookDecision:
        decision = self.emit(event)
        if decision.blocked:
            raise CompanyOSHookBlockedError(event, decision)
        return decision

    def transform_tool_parameters(self, event: JsonObject, params: JsonObject) -> JsonObject:
        decision = self.emit_checked({**event, "hook": "modify_tool_parameters", "params": dict(params)})
        return {**params, **decision.params}


@dataclass
class CompanyOSSessionSnapshot:
    session_id: str
    events: list[JsonObject] = field(default_factory=list)
    metadata: JsonObject = field(default_factory=dict)
    schema: str = "hsm.company_os.sdk_session.v1"

    def to_json(self) -> JsonObject:
        return {
            "schema": self.schema,
            "sessionId": self.session_id,
            "events": self.events,
            "metadata": self.metadata,
        }


class SessionStore(Protocol):
    def read(self, session_id: str) -> Optional[CompanyOSSessionSnapshot]:
        ...

    def write(self, snapshot: CompanyOSSessionSnapshot) -> None:
        ...

    def list(self) -> list[str]:
        ...


class MemorySessionStore:
    def __init__(self) -> None:
        self._sessions: dict[str, CompanyOSSessionSnapshot] = {}

    def read(self, session_id: str) -> Optional[CompanyOSSessionSnapshot]:
        return self._sessions.get(session_id)

    def write(self, snapshot: CompanyOSSessionSnapshot) -> None:
        self._sessions[snapshot.session_id] = snapshot

    def list(self) -> list[str]:
        return sorted(self._sessions)


class FileSessionStore:
    """Simple JSON session store for local scripts and notebooks."""

    def __init__(self, directory: Union[str, Path]) -> None:
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)

    def read(self, session_id: str) -> Optional[CompanyOSSessionSnapshot]:
        path = self._path(session_id)
        if not path.exists():
            return None
        data = json.loads(path.read_text(encoding="utf-8"))
        return CompanyOSSessionSnapshot(
            session_id=str(data["sessionId"]),
            events=list(data.get("events") or []),
            metadata=dict(data.get("metadata") or {}),
        )

    def write(self, snapshot: CompanyOSSessionSnapshot) -> None:
        self._path(snapshot.session_id).write_text(json.dumps(snapshot.to_json(), indent=2), encoding="utf-8")

    def list(self) -> list[str]:
        return sorted(path.stem for path in self.directory.glob("*.json"))

    def _path(self, session_id: str) -> Path:
        safe = re.sub(r"[^a-zA-Z0-9_.-]+", "_", session_id)
        return self.directory / f"{safe}.json"


class CompanyOSSessionManager:
    def __init__(self, store: Optional[SessionStore] = None) -> None:
        self.store = store or MemorySessionStore()

    def append(self, session_id: str, event: JsonObject, metadata: Optional[JsonObject] = None) -> CompanyOSSessionSnapshot:
        snapshot = self.store.read(session_id) or CompanyOSSessionSnapshot(
            session_id=session_id,
            metadata=metadata or {},
        )
        snapshot.events.append({**event, "ts": event.get("ts") or utc_now()})
        self.store.write(snapshot)
        return snapshot


@dataclass
class A2AAgentCard:
    name: str
    agent_ref: str
    url: str
    skills: list[JsonObject] = field(default_factory=list)
    metadata: JsonObject = field(default_factory=dict)
    schema: str = "hsm.company_os.a2a_agent_card.v1"
    protocol: str = "a2a"

    def to_json(self) -> JsonObject:
        return {
            "schema": self.schema,
            "protocol": self.protocol,
            "name": self.name,
            "agentRef": self.agent_ref,
            "url": self.url,
            "capabilities": {
                "streaming": True,
                "agentAsTool": True,
                "receipts": True,
                "approvals": True,
                "memory": True,
            },
            "skills": self.skills,
            "metadata": self.metadata,
        }


def remote_a2a_agent_as_tool(card: A2AAgentCard) -> JsonObject:
    return {
        "name": f"a2a_{slugify(card.agent_ref)}",
        "title": f"{card.name} remote agent",
        "category": "a2a",
        "description": "Remote A2A agent exposed as a Company OS governed tool.",
        "permissions": ["network", "agent.invoke"],
        "receipts": ["a2a_call_started", "a2a_policy_decision", "a2a_call_completed"],
        "inputSchema": {
            "type": "object",
            "properties": {"message": {"type": "string"}, "context": {"type": "object"}},
            "required": ["message"],
        },
        "capabilityCard": {
            "summary": "Calls a remote A2A agent through Company OS policy, reputation, and ledger.",
            "riskLevel": "medium",
            "setup": "Install the external adapter card, verify health, then attach it to an agent.",
        },
        "reputationScore": float(card.metadata.get("reputation_score", 0.5)),
        "installCount": int(card.metadata.get("install_count", 0)),
        "healthCheck": {"endpoint": card.url, "expectedReceipt": "a2a_call_completed"},
        "attachToAgent": {"supported": True, "requiresApproval": True},
        "metadata": {"card": card.to_json()},
    }


def a2a_agent_card_to_external_adapter(
    card: A2AAgentCard,
    *,
    mode: Literal["noop", "webhook", "bridged"] = "bridged",
    auth: Literal["local_agent_jwt", "bearer", "none"] = "local_agent_jwt",
) -> JsonObject:
    return {
        "schema": "hsm.company_os.external_adapter_manifest.v1",
        "adapter_type": "external",
        "mode": mode,
        "name": card.name,
        "agent_ref": card.agent_ref,
        "endpoint": card.url,
        "capabilities": card.to_json()["capabilities"],
        "auth": {"kind": auth, "audience": card.agent_ref},
        "policy": {
            "route_through_policy": True,
            "route_through_reputation": True,
            "write_to_ledger": True,
        },
        "metadata": {"card": card.to_json()},
    }


class Agent:
    """Strands-style Agent(...) facade backed by Company OS AgentChat."""

    def __init__(
        self,
        *,
        client: CompanyOSHttpClient,
        company_id: str,
        agent_ref: str,
        name: Optional[str] = None,
        actor: str = "sdk",
        instructions: Optional[str] = None,
        tools: Iterable[str] = (),
        model: Optional[str] = None,
        hooks: Optional[CompanyOSHookBus] = None,
        session_manager: Optional[CompanyOSSessionManager] = None,
    ) -> None:
        self.client = client
        self.company_id = company_id
        self.agent_ref = agent_ref
        self.name = name or agent_ref
        self.actor = actor
        self.instructions = instructions
        self.tools = list(tools)
        self.model = model
        self.hooks = hooks or CompanyOSHookBus()
        self.session_manager = session_manager

    def run(
        self,
        prompt: str,
        *,
        thread_id: Optional[str] = None,
        run_id: Optional[str] = None,
        actor: Optional[str] = None,
    ) -> JsonObject:
        run_id = run_id or f"sdk-{int(time.time() * 1000)}"
        run_params: JsonObject = {"input": prompt, "actor": actor or self.actor, "thread_id": thread_id}
        receipts: list[JsonObject] = []

        run_params = self._apply_hook(
            "before_invocation",
            {"input": prompt, "tools": self.tools, "instructions": self.instructions or ""},
            run_params,
            run_id,
            receipts,
        )
        self._emit_checked("before_agent_route", {"route": "company_agent_chat", "agentRef": self.agent_ref}, run_id, receipts)
        self._emit_checked("before_model_call", {"input": run_params.get("input"), "model": self.model}, run_id, receipts)
        tool_params = self._apply_hook(
            "before_tool_call",
            {"tool_name": "company_agent_chat", "params": {"message": run_params.get("input"), "actor": run_params.get("actor")}},
            {"message": run_params.get("input"), "actor": run_params.get("actor"), "thread_id": run_params.get("thread_id")},
            run_id,
            receipts,
        )
        tool_params = self.hooks.transform_tool_parameters(
            self._event("modify_tool_parameters", {"tool_name": "company_agent_chat"}, run_id=run_id, params=tool_params),
            tool_params,
        )

        response = self.client.agent_chat(
            self.company_id,
            message=str(tool_params.get("message") or prompt),
            actor=str(tool_params.get("actor") or self.actor),
            thread_id=tool_params.get("thread_id") if isinstance(tool_params.get("thread_id"), str) else thread_id,
        )
        self._emit_checked("after_tool_call", {"tool_name": "company_agent_chat", "response": response}, run_id, receipts)
        self._emit_checked("after_agent_route", {"response": response}, run_id, receipts)
        self._emit_checked("after_model_call", {"response": response}, run_id, receipts)
        self._emit_checked("before_result", {"response": response}, run_id, receipts)
        if self.session_manager:
            self.session_manager.append(
                thread_id or str(response.get("thread_id") or "default"),
                {"type": "agent_result", "agentRef": self.agent_ref, "input": str(run_params.get("input")), "response": response, "receipts": receipts},
            )
        self._emit_checked("after_result", {"response": response}, run_id, receipts)
        self._emit_checked("after_invocation", {"response": response}, run_id, receipts)
        return response

    def to_agent_card(self, base_url: str) -> A2AAgentCard:
        return A2AAgentCard(
            name=self.name,
            agent_ref=self.agent_ref,
            url=f"{base_url.rstrip('/')}/api/company/companies/{self.company_id}/agent-chat",
            skills=[{"name": tool} for tool in self.tools],
            metadata={"companyId": self.company_id, "model": self.model},
        )

    def _apply_hook(self, hook: HookName, payload: JsonObject, params: JsonObject, run_id: str, receipts: list[JsonObject]) -> JsonObject:
        decision = self._emit_checked(hook, payload, run_id, receipts, params=params)
        return {**params, **decision.params}

    def _emit_checked(
        self,
        hook: HookName,
        payload: JsonObject,
        run_id: str,
        receipts: list[JsonObject],
        *,
        params: Optional[JsonObject] = None,
    ) -> HookDecision:
        decision = self.hooks.emit_checked(self._event(hook, payload, run_id=run_id, params=params))
        receipts.extend(decision.receipts)
        return decision

    def _event(self, hook: HookName, payload: JsonObject, *, run_id: Optional[str] = None, params: Optional[JsonObject] = None) -> JsonObject:
        return {
            "schema": "hsm.company_os.sdk_hook_event.v1",
            "hook": hook,
            "companyId": self.company_id,
            "agentRef": self.agent_ref,
            "runId": run_id,
            "model": self.model,
            "params": params,
            "payload": payload,
        }


class CompanyOSGraphBuilder:
    def __init__(self, graph_id: str) -> None:
        self.id = graph_id
        self.nodes: dict[str, JsonObject] = {}
        self.edges: list[JsonObject] = []
        self.state: JsonObject = {}

    def agent(
        self,
        node_id: str,
        *,
        title: Optional[str] = None,
        agent_ref: Optional[str] = None,
        prompt: Optional[str] = None,
        **metadata: Any,
    ) -> "CompanyOSGraphBuilder":
        return self.node(node_id, "agent", title or node_id, agentRef=agent_ref or node_id, prompt=prompt, metadata=metadata)

    def task(self, node_id: str, title: str, *, prompt: Optional[str] = None, **metadata: Any) -> "CompanyOSGraphBuilder":
        return self.node(node_id, "task", title, prompt=prompt, metadata=metadata)

    def workflow(self, node_id: str, title: str, **metadata: Any) -> "CompanyOSGraphBuilder":
        return self.node(node_id, "workflow", title, metadata=metadata)

    def swarm(self, node_id: str, title: str, **metadata: Any) -> "CompanyOSGraphBuilder":
        return self.node(node_id, "swarm", title, metadata=metadata)

    def node(self, node_id: str, kind: str, title: str, **fields: Any) -> "CompanyOSGraphBuilder":
        self.nodes[node_id] = {"id": node_id, "kind": kind, "title": title, **{k: v for k, v in fields.items() if v is not None}}
        return self

    def edge(self, from_node: str, to_node: str, *, condition: Optional[str] = None, **metadata: Any) -> "CompanyOSGraphBuilder":
        self.edges.append({"from": from_node, "to": to_node, "condition": condition, "metadata": metadata})
        return self

    def shared_state(self, state: JsonObject) -> "CompanyOSGraphBuilder":
        self.state.update(state)
        return self

    def to_json(self) -> JsonObject:
        return {
            "schema": "hsm.company_os.sdk_graph.v1",
            "id": self.id,
            "nodes": list(self.nodes.values()),
            "edges": self.edges,
            "shared_state": self.state,
        }

    def run(
        self,
        client: CompanyOSHttpClient,
        company_id: str,
        *,
        actor: str = "sdk",
        hooks: Optional[CompanyOSHookBus] = None,
        run_id: Optional[str] = None,
    ) -> JsonObject:
        hook_bus = hooks or CompanyOSHookBus()
        run_id = run_id or f"sdk-graph-{int(time.time() * 1000)}"
        created: list[JsonObject] = []
        task_by_node: dict[str, str] = {}
        for node_id, node in self.nodes.items():
            if node.get("kind") not in {"agent", "task", "workflow", "swarm", "approval"}:
                continue
            incoming = [edge for edge in self.edges if edge["to"] == node_id]
            dependencies = [task_by_node[edge["from"]] for edge in incoming if edge["from"] in task_by_node]
            hook_bus.emit_checked(graph_event("before_agent_route", company_id, run_id, self.id, node, {"node": node, "incoming_edges": incoming}))
            params: JsonObject = {
                "title": str(node["title"]),
                "specification": str(node.get("prompt") or f"Run {node.get('kind')} node {node_id}"),
                "owner_persona": node.get("agentRef"),
                "depends_on_task_ids": dependencies,
                "capability_refs": [{"kind": "sdk_graph", "ref": self.id}, {"kind": "graph_node", "ref": node_id}],
                "metadata": {
                    "schema": "hsm.company_os.sdk_graph_node.v1",
                    "graph_id": self.id,
                    "node": node,
                    "incoming_edges": incoming,
                    "shared_state": self.state,
                    "actor": actor,
                },
            }
            before = hook_bus.emit_checked(
                graph_event("before_bead_transition", company_id, run_id, self.id, node, {"transition": "create", "params": params}, params)
            )
            params = {**params, **before.params}
            response = client.create_task(company_id, **params)
            task = response.get("task") if isinstance(response.get("task"), dict) else response
            if isinstance(task, dict) and isinstance(task.get("id"), str):
                task_by_node[node_id] = str(task["id"])
            hook_bus.emit_checked(graph_event("after_bead_transition", company_id, run_id, self.id, node, {"transition": "create", "response": response}))
            hook_bus.emit_checked(graph_event("after_agent_route", company_id, run_id, self.id, node, {"node": node, "response": response}))
            created.append(response)
        return {"schema": "hsm.company_os.sdk_graph_run.v1", "graph_id": self.id, "created_count": len(created), "tasks": created}


@dataclass(frozen=True)
class RealtimeVoiceAgent:
    provider: Literal["fluidvoice", "openai_realtime", "gemini_live", "nova_sonic"]
    company_id: str
    agent_ref: str
    model: Optional[str] = None
    allow_interruptions: bool = True
    tool_calling: bool = True
    approval_mode: Literal["auto", "approval_required"] = "approval_required"

    def describe(self) -> JsonObject:
        return {
            "schema": "hsm.company_os.realtime_voice_agent.v1",
            "provider": self.provider,
            "companyId": self.company_id,
            "agentRef": self.agent_ref,
            "model": self.model,
            "transport": "local" if self.provider == "fluidvoice" else "provider_native_realtime",
            "capabilities": {
                "microphone": True,
                "speaker": True,
                "live_transcript": True,
                "interruptions": self.allow_interruptions,
                "tool_calling": self.tool_calling,
                "approval_pause": self.approval_mode == "approval_required",
                "receipts": True,
            },
            "hook_order": list(COMPANY_OS_CORE_HOOKS),
        }


class EvalExperimentGenerator:
    @staticmethod
    def from_agent(agent: Agent, prompts: Iterable[str]) -> JsonObject:
        return {
            "schema": "hsm.company_os.sdk_eval_experiment.v1",
            "name": f"{agent.agent_ref}-sdk-eval",
            "agentRef": agent.agent_ref,
            "companyId": agent.company_id,
            "metrics": default_eval_metrics(),
            "cases": [
                {"id": f"case-{i + 1}", "prompt": prompt, "metadata": {"tools": agent.tools, "model": agent.model}}
                for i, prompt in enumerate(prompts)
            ],
            "generatedFrom": {
                "source": "company_os_sdk_agent",
                "tools": agent.tools,
                "instructions_present": bool(agent.instructions),
            },
        }

    @staticmethod
    def from_company_signals(
        *,
        company_id: str,
        agent_ref: str,
        available_tools: Iterable[JsonObject] = (),
        agent_roles: Iterable[JsonObject] = (),
        company_policies: Iterable[JsonObject] = (),
        past_failures: Iterable[JsonObject] = (),
        corrections: Iterable[JsonObject] = (),
        beads_history: Iterable[JsonObject] = (),
    ) -> JsonObject:
        available_tools_list = list(available_tools)
        agent_roles_list = list(agent_roles)
        company_policies_list = list(company_policies)
        past_failures_list = list(past_failures)
        corrections_list = list(corrections)
        beads_history_list = list(beads_history)
        cases: list[JsonObject] = []
        for tool_def in available_tools_list:
            cases.append(
                {
                    "id": f"tool-{slugify(str(tool_def.get('name', 'tool')))}",
                    "prompt": f"Use or reject {tool_def.get('name')} correctly for a permission-sensitive task.",
                    "metadata": {"source": "available_tools", "tool": tool_def},
                }
            )
        for role in agent_roles_list:
            cases.append(
                {
                    "id": f"role-{slugify(str(role.get('ref', 'role')))}",
                    "prompt": f"Route work to {role.get('ref')} only when responsibilities match the request.",
                    "metadata": {"source": "agent_roles", "role": role},
                }
            )
        for policy in company_policies_list:
            cases.append(
                {
                    "id": f"policy-{slugify(str(policy.get('id', 'policy')))}",
                    "prompt": f"Apply policy \"{policy.get('title')}\" and pause for approval when required.",
                    "metadata": {"source": "company_policies", "policy": policy},
                }
            )
        for failure in past_failures_list:
            cases.append(
                {
                    "id": f"failure-{slugify(str(failure.get('id', 'failure')))}",
                    "prompt": str(failure.get("prompt") or f"Avoid repeating this past failure: {failure.get('summary')}"),
                    "metadata": {"source": "past_failures", "failure": failure},
                }
            )
        for correction in corrections_list:
            cases.append(
                {
                    "id": f"correction-{slugify(str(correction.get('id', 'correction')))}",
                    "prompt": str(correction.get("prompt") or f"Honor this user correction: {correction.get('summary')}"),
                    "metadata": {"source": "corrections", "correction": correction},
                }
            )
        for bead in beads_history_list:
            cases.append(
                {
                    "id": f"bead-{slugify(str(bead.get('id', 'bead')))}",
                    "prompt": f"Continue or triage bead \"{bead.get('title')}\" with correct evidence and owner.",
                    "metadata": {"source": "beads_history", "bead": bead},
                }
            )
        return {
            "schema": "hsm.company_os.sdk_eval_experiment.v1",
            "name": f"{agent_ref}-signals-eval",
            "agentRef": agent_ref,
            "companyId": company_id,
            "metrics": default_eval_metrics(),
            "cases": cases,
            "generatedFrom": {
                "source": "company_os_signals",
                "available_tools": len(available_tools_list),
                "agent_roles": len(agent_roles_list),
                "company_policies": len(company_policies_list),
                "past_failures": len(past_failures_list),
                "corrections": len(corrections_list),
                "beads_history": len(beads_history_list),
            },
        }


def company_os_tool_catalog() -> list[JsonObject]:
    return [
        _tool("company_memory_search", "Company memory search", "memory", "Retrieve shared company memory with evidence receipts.", ["memory.read"], "low"),
        _tool("company_create_task", "Create Company OS task", "graph", "Create a Beads-backed task in the company ledger.", ["tasks.write"], "medium"),
        _tool("company_web_search", "Governed web search", "web", "Search through a bounded Company OS web adapter.", ["network"], "medium"),
        _tool("company_sql_query", "Company SQL query", "code", "Run governed SQL against approved company data.", ["data.read"], "high"),
        _tool("company_sandbox_exec", "Sandbox command", "shell", "Run risky tool work in a policy-selected sandbox.", ["sandbox.exec"], "high"),
        _tool("company_browser_snapshot_capture", "Browser snapshot", "browser", "Capture a governed browser/workflow snapshot.", ["browser.read"], "medium"),
        _tool("company_dynamic_workflow_run", "Dynamic workflow plan", "graph", "Compile a goal into an auditable workflow plan.", ["tasks.write", "memory.write"], "medium"),
        _tool("company_persona_sidecar_status", "Sidecar dependency status", "mcp", "Check br/bv/cass/asupersync sidecar readiness.", ["runtime.read"], "low"),
    ]


def company_os_skill_store_catalog() -> list[JsonObject]:
    return [
        _tool("skill_trace_to_prompt_delta", "Trace to prompt proposal", "skill", "Analyze receipts and propose a review-gated prompt delta.", ["memory.read", "skills.write"], "medium"),
        _tool("skill_agent_role_contract", "Role instruction contract", "skill", "Attach role-owned instructions and scope to an agent.", ["agents.write", "skills.read"], "medium"),
    ]


def _tool(name: str, title: str, category: str, description: str, permissions: list[str], risk_level: str) -> JsonObject:
    return {
        "name": name,
        "title": title,
        "category": category,
        "description": description,
        "permissions": permissions,
        "receipts": ["tool_call_started", "tool_call_completed", "policy_decision"],
        "inputSchema": {"type": "object", "additionalProperties": True},
        "capabilityCard": {"summary": description, "riskLevel": risk_level, "setup": "Install, run health check, then attach to one or more agents."},
        "reputationScore": 0.65 if risk_level == "high" else 0.85,
        "installCount": 0,
        "healthCheck": {"expectedReceipt": "tool_call_completed"},
        "attachToAgent": {"supported": True, "requiresApproval": risk_level != "low"},
    }


def graph_event(
    hook: HookName,
    company_id: str,
    run_id: str,
    graph_id: str,
    node: JsonObject,
    payload: JsonObject,
    params: Optional[JsonObject] = None,
) -> JsonObject:
    return {
        "schema": "hsm.company_os.sdk_hook_event.v1",
        "hook": hook,
        "companyId": company_id,
        "runId": run_id,
        "nodeId": node.get("id"),
        "agentRef": node.get("agentRef"),
        "params": params,
        "payload": {"graph_id": graph_id, **payload},
    }


def merge_hook_decision(current: HookDecision, result: Optional[JsonObject]) -> HookDecision:
    if not result:
        return current
    params = {**current.params, **dict(result.get("params") or {}), **dict(result.get("rewriteParams") or {})}
    metadata = {**current.metadata, **dict(result.get("metadata") or {})}
    receipts = [*current.receipts, *list(result.get("receipts") or [])]
    reasons = [*current.reasons]
    if result.get("reason"):
        reasons.append(str(result["reason"]))
    return HookDecision(
        params=params,
        metadata=metadata,
        receipts=receipts,
        blocked=current.blocked or bool(result.get("block") or result.get("cancel")),
        approval_required=current.approval_required or bool(result.get("approvalRequired") or result.get("requireApproval")),
        retry=normalize_retry(current.retry, result.get("retry")),
        reasons=reasons,
    )


def normalize_retry(existing: Union[bool, JsonObject], incoming: Any) -> Union[bool, JsonObject]:
    if not incoming:
        return existing
    next_retry = {"maxAttempts": 2, "delayMs": 0} if incoming is True else dict(incoming)
    if not existing:
        return next_retry
    existing_retry = existing if isinstance(existing, dict) else {"maxAttempts": 2, "delayMs": 0}
    return {
        "maxAttempts": max(int(existing_retry.get("maxAttempts", 1)), int(next_retry.get("maxAttempts", 1))),
        "delayMs": max(int(existing_retry.get("delayMs", 0)), int(next_retry.get("delayMs", 0))),
        "reason": next_retry.get("reason") or existing_retry.get("reason"),
    }


def default_eval_metrics() -> list[str]:
    return [
        "output_quality",
        "trajectory_completeness",
        "interaction_helpfulness",
        "faithfulness",
        "goal_success",
        "tool_selection_accuracy",
        "tool_parameter_accuracy",
    ]


def slugify(value: str) -> str:
    return re.sub(r"[^a-zA-Z0-9_]+", "_", value).strip("_") or "item"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


__all__ = [
    "A2AAgentCard",
    "Agent",
    "COMPANY_OS_CORE_HOOKS",
    "CompanyOSGraphBuilder",
    "CompanyOSHookBlockedError",
    "CompanyOSHookBus",
    "CompanyOSSessionManager",
    "CompanyOSSessionSnapshot",
    "EvalExperimentGenerator",
    "FileSessionStore",
    "MemorySessionStore",
    "RealtimeVoiceAgent",
    "a2a_agent_card_to_external_adapter",
    "company_os_skill_store_catalog",
    "company_os_tool_catalog",
    "remote_a2a_agent_as_tool",
]
