# Company OS Developer Kit

The Developer Kit adapts the useful public SDK ergonomics from modern agent frameworks into Company OS without replacing the Company OS runtime.

It gives developers simple primitives:

- `Agent(...)` for one-call agent execution through Company OS AgentChat.
- `CompanyOSHookBus` for typed lifecycle hooks that can observe, block, retry, rewrite params, require approval, and attach receipts.
- `A2AAgentCard`, `remote_a2a_agent_as_tool`, and external adapter manifests for Agent-to-Agent compatibility.
- `CompanyOSGraphBuilder` for graph, workflow, and swarm-shaped work.
- `CompanyOSSessionManager` with memory and file-backed session stores.
- `RealtimeVoiceAgent` as the full-duplex voice-agent contract over FluidVoice or provider realtime lanes.
- `EvalExperimentGenerator` for output, trajectory, helpfulness, faithfulness, goal success, tool selection, and tool parameter eval cases.
- `company_os_tool_catalog` / `companyOSToolCatalog` and skill catalogs for installable Tool/Skill Store manifests.

The important difference from generic agent SDKs is that every call is Company OS-native:

- Work becomes tasks and Beads.
- Tools are governed through policy, permissions, sandbox, and reputation.
- Runs produce receipts and evidence.
- Memory belongs to the company, not an isolated chat thread.
- A2A/remote agents are treated as adapters, not trusted local code.

## TypeScript

```ts
import {
  Agent,
  CompanyOSClient,
  CompanyOSGraphBuilder,
  CompanyOSHookBus,
  CompanyOSSessionManager,
  MemorySessionStore,
} from "@hsm-ii/company-os-sdk";

const client = CompanyOSClient.fromEnv();
const hooks = new CompanyOSHookBus()
  .on("before_tool_call", (event) => {
    console.log("tool", event.payload.tool_name);
  });

const agent = new Agent({
  client,
  companyId: "company_uuid",
  agentRef: "operator",
  tools: ["company_memory_search", "company_create_task"],
  hooks,
  sessionManager: new CompanyOSSessionManager(new MemorySessionStore()),
});

const result = await agent.run("Create a launch-readiness task with evidence.");
```

## Python

```python
from company_os_sdk import Agent, CompanyOSClient, CompanyOSHookBus

client = CompanyOSClient.from_env()
hooks = CompanyOSHookBus()
hooks.on("before_tool_call", lambda event: print(event["payload"].get("tool_name")) or None)

agent = Agent(
    client=client,
    company_id="company_uuid",
    agent_ref="operator",
    tools=["company_memory_search", "company_create_task"],
    hooks=hooks,
)

result = agent.run("Create a launch-readiness task with evidence.")
```

## Lifecycle Hooks

The core Company OS hook order is intentionally explicit and stable:

- `before_invocation`
- `before_model_call`
- `after_model_call`
- `before_tool_call`
- `after_tool_call`
- `before_agent_route`
- `after_agent_route`
- `before_bead_transition`
- `after_bead_transition`

The SDK also keeps compatibility hooks for `after_invocation`, `before_node_call`, `after_node_call`, `before_result`, `after_result`, `retry`, `tool_cancelled`, and `modify_tool_parameters`.

Hook decisions can return:

- `block` or `cancel` to stop unsafe work.
- `retry` to request a bounded retry.
- `params` or `rewriteParams` to rewrite tool/route/task parameters.
- `approvalRequired` or `requireApproval` to force a human approval lane.
- `receipts` to attach operator-readable proof to the run.

Durable behavior changes should still be promoted through Company OS policy/eval review, not silently applied from one run.

## A2A Compatibility

Company OS agents can emit an A2A-style card:

```ts
const card = agent.toAgentCard("https://api.company-os.example");
const tool = remoteA2AAgentAsTool(card);
const adapter = a2aAgentCardToExternalAdapter(card, { mode: "bridged" });
```

The card advertises streaming, receipts, approvals, memory, and agent-as-tool support. When consumed by Company OS, the remote agent becomes an external adapter and A2A calls route through policy, reputation, and ledger instead of bypassing governance.

## Graph / Workflow / Swarm

```ts
const graph = new CompanyOSGraphBuilder("launch")
  .agent("research", { agentRef: "research-analyst", prompt: "Find risks." })
  .agent("review", { agentRef: "operator", prompt: "Review risks." })
  .edge("research", "review", { condition: "research complete" });

await graph.run(client, "company_uuid");
```

`run` creates Company OS tasks with graph capability references, dependency metadata, and shared state. It fires `before_agent_route`, `before_bead_transition`, `after_bead_transition`, and `after_agent_route` hooks so graph execution remains visible in Beads and receipts instead of hiding inside an SDK process.

## Sessions

The session abstraction is intentionally pluggable:

- TypeScript: `MemorySessionStore` plus any object implementing `read`, `write`, and `list`.
- Python: `MemorySessionStore` and `FileSessionStore`.

Hosted or S3-style session stores should implement the same contract and can mirror snapshots into Company OS run events or memory.

## Realtime Voice

`RealtimeVoiceAgent` is a contract object for provider-backed full-duplex voice:

- `fluidvoice`
- `openai_realtime`
- `gemini_live`
- `nova_sonic`

It declares microphone/speaker, live transcript, interruptions, tool-calling, receipts, and approval-pause capabilities. The live browser/UI transport remains Company OS-specific so sensitive voice-driven actions still pass through approval and policy.

## Eval Experiment Generation

`EvalExperimentGenerator.fromAgent(...)` produces a Company OS eval experiment with:

- output quality
- trajectory completeness
- interaction helpfulness
- faithfulness
- goal success
- tool selection accuracy
- tool parameter accuracy

This complements the existing EvalGrader, CanaryDetection, result verifier, and meta-harness rather than replacing them.

`EvalExperimentGenerator.fromCompanySignals(...)` can also generate cases from available tools, agent roles, company policies, past failures/corrections, and Beads history. That gives EvalGrader and CanaryDetection a starting pack from the actual operating context instead of only hand-written prompts.

## Public Tool/Skill Store

The SDK exposes curated tool and skill catalogs with permissions, reputation, receipt, and install metadata. Tool/Skill Store packages should declare:

- name
- category
- description
- permissions
- input schema
- receipts produced
- Capability cards
- reputation score
- install count
- health check
- Attach to agent support

Company OS can then show the tool as installable, policy-aware, and auditable instead of treating it as an opaque function.
