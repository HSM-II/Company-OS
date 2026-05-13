# Company OS Product Deck

Use this as the narrative spine for a 10-12 slide pitch, landing page, or recorded walkthrough. Keep each slide visually simple: one message, one concrete image or UI capture, minimal text.

## 1. Intro

**Company OS**

One operating layer for AI-native companies: tasks, goals, memory, agents, approvals, and integrations through one API.

Presenter: HSM-II team, building the public SDK and hosted Company OS interface for external developers and operators.

## 2. Problem

AI agents are useful, but company work still falls apart after the chat.

The pain:

- Outputs are scattered across conversations, files, tools, and people.
- Agents lose context between runs.
- Operators cannot easily see who owns what, what is blocked, or what needs human approval.
- Teams cannot safely expose private company workflows without governance, audit, and access control.

Real consequence: as more companies adopt AI agents, the bottleneck shifts from model capability to operational control: memory, delegation, review, and integration.

Use on-slide evidence:

- Recent enterprise AI adoption stat from a source you trust.
- Screenshot/news headline about agentic AI entering business workflows.
- One visual of messy work: chat output, ticket queue, docs, and tool dashboards split apart.

## 3. Value Proposition

Company OS turns AI agent output into governed company operations.

## 4. Solution / Features

### Shared Company Graph

Create a company workspace with goals, tasks, agents, memory, governance events, and connectors. Work has state, ownership, priority, and history.

### Agent-Ready Task Layer

Assign tasks to agents or operators with rich specifications, attachments, goals, due dates, and escalation flags. Agents can continue work without starting from zero.

### Controlled Public Interface

Developers use the OpenAPI spec, Python SDK, and TypeScript SDK. HSM-II keeps the implementation private and controls hosted access with tokens, rate limits, and revocation.

## 5. Demo

Show the core loop in 20-30 seconds:

1. Create a company.
2. Create a goal.
3. Create a task attached to that goal.
4. Ask Company OS agent chat what should happen next.
5. Show the task state and response.

Use [demo-script.md](demo-script.md) for the exact flow.

## 6. Market Potential

Target users:

- AI agent builders who need memory, tasks, and governance.
- Startups building agentic workflows for operations, sales, support, engineering, or research.
- Enterprises adopting multi-agent systems but needing control, audit, and integration boundaries.
- Consultants and systems integrators packaging repeatable AI operations.

Market framing:

- AI software spend is expanding quickly.
- Agentic workflows are moving from experiments to production.
- Every production agent stack needs the same missing operational primitives: state, memory, identity, task routing, permissions, and audit.

Replace with verified sizing before external fundraising or sales use:

- TAM: enterprise workflow automation + AI agent platforms.
- SAM: teams deploying agentic operations.
- SOM: developer-first Company OS API and hosted control plane users.

## 7. Competitive Analysis

| Category | Examples | Where They Help | Company OS Difference |
| --- | --- | --- | --- |
| Agent frameworks | LangChain, CrewAI, AutoGen | Build agent logic | Company OS supplies operational state, memory, tasks, approvals, and public API surface around agents. |
| Project tools | Linear, Jira, Asana | Human task tracking | Company OS is agent-native and API-first, with company memory and agent chat built around execution. |
| Automation tools | Zapier, n8n, Make | Connect apps | Company OS adds company graph, governance, and agent work context instead of only trigger/action automation. |

One key win: Company OS is the operational control plane around agents, not another isolated agent runtime.

## 8. Business Model

Simple hosted model:

- Free public SDK and OpenAPI spec.
- Hosted API subscriptions by workspace, usage, or seat.
- Enterprise plans for private deployment, SSO, audit controls, custom connectors, and support.
- Optional usage-based pricing for agent runs, memory retrieval, and connector operations.

The exact public pricing is controlled by HSM-II and can evolve without changing the SDK contract.

## 9. Traction

Use concrete data only. Do not use vanity metrics.

Recommended metrics to fill before external use:

- Revenue: monthly recurring revenue or signed pilot value.
- Usage: number of active workspaces, API calls, tasks created, or agent runs completed.
- Growth: week-over-week usage growth, retention, or conversion from demo to active workspace.

Current public-safe traction statement:

Company OS has a working public SDK, OpenAPI contract, and hosted-access boundary. The next public proof point is live API access with real external users and measured task/agent throughput.

## 10. Roadmap

### Q1: Public Interface

- Publish SDK and OpenAPI spec.
- Finalize hosted API URL and external token issuance.
- Add examples for Python, TypeScript, and common agent frameworks.

### Q2: Hosted Control Plane

- Add rate limits, API keys, usage reporting, and onboarding docs.
- Publish dashboard walkthrough and demo video.
- Add connector examples for GitHub, Slack, email, and docs.

### Q3: Enterprise Readiness

- Add SSO-ready access model, audit exports, and stronger governance docs.
- Publish integration playbooks for operations, support, engineering, and research teams.
- Package private deployment and support options.

Growth channels:

- Developer docs and examples.
- Demo videos.
- Agent framework integrations.
- Founder-led pilots with AI-native operations teams.

## 11. Team

Position around proof, not titles:

- Built HSM-II Company OS API surface.
- Published public SDK and OpenAPI contract.
- Designed hosted/private boundary so external users get access without exposing private implementation.
- Continuing to build the agentic operations layer around tasks, memory, governance, and connectors.

Add advisors or customer logos only when approved for public use.

## 12. Conclusion / Call To Action

Company OS is the operating layer for agentic work.

Developers can inspect the interface today:

- OpenAPI: `openapi/company-os.openapi.yaml`
- Python SDK: `python/`
- TypeScript SDK: `typescript/`

Next step: request hosted API access, run the 30-second demo, and connect one real company workflow.

