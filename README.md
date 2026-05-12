# Company OS SDK

Public SDK surface for the HSM-II Company OS API.

This repository is intentionally small: it exposes the HTTP interface, client helpers, and examples without shipping the private server implementation or hosted operations code.

## Contents

- `openapi/company-os.openapi.yaml` - hand-written OpenAPI 3.1 spec for the public Company OS API surface.
- `python/` - dependency-light Python client.
- `typescript/` - dependency-light TypeScript client for Node 18+ and modern browsers.
- `examples/` - minimal Python and TypeScript usage examples.

## Authentication

Most endpoints require a bearer token:

```bash
export HSM_COMPANY_API_URL="https://api.example.com"
export HSM_COMPANY_API_TOKEN="..."
```

`GET /api/company/health` is intentionally unauthenticated so operators can check deployment health.

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

## Versioning

The SDK follows the API contract in `openapi/company-os.openapi.yaml`. Until the hosted API is declared stable, prefer pinning SDK versions and treating newly added endpoints as additive.

