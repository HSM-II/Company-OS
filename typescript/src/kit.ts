export type CompanyOSJson =
  | string
  | number
  | boolean
  | null
  | CompanyOSJson[]
  | { [key: string]: CompanyOSJson };

export type CompanyOSObject = { [key: string]: CompanyOSJson };

export type CompanyOSHttpClient = {
  request<T = unknown>(
    method: string,
    path: string,
    options?: { query?: Record<string, unknown>; body?: unknown; headers?: Record<string, string> },
  ): Promise<T>;
  agentChat<T = CompanyOSObject>(
    companyId: string,
    body: { message: string; actor?: string; thread_id?: string; metadata?: CompanyOSObject },
  ): Promise<T>;
  createTask<T = CompanyOSObject>(
    companyId: string,
    body: { title: string } & Record<string, unknown>,
  ): Promise<T>;
  appendRunEvent?<T = CompanyOSObject>(
    companyId: string,
    runId: string,
    body: { event_type: string } & Record<string, unknown>,
  ): Promise<T>;
};

export const COMPANY_OS_CORE_HOOKS = [
  "before_invocation",
  "before_model_call",
  "after_model_call",
  "before_tool_call",
  "after_tool_call",
  "before_agent_route",
  "after_agent_route",
  "before_bead_transition",
  "after_bead_transition",
] as const;

export type CompanyOSCoreHookName = (typeof COMPANY_OS_CORE_HOOKS)[number];

export type CompanyOSHookName =
  | CompanyOSCoreHookName
  | "after_invocation"
  | "before_node_call"
  | "after_node_call"
  | "before_result"
  | "after_result"
  | "retry"
  | "tool_cancelled"
  | "modify_tool_parameters";

export type CompanyOSReceipt = {
  type: string;
  summary?: string;
  payload?: CompanyOSObject;
};

export type CompanyOSHookRetryRequest = boolean | { maxAttempts?: number; delayMs?: number; reason?: string };

export type CompanyOSHookEvent = {
  schema: "hsm.company_os.sdk_hook_event.v1";
  hook: CompanyOSHookName;
  companyId: string;
  agentRef?: string;
  runId?: string;
  nodeId?: string;
  toolName?: string;
  model?: string;
  attempt?: number;
  params?: CompanyOSObject;
  payload: CompanyOSObject;
};

export type CompanyOSHookResult =
  | void
  | {
      params?: CompanyOSObject;
      rewriteParams?: CompanyOSObject;
      metadata?: CompanyOSObject;
      block?: boolean;
      cancel?: boolean;
      retry?: CompanyOSHookRetryRequest;
      approvalRequired?: boolean;
      requireApproval?: boolean;
      receipts?: CompanyOSReceipt[];
      reason?: string;
    };

export type CompanyOSHookDecision = {
  params: CompanyOSObject;
  metadata: CompanyOSObject;
  receipts: CompanyOSReceipt[];
  blocked: boolean;
  approvalRequired: boolean;
  retry: false | { maxAttempts: number; delayMs: number; reason?: string };
  reasons: string[];
};

export type CompanyOSHookHandler = (
  event: CompanyOSHookEvent,
) => CompanyOSHookResult | Promise<CompanyOSHookResult>;

export class CompanyOSHookBlockedError extends Error {
  readonly event: CompanyOSHookEvent;
  readonly decision: CompanyOSHookDecision;

  constructor(event: CompanyOSHookEvent, decision: CompanyOSHookDecision) {
    super(`Company OS hook blocked ${event.hook}${decision.reasons.length ? `: ${decision.reasons.join("; ")}` : ""}`);
    this.name = "CompanyOSHookBlockedError";
    this.event = event;
    this.decision = decision;
  }
}

export class CompanyOSHookBus {
  private readonly handlers = new Map<CompanyOSHookName, CompanyOSHookHandler[]>();

  on(hook: CompanyOSHookName, handler: CompanyOSHookHandler): this {
    const list = this.handlers.get(hook) ?? [];
    list.push(handler);
    this.handlers.set(hook, list);
    return this;
  }

  async emit(event: CompanyOSHookEvent): Promise<CompanyOSHookDecision> {
    let decision = emptyDecision(event.params ?? {});
    for (const handler of this.handlers.get(event.hook) ?? []) {
      const result = await handler(event);
      decision = mergeHookDecision(decision, result);
    }
    return decision;
  }

  async emitChecked(event: CompanyOSHookEvent): Promise<CompanyOSHookDecision> {
    const decision = await this.emit(event);
    if (decision.blocked) throw new CompanyOSHookBlockedError(event, decision);
    return decision;
  }

  async transformToolParameters(event: CompanyOSHookEvent, initial: CompanyOSObject): Promise<CompanyOSObject> {
    const decision = await this.emitChecked({ ...event, hook: "modify_tool_parameters", params: initial });
    return { ...initial, ...decision.params };
  }
}

export type CompanyOSAgentOptions = {
  client: CompanyOSHttpClient;
  companyId: string;
  agentRef: string;
  name?: string;
  actor?: string;
  instructions?: string;
  tools?: string[];
  model?: string;
  hooks?: CompanyOSHookBus;
  sessionManager?: CompanyOSSessionManager;
};

export type CompanyOSAgentRunOptions = {
  threadId?: string;
  runId?: string;
  actor?: string;
  metadata?: CompanyOSObject;
};

export class Agent {
  readonly client: CompanyOSHttpClient;
  readonly companyId: string;
  readonly agentRef: string;
  readonly name: string;
  readonly actor: string;
  readonly instructions?: string;
  readonly tools: string[];
  readonly model?: string;
  readonly hooks: CompanyOSHookBus;
  readonly sessionManager?: CompanyOSSessionManager;

  constructor(options: CompanyOSAgentOptions) {
    this.client = options.client;
    this.companyId = options.companyId;
    this.agentRef = options.agentRef;
    this.name = options.name ?? options.agentRef;
    this.actor = options.actor ?? "sdk";
    this.instructions = options.instructions;
    this.tools = options.tools ?? [];
    this.model = options.model;
    this.hooks = options.hooks ?? new CompanyOSHookBus();
    this.sessionManager = options.sessionManager;
  }

  async run(input: string, options: CompanyOSAgentRunOptions = {}): Promise<CompanyOSObject> {
    const runId = options.runId ?? `sdk-${Date.now().toString(36)}`;
    let runParams: CompanyOSObject = {
      input,
      actor: options.actor ?? this.actor,
      thread_id: options.threadId ?? null,
      metadata: options.metadata ?? {},
    };
    const receipts: CompanyOSReceipt[] = [];

    runParams = await this.applyHook(
      "before_invocation",
      {
        input,
        actor: String(runParams.actor ?? this.actor),
        instructions: this.instructions ?? "",
        tools: this.tools,
        metadata: options.metadata ?? {},
      },
      options,
      runParams,
      receipts,
      runId,
    );

    await this.applyHook(
      "before_agent_route",
      {
        route: "company_agent_chat",
        agentRef: this.agentRef,
        tools: this.tools,
      },
      options,
      { agent_ref: this.agentRef, route: "company_agent_chat" },
      receipts,
      runId,
    );

    await this.applyHook(
      "before_model_call",
      { input: runParams.input ?? input, model: this.model ?? null },
      options,
      { model: this.model ?? null },
      receipts,
      runId,
    );

    let toolParams = await this.applyHook(
      "before_tool_call",
      {
        tool_name: "company_agent_chat",
        params: { message: runParams.input ?? input, actor: runParams.actor ?? this.actor },
      },
      options,
      { message: runParams.input ?? input, actor: runParams.actor ?? this.actor, thread_id: runParams.thread_id ?? null },
      receipts,
      runId,
    );

    toolParams = await this.hooks.transformToolParameters(
      this.event("modify_tool_parameters", { tool_name: "company_agent_chat" }, options, runId, toolParams),
      toolParams,
    );

    let normalized: CompanyOSObject | undefined;
    let attempt = 1;
    let maxAttempts = 1;
    while (attempt <= maxAttempts) {
      try {
        const response = await this.client.agentChat(this.companyId, {
          message: String(toolParams.message ?? runParams.input ?? input),
          actor: String(toolParams.actor ?? runParams.actor ?? this.actor),
          thread_id: valueAsString(toolParams.thread_id ?? runParams.thread_id),
          metadata: {
            schema: "hsm.company_os.sdk_agent_run.v1",
            agent_ref: this.agentRef,
            model: this.model ?? null,
            tools: this.tools,
            hook_receipts: receipts as unknown as CompanyOSJson,
            ...(options.metadata ?? {}),
          },
        });
        normalized = asObject(response);
        const afterTool = await this.emitAndRecord(
          this.event(
            "after_tool_call",
            { tool_name: "company_agent_chat", response: normalized },
            options,
            runId,
            toolParams,
            attempt,
          ),
          receipts,
        );
        if (afterTool.retry && attempt < afterTool.retry.maxAttempts) {
          maxAttempts = Math.max(maxAttempts, afterTool.retry.maxAttempts);
          await delay(afterTool.retry.delayMs);
          attempt += 1;
          continue;
        }
        break;
      } catch (error) {
        const retry = await this.emitAndRecord(
          this.event("retry", { error: errorToPayload(error), attempt }, options, runId, toolParams, attempt),
          receipts,
        );
        if (retry.retry && attempt < retry.retry.maxAttempts) {
          maxAttempts = Math.max(maxAttempts, retry.retry.maxAttempts);
          await delay(retry.retry.delayMs);
          attempt += 1;
          continue;
        }
        throw error;
      }
    }

    const response = normalized ?? {};
    await this.emitAndRecord(this.event("after_agent_route", { response }, options, runId), receipts);
    await this.emitAndRecord(this.event("after_model_call", { response }, options, runId), receipts);
    await this.emitAndRecord(this.event("before_result", { response }, options, runId), receipts);

    if (this.sessionManager) {
      await this.sessionManager.append({
        sessionId: options.threadId ?? String(response.thread_id ?? response.threadId ?? "default"),
        event: {
          type: "agent_result",
          agentRef: this.agentRef,
          input: String(runParams.input ?? input),
          response,
          receipts: receipts as unknown as CompanyOSJson,
          ts: new Date().toISOString(),
        },
      });
    }

    await this.emitAndRecord(this.event("after_result", { response }, options, runId), receipts);
    await this.emitAndRecord(this.event("after_invocation", { response }, options, runId), receipts);
    return response;
  }

  toAgentCard(baseUrl: string): A2AAgentCard {
    return {
      schema: "hsm.company_os.a2a_agent_card.v1",
      protocol: "a2a",
      name: this.name,
      agentRef: this.agentRef,
      url: `${baseUrl.replace(/\/+$/, "")}/api/company/companies/${this.companyId}/agent-chat`,
      capabilities: {
        streaming: true,
        agentAsTool: true,
        receipts: true,
        approvals: true,
        memory: true,
      },
      skills: this.tools.map((tool) => ({ name: tool })),
      metadata: {
        companyId: this.companyId,
        model: this.model ?? null,
      },
    };
  }

  private async applyHook(
    hook: CompanyOSHookName,
    payload: CompanyOSObject,
    options: CompanyOSAgentRunOptions,
    params: CompanyOSObject,
    receipts: CompanyOSReceipt[],
    runId: string,
  ): Promise<CompanyOSObject> {
    const decision = await this.emitAndRecord(this.event(hook, payload, options, runId, params), receipts);
    return { ...params, ...decision.params };
  }

  private async emitAndRecord(event: CompanyOSHookEvent, receipts: CompanyOSReceipt[]): Promise<CompanyOSHookDecision> {
    const decision = await this.hooks.emitChecked(event);
    receipts.push(...decision.receipts);
    if (this.client.appendRunEvent && event.runId) {
      for (const receipt of decision.receipts) {
        await this.client.appendRunEvent(this.companyId, event.runId, {
          event_type: "sdk_hook_receipt",
          hook: event.hook,
          payload: {
            schema: "hsm.company_os.sdk_hook_receipt.v1",
            receipt,
            metadata: decision.metadata,
            approval_required: decision.approvalRequired,
          },
        });
      }
    }
    return decision;
  }

  private event(
    hook: CompanyOSHookName,
    payload: CompanyOSObject,
    options: CompanyOSAgentRunOptions,
    runId: string,
    params?: CompanyOSObject,
    attempt?: number,
  ): CompanyOSHookEvent {
    return {
      schema: "hsm.company_os.sdk_hook_event.v1",
      hook,
      companyId: this.companyId,
      agentRef: this.agentRef,
      runId,
      model: this.model,
      attempt,
      params,
      payload,
    };
  }
}

export type A2AAgentCard = {
  schema: "hsm.company_os.a2a_agent_card.v1";
  protocol: "a2a";
  name: string;
  agentRef: string;
  url: string;
  capabilities: {
    streaming: boolean;
    agentAsTool: boolean;
    receipts: boolean;
    approvals: boolean;
    memory: boolean;
  };
  skills: Array<{ name: string; description?: string }>;
  metadata?: CompanyOSObject;
};

export type A2AExternalAdapterManifest = {
  schema: "hsm.company_os.external_adapter_manifest.v1";
  adapter_type: "external";
  mode: "noop" | "webhook" | "bridged";
  name: string;
  agent_ref: string;
  endpoint: string;
  capabilities: CompanyOSObject;
  auth: { kind: "local_agent_jwt" | "bearer" | "none"; audience?: string };
  policy: { route_through_policy: boolean; route_through_reputation: boolean; write_to_ledger: boolean };
  metadata?: CompanyOSObject;
};

export function remoteA2AAgentAsTool(card: A2AAgentCard): CompanyOSToolManifest {
  return {
    name: `a2a_${slugify(card.agentRef)}`,
    title: `${card.name} remote agent`,
    category: "a2a",
    description: "Remote A2A agent exposed as a Company OS governed tool.",
    permissions: ["network", "agent.invoke"],
    receipts: ["a2a_call_started", "a2a_policy_decision", "a2a_call_completed"],
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string" },
        context: { type: "object" },
      },
      required: ["message"],
    },
    capabilityCard: {
      summary: "Calls a remote A2A agent through Company OS policy, reputation, and ledger.",
      riskLevel: "medium",
      setup: "Install the external adapter card, verify health, then attach it to an agent.",
    },
    reputationScore: numberFromMetadata(card.metadata?.reputation_score, 0.5),
    installCount: numberFromMetadata(card.metadata?.install_count, 0),
    healthCheck: { endpoint: card.url, expectedReceipt: "a2a_call_completed" },
    attachToAgent: { supported: true, requiresApproval: true },
    metadata: { card: card as unknown as CompanyOSJson },
  };
}

export function a2aAgentCardToExternalAdapter(
  card: A2AAgentCard,
  options: { mode?: "noop" | "webhook" | "bridged"; auth?: "local_agent_jwt" | "bearer" | "none" } = {},
): A2AExternalAdapterManifest {
  return {
    schema: "hsm.company_os.external_adapter_manifest.v1",
    adapter_type: "external",
    mode: options.mode ?? "bridged",
    name: card.name,
    agent_ref: card.agentRef,
    endpoint: card.url,
    capabilities: card.capabilities as unknown as CompanyOSObject,
    auth: { kind: options.auth ?? "local_agent_jwt", audience: card.agentRef },
    policy: {
      route_through_policy: true,
      route_through_reputation: true,
      write_to_ledger: true,
    },
    metadata: { card: card as unknown as CompanyOSJson },
  };
}

export type GraphNodeKind = "agent" | "task" | "workflow" | "swarm" | "tool" | "approval";

export type GraphNode = {
  id: string;
  kind: GraphNodeKind;
  title: string;
  agentRef?: string;
  prompt?: string;
  metadata?: CompanyOSObject;
};

export type GraphEdge = {
  from: string;
  to: string;
  condition?: string;
  metadata?: CompanyOSObject;
};

export class CompanyOSGraphBuilder {
  readonly id: string;
  private readonly nodes = new Map<string, GraphNode>();
  private readonly edges: GraphEdge[] = [];
  private state: CompanyOSObject = {};

  constructor(id: string) {
    this.id = id;
  }

  agent(id: string, options: { title?: string; agentRef?: string; prompt?: string; metadata?: CompanyOSObject } = {}): this {
    return this.node({
      id,
      kind: "agent",
      title: options.title ?? id,
      agentRef: options.agentRef ?? id,
      prompt: options.prompt,
      metadata: options.metadata,
    });
  }

  task(id: string, title: string, options: { prompt?: string; metadata?: CompanyOSObject } = {}): this {
    return this.node({ id, kind: "task", title, prompt: options.prompt, metadata: options.metadata });
  }

  workflow(id: string, title: string, metadata: CompanyOSObject = {}): this {
    return this.node({ id, kind: "workflow", title, metadata });
  }

  swarm(id: string, title: string, metadata: CompanyOSObject = {}): this {
    return this.node({ id, kind: "swarm", title, metadata });
  }

  node(node: GraphNode): this {
    this.nodes.set(node.id, node);
    return this;
  }

  edge(from: string, to: string, options: { condition?: string; metadata?: CompanyOSObject } = {}): this {
    this.edges.push({ from, to, condition: options.condition, metadata: options.metadata });
    return this;
  }

  sharedState(state: CompanyOSObject): this {
    this.state = { ...this.state, ...state };
    return this;
  }

  toJSON(): CompanyOSObject {
    return {
      schema: "hsm.company_os.sdk_graph.v1",
      id: this.id,
      nodes: Array.from(this.nodes.values()) as unknown as CompanyOSJson,
      edges: this.edges as unknown as CompanyOSJson,
      shared_state: this.state,
    };
  }

  asTool(): CompanyOSToolManifest {
    return {
      name: `graph_${slugify(this.id)}`,
      title: `Graph workflow ${this.id}`,
      category: "graph",
      description: "Company OS graph/workflow runnable as a governed tool.",
      permissions: ["tasks.write", "agent.invoke"],
      receipts: ["graph_compiled", "graph_tasks_created"],
      inputSchema: { type: "object", properties: { input: { type: "string" } } },
      capabilityCard: {
        summary: "Compiles a graph into Beads-backed work with approvals, evidence, and memory context.",
        riskLevel: "medium",
        setup: "Preview the graph, then create the task ledger entries.",
      },
      reputationScore: 0.8,
      installCount: 0,
      healthCheck: { expectedReceipt: "graph_tasks_created" },
      attachToAgent: { supported: true, requiresApproval: false },
      metadata: this.toJSON(),
    };
  }

  async run(
    client: CompanyOSHttpClient,
    companyId: string,
    options: { title?: string; actor?: string; hooks?: CompanyOSHookBus; runId?: string } = {},
  ): Promise<CompanyOSObject> {
    const hooks = options.hooks ?? new CompanyOSHookBus();
    const runId = options.runId ?? `sdk-graph-${Date.now().toString(36)}`;
    const created: CompanyOSObject[] = [];
    const taskIdByNode = new Map<string, string>();

    for (const node of this.nodes.values()) {
      if (!["agent", "task", "workflow", "swarm", "approval"].includes(node.kind)) continue;
      const incomingEdges = this.edges.filter((edge) => edge.to === node.id);
      const dependencies = incomingEdges.map((edge) => taskIdByNode.get(edge.from)).filter(Boolean);
      await hooks.emitChecked(graphEvent("before_agent_route", companyId, runId, this.id, node, { node, incoming_edges: incomingEdges }));
      let createParams: CompanyOSObject = {
        title: node.title,
        specification: node.prompt ?? options.title ?? `Run ${node.kind} node ${node.id}`,
        owner_persona: node.agentRef ?? null,
        depends_on_task_ids: dependencies as unknown as CompanyOSJson,
        capability_refs: [
          { kind: "sdk_graph", ref: this.id },
          { kind: "graph_node", ref: node.id },
        ] as unknown as CompanyOSJson,
        metadata: {
          schema: "hsm.company_os.sdk_graph_node.v1",
          graph_id: this.id,
          node: node as unknown as CompanyOSJson,
          incoming_edges: incomingEdges as unknown as CompanyOSJson,
          shared_state: this.state,
          actor: options.actor ?? "sdk",
        },
      };
      const beforeBead = await hooks.emitChecked(
        graphEvent("before_bead_transition", companyId, runId, this.id, node, { transition: "create", params: createParams }, createParams),
      );
      createParams = { ...createParams, ...beforeBead.params };
      const response = await client.createTask(companyId, createParams as { title: string } & Record<string, unknown>);
      const obj = asObject(response);
      const task = asObject(obj.task ?? obj);
      if (typeof task.id === "string") taskIdByNode.set(node.id, task.id);
      await hooks.emitChecked(
        graphEvent("after_bead_transition", companyId, runId, this.id, node, { transition: "create", response: obj }),
      );
      await hooks.emitChecked(graphEvent("after_agent_route", companyId, runId, this.id, node, { node, response: obj }));
      created.push(obj);
    }

    return {
      schema: "hsm.company_os.sdk_graph_run.v1",
      graph_id: this.id,
      created_count: created.length,
      tasks: created as unknown as CompanyOSJson,
    };
  }
}

export type CompanyOSSessionEvent = {
  type: string;
  ts?: string;
  [key: string]: CompanyOSJson | undefined;
};

export type CompanyOSSessionSnapshot = {
  schema: "hsm.company_os.sdk_session.v1";
  sessionId: string;
  events: CompanyOSSessionEvent[];
  metadata?: CompanyOSObject;
};

export type CompanyOSSessionStore = {
  read(sessionId: string): Promise<CompanyOSSessionSnapshot | undefined>;
  write(snapshot: CompanyOSSessionSnapshot): Promise<void>;
  list?(): Promise<string[]>;
};

export class MemorySessionStore implements CompanyOSSessionStore {
  private readonly sessions = new Map<string, CompanyOSSessionSnapshot>();

  async read(sessionId: string): Promise<CompanyOSSessionSnapshot | undefined> {
    return this.sessions.get(sessionId);
  }

  async write(snapshot: CompanyOSSessionSnapshot): Promise<void> {
    this.sessions.set(snapshot.sessionId, snapshot);
  }

  async list(): Promise<string[]> {
    return Array.from(this.sessions.keys()).sort();
  }
}

export class CompanyOSSessionManager {
  readonly store: CompanyOSSessionStore;

  constructor(store: CompanyOSSessionStore = new MemorySessionStore()) {
    this.store = store;
  }

  async append(input: { sessionId: string; event: CompanyOSSessionEvent; metadata?: CompanyOSObject }): Promise<CompanyOSSessionSnapshot> {
    const existing = await this.store.read(input.sessionId);
    const snapshot: CompanyOSSessionSnapshot = existing ?? {
      schema: "hsm.company_os.sdk_session.v1",
      sessionId: input.sessionId,
      events: [],
      metadata: input.metadata,
    };
    snapshot.events.push({ ...input.event, ts: input.event.ts ?? new Date().toISOString() });
    await this.store.write(snapshot);
    return snapshot;
  }
}

export type RealtimeVoiceProvider = "fluidvoice" | "openai_realtime" | "gemini_live" | "nova_sonic";

export type RealtimeVoiceAgentConfig = {
  provider: RealtimeVoiceProvider;
  companyId: string;
  agentRef: string;
  model?: string;
  allowInterruptions?: boolean;
  toolCalling?: boolean;
  approvalMode?: "auto" | "approval_required";
};

export class RealtimeVoiceAgent {
  readonly config: RealtimeVoiceAgentConfig;
  readonly hooks: CompanyOSHookBus;

  constructor(config: RealtimeVoiceAgentConfig, hooks: CompanyOSHookBus = new CompanyOSHookBus()) {
    this.config = config;
    this.hooks = hooks;
  }

  describe(): CompanyOSObject {
    return {
      schema: "hsm.company_os.realtime_voice_agent.v1",
      ...this.config,
      transport: this.config.provider === "fluidvoice" ? "local" : "provider_native_realtime",
      capabilities: {
        microphone: true,
        speaker: true,
        live_transcript: true,
        interruptions: this.config.allowInterruptions !== false,
        tool_calling: this.config.toolCalling !== false,
        approval_pause: (this.config.approvalMode ?? "approval_required") === "approval_required",
        receipts: true,
      },
      hook_order: COMPANY_OS_CORE_HOOKS as unknown as CompanyOSJson,
    };
  }
}

export type EvalExperiment = {
  schema: "hsm.company_os.sdk_eval_experiment.v1";
  name: string;
  agentRef: string;
  companyId: string;
  metrics: string[];
  cases: Array<{ id: string; prompt: string; expected?: string; metadata?: CompanyOSObject }>;
  generatedFrom: CompanyOSObject;
};

export type EvalExperimentSignals = {
  companyId: string;
  agentRef: string;
  availableTools?: CompanyOSToolManifest[];
  agentRoles?: Array<{ ref: string; role: string; responsibilities?: string[] }>;
  companyPolicies?: Array<{ id: string; title: string; rule?: string }>;
  pastFailures?: Array<{ id: string; summary: string; prompt?: string }>;
  corrections?: Array<{ id: string; summary: string; prompt?: string }>;
  beadsHistory?: Array<{ id: string; title: string; status?: string; labels?: string[] }>;
};

export class EvalExperimentGenerator {
  static fromAgent(agent: Agent, prompts: string[]): EvalExperiment {
    return {
      schema: "hsm.company_os.sdk_eval_experiment.v1",
      name: `${agent.agentRef}-sdk-eval`,
      agentRef: agent.agentRef,
      companyId: agent.companyId,
      metrics: defaultEvalMetrics(),
      cases: prompts.map((prompt, index) => ({
        id: `case-${index + 1}`,
        prompt,
        metadata: { tools: agent.tools, model: agent.model ?? null },
      })),
      generatedFrom: {
        source: "company_os_sdk_agent",
        tools: agent.tools,
        instructions_present: Boolean(agent.instructions),
      },
    };
  }

  static fromCompanySignals(signals: EvalExperimentSignals): EvalExperiment {
    const cases = [
      ...(signals.availableTools ?? []).map((tool) => ({
        id: `tool-${tool.name}`,
        prompt: `Use or reject ${tool.name} correctly for a task that may require ${tool.permissions.join(", ")}.`,
        metadata: { source: "available_tools", tool: tool.name, permissions: tool.permissions },
      })),
      ...(signals.agentRoles ?? []).map((role) => ({
        id: `role-${slugify(role.ref)}`,
        prompt: `Route work to ${role.ref} only when the role responsibilities match the request.`,
        metadata: { source: "agent_roles", role: role as unknown as CompanyOSJson },
      })),
      ...(signals.companyPolicies ?? []).map((policy) => ({
        id: `policy-${slugify(policy.id)}`,
        prompt: `Apply policy "${policy.title}" and pause for approval when required.`,
        metadata: { source: "company_policies", policy: policy as unknown as CompanyOSJson },
      })),
      ...(signals.pastFailures ?? []).map((failure) => ({
        id: `failure-${slugify(failure.id)}`,
        prompt: failure.prompt ?? `Avoid repeating this past failure: ${failure.summary}`,
        metadata: { source: "past_failures", failure: failure as unknown as CompanyOSJson },
      })),
      ...(signals.corrections ?? []).map((correction) => ({
        id: `correction-${slugify(correction.id)}`,
        prompt: correction.prompt ?? `Honor this user correction: ${correction.summary}`,
        metadata: { source: "corrections", correction: correction as unknown as CompanyOSJson },
      })),
      ...(signals.beadsHistory ?? []).map((bead) => ({
        id: `bead-${slugify(bead.id)}`,
        prompt: `Continue or triage bead "${bead.title}" with correct status, labels, evidence, and owner.`,
        metadata: { source: "beads_history", bead: bead as unknown as CompanyOSJson },
      })),
    ];
    return {
      schema: "hsm.company_os.sdk_eval_experiment.v1",
      name: `${signals.agentRef}-signals-eval`,
      agentRef: signals.agentRef,
      companyId: signals.companyId,
      metrics: defaultEvalMetrics(),
      cases,
      generatedFrom: {
        source: "company_os_signals",
        available_tools: (signals.availableTools ?? []).length,
        agent_roles: (signals.agentRoles ?? []).length,
        company_policies: (signals.companyPolicies ?? []).length,
        past_failures: (signals.pastFailures ?? []).length,
        corrections: (signals.corrections ?? []).length,
        beads_history: (signals.beadsHistory ?? []).length,
      },
    };
  }
}

export type CompanyOSToolManifest = {
  name: string;
  title: string;
  category: "memory" | "graph" | "web" | "code" | "shell" | "browser" | "mcp" | "a2a" | "skill";
  description: string;
  permissions: string[];
  receipts: string[];
  inputSchema: CompanyOSObject;
  capabilityCard: { summary: string; riskLevel: "low" | "medium" | "high"; setup: string };
  reputationScore: number;
  installCount: number;
  healthCheck: { endpoint?: string; command?: string; expectedReceipt?: string };
  attachToAgent: { supported: boolean; requiresApproval: boolean };
  metadata?: CompanyOSObject;
};

export const companyOSToolCatalog: CompanyOSToolManifest[] = [
  tool("company_memory_search", "Company memory search", "memory", "Retrieve shared company memory with evidence receipts.", ["memory.read"], "low"),
  tool("company_create_task", "Create Company OS task", "graph", "Create a Beads-backed task in the company ledger.", ["tasks.write"], "medium"),
  tool("company_web_search", "Governed web search", "web", "Search through a bounded Company OS web adapter.", ["network"], "medium"),
  tool("company_sql_query", "Company SQL query", "code", "Run governed SQL against approved company data.", ["data.read"], "high"),
  tool("company_sandbox_exec", "Sandbox command", "shell", "Run risky tool work in a policy-selected sandbox.", ["sandbox.exec"], "high"),
  tool("company_browser_snapshot_capture", "Browser snapshot", "browser", "Capture a governed browser/workflow snapshot.", ["browser.read"], "medium"),
  tool("company_dynamic_workflow_run", "Dynamic workflow plan", "graph", "Compile a goal into an auditable workflow plan.", ["tasks.write", "memory.write"], "medium"),
  tool("company_persona_sidecar_status", "Sidecar dependency status", "mcp", "Check br/bv/cass/asupersync sidecar readiness.", ["runtime.read"], "low"),
];

export const companyOSSkillStoreCatalog: CompanyOSToolManifest[] = [
  tool("skill_trace_to_prompt_delta", "Trace to prompt proposal", "skill", "Analyze receipts and propose a review-gated prompt delta.", ["memory.read", "skills.write"], "medium"),
  tool("skill_agent_role_contract", "Role instruction contract", "skill", "Attach role-owned instructions and scope to an agent.", ["agents.write", "skills.read"], "medium"),
];

function tool(
  name: string,
  title: string,
  category: CompanyOSToolManifest["category"],
  description: string,
  permissions: string[],
  riskLevel: "low" | "medium" | "high",
): CompanyOSToolManifest {
  return {
    name,
    title,
    category,
    description,
    permissions,
    receipts: ["tool_call_started", "tool_call_completed", "policy_decision"],
    inputSchema: { type: "object", additionalProperties: true },
    capabilityCard: {
      summary: description,
      riskLevel,
      setup: "Install, run health check, then attach to one or more agents.",
    },
    reputationScore: riskLevel === "high" ? 0.65 : 0.85,
    installCount: 0,
    healthCheck: { expectedReceipt: "tool_call_completed" },
    attachToAgent: { supported: true, requiresApproval: riskLevel !== "low" },
  };
}

function graphEvent(
  hook: CompanyOSHookName,
  companyId: string,
  runId: string,
  graphId: string,
  node: GraphNode,
  payload: CompanyOSObject,
  params?: CompanyOSObject,
): CompanyOSHookEvent {
  return {
    schema: "hsm.company_os.sdk_hook_event.v1",
    hook,
    companyId,
    runId,
    nodeId: node.id,
    agentRef: node.agentRef,
    params,
    payload: {
      graph_id: graphId,
      ...payload,
    },
  };
}

function emptyDecision(params: CompanyOSObject = {}): CompanyOSHookDecision {
  return {
    params,
    metadata: {},
    receipts: [],
    blocked: false,
    approvalRequired: false,
    retry: false,
    reasons: [],
  };
}

function mergeHookDecision(current: CompanyOSHookDecision, result: CompanyOSHookResult): CompanyOSHookDecision {
  if (!result) return current;
  const nextParams = { ...current.params, ...(result.params ?? {}), ...(result.rewriteParams ?? {}) };
  const nextMetadata = { ...current.metadata, ...(result.metadata ?? {}) };
  const nextReceipts = [...current.receipts, ...(result.receipts ?? [])];
  const reasons = [...current.reasons];
  if (result.reason) reasons.push(result.reason);
  return {
    params: nextParams,
    metadata: nextMetadata,
    receipts: nextReceipts,
    blocked: current.blocked || Boolean(result.block || result.cancel),
    approvalRequired: current.approvalRequired || Boolean(result.approvalRequired || result.requireApproval),
    retry: normalizeRetry(current.retry, result.retry),
    reasons,
  };
}

function normalizeRetry(
  existing: CompanyOSHookDecision["retry"],
  incoming?: CompanyOSHookRetryRequest,
): CompanyOSHookDecision["retry"] {
  if (!incoming) return existing;
  const next =
    incoming === true
      ? { maxAttempts: 2, delayMs: 0 }
      : {
          maxAttempts: Math.max(1, incoming.maxAttempts ?? 2),
          delayMs: Math.max(0, incoming.delayMs ?? 0),
          reason: incoming.reason,
        };
  if (!existing) return next;
  return {
    maxAttempts: Math.max(existing.maxAttempts, next.maxAttempts),
    delayMs: Math.max(existing.delayMs, next.delayMs),
    reason: next.reason ?? existing.reason,
  };
}

function defaultEvalMetrics(): string[] {
  return [
    "output_quality",
    "trajectory_completeness",
    "interaction_helpfulness",
    "faithfulness",
    "goal_success",
    "tool_selection_accuracy",
    "tool_parameter_accuracy",
  ];
}

function asObject(value: unknown): CompanyOSObject {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as CompanyOSObject;
  return {};
}

function valueAsString(value: CompanyOSJson | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberFromMetadata(value: CompanyOSJson | undefined, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function slugify(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

function errorToPayload(error: unknown): CompanyOSObject {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: String(error) };
}

async function delay(delayMs: number): Promise<void> {
  if (delayMs <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
