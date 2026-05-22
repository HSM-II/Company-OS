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
