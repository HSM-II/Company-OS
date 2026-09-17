from company_os_sdk import (
    Agent,
    CompanyOSClient,
    CompanyOSGraphBuilder,
    CompanyOSHookBus,
    CompanyOSSessionManager,
    EvalExperimentGenerator,
    MemorySessionStore,
    RealtimeVoiceAgent,
    a2a_agent_card_to_external_adapter,
    company_os_skill_store_catalog,
    company_os_tool_catalog,
    remote_a2a_agent_as_tool,
)


client = CompanyOSClient.from_env()
company = client.create_company(slug="sdk-kit-demo", display_name="SDK Kit Demo")
company_id = company.get("company", company).get("id")

hooks = CompanyOSHookBus()
hooks.on("before_invocation", lambda event: print("hook", event["hook"], event["agentRef"]) or None)
hooks.on(
    "before_tool_call",
    lambda event: {
        "rewriteParams": {"actor": "sdk-demo"},
        "receipts": [{"type": "demo_hook", "summary": "Tool call observed and actor normalized."}],
    },
)
hooks.on("after_result", lambda event: print("hook", event["hook"], bool(event["payload"].get("response"))) or None)

agent = Agent(
    client=client,
    company_id=company_id,
    agent_ref="operator",
    name="Operator",
    model="company-os-default",
    tools=["company_memory_search", "company_create_task"],
    hooks=hooks,
    session_manager=CompanyOSSessionManager(MemorySessionStore()),
)

print(agent.run("Create a short launch-readiness task."))
card = agent.to_agent_card("http://localhost:18765")
print(card.to_json())

graph = (
    CompanyOSGraphBuilder("launch-readiness")
    .agent("research", agent_ref="research-analyst", prompt="Find launch risks.")
    .agent("operator", agent_ref="operator", prompt="Review the risks and request approval if needed.")
    .edge("research", "operator", condition="research complete")
)

print(graph.to_json())
print(remote_a2a_agent_as_tool(card))
print(a2a_agent_card_to_external_adapter(card, mode="bridged"))
print(EvalExperimentGenerator.from_agent(agent, ["Can this agent create a task with evidence?"]))
print(
    EvalExperimentGenerator.from_company_signals(
        company_id=company_id,
        agent_ref="operator",
        available_tools=company_os_tool_catalog(),
        company_policies=[{"id": "approval", "title": "Ask approval before customer-impacting actions."}],
        corrections=[{"id": "receipt", "summary": "Always attach evidence receipts."}],
        beads_history=[{"id": "launch", "title": "Review launch readiness", "status": "open", "labels": ["launch"]}],
    )
)
print(RealtimeVoiceAgent(provider="fluidvoice", company_id=company_id, agent_ref="operator").describe())
print([tool["name"] for tool in company_os_tool_catalog()])
print([skill["name"] for skill in company_os_skill_store_catalog()])
