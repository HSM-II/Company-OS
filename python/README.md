# company-os-sdk for Python

```bash
python -m pip install -e .
```

```python
from company_os_sdk import CompanyOSClient

client = CompanyOSClient("http://localhost:8765", token="dev-token")
print(client.health())
```

Set `HSM_COMPANY_API_URL` and `HSM_COMPANY_API_TOKEN` to use `CompanyOSClient.from_env()`.

