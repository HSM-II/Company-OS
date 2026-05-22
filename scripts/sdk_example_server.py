#!/usr/bin/env python3
from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse


COMPANY_ID = "00000000-0000-0000-0000-000000000001"
GOAL_ID = "00000000-0000-0000-0000-000000000002"
TASK_ID = "00000000-0000-0000-0000-000000000003"
THREAD_ID = "00000000-0000-0000-0000-000000000004"


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/company/health":
            self.reply({"service": "company-os", "postgres_configured": True, "postgres_ok": True})
        elif path == "/api/company/companies":
            self.reply({"companies": [company()]})
        elif path == f"/api/company/companies/{COMPANY_ID}/goals":
            self.reply({"goals": [goal()]})
        elif path == f"/api/company/companies/{COMPANY_ID}/tasks":
            self.reply({"tasks": [task()]})
        elif path == f"/api/company/companies/{COMPANY_ID}/board":
            self.reply({"columns": [{"id": "open", "title": "Open"}], "tasks": [task()]})
        elif path == f"/api/company/companies/{COMPANY_ID}/runtime/daemons":
            self.reply({"daemons": []})
        elif path == f"/api/company/companies/{COMPANY_ID}/dead-star/contributors":
            self.reply({"contributors": []})
        else:
            self.reply({"error": f"not found: {path}"}, status=404)

    def do_POST(self) -> None:
        path = urlparse(self.path).path
        body = self.read_json()
        if path == "/api/company/companies":
            self.reply({"company": company(body)}, status=201)
        elif path == f"/api/company/companies/{COMPANY_ID}/goals":
            self.reply({"goal": goal(body)}, status=201)
        elif path == f"/api/company/companies/{COMPANY_ID}/tasks":
            self.reply({"task": task(body)}, status=201)
        elif path == f"/api/company/companies/{COMPANY_ID}/agent-chat":
            self.reply({"reply": "fixture response", "thread_id": THREAD_ID, "echo": body.get("message")})
        elif path == f"/api/company/companies/{COMPANY_ID}/runtime/daemons/register":
            self.reply({"daemon": {"device_id": body.get("device_id"), "agent_ref": body.get("agent_ref"), "status": "online"}})
        elif path == f"/api/company/companies/{COMPANY_ID}/dead-star/contributors":
            self.reply({"contributor": {"id": GOAL_ID, "contributor_name": body.get("contributor_name")}})
        else:
            self.reply({"error": f"not found: {path}"}, status=404)

    def log_message(self, fmt: str, *args: object) -> None:
        return

    def read_json(self) -> dict:
        n = int(self.headers.get("content-length") or "0")
        if n <= 0:
            return {}
        return json.loads(self.rfile.read(n).decode("utf-8"))

    def reply(self, payload: dict, status: int = 200) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def company(overrides: dict | None = None) -> dict:
    data = {
        "id": COMPANY_ID,
        "slug": "acme",
        "display_name": "Acme",
        "issue_key_prefix": "ACME",
        "created_at": "2026-05-22T00:00:00Z",
    }
    if overrides:
        data.update({k: v for k, v in overrides.items() if v is not None})
    return data


def goal(overrides: dict | None = None) -> dict:
    data = {"id": GOAL_ID, "company_id": COMPANY_ID, "title": "Launch", "status": "active"}
    if overrides:
        data.update(overrides)
    return data


def task(overrides: dict | None = None) -> dict:
    data = {"id": TASK_ID, "company_id": COMPANY_ID, "title": "Draft checklist", "state": "open"}
    if overrides:
        data.update(overrides)
    return data


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", 18765), Handler)
    print("sdk fixture listening on http://127.0.0.1:18765", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
