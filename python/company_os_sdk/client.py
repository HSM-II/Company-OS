from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any, Mapping


JsonObject = dict[str, Any]
AGENT_DEFINITION_SCHEMA = "hsm.company_os.agent_definition.v1"


class CompanyOSAPIError(RuntimeError):
    """Raised when the Company OS API returns a non-2xx response."""

    def __init__(self, status: int, message: str, body: Any | None = None) -> None:
        super().__init__(f"Company OS API error {status}: {message}")
        self.status = status
        self.body = body


@dataclass(frozen=True)
class CompanyOSClient:
    base_url: str
    token: str | None = None
    timeout: float = 30.0

    @classmethod
    def from_env(cls) -> "CompanyOSClient":
        base_url = os.environ.get("HSM_COMPANY_API_URL", "http://localhost:8765")
        token = os.environ.get("HSM_COMPANY_API_TOKEN")
        return cls(base_url=base_url, token=token)

    def request(
        self,
        method: str,
        path: str,
        *,
        query: Mapping[str, Any] | None = None,
        json_body: Any | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> Any:
        url = self._url(path, query)
        body: bytes | None = None
        req_headers = {"Accept": "application/json"}
        if self.token:
            req_headers["Authorization"] = f"Bearer {self.token}"
        if json_body is not None:
            body = json.dumps(json_body).encode("utf-8")
            req_headers["Content-Type"] = "application/json"
        if headers:
            req_headers.update(headers)

        req = urllib.request.Request(url, data=body, headers=req_headers, method=method.upper())
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                raw = resp.read()
                if not raw:
                    return None
                content_type = resp.headers.get("content-type", "")
                if "application/json" in content_type:
                    return json.loads(raw.decode("utf-8"))
                return raw.decode("utf-8")
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            parsed: Any | None = None
            message = exc.reason or "HTTP error"
            if raw:
                try:
                    parsed = json.loads(raw.decode("utf-8"))
                    message = str(parsed.get("error") or parsed.get("message") or message)
                except Exception:
                    message = raw.decode("utf-8", errors="replace")
            raise CompanyOSAPIError(exc.code, message, parsed) from exc

    def health(self) -> JsonObject:
        return self.request("GET", "/api/company/health")

    def list_companies(self) -> JsonObject:
        return self.request("GET", "/api/company/companies")

    def create_company(self, *, slug: str, display_name: str, hsmii_home: str | None = None) -> JsonObject:
        body: JsonObject = {"slug": slug, "display_name": display_name}
        if hsmii_home is not None:
            body["hsmii_home"] = hsmii_home
        return self.request("POST", "/api/company/companies", json_body=body)

    def get_company(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}")

    def update_company(self, company_id: str, **fields: Any) -> JsonObject:
        return self.request("PATCH", f"/api/company/companies/{company_id}", json_body=fields)

    def delete_company(self, company_id: str) -> JsonObject:
        return self.request("DELETE", f"/api/company/companies/{company_id}")

    def dashboard(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/dashboard")

    def api_catalog(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/api-catalog")

    def list_goals(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/goals")

    def create_goal(self, company_id: str, *, title: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/goals",
            json_body={"title": title, **fields},
        )

    def update_goal(self, company_id: str, goal_id: str, **fields: Any) -> JsonObject:
        return self.request("PATCH", f"/api/company/companies/{company_id}/goals/{goal_id}", json_body=fields)

    def list_tasks(self, company_id: str, **query: Any) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/tasks", query=query)

    def create_task(self, company_id: str, *, title: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/tasks",
            json_body={"title": title, **fields},
        )

    def delete_task(self, company_id: str, task_id: str) -> JsonObject:
        return self.request("DELETE", f"/api/company/companies/{company_id}/tasks/{task_id}")

    def update_task_state(self, task_id: str, *, state: str, **fields: Any) -> JsonObject:
        return self.request("PATCH", f"/api/company/tasks/{task_id}/state", json_body={"state": state, **fields})

    def decide_task(
        self,
        task_id: str,
        *,
        decision_mode: str,
        actor: str | None = None,
        reason: str | None = None,
        idempotency_key: str | None = None,
    ) -> JsonObject:
        body = {k: v for k, v in {
            "decision_mode": decision_mode,
            "actor": actor,
            "reason": reason,
        }.items() if v is not None}
        headers = {"Idempotency-Key": idempotency_key} if idempotency_key else None
        return self.request("POST", f"/api/company/tasks/{task_id}/decision", json_body=body, headers=headers)

    def set_task_requires_human(self, task_id: str, requires_human: bool, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/tasks/{task_id}/requires-human",
            json_body={"requires_human": requires_human, **fields},
        )

    def list_agents(self, company_id: str, **query: Any) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/agents", query=query)

    def create_agent(self, company_id: str, *, name: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/agents",
            json_body={"name": name, **fields},
        )

    def create_agent_from_definition(self, company_id: str, definition: Mapping[str, Any]) -> JsonObject:
        metadata = {"schema": definition.get("schema", AGENT_DEFINITION_SCHEMA)}
        metadata.update(dict(definition.get("metadata") or {}))
        return self.create_agent(
            company_id,
            name=str(definition["name"]),
            slug=definition.get("slug"),
            description=definition.get("description"),
            instructions_markdown=definition.get("instructions_markdown"),
            work_mode=definition.get("work_mode"),
            tool_declarations=definition.get("tools") or [],
            mcp_declarations=definition.get("mcp") or [],
            runtime=definition.get("runtime") or {},
            context_budget=definition.get("context_budget") or {},
            metadata=metadata,
        )

    def update_agent(self, company_id: str, agent_id: str, **fields: Any) -> JsonObject:
        return self.request("PATCH", f"/api/company/companies/{company_id}/agents/{agent_id}", json_body=fields)

    def delete_agent(self, company_id: str, agent_id: str) -> JsonObject:
        return self.request("DELETE", f"/api/company/companies/{company_id}/agents/{agent_id}")

    def list_memory(self, company_id: str, **query: Any) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/memory", query=query)

    def create_memory(self, company_id: str, *, title: str, body: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/memory",
            json_body={"scope": "shared", "title": title, "body": body, **fields},
        )

    def agent_chat(
        self,
        company_id: str,
        *,
        message: str,
        actor: str | None = None,
        thread_id: str | None = None,
    ) -> JsonObject:
        body = {k: v for k, v in {"message": message, "actor": actor, "thread_id": thread_id}.items() if v is not None}
        return self.request("POST", f"/api/company/companies/{company_id}/agent-chat", json_body=body)

    def board(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/board")

    def board_columns(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/board/columns")

    def board_presence(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/board/presence")

    def list_runtime_daemons(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/runtime/daemons")

    def register_runtime_daemon(self, company_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/runtime/daemons/register",
            json_body=fields,
        )

    def heartbeat_runtime_daemon(self, company_id: str, device_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/runtime/daemons/{device_id}/heartbeat",
            json_body=fields,
        )

    def deregister_runtime_daemon(self, company_id: str, device_id: str, *, agent_ref: str) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/runtime/daemons/{device_id}/deregister",
            json_body={"agent_ref": agent_ref},
        )

    def list_run_events(self, company_id: str, run_id: str, **query: Any) -> JsonObject:
        return self.request(
            "GET",
            f"/api/company/companies/{company_id}/agent-runs/{run_id}/execution-events",
            query=query,
        )

    def append_run_event(self, company_id: str, run_id: str, *, event_type: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/agent-runs/{run_id}/execution-events",
            json_body={"event_type": event_type, **fields},
        )

    def list_dead_star_contributors(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/dead-star/contributors")

    def create_dead_star_contributor(self, company_id: str, *, contributor_name: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/dead-star/contributors",
            json_body={"contributor_name": contributor_name, **fields},
        )

    def update_dead_star_contributor(self, company_id: str, contributor_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "PATCH",
            f"/api/company/companies/{company_id}/dead-star/contributors/{contributor_id}",
            json_body=fields,
        )

    def review_with_dead_star_contributor(self, company_id: str, contributor_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/dead-star/contributors/{contributor_id}/review",
            json_body=fields,
        )

    def accrue_dead_star_royalty(self, company_id: str, contributor_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/dead-star/contributors/{contributor_id}/accrue",
            json_body=fields,
        )

    def list_dead_star_royalty_ledger(self, company_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/dead-star/royalty-ledger")

    def settle_dead_star_royalty_event(self, event_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/dead-star/royalty-events/{event_id}/settle",
            json_body=fields,
        )

    def create_snapshot(self, company_id: str, **fields: Any) -> JsonObject:
        return self.request("POST", f"/api/company/companies/{company_id}/snapshots", json_body=fields)

    def list_snapshots(self, company_id: str, **query: Any) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/snapshots", query=query)

    def get_snapshot(self, company_id: str, snapshot_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/snapshots/{snapshot_id}")

    def replay_snapshot(self, company_id: str, snapshot_id: str) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/snapshots/{snapshot_id}/replay")

    def optimize_gepa(self, company_id: str, **fields: Any) -> JsonObject:
        return self.request("POST", f"/api/company/companies/{company_id}/gepa/optimize", json_body=fields)

    def list_promotion_experiments(self, company_id: str, **query: Any) -> JsonObject:
        return self.request("GET", f"/api/company/companies/{company_id}/promotion-experiments", query=query)

    def create_promotion_experiment(self, company_id: str, **fields: Any) -> JsonObject:
        return self.request("POST", f"/api/company/companies/{company_id}/promotion-experiments", json_body=fields)

    def promote_promotion_experiment(self, company_id: str, experiment_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/promotion-experiments/{experiment_id}/promote",
            json_body=fields,
        )

    def rollback_promotion_experiment(self, company_id: str, experiment_id: str, **fields: Any) -> JsonObject:
        return self.request(
            "POST",
            f"/api/company/companies/{company_id}/promotion-experiments/{experiment_id}/rollback",
            json_body=fields,
        )

    def _url(self, path: str, query: Mapping[str, Any] | None = None) -> str:
        base = self.base_url.rstrip("/")
        normalized_path = "/" + path.lstrip("/")
        url = base + normalized_path
        if query:
            clean = {
                key: value
                for key, value in query.items()
                if value is not None
            }
            if clean:
                url = f"{url}?{urllib.parse.urlencode(clean, doseq=True)}"
        return url


def parse_agent_definition_markdown(markdown: str) -> JsonObject:
    text = markdown.lstrip("\ufeff")
    if not text.startswith("---\n") and not text.startswith("---\r\n"):
        raise ValueError("agent definition requires YAML frontmatter")
    newline = "\r\n" if text.startswith("---\r\n") else "\n"
    marker = f"{newline}---{newline}"
    try:
        frontmatter, body = text[len(f"---{newline}"):].split(marker, 1)
    except ValueError as exc:
        raise ValueError("agent definition frontmatter is not closed") from exc
    parsed = _parse_simple_yaml(frontmatter)
    schema = str(parsed.get("schema") or AGENT_DEFINITION_SCHEMA)
    if schema != AGENT_DEFINITION_SCHEMA:
        raise ValueError(f"unsupported agent definition schema {schema}")
    slug = str(parsed.get("slug") or "").strip()
    name = str(parsed.get("name") or "").strip()
    if not slug:
        raise ValueError("agent definition slug is required")
    if not name:
        raise ValueError("agent definition name is required")
    parsed["schema"] = schema
    parsed["slug"] = slug
    parsed["name"] = name
    parsed["instructions_markdown"] = body.strip()
    return parsed


def _parse_simple_yaml(yaml: str) -> JsonObject:
    out: JsonObject = {}
    lines = yaml.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value:
            out[key] = _parse_yaml_scalar(value)
            continue
        child: list[str] = []
        while i < len(lines) and lines[i].startswith(" "):
            child.append(lines[i][2:] if lines[i].startswith("  ") else lines[i].lstrip())
            i += 1
        out[key] = _parse_yaml_child_block(child)
    return out


def _parse_yaml_child_block(lines: list[str]) -> Any:
    if any(line.lstrip().startswith("- ") for line in lines):
        items: list[JsonObject] = []
        current: JsonObject | None = None
        for raw in lines:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("- "):
                current = {}
                items.append(current)
                rest = line[2:].strip()
                if rest:
                    _assign_yaml_pair(current, rest)
            elif current is not None:
                _assign_yaml_pair(current, line)
        return items
    obj: JsonObject = {}
    for raw in lines:
        _assign_yaml_pair(obj, raw.strip())
    return obj


def _assign_yaml_pair(obj: JsonObject, line: str) -> None:
    if ":" not in line:
        return
    key, value = line.split(":", 1)
    obj[key.strip()] = _parse_yaml_scalar(value.strip())


def _parse_yaml_scalar(value: str) -> Any:
    if value == "true":
        return True
    if value == "false":
        return False
    if value.isdigit() or (value.startswith("-") and value[1:].isdigit()):
        return int(value)
    if value.startswith("[") and value.endswith("]"):
        return [_parse_yaml_scalar(v.strip()) for v in value[1:-1].split(",") if v.strip()]
    return value.strip("'\"")
