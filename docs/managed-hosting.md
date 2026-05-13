# Managed Hosting Model

The public Company OS SDK is intentionally thin: it gives developers a stable way to call Company OS, while HSM-II operates the runtime behind the API.

## What Users Get

Users get an API endpoint and token:

```bash
export HSM_COMPANY_API_URL="https://api.hsm-ii.example"
export HSM_COMPANY_API_TOKEN="..."
```

From there, they can create companies, goals, tasks, memory entries, agents, connector records, and agent-chat turns through the SDK. Their product can be a dashboard, internal automation, agent UI, workflow runner, or integration layer.

## What HSM-II Operates

### Quality

HSM-II can centralize quality controls around the hosted runtime: task lifecycle rules, approvals, audit trail, error handling, compatibility tests, and safe rollout of API changes.

### Secrets

Hosted operation keeps model keys, connector credentials, private packs, and infrastructure secrets out of the public SDK. Users receive scoped API tokens instead of raw backend access.

### Tenant Isolation

Each company workspace is addressed by API resources and bearer-token access. Hosted operation lets HSM-II enforce workspace boundaries, credential boundaries, and access revocation at the control-plane layer.

### Abuse Prevention

The hosted API can enforce rate limits, usage quotas, blocked actions, token revocation, and provider-level safety controls. This matters because agentic workflows can create work, call tools, and consume model/provider budget.

### Billing And Usage

Hosted access supports workspace, seat, usage, or enterprise billing without changing the SDK contract. The SDK stays stable while HSM-II evolves pricing, quotas, and plans behind the API.

### Updates

HSM-II can upgrade the server, run migrations, patch connectors, and add private packs while keeping the public OpenAPI contract additive and versioned.

### Private Company Packs

Company packs, internal agents, curated connector templates, and proprietary operational playbooks can stay hosted/private while still being exposed through stable API behavior.

## Bring Your Own Model Or Hosting Provider

The SDK can only talk to a running Company OS API. To let users bring their own model keys, Postgres, hosting provider, and runtime, HSM-II must provide a self-hosted server distribution such as:

- Docker image or source release for the Company OS server.
- Database migrations and setup scripts.
- Environment documentation for model providers and connector credentials.
- A smoke test that proves `health -> create company -> create task -> agent chat`.
- Upgrade and support policy for self-hosted operators.

Until that exists, users can build against the API but cannot run the full Company OS backend from this repository alone.

For the hosted scaling design behind model routing, quotas, usage, workers, and billing, see [hosted-scale-architecture.md](hosted-scale-architecture.md).

## Positioning

Use this framing publicly:

- **Public SDK/API:** build clients and integrations.
- **Hosted Company OS:** use the full control plane without operating it.
- **Private or self-hosted deployment:** run the backend on dedicated infrastructure when HSM-II offers that package.
