# Hosted Scale Architecture

This is the target architecture for running Company OS as a hosted SaaS while still giving users model/provider flexibility.

The core rule: users call HSM-II, and HSM-II calls model/tool providers through managed gateways. The SDK should not require users to wire OpenRouter, OpenAI, Anthropic, or connector credentials directly into every client app.

## Request Path

```text
User app / SDK
  -> Company OS API
    -> auth, tenant, quota, billing checks
    -> task / memory / governance ledger
    -> agent-run job queue
    -> worker pool
      -> model gateway
        -> HSM-II managed OpenRouter key
        -> optional user BYO provider key
        -> optional enterprise provider config
      -> connector gateway
    -> usage ledger + audit trail
    -> streamed run status / final result
```

## Access Modes

### 1. Hosted Shared Model Pool

The simplest product path. Users receive `HSM_COMPANY_API_URL` and `HSM_COMPANY_API_TOKEN`. HSM-II calls OpenRouter or other providers with HSM-II-managed credentials.

Use this for onboarding, demos, pilots, and small teams. HSM-II must enforce quotas and spend limits because HSM-II carries the provider bill.

### 2. Hosted BYO Provider Key

Users still use hosted Company OS, but they store their own OpenRouter, OpenAI, Anthropic, or other provider key in the HSM-II credential vault.

Use this when users want their own model spend, provider account, data policy, or rate limits while still relying on HSM-II for tasks, memory, governance, workers, and audit.

### 3. Dedicated Or Self-Hosted Deployment

Enterprise path. HSM-II packages the server, migrations, runtime config, and upgrade policy for dedicated infrastructure.

This is separate from the public SDK. The SDK can point at a dedicated deployment, but the SDK alone is not a server distribution.

## Core Services

### Model Gateway

One internal service or module that every agent run uses for model calls.

Responsibilities:

- Resolve tenant, company, run, requested capability, and policy.
- Choose provider/model from routing config.
- Support fallback and retry rules.
- Enforce max tokens, max turns, timeout, and spend limits before the call.
- Inject provider credentials server-side only.
- Normalize provider responses into one internal shape.
- Emit usage and audit events for every attempt.

Minimum routing inputs:

- `tenant_id`
- `company_id`
- `run_id`
- `capability`
- `requested_model`
- `quality_band`
- `max_tokens`
- `budget_remaining`
- `provider_preference`

Minimum model-call event:

```json
{
  "tenant_id": "tenant_123",
  "company_id": "company_123",
  "run_id": "run_123",
  "provider": "openrouter",
  "model": "openrouter/auto",
  "status": "success",
  "prompt_tokens": 1200,
  "completion_tokens": 420,
  "estimated_cost_usd": 0.0042,
  "latency_ms": 1830
}
```

### Usage Ledger

Every billable or safety-relevant action lands in an append-only ledger.

Track:

- Model calls.
- Agent runs.
- Tool calls.
- Connector calls.
- Memory retrieval / write events if priced or quota-controlled.
- Failed attempts when they consume provider budget or signal abuse.

Required dimensions:

- tenant
- company
- user / actor
- agent
- task
- run
- provider
- model or connector
- status
- token counts or operation counts
- estimated cost
- timestamps and latency

### Quota Engine

The quota engine blocks expensive or abusive work before it reaches providers.

Enforce:

- Monthly tenant spend.
- Daily tenant spend.
- Per-company spend.
- Max concurrent runs.
- Max turns per run.
- Max tokens per call and per run.
- Max connector calls per run.
- Max tool runtime.

Quota checks should happen:

- At API request admission.
- Before enqueueing an agent run.
- Before every model call.
- Before every external connector call.

### Job Queue

Agent runs should not be long synchronous HTTP requests.

Flow:

1. API validates request and creates an `agent_run`.
2. API enqueues a job.
3. Worker claims the job.
4. UI listens through stream/polling for run events.
5. Worker writes final result, usage, and audit trail.

This lets HSM-II scale workers horizontally and survive slow model/tool calls without pinning API processes.

### Worker Pool

Workers consume queued agent-run jobs.

Workers must be stateless except for:

- The job they are processing.
- Temporary sandbox workspace.
- Short-lived provider credentials fetched from the vault.

Workers should be safe to kill and retry. All durable state belongs in Postgres or another managed store.

### Tenant Isolation

Every durable record must be tenant-scoped or company-scoped.

Required guarantees:

- Every API token maps to a tenant and permissions.
- Every company belongs to one tenant.
- Every task, goal, memory entry, agent, run, connector account, credential grant, and usage event carries tenant/company scope.
- Every query filters by tenant/company scope.
- Cross-tenant admin operations require explicit elevated auth.

### Credential Vault

The vault stores:

- HSM-II managed provider keys.
- User BYO provider keys.
- Connector credentials.
- OAuth refresh/access tokens.
- Enterprise deployment credentials.

Rules:

- Credentials are encrypted at rest.
- Agents and browser clients never see raw secrets.
- Workers receive secrets just in time.
- Secrets are not logged.
- Secret use emits audit events.
- Revocation takes effect without redeploying workers.

### Abuse Controls

Required controls:

- Per-token rate limits.
- Per-tenant run limits.
- Blocked host and blocked method policies for external tools.
- Max runtime and timeout per worker job.
- Kill switch per tenant, company, token, provider, and connector.
- Prompt-injection and unsafe action policy checks at tool boundaries.
- Provider fallback must not bypass safety policy or quota.

### Billing

Billing maps the usage ledger to customer plans.

Common billable meters:

- Agent runs.
- Model tokens or estimated model cost.
- Connector calls.
- Memory retrieval/write volume.
- Seats or active workspaces.
- Dedicated deployment/support.

Billing should read from the ledger, not from provider invoices alone. Provider invoices are reconciliation data; the HSM-II ledger is the product meter.

## Minimal Production Slice

The first scalable hosted version does not need every enterprise feature. It does need these hard pieces:

1. Tenant-scoped API tokens.
2. Hosted OpenRouter model gateway.
3. Usage ledger for every model call and agent run.
4. Monthly and daily quota checks.
5. Agent-run job queue.
6. One worker pool.
7. Credential vault for HSM-II provider keys.
8. Admin kill switch.
9. Health, usage, and run-status endpoints.

## Public Positioning

Use this language:

> Company OS is provider-flexible, but hosted by HSM-II. By default, HSM-II routes model calls through managed providers such as OpenRouter with quotas, audit, and billing. Teams can also bring their own provider keys or request dedicated deployment when they need stricter control.

Avoid implying that the public SDK can run the server. The public SDK integrates with a running Company OS API.

