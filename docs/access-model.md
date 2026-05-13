# Access Model

This repository is public by design. It exposes how developers call Company OS, not how HSM-II runs the private stack. The default public product is hosted API access: developers use the SDK, while HSM-II operates the Company OS control plane.

## Public

- OpenAPI contract.
- Python SDK.
- TypeScript SDK.
- Examples and demo scripts.
- Product-level explanation of Company OS.

## Controlled By HSM-II

- Hosted API URL.
- API tokens and revocation.
- Rate limits and usage quotas.
- Billing and access tiers.
- Production deployment and operations.
- Server updates, migrations, and SDK/API compatibility.
- Private server implementation.
- Proprietary company packs, internal agents, private connectors, secrets, and infrastructure.

## Hosted Value

The hosted boundary is not only about keeping code private. It is how HSM-II can manage:

- Quality gates for agent runs, task state, approvals, and audit trail.
- Secret handling for model/provider keys and hosted connectors.
- Tenant isolation between company workspaces.
- Abuse prevention through tokens, rate limits, quotas, and revocation.
- Billing and usage reporting.
- Updates without asking every SDK user to operate migrations and runtime patches.
- Private company packs and curated operational playbooks.

## Developer Flow

1. Read the public API contract.
2. Install the SDK.
3. Request or receive hosted API credentials from HSM-II.
4. Set `HSM_COMPANY_API_URL` and `HSM_COMPANY_API_TOKEN`.
5. Build against the Company OS API without seeing or copying the private implementation.

## Operator Control

HSM-II can grant, limit, rotate, or revoke access at the token and hosted API layer. The SDK does not bypass the hosted API, and it does not contain private server logic.

## Self-Hosting

Self-hosting is not provided by this SDK repository. A self-hosted offer would need a server distribution, database migrations, runtime configuration, model-provider setup, connector credential handling, and an upgrade policy. Without that package, users can build against Company OS but cannot run the full backend themselves from this repo alone.
