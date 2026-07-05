export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type JsonObject = { [key: string]: JsonValue };

export type RequestOptions = {
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
};

export type RuntimeDaemonRegistration = {
  device_id: string;
  agent_ref: string;
  host?: string;
  platform?: string;
  detected_clis?: string[];
  poll_interval_secs?: number;
  daemon_version?: string;
  metadata?: JsonObject;
  execution_backend?: string;
  execution_endpoint?: string;
};

export type RuntimeDaemonHeartbeat = {
  agent_ref: string;
  status?: "online" | "idle" | "offline" | "error";
  metadata?: JsonObject;
};

export type CompanyActionEvent = {
  schema: "hsm.company_os.action_event.v1";
  grammar?: "operator_stream_v1";
  id?: string;
  run_id: string;
  event_seq: number;
  event_type: string;
  phase?: string | null;
  ts: string;
  lane?: string | null;
  backend?: string | null;
  model?: string | null;
  tool_name?: string | null;
  duration_ms?: number | null;
  error_code?: string | null;
  fallback_reason?: string | null;
  payload: JsonObject;
};

export type AppendCompanyActionEvent = {
  event_type: string;
  phase?: string;
  lane?: string;
  backend?: string;
  model?: string;
  tool_name?: string;
  duration_ms?: number;
  error_code?: string;
  fallback_reason?: string;
  payload?: JsonObject;
};

export type CompanyAgentDefinition = {
  schema: "hsm.company_os.agent_definition.v1";
  slug: string;
  name: string;
  description?: string;
  work_mode?: string;
  context_budget?: JsonObject;
  tools?: Array<{ name: string; required?: boolean; permission?: string; description?: string }>;
  mcp?: Array<{ name: string; command?: string; url?: string; args?: string[]; env_keys?: string[]; tools?: string[] }>;
  runtime?: JsonObject;
  metadata?: JsonObject;
  instructions_markdown?: string;
};

export type DeadStarContributorCreate = {
  contributor_name: string;
  role?: string;
  departed_at?: string;
  judgment_corpus?: string;
  beneficiary_meta?: JsonObject;
  royalty_rate_bps?: number;
};

export type DeadStarReviewRequest = {
  task_id: string;
  work_summary?: string;
};

export type DeadStarAccrualRequest = {
  task_id?: string;
  event_kind: "review" | "reference" | "manual";
  verdict?: string;
  amount_usd?: number;
  settlement_meta?: JsonObject;
};

export class CompanyOSAPIError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(`Company OS API error ${status}: ${message}`);
    this.name = "CompanyOSAPIError";
    this.status = status;
    this.body = body;
  }
}

export class CompanyOSClient {
  readonly baseUrl: string;
  readonly token?: string;

  constructor(options: { baseUrl: string; token?: string }) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.token = options.token;
  }

  static fromEnv(): CompanyOSClient {
    return new CompanyOSClient({
      baseUrl: env("HSM_COMPANY_API_URL") || "http://localhost:8765",
      token: env("HSM_COMPANY_API_TOKEN") || undefined,
    });
  }

  async request<T = unknown>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.url(path, options.query);
    const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const init: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const res = await fetch(url, init);
    const contentType = res.headers.get("content-type") || "";
    const parsed = contentType.includes("application/json") ? await res.json() : await res.text();
    if (!res.ok) {
      const message =
        typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error?: unknown }).error)
          : res.statusText;
      throw new CompanyOSAPIError(res.status, message, parsed);
    }
    return parsed as T;
  }

  health<T = JsonObject>(): Promise<T> {
    return this.request("GET", "/api/company/health");
  }

  listCompanies<T = JsonObject>(): Promise<T> {
    return this.request("GET", "/api/company/companies");
  }

  createCompany<T = JsonObject>(body: { slug: string; display_name: string; hsmii_home?: string }): Promise<T> {
    return this.request("POST", "/api/company/companies", { body });
  }

  getCompany<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}`);
  }

  updateCompany<T = JsonObject>(companyId: string, body: Record<string, unknown>): Promise<T> {
    return this.request("PATCH", `/api/company/companies/${companyId}`, { body });
  }

  deleteCompany<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("DELETE", `/api/company/companies/${companyId}`);
  }

  dashboard<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/dashboard`);
  }

  apiCatalog<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/api-catalog`);
  }

  listGoals<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/goals`);
  }

  createGoal<T = JsonObject>(companyId: string, body: { title: string } & Record<string, unknown>): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/goals`, { body });
  }

  updateGoal<T = JsonObject>(companyId: string, goalId: string, body: Record<string, unknown>): Promise<T> {
    return this.request("PATCH", `/api/company/companies/${companyId}/goals/${goalId}`, { body });
  }

  listTasks<T = JsonObject>(companyId: string, query?: Record<string, unknown>): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/tasks`, { query });
  }

  createTask<T = JsonObject>(companyId: string, body: { title: string } & Record<string, unknown>): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/tasks`, { body });
  }

  deleteTask<T = JsonObject>(companyId: string, taskId: string): Promise<T> {
    return this.request("DELETE", `/api/company/companies/${companyId}/tasks/${taskId}`);
  }

  updateTaskState<T = JsonObject>(taskId: string, body: { state: string } & Record<string, unknown>): Promise<T> {
    return this.request("PATCH", `/api/company/tasks/${taskId}/state`, { body });
  }

  decideTask<T = JsonObject>(
    taskId: string,
    body: { decision_mode: "auto" | "admin_required" | "blocked"; actor?: string; reason?: string },
    idempotencyKey?: string,
  ): Promise<T> {
    const headers = idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined;
    return this.request("POST", `/api/company/tasks/${taskId}/decision`, { body, headers });
  }

  setTaskRequiresHuman<T = JsonObject>(
    taskId: string,
    body: { requires_human: boolean; actor?: string; reason?: string },
  ): Promise<T> {
    return this.request("POST", `/api/company/tasks/${taskId}/requires-human`, { body });
  }

  listAgents<T = JsonObject>(companyId: string, query?: Record<string, unknown>): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/agents`, { query });
  }

  createAgent<T = JsonObject>(companyId: string, body: { name: string } & Record<string, unknown>): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/agents`, { body });
  }

  createAgentFromDefinition<T = JsonObject>(
    companyId: string,
    definition: CompanyAgentDefinition,
  ): Promise<T> {
    return this.createAgent(companyId, {
      name: definition.name,
      slug: definition.slug,
      description: definition.description,
      instructions_markdown: definition.instructions_markdown,
      work_mode: definition.work_mode,
      tool_declarations: definition.tools ?? [],
      mcp_declarations: definition.mcp ?? [],
      runtime: definition.runtime ?? {},
      context_budget: definition.context_budget ?? {},
      metadata: {
        schema: definition.schema,
        ...(definition.metadata ?? {}),
      },
    });
  }

  updateAgent<T = JsonObject>(companyId: string, agentId: string, body: Record<string, unknown>): Promise<T> {
    return this.request("PATCH", `/api/company/companies/${companyId}/agents/${agentId}`, { body });
  }

  deleteAgent<T = JsonObject>(companyId: string, agentId: string): Promise<T> {
    return this.request("DELETE", `/api/company/companies/${companyId}/agents/${agentId}`);
  }

  listMemory<T = JsonObject>(companyId: string, query?: Record<string, unknown>): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/memory`, { query });
  }

  createMemory<T = JsonObject>(
    companyId: string,
    body: { title: string; body: string } & Record<string, unknown>,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/memory`, {
      body: { scope: "shared", ...body },
    });
  }

  agentChat<T = JsonObject>(
    companyId: string,
    body: { message: string; actor?: string; thread_id?: string },
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/agent-chat`, { body });
  }

  board<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/board`);
  }

  boardColumns<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/board/columns`);
  }

  boardPresence<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/board/presence`);
  }

  listRuntimeDaemons<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/runtime/daemons`);
  }

  registerRuntimeDaemon<T = JsonObject>(
    companyId: string,
    body: RuntimeDaemonRegistration,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/runtime/daemons/register`, { body });
  }

  heartbeatRuntimeDaemon<T = JsonObject>(
    companyId: string,
    deviceId: string,
    body: RuntimeDaemonHeartbeat,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/runtime/daemons/${deviceId}/heartbeat`, { body });
  }

  deregisterRuntimeDaemon<T = JsonObject>(
    companyId: string,
    deviceId: string,
    body: { agent_ref: string },
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/runtime/daemons/${deviceId}/deregister`, { body });
  }

  listDeadStarContributors<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/dead-star/contributors`);
  }

  createDeadStarContributor<T = JsonObject>(
    companyId: string,
    body: DeadStarContributorCreate,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/dead-star/contributors`, { body });
  }

  updateDeadStarContributor<T = JsonObject>(
    companyId: string,
    contributorId: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request("PATCH", `/api/company/companies/${companyId}/dead-star/contributors/${contributorId}`, { body });
  }

  reviewWithDeadStarContributor<T = JsonObject>(
    companyId: string,
    contributorId: string,
    body: DeadStarReviewRequest,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/dead-star/contributors/${contributorId}/review`, { body });
  }

  accrueDeadStarRoyalty<T = JsonObject>(
    companyId: string,
    contributorId: string,
    body: DeadStarAccrualRequest,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/dead-star/contributors/${contributorId}/accrue`, { body });
  }

  listDeadStarRoyaltyLedger<T = JsonObject>(companyId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/dead-star/royalty-ledger`);
  }

  settleDeadStarRoyaltyEvent<T = JsonObject>(
    eventId: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request("POST", `/api/company/dead-star/royalty-events/${eventId}/settle`, { body });
  }

  createSnapshot<T = JsonObject>(companyId: string, body: Record<string, unknown>): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/snapshots`, { body });
  }

  listSnapshots<T = JsonObject>(companyId: string, query?: Record<string, unknown>): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/snapshots`, { query });
  }

  getSnapshot<T = JsonObject>(companyId: string, snapshotId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/snapshots/${snapshotId}`);
  }

  replaySnapshot<T = JsonObject>(companyId: string, snapshotId: string): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/snapshots/${snapshotId}/replay`);
  }

  optimizeGepa<T = JsonObject>(companyId: string, body: Record<string, unknown>): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/gepa/optimize`, { body });
  }

  listPromotionExperiments<T = JsonObject>(companyId: string, query?: Record<string, unknown>): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/promotion-experiments`, { query });
  }

  createPromotionExperiment<T = JsonObject>(companyId: string, body: Record<string, unknown>): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/promotion-experiments`, { body });
  }

  promotePromotionExperiment<T = JsonObject>(
    companyId: string,
    experimentId: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/promotion-experiments/${experimentId}/promote`, { body });
  }

  rollbackPromotionExperiment<T = JsonObject>(
    companyId: string,
    experimentId: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/promotion-experiments/${experimentId}/rollback`, { body });
  }

  listRunEvents<T = { run_id: string; events: CompanyActionEvent[]; last_seq?: number | null }>(
    companyId: string,
    runId: string,
    query?: { after_seq?: number; limit?: number },
  ): Promise<T> {
    return this.request("GET", `/api/company/companies/${companyId}/agent-runs/${runId}/execution-events`, { query });
  }

  appendRunEvent<T = CompanyActionEvent>(
    companyId: string,
    runId: string,
    body: AppendCompanyActionEvent,
  ): Promise<T> {
    return this.request("POST", `/api/company/companies/${companyId}/agent-runs/${runId}/execution-events`, { body });
  }

  private url(path: string, query?: Record<string, unknown>): string {
    const url = new URL(`${this.baseUrl}/${path.replace(/^\/+/, "")}`);
    for (const [key, value] of Object.entries(query || {})) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, String(item));
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }
}

function env(name: string): string | undefined {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return maybeProcess.process?.env?.[name];
}

export function parseAgentDefinitionMarkdown(markdown: string): CompanyAgentDefinition {
  const match = markdown.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error("agent definition requires YAML frontmatter");
  const frontmatter = parseSimpleYaml(match[1]);
  const schema = String(frontmatter.schema || "hsm.company_os.agent_definition.v1");
  if (schema !== "hsm.company_os.agent_definition.v1") {
    throw new Error(`unsupported agent definition schema ${schema}`);
  }
  const slug = String(frontmatter.slug || "").trim();
  const name = String(frontmatter.name || "").trim();
  if (!slug) throw new Error("agent definition slug is required");
  if (!name) throw new Error("agent definition name is required");
  return {
    schema,
    slug,
    name,
    description: asString(frontmatter.description),
    work_mode: asString(frontmatter.work_mode),
    context_budget: asObject(frontmatter.context_budget),
    tools: asArray(frontmatter.tools) as CompanyAgentDefinition["tools"],
    mcp: asArray(frontmatter.mcp) as CompanyAgentDefinition["mcp"],
    runtime: asObject(frontmatter.runtime),
    metadata: asObject(frontmatter.metadata),
    instructions_markdown: match[2].trim(),
  };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    i += 1;
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2];
    if (value) {
      out[key] = parseYamlScalar(value);
      continue;
    }
    const childLines: string[] = [];
    while (i < lines.length && /^\s+/.test(lines[i])) {
      childLines.push(lines[i]);
      i += 1;
    }
    out[key] = parseYamlChildBlock(childLines);
  }
  return out;
}

function parseYamlChildBlock(lines: string[]): unknown {
  const trimmed = lines.map((l) => l.replace(/^ {2}/, ""));
  if (trimmed.some((l) => l.trimStart().startsWith("- "))) {
    const items: Record<string, unknown>[] = [];
    let current: Record<string, unknown> | null = null;
    for (const raw of trimmed) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("- ")) {
        current = {};
        items.push(current);
        const rest = line.slice(2).trim();
        if (rest) assignYamlPair(current, rest);
      } else if (current) {
        assignYamlPair(current, line);
      }
    }
    return items;
  }
  const obj: Record<string, unknown> = {};
  for (const raw of trimmed) assignYamlPair(obj, raw.trim());
  return obj;
}

function assignYamlPair(obj: Record<string, unknown>, line: string): void {
  const m = line.match(/^([A-Za-z0-9_.-]+):\s*(.*)$/);
  if (m) obj[m[1]] = parseYamlScalar(m[2]);
}

function parseYamlScalar(value: string): unknown {
  const v = value.trim();
  if (v === "true") return true;
  if (v === "false") return false;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) {
    return v.slice(1, -1).split(",").map((s) => String(parseYamlScalar(s.trim())));
  }
  return v.replace(/^['"]|['"]$/g, "");
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asObject(value: unknown): JsonObject | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export * from "./kit.js";
