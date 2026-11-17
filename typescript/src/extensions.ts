/** Friendly compiler and validation helpers for governed Company OS extensions. */

export const EXTENSION_MANIFEST_SCHEMA = "hsm.extension.manifest.v1" as const;
export const EXTENSION_COMPILER_SCHEMA = "hsm.company_os.extension_compiler.v1" as const;

type ExtensionJsonValue = string | number | boolean | null | ExtensionJsonValue[] | { [key: string]: ExtensionJsonValue };
type ExtensionJsonObject = { [key: string]: ExtensionJsonValue };

export type ExtensionManifest = {
  apiVersion: typeof EXTENSION_MANIFEST_SCHEMA;
  kind: "Extension";
  signer?: string;
  signature?: string;
  metadata: { id: string; version: string; publisher: string; digest?: string };
  spec: {
    type: string;
    protocol: string;
    entrypoint?: string;
    capabilities: Array<Record<string, ExtensionJsonValue> & { id: string }>;
    permissions?: {
      network?: string[];
      secrets?: string[];
      companyScopes?: string[];
      filesystem?: string[];
      processes?: string[];
    };
    governance?: ExtensionJsonObject;
    ui?: {
      settings?: Array<{ key: string; label: string; type: string; default?: ExtensionJsonValue; secretRef?: boolean }>;
      surfaces?: Array<{ id: string; kind: "sidebar" | "settings" | "transcript_card" | "right_panel"; title?: string; schema?: string }>;
    };
    mcp?: Array<{
      name: string;
      transport: "stdio" | "streamable_http";
      endpoint?: string;
      command?: string;
      args?: string[];
      envRefs?: string[];
      requestedCapabilities?: string[];
    }>;
    contributions?: Array<{
      kind: "wasi_hostcall" | "gpui_surface";
      contractSchema: string;
      capabilities?: string[];
    }>;
  };
};

export type ExtensionCompileResult = {
  schema: typeof EXTENSION_COMPILER_SCHEMA;
  manifest: ExtensionManifest;
  manifestHash: string;
  requestedCapabilities: string[];
  declarativeUi?: ExtensionManifest["spec"]["ui"];
  mcpDeclarations?: ExtensionManifest["spec"]["mcp"];
  brokerContributions?: ExtensionManifest["spec"]["contributions"];
  artifactDigest?: string;
  artifactSizeBytes?: number;
};

export class ExtensionManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtensionManifestError";
  }
}

function canonical(value: ExtensionJsonValue): ExtensionJsonValue {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  }
  return value;
}

function withoutSignature(manifest: ExtensionManifest): ExtensionJsonObject {
  const copy = { ...manifest } as unknown as ExtensionJsonObject & Record<string, unknown>;
  delete copy.signature;
  delete copy.checksum;
  delete copy.signer;
  return copy;
}

export function canonicalManifestJson(manifest: ExtensionManifest): string {
  return JSON.stringify(canonical(withoutSignature(manifest)));
}

export async function manifestHash(manifest: ExtensionManifest): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalManifestJson(manifest));
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function validateExtensionManifest(input: unknown): ExtensionManifest {
  if (!input || typeof input !== "object") throw new ExtensionManifestError("manifest must be an object");
  const manifest = input as ExtensionManifest;
  if (manifest.apiVersion !== EXTENSION_MANIFEST_SCHEMA) throw new ExtensionManifestError(`apiVersion must be ${EXTENSION_MANIFEST_SCHEMA}`);
  if (manifest.kind !== "Extension") throw new ExtensionManifestError("kind must be Extension");
  if ((manifest.signer == null) !== (manifest.signature == null)) {
    throw new ExtensionManifestError("signer and signature must be supplied together");
  }
  for (const [field, value] of [["signer", manifest.signer], ["signature", manifest.signature]] as const) {
    if (value != null && (!/^[\x21-\x7e]+$/.test(value) || value.length > 256)) {
      throw new ExtensionManifestError(`${field} must be a bounded non-whitespace string`);
    }
  }
  if (!manifest.metadata?.id?.trim() || !manifest.metadata?.version?.trim() || !manifest.metadata?.publisher?.trim()) {
    throw new ExtensionManifestError("metadata.id, metadata.version, and metadata.publisher are required");
  }
  if (!Array.isArray(manifest.spec?.capabilities) || manifest.spec.capabilities.length === 0) {
    throw new ExtensionManifestError("spec.capabilities must contain at least one capability");
  }
  const ids = new Set<string>();
  for (const capability of manifest.spec.capabilities) {
    if (!capability.id?.trim() || ids.has(capability.id)) throw new ExtensionManifestError("capability ids must be unique non-empty strings");
    ids.add(capability.id);
  }
  for (const field of ["network", "secrets", "companyScopes", "filesystem", "processes"] as const) {
    const values = manifest.spec.permissions?.[field] ?? [];
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) {
      throw new ExtensionManifestError(`spec.permissions.${field} must be identifier strings`);
    }
  }
  const ui = manifest.spec.ui;
  if (ui && ["nativeModule", "dynamicLibrary", "dlopen", "unsafeHtml"].some((key) => key in ui)) {
    throw new ExtensionManifestError("spec.ui may only declare brokered declarative surfaces");
  }
  const settingKeys = new Set<string>();
  for (const setting of ui?.settings ?? []) {
    if (!setting.key?.trim() || !setting.label?.trim() || !setting.type?.trim()) {
      throw new ExtensionManifestError("UI settings require key, label, and type");
    }
    const key = setting.key.toLowerCase();
    if (settingKeys.has(key)) throw new ExtensionManifestError(`duplicate UI setting ${setting.key}`);
    settingKeys.add(key);
  }
  const surfaceIds = new Set<string>();
  for (const surface of ui?.surfaces ?? []) {
    if (!surface.id?.trim() || !["sidebar", "settings", "transcript_card", "right_panel"].includes(surface.kind)) {
      throw new ExtensionManifestError("UI surfaces require a supported id and kind");
    }
    const id = surface.id.toLowerCase();
    if (surfaceIds.has(id)) throw new ExtensionManifestError(`duplicate UI surface ${surface.id}`);
    surfaceIds.add(id);
  }
  const mcpNames = new Set<string>();
  for (const declaration of manifest.spec.mcp ?? []) {
    if (!declaration.name?.trim() || !["stdio", "streamable_http"].includes(declaration.transport)) {
      throw new ExtensionManifestError("MCP declarations require a supported name and transport");
    }
    const name = declaration.name.toLowerCase();
    if (mcpNames.has(name)) throw new ExtensionManifestError(`duplicate MCP declaration ${declaration.name}`);
    mcpNames.add(name);
    if (declaration.transport === "stdio" && !declaration.command?.trim()) {
      throw new ExtensionManifestError("stdio MCP declarations require command");
    }
    if (declaration.transport === "streamable_http") {
      let endpoint: URL;
      try { endpoint = new URL(declaration.endpoint ?? ""); } catch { throw new ExtensionManifestError("streamable_http MCP declarations require a valid endpoint"); }
      if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
        throw new ExtensionManifestError("MCP endpoints cannot contain credentials");
      }
    }
    for (const values of [declaration.args ?? [], declaration.envRefs ?? [], declaration.requestedCapabilities ?? []]) {
      if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value.trim())) {
        throw new ExtensionManifestError("MCP arguments, env refs, and capabilities must be strings");
      }
    }
  }
  for (const contribution of manifest.spec.contributions ?? []) {
    if (!["wasi_hostcall", "gpui_surface"].includes(contribution.kind) || !contribution.contractSchema?.trim()) {
      throw new ExtensionManifestError("broker contributions require a supported kind and contract schema");
    }
    if ((contribution.capabilities ?? []).some((value) => typeof value !== "string" || !value.trim())) {
      throw new ExtensionManifestError("broker contribution capabilities must be strings");
    }
  }
  return manifest;
}

export async function compileExtensionManifest(manifest: unknown, packageBytes?: Uint8Array): Promise<ExtensionCompileResult> {
  const normalized = validateExtensionManifest(manifest);
  const result: ExtensionCompileResult = {
    schema: EXTENSION_COMPILER_SCHEMA,
    manifest: normalized,
    manifestHash: await manifestHash(normalized),
    requestedCapabilities: normalized.spec.capabilities.map((capability) => capability.id),
    declarativeUi: normalized.spec.ui,
    mcpDeclarations: normalized.spec.mcp,
    brokerContributions: normalized.spec.contributions,
  };
  if (packageBytes) {
    const digest = await crypto.subtle.digest("SHA-256", packageBytes as unknown as BufferSource);
    result.artifactDigest = `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    result.artifactSizeBytes = packageBytes.byteLength;
  }
  return result;
}

export function extensionPermissionDiff(manifest: ExtensionManifest, granted: string[]): { requested: string[]; granted: string[]; missing: string[]; excess: string[] } {
  const normalized = validateExtensionManifest(manifest);
  const requested = new Set(normalized.spec.capabilities.map((capability) => capability.id));
  for (const values of Object.values(normalized.spec.permissions ?? {})) for (const value of values ?? []) requested.add(value);
  const approved = new Set(granted);
  return {
    requested: [...requested].sort(),
    granted: [...approved].sort(),
    missing: [...requested].filter((value) => !approved.has(value)).sort(),
    excess: [...approved].filter((value) => !requested.has(value)).sort(),
  };
}
