import {
  Agent,
  CompanyOSClient,
  CompanyOSGraphBuilder,
  CompanyOSHookBus,
  CompanyOSSessionManager,
  EvalExperimentGenerator,
  MemorySessionStore,
  RealtimeVoiceAgent,
  a2aAgentCardToExternalAdapter,
  companyOSSkillStoreCatalog,
  companyOSToolCatalog,
  remoteA2AAgentAsTool,
} from "../typescript/dist/index.js";

const client = CompanyOSClient.fromEnv();
const company = await client.createCompany({ slug: "sdk-kit-demo", display_name: "SDK Kit Demo" });
const companyId = company.company?.id ?? company.id;

const hooks = new CompanyOSHookBus()
  .on("before_invocation", (event) => {
    console.log("hook", event.hook, event.agentRef);
  })
  .on("before_tool_call", () => ({
    rewriteParams: { actor: "sdk-demo" },
    receipts: [{ type: "demo_hook", summary: "Tool call observed and actor normalized." }],
  }))
  .on("after_result", (event) => {
    console.log("hook", event.hook, Boolean(event.payload.response));
  });

const agent = new Agent({
  client,
  companyId,
  agentRef: "operator",
  name: "Operator",
  model: "company-os-default",
  tools: ["company_memory_search", "company_create_task"],
  hooks,
  sessionManager: new CompanyOSSessionManager(new MemorySessionStore()),
});

console.log(await agent.run("Create a short launch-readiness task."));
const card = agent.toAgentCard(process.env.HSM_COMPANY_API_URL || "http://localhost:18765");
console.log(card);

const graph = new CompanyOSGraphBuilder("launch-readiness")
  .agent("research", { agentRef: "research-analyst", prompt: "Find launch risks." })
  .agent("operator", { agentRef: "operator", prompt: "Review the risks and request approval if needed." })
  .edge("research", "operator", { condition: "research complete" });

console.log(graph.toJSON());
console.log(remoteA2AAgentAsTool(card));
console.log(a2aAgentCardToExternalAdapter(card, { mode: "bridged" }));
console.log(EvalExperimentGenerator.fromAgent(agent, ["Can this agent create a task with evidence?"]));
console.log(EvalExperimentGenerator.fromCompanySignals({
  companyId,
  agentRef: "operator",
  availableTools: companyOSToolCatalog,
  companyPolicies: [{ id: "approval", title: "Ask approval before customer-impacting actions." }],
  corrections: [{ id: "receipt", summary: "Always attach evidence receipts." }],
  beadsHistory: [{ id: "launch", title: "Review launch readiness", status: "open", labels: ["launch"] }],
}));
console.log(new RealtimeVoiceAgent({ provider: "fluidvoice", companyId, agentRef: "operator" }).describe());
console.log(companyOSToolCatalog.map((tool) => tool.name));
console.log(companyOSSkillStoreCatalog.map((skill) => skill.name));
