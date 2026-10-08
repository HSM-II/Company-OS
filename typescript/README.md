# @hsm-ii/company-os-sdk

```bash
npm install @hsm-ii/company-os-sdk
```

```ts
import { CompanyOSClient } from "@hsm-ii/company-os-sdk";

const client = CompanyOSClient.fromEnv();
console.log(await client.health());
```

`CompanyOSClient.fromEnv()` reads `HSM_COMPANY_API_URL` and `HSM_COMPANY_API_TOKEN`.

### Request deadlines and mutation retries

Clients default to a 30-second deadline covering headers and response bodies.
Set `timeoutMs` on `CompanyOSClient` to tune it; generic `request()` also accepts
`timeoutMs` and a caller `signal`. Deadlines must be positive finite integers.
`CompanyOSTransportError.kind` distinguishes `timeout`, `cancelled`, and `network`
failures; API refusals remain `CompanyOSAPIError`.

`Agent.run()` submits one chat mutation. Retry hooks are still observed for
receipts, but do not replay successful or ambiguously failed chat submissions:
the server does not expose a guaranteed replay contract for this endpoint.
Check the recorded run after an ambiguous failure. A separate explicit `run()`
call starts new work and may repeat side effects.

Run transport and replay regressions after building:
`node --test ../scripts/transport-retry.test.mjs` from `typescript/`.

Sensitive company reads and governed mutations require a separate tenant principal
credential. Configure `HSM_COMPANY_PRINCIPAL_TOKEN` alongside the transport bearer
`HSM_COMPANY_API_TOKEN`; `fromEnv()` / `from_env()` then send the principal in
`x-hsm-principal-token`. Explicit clients accept `principalToken` (TypeScript)
or `principal_token` (Python). A transport bearer alone does not establish tenant
authority. Issue the principal through the configured Company OS authority flow.
