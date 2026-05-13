# Access Model

This repository is public by design. It exposes how developers call Company OS, not how HSM-II runs the private stack.

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
- Private server implementation.
- Proprietary company packs, internal agents, private connectors, secrets, and infrastructure.

## Developer Flow

1. Read the public API contract.
2. Install the SDK.
3. Request or receive hosted API credentials from HSM-II.
4. Set `HSM_COMPANY_API_URL` and `HSM_COMPANY_API_TOKEN`.
5. Build against the Company OS API without seeing or copying the private implementation.

## Operator Control

HSM-II can grant, limit, rotate, or revoke access at the token and hosted API layer. The SDK does not bypass the hosted API, and it does not contain private server logic.

