from company_os_sdk import CompanyOSClient


client = CompanyOSClient.from_env()
print(client.health())

