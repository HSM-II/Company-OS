# 20-30 Second Demo Script

Purpose: show that Company OS is not just chat. It creates durable company work: a workspace, goal, task, and agent response through the public SDK.

## Setup

```bash
export HSM_COMPANY_API_URL="https://api.example.com"
export HSM_COMPANY_API_TOKEN="..."
```

Install Python SDK locally:

```bash
cd python
python -m pip install -e .
```

## Demo Narration

**0-5 seconds**

"Company OS gives AI agents a real operating layer. I start by creating a company workspace."

**5-10 seconds**

"Then I create a goal and attach work to it, so the task is not floating in a chat transcript."

**10-20 seconds**

"Now I ask the Company OS agent interface what should happen next. It can reason over the company context, goals, agents, tasks, and memory exposed by the API."

**20-30 seconds**

"The result is durable: a task with state, priority, ownership potential, and auditability. The public SDK calls the API; HSM-II still controls hosted access and private implementation."

## Demo Code

```python
from company_os_sdk import CompanyOSClient

client = CompanyOSClient.from_env()

company = client.create_company(slug="demo-co", display_name="Demo Co")
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
    actor="operator",
    message="What should we do next for the onboarding launch?",
)

print("Company:", company_id)
print("Task:", task["task"]["id"])
print("Agent reply:", reply)
```

## What To Show On Screen

- Terminal running the SDK call.
- API response with company ID and task ID.
- A dashboard or JSON view showing the task exists.
- Agent chat response identifying the next action.

Keep it silent, fast, and direct. No music. No long explanation.

