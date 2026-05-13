# Company OS

**Company OS gives AI agents a shared operating layer for companies: workspaces, tasks, goals, memory, agents, approvals, and connectors through one API.**

This public repository contains the Company OS interface layer: OpenAPI contract, Python SDK, TypeScript SDK, and examples. It does not include the private server implementation, hosted operations, secrets, proprietary company packs, or internal deployment code.

The intended public path is **SDK -> hosted Company OS API**. HSM-II runs the control plane, issues API credentials, and manages the operational boundary around models, tools, tenants, billing, updates, and private packs. A self-hosted server is a separate deployment product, not something this SDK repo provides by itself.

## Why It Exists

Most AI agent stacks still behave like chat wrappers: they produce useful output, but the work is hard to assign, audit, continue, govern, or connect to a real company workflow.

Company OS turns agent work into an operational graph:

- Companies own goals, tasks, memory, agents, governance events, and integrations.
- Agents can be assigned work with context, state, owners, approvals, and audit trails.
- Operators keep control through bearer-token access, hosted API permissions, and human review flows.

## What You Can Build

- Agent workspaces that create and track real tasks instead of losing work in chat history.
- Shared memory and context systems for long-running company operations.
- Human-in-the-loop review queues for approvals, blocked work, and escalations.
- External tools and product integrations through a stable Company OS API.
- Dashboards, automations, and agent UIs on top of one public contract.

## What HSM-II Hosts For You

Using the hosted API means your application can call Company OS without operating the backend runtime. HSM-II is responsible for:

- Quality gates around agent runs, task state, approvals, and operational audit.
- Secret handling for hosted connectors and model/provider credentials.
- Tenant isolation so each company workspace has separated state and access.
- Abuse controls such as bearer-token access, rate limits, revocation, and usage quotas.
- Billing and usage reporting for API calls, agent runs, memory retrieval, and connector operations.
- Platform updates, schema migrations, and compatibility with the public SDK contract.
- Private company packs, internal agents, and curated integrations that are not distributed in this public repo.

You still build your own app, dashboard, agent UI, or automation on top of the API. HSM-II operates the shared control plane behind it.

## Quick Demo Flow

```python
from company_os_sdk import CompanyOSClient

client = CompanyOSClient.from_env()

company = client.create_company(slug="acme", display_name="Acme")
company_id = company["company"]["id"]

goal = client.create_goal(company_id, title="Launch customer onboarding v1")
task = client.create_task(
    company_id,
    title="Draft onboarding checklist",
    specification="Create a concise checklist for first-time customers.",
    primary_goal_id=goal["goal"]["id"],
    priority=10,
)

reply = client.agent_chat(
    company_id,
    message="What is the highest-priority work and who should handle it?",
    actor="operator",
)

print(task["task"]["id"])
print(reply)
```

## Repository Contents

- [OpenAPI spec](openapi/company-os.openapi.yaml): public Company OS API contract.
- [Python SDK](python/): dependency-light client for scripts, notebooks, and backend jobs.
- [TypeScript SDK](typescript/): client for Node 18+, modern browsers, and app frontends.
- [Examples](examples/): minimal quickstarts.
- [Product deck narrative](docs/product-deck.md): how Company OS works and why it matters.
- [Demo script](docs/demo-script.md): 20-30 second demo flow for a pitch or walkthrough.
- [Access model](docs/access-model.md): what is public, what stays private, and how hosted access is controlled.
- [Managed hosting model](docs/managed-hosting.md): what HSM-II operates for hosted SDK/API users.
- [Hosted scale architecture](docs/hosted-scale-architecture.md): model gateway, quota, workers, usage ledger, and billing architecture.

## Authentication

Most endpoints require a bearer token:

```bash
export HSM_COMPANY_API_URL="https://api.example.com"
export HSM_COMPANY_API_TOKEN="..."
```

`GET /api/company/health` is intentionally unauthenticated so operators can check deployment health.

The hosted API URL and external token issuance flow are controlled by HSM-II. Replace the placeholder URL with the live API endpoint when access is issued.

## Python

```bash
cd python
python -m pip install -e .
python ../examples/python_quickstart.py
```

```python
from company_os_sdk import CompanyOSClient

client = CompanyOSClient.from_env()
company = client.create_company(slug="acme", display_name="Acme")
task = client.create_task(company["company"]["id"], title="Review launch checklist")
print(task["task"]["id"])
```

## TypeScript

```bash
cd typescript
npm install
npm run build
node ../examples/typescript-quickstart.mjs
```

```ts
import { CompanyOSClient } from "@hsm-ii/company-os-sdk";

const client = CompanyOSClient.fromEnv();
const health = await client.health();
console.log(health);
```

## Product Story

The short version:

1. AI work is moving from chat into operations.
2. Operations need memory, task state, governance, tools, and accountability.
3. Company OS gives agents and operators one shared API for that work.
4. HSM-II controls hosted access; this repo exposes the public interface.

For the full pitch-style flow, read [docs/product-deck.md](docs/product-deck.md).

## Versioning

The SDK follows the API contract in [openapi/company-os.openapi.yaml](openapi/company-os.openapi.yaml). Until the hosted API is declared stable, pin SDK versions and treat newly added endpoints as additive.
