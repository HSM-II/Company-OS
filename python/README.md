# company-os-sdk for Python

```bash
python -m pip install -e .
```

```python
from company_os_sdk import CompanyOSClient

client = CompanyOSClient("http://localhost:3847", token="dev-token")
print(client.health())
```

Set `HSM_COMPANY_API_URL` and `HSM_COMPANY_API_TOKEN` to use `CompanyOSClient.from_env()`.

Sensitive company reads and governed mutations require a separate tenant principal
credential. Configure `HSM_COMPANY_PRINCIPAL_TOKEN` alongside the transport bearer
`HSM_COMPANY_API_TOKEN`; `fromEnv()` / `from_env()` then send the principal in
`x-hsm-principal-token`. Explicit clients accept `principalToken` (TypeScript)
or `principal_token` (Python). A transport bearer alone does not establish tenant
authority. Issue the principal through the configured Company OS authority flow.
