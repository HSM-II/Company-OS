from company_os_sdk import CompanyOSClient


client = CompanyOSClient.from_env()
print(client.health())

company = client.create_company(slug="acme", display_name="Acme")
company_id = company["company"]["id"]

goal = client.create_goal(company_id, title="Launch customer onboarding v1")
task = client.create_task(
    company_id,
    title="Draft onboarding checklist",
    specification="Create a concise checklist for first-time customers.",
    primary_goal_id=goal["goal"]["id"],
    priority=10,
)
reply = client.agent_chat(
    company_id,
    message="What is the highest-priority work?",
    actor="operator",
)

print(task["task"]["id"])
print(reply["thread_id"])
