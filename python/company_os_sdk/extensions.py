"""Friendly helpers for building governed Company OS extensions.

Compilation happens locally; Company OS remains authoritative for signatures,
permissions, rollout, and execution.
"""

from __future__ import annotations

import copy
import hashlib
import json
import urllib.parse
from typing import Any, Mapping

MANIFEST_SCHEMA = "hsm.extension.manifest.v1"
COMPILER_SCHEMA = "hsm.company_os.extension_compiler.v1"


class ExtensionManifestError(ValueError):
    """A manifest cannot be admitted under the universal extension contract."""


def _canonical(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: _canonical(value[key]) for key in sorted(value)}
    if isinstance(value, list):
        return [_canonical(item) for item in value]
    return value


def canonical_manifest_bytes(manifest: Mapping[str, Any]) -> bytes:
    value = copy.deepcopy(dict(manifest))
    for key in ("signature", "checksum", "signer"):
        value.pop(key, None)
    return json.dumps(_canonical(value), separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def manifest_hash(manifest: Mapping[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(canonical_manifest_bytes(manifest)).hexdigest()


def validate_manifest(manifest: Mapping[str, Any]) -> dict[str, Any]:
    """Validate identity, permissions, declarative UI, MCP, and broker surfaces."""
    value = copy.deepcopy(dict(manifest))
    if value.get("apiVersion") != MANIFEST_SCHEMA:
        raise ExtensionManifestError(f"apiVersion must be {MANIFEST_SCHEMA}")
    if value.get("kind") != "Extension":
        raise ExtensionManifestError("kind must be Extension")
    signer = value.get("signer")
    signature = value.get("signature")
    if (signer is None) != (signature is None):
        raise ExtensionManifestError("signer and signature must be supplied together")
    for field, item in (("signer", signer), ("signature", signature)):
        if item is not None and (
            not isinstance(item, str)
            or not item.strip()
            or any(not char.isascii() or not char.isprintable() or char.isspace() for char in item)
        ):
            raise ExtensionManifestError(f"{field} must be a bounded non-whitespace string")
    metadata = value.get("metadata")
    spec = value.get("spec")
    if not isinstance(metadata, dict) or not isinstance(spec, dict):
        raise ExtensionManifestError("metadata and spec are required objects")
    for field in ("id", "version", "publisher"):
        if not isinstance(metadata.get(field), str) or not metadata[field].strip():
            raise ExtensionManifestError(f"metadata.{field} is required")
    capabilities = spec.get("capabilities")
    if not isinstance(capabilities, list) or not capabilities:
        raise ExtensionManifestError("spec.capabilities must contain at least one capability")
    ids: set[str] = set()
    for capability in capabilities:
        if not isinstance(capability, dict) or not isinstance(capability.get("id"), str):
            raise ExtensionManifestError("each capability requires an id")
        if capability["id"] in ids:
            raise ExtensionManifestError(f"duplicate capability {capability['id']}")
        ids.add(capability["id"])
    permissions = spec.setdefault("permissions", {})
    if not isinstance(permissions, dict):
        raise ExtensionManifestError("spec.permissions must be an object")
    for field in ("network", "secrets", "companyScopes", "filesystem", "processes"):
        values = permissions.setdefault(field, [])
        if not isinstance(values, list) or any(not isinstance(item, str) or not item.strip() for item in values):
            raise ExtensionManifestError(f"spec.permissions.{field} must be a list of identifiers")
    ui = spec.get("ui")
    if ui is not None:
        if not isinstance(ui, dict):
            raise ExtensionManifestError("spec.ui must be a declarative object")
        if any(key in ui for key in ("nativeModule", "dynamicLibrary", "dlopen", "unsafeHtml")):
            raise ExtensionManifestError("spec.ui cannot declare native or unsafe surfaces")
        settings = ui.get("settings", [])
        if not isinstance(settings, list):
            raise ExtensionManifestError("spec.ui.settings must be a list")
        setting_keys: set[str] = set()
        for setting in settings:
            if not isinstance(setting, dict):
                raise ExtensionManifestError("each UI setting must be an object")
            for field in ("key", "label", "type"):
                if not isinstance(setting.get(field), str) or not setting[field].strip():
                    raise ExtensionManifestError(f"spec.ui.settings[].{field} is required")
            key = setting["key"].lower()
            if key in setting_keys:
                raise ExtensionManifestError(f"duplicate UI setting {setting['key']}")
            setting_keys.add(key)
        surfaces = ui.get("surfaces", [])
        if not isinstance(surfaces, list):
            raise ExtensionManifestError("spec.ui.surfaces must be a list")
        surface_ids: set[str] = set()
        for surface in surfaces:
            if not isinstance(surface, dict):
                raise ExtensionManifestError("each UI surface must be an object")
            if not isinstance(surface.get("id"), str) or not surface["id"].strip():
                raise ExtensionManifestError("spec.ui.surfaces[].id is required")
            if surface.get("kind") not in {"sidebar", "settings", "transcript_card", "right_panel"}:
                raise ExtensionManifestError("spec.ui.surfaces[].kind is not supported")
            surface_id = surface["id"].lower()
            if surface_id in surface_ids:
                raise ExtensionManifestError(f"duplicate UI surface {surface['id']}")
            surface_ids.add(surface_id)
    mcp = spec.get("mcp", [])
    if not isinstance(mcp, list):
        raise ExtensionManifestError("spec.mcp must be a list")
    mcp_names: set[str] = set()
    for declaration in mcp:
        if not isinstance(declaration, dict) or not isinstance(declaration.get("name"), str) or not declaration["name"].strip():
            raise ExtensionManifestError("each MCP declaration requires a name")
        name = declaration["name"].lower()
        if name in mcp_names:
            raise ExtensionManifestError(f"duplicate MCP declaration {declaration['name']}")
        mcp_names.add(name)
        transport = declaration.get("transport")
        if transport not in {"stdio", "streamable_http"}:
            raise ExtensionManifestError("MCP transport must be stdio or streamable_http")
        if transport == "stdio" and not isinstance(declaration.get("command"), str):
            raise ExtensionManifestError("stdio MCP declarations require command")
        if transport == "streamable_http":
            endpoint = declaration.get("endpoint")
            parsed = urllib.parse.urlparse(endpoint or "")
            if parsed.scheme not in {"http", "https"} or parsed.username or parsed.password or not parsed.netloc:
                raise ExtensionManifestError("streamable_http MCP declarations require a credential-free http(s) endpoint")
        for field in ("args", "envRefs", "requestedCapabilities"):
            values = declaration.get(field, [])
            if not isinstance(values, list) or any(not isinstance(value, str) or not value.strip() for value in values):
                raise ExtensionManifestError(f"spec.mcp[].{field} must be a list of strings")
    contributions = spec.get("contributions", [])
    if not isinstance(contributions, list):
        raise ExtensionManifestError("spec.contributions must be a list")
    for contribution in contributions:
        if not isinstance(contribution, dict) or contribution.get("kind") not in {"wasi_hostcall", "gpui_surface"}:
            raise ExtensionManifestError("contribution kind must be wasi_hostcall or gpui_surface")
        if not isinstance(contribution.get("contractSchema"), str) or not contribution["contractSchema"].strip():
            raise ExtensionManifestError("contributions require contractSchema")
        capabilities = contribution.get("capabilities", [])
        if not isinstance(capabilities, list) or any(not isinstance(value, str) or not value.strip() for value in capabilities):
            raise ExtensionManifestError("contribution capabilities must be a list of strings")
    return value


def compile_manifest(manifest: Mapping[str, Any], *, package_bytes: bytes | None = None) -> dict[str, Any]:
    """Compile a friendly manifest into an immutable admission descriptor."""
    normalized = validate_manifest(manifest)
    result: dict[str, Any] = {
        "schema": COMPILER_SCHEMA,
        "manifest": normalized,
        "manifestHash": manifest_hash(normalized),
        "requestedCapabilities": [item["id"] for item in normalized["spec"]["capabilities"]],
        "declarativeUi": normalized["spec"].get("ui"),
        "mcpDeclarations": normalized["spec"].get("mcp", []),
        "brokerContributions": normalized["spec"].get("contributions", []),
    }
    if package_bytes is not None:
        result["artifactDigest"] = "sha256:" + hashlib.sha256(package_bytes).hexdigest()
        result["artifactSizeBytes"] = len(package_bytes)
    return result


def permission_diff(manifest: Mapping[str, Any], granted: list[str]) -> dict[str, list[str]]:
    normalized = validate_manifest(manifest)
    requested = {item["id"] for item in normalized["spec"]["capabilities"]}
    requested.update(value for values in normalized["spec"]["permissions"].values() for value in values)
    approved = set(granted)
    return {
        "requested": sorted(requested),
        "granted": sorted(approved),
        "missing": sorted(requested - approved),
        "excess": sorted(approved - requested),
    }
