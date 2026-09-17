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

