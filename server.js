#!/usr/bin/env node

process.env.HOME = process.env.HOME || require("os").homedir();

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
const querystring = require("querystring");
const { spawnSync, spawn, execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const CLI_PATH = path.join(ROOT, "bin", "nemoclaw.js");
const ROOT_INSTALL_SCRIPT = path.join(ROOT, "install.sh");
const STANDALONE_INSTALL_SCRIPT = path.join(__dirname, "install.sh");
const INSTALL_REPO_URL = "https://github.com/thanhan92-f1/Nemo-Claw.git";
const CANONICAL_INSTALL_URL = "https://raw.githubusercontent.com/thanhan92-f1/Nemo-Claw/refs/heads/main/standalone-api/install.sh";
const UPSTREAM_NEMOCLAW_INSTALL_URL = "https://raw.githubusercontent.com/NVIDIA/NemoClaw/refs/heads/main/install.sh";
const PACKAGE_JSON = require(path.join(ROOT, "package.json"));
const registry = require(path.join(ROOT, "bin", "lib", "registry.js"));
const policies = require(path.join(ROOT, "bin", "lib", "policies.js"));
const credentials = require(path.join(ROOT, "bin", "lib", "credentials.js"));
const localInference = require(path.join(ROOT, "bin", "lib", "local-inference.js"));
const nim = require(path.join(ROOT, "bin", "lib", "nim.js"));
const onboard = require(path.join(ROOT, "bin", "lib", "onboard.js"));
const preflight = require(path.join(ROOT, "bin", "lib", "preflight.js"));
const platformInfo = require(path.join(ROOT, "bin", "lib", "platform.js"));
const { resolveOpenshell } = require(path.join(ROOT, "bin", "lib", "resolve-openshell.js"));
const { shellQuote, validateName } = require(path.join(ROOT, "bin", "lib", "runner.js"));
const inferenceConfig = require(path.join(ROOT, "bin", "lib", "inference-config.js"));

const HOST = process.env.NEMOCLAW_API_HOST || "127.0.0.1";
const PORT = Number(process.env.NEMOCLAW_API_PORT || 3100);
const DEFAULT_SANDBOX = process.env.NEMOCLAW_DEFAULT_SANDBOX || registry.getDefault() || "my-assistant";
const openshellBinary = resolveOpenshell() || process.env.NEMOCLAW_OPENSHELL_BIN || "openshell";

const PROVIDERS = [
  "nvidia-prod",
  "openai-api",
  "anthropic-prod",
  "compatible-anthropic-endpoint",
  "gemini-api",
  "compatible-endpoint",
  "ollama-local",
  "vllm-local",
  "nvidia-nim",
];

const DEFAULT_FORWARD_PORT = Number(process.env.DASHBOARD_PORT || 18789);
const NVIDIA_BUILD_ENDPOINT_URL = "https://integrate.api.nvidia.com/v1";
const OPENAI_ENDPOINT_URL = "https://api.openai.com/v1";
const ANTHROPIC_ENDPOINT_URL = "https://api.anthropic.com";
const GEMINI_ENDPOINT_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const LOCAL_INFERENCE_PROVIDERS = ["ollama-local", "vllm-local"];

const CREDENTIAL_KEYS = [
  "NVIDIA_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "COMPATIBLE_API_KEY",
  "COMPATIBLE_ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "SLACK_BOT_TOKEN",
  "DISCORD_BOT_TOKEN",
  "GITHUB_TOKEN",
];

const CLI_SURFACE = {
  globalCommands: [
    "onboard",
    "list",
    "deploy",
    "setup",
    "setup-spark",
    "start",
    "stop",
    "status",
    "debug",
    "uninstall",
    "help",
    "--version",
  ],
  sandboxCommands: [
    "connect",
    "status",
    "logs",
    "policy-add",
    "policy-list",
    "destroy",
  ],
};

const ROUTES = [
  ["GET", "/health", "Health check"],
  ["GET", "/api", "List API routes"],
  ["GET", "/api/commands", "CLI command surface"],
  ["GET", "/api/version", "NemoClaw version"],
  ["GET", "/api/help", "CLI help"],
  ["GET", "/api/list", "CLI list alias"],
  ["GET", "/api/status", "Global status"],
  ["GET", "/api/presets", "Policy presets"],
  ["GET", "/api/install", "Bootstrap installer metadata"],
  ["GET", "/api/install/script", "Bootstrap installer and root install info"],
  ["POST", "/api/install/run", "Run bootstrap installer"],
  ["GET", "/api/onboard/options", "Onboard options"],
  ["POST", "/api/onboard", "Run non-interactive onboard"],
  ["POST", "/api/setup", "Run legacy nemoclaw setup"],
  ["POST", "/api/setup-spark", "Run setup-spark"],
  ["GET", "/api/sandboxes", "List sandboxes"],
  ["GET", "/api/sandboxes/default", "Get default sandbox"],
  ["PUT", "/api/sandboxes/default", "Set default sandbox"],
  ["GET", "/api/sandboxes/:name", "Sandbox metadata"],
  ["GET", "/api/sandboxes/:name/status", "Sandbox status"],
  ["GET", "/api/sandboxes/:name/status/structured", "Structured sandbox status"],
  ["GET", "/api/sandboxes/:name/gateway-state", "Sandbox gateway visibility state"],
  ["GET", "/api/sandboxes/:name/readiness", "Sandbox readiness probe"],
  ["GET", "/api/sandboxes/:name/nim", "Sandbox NIM details"],
  ["POST", "/api/sandboxes/:name/connect", "Prepare connect"],
  ["GET", "/api/sandboxes/:name/logs", "Sandbox logs"],
  ["GET", "/api/sandboxes/:name/policies", "Sandbox policies"],
  ["GET", "/api/sandboxes/:name/policy/raw", "Raw live sandbox policy"],
  ["GET", "/api/sandboxes/:name/policy/endpoints", "Extract live sandbox policy endpoints"],
  ["GET", "/api/sandboxes/:name/policy/preview-merge?preset=name", "Preview merged policy for preset application"],
  ["POST", "/api/sandboxes/:name/policies", "Apply policy preset"],
  ["POST", "/api/sandboxes/:name/policy-add", "CLI policy-add alias"],
  ["DELETE", "/api/sandboxes/:name", "Destroy sandbox"],
  ["GET", "/api/sandboxes/:name/ui", "UI + terminal links"],
  ["GET", "/api/inference", "Live inference status"],
  ["GET", "/api/inference/providers", "Inference provider metadata"],
  ["GET", "/api/inference/models/nvidia", "List NVIDIA endpoint models"],
  ["POST", "/api/inference/models/openai-compatible", "List OpenAI-compatible endpoint models"],
  ["POST", "/api/inference/models/anthropic-compatible", "List Anthropic-compatible endpoint models"],
  ["POST", "/api/inference/remote/validate", "Validate remote provider model"],
  ["GET", "/api/inference/local/providers", "Local inference provider metadata"],
  ["GET", "/api/inference/local/providers/:provider/diagnostics", "Local inference provider diagnostics"],
  ["GET", "/api/inference/local/ollama/models", "Local Ollama models"],
  ["GET", "/api/inference/local/default-model", "Recommended local Ollama model"],
  ["GET", "/api/inference/local/bootstrap-options", "Local bootstrap model options"],
  ["POST", "/api/inference/local/validate", "Validate local inference provider or model"],
  ["GET", "/api/gateway/status", "Named gateway status"],
  ["GET", "/api/openshell/diagnostics", "OpenShell and container runtime diagnostics"],
  ["GET", "/api/environment/summary", "Local runtime and environment summary"],
  ["GET", "/api/preflight/port?port=18789", "Port availability preflight"],
  ["GET", "/api/preflight/ports?ports=18789,3100", "Batch port availability preflight"],
  ["POST", "/api/onboard/preview", "Preview non-interactive onboard config"],
  ["GET", "/api/presets/:name", "Preset detail"],
  ["GET", "/api/presets/:name/endpoints", "Preset host endpoints"],
  ["GET", "/api/presets/:name/entries", "Preset network policy entries"],
  ["GET", "/api/credentials", "Credential summary"],
  ["PUT", "/api/credentials/:key", "Save credential"],
  ["GET", "/api/nim/gpu", "GPU and NIM model support"],
  ["GET", "/api/nim/models/compatible", "NIM model compatibility for current host"],
  ["GET", "/api/services/status", "Services status"],
  ["GET", "/api/services/structured-status", "Structured services status"],
  ["GET", "/api/services/logs/:service", "Read service log file"],
  ["POST", "/api/start", "CLI start alias"],
  ["POST", "/api/stop", "CLI stop alias"],
  ["POST", "/api/services/start", "Start services"],
  ["POST", "/api/services/stop", "Stop services"],
  ["POST", "/api/deployments", "Deploy"],
  ["POST", "/api/debug", "Debug bundle"],
  ["POST", "/api/uninstall", "Uninstall"],
  ["POST", "/api/chat", "Chat without CLI"],
  ["POST", "/api/terminal/exec", "Safe terminal actions"],
  ["GET", "/chat", "Candy chat UI"],
  ["GET", "/terminal", "Candy terminal UI"],
];

function withHome(env = {}) {
  return { ...process.env, HOME: process.env.HOME || os.homedir(), ...env };
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value, null, 2), { "Content-Type": "application/json; charset=utf-8" });
}

function sendHtml(res, status, html) {
  send(res, status, html, { "Content-Type": "text/html; charset=utf-8" });
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function parseBool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "y", "on"].includes(String(value).trim().toLowerCase());
}

function normalizeSandboxName(name) {
  const value = String(name || "").trim();
  validateName(value, "sandbox name");
  return value;
}

function safeSessionId(input) {
  return (String(input || crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, "").slice(0, 64) || "web-chat");
}

function maskSecrets(value) {
  const clone = JSON.parse(JSON.stringify(value || {}));
  for (const key of [
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "COMPATIBLE_API_KEY",
    "COMPATIBLE_ANTHROPIC_API_KEY", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN",
    "SLACK_BOT_TOKEN", "DISCORD_BOT_TOKEN", "GITHUB_TOKEN",
  ]) {
    if (clone[key]) clone[key] = "***";
  }
  return clone;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 5 * 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        const contentType = String(req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
        if (contentType === "application/json") return resolve(JSON.parse(raw));
        if (contentType === "application/x-www-form-urlencoded") return resolve(querystring.parse(raw));
        resolve({ raw });
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: withHome(options.env),
    encoding: "utf-8",
    stdio: options.stdio || ["ignore", "pipe", "pipe"],
  });
  return {
    ok: result.status === 0,
    command,
    args,
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function runNemoclaw(args, options = {}) {
  return runCommand(process.execPath, [CLI_PATH, ...args], options);
}

function runOpenshell(args, options = {}) {
  return runCommand(openshellBinary, args, options);
}

function wrapCommand(label, result, extra = {}) {
  return {
    success: Boolean(result.ok),
    label,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    ...extra,
  };
}

function getInferenceInfo() {
  const result = runOpenshell(["inference", "get"]);
  return {
    raw: result,
    parsed: inferenceConfig.parseGatewayInference(`${result.stdout}${result.stderr}`),
  };
}

function stripAnsi(value = "") {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function summarizeRemoteError(body, status) {
  if (!body) return `HTTP ${status} with no response body`;
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.error?.message || parsed?.error?.details || parsed?.message || parsed?.detail || parsed?.details;
    if (message) return `HTTP ${status}: ${String(message)}`;
  } catch {}
  const compact = String(body).replace(/\s+/g, " ").trim();
  return `HTTP ${status}: ${compact.slice(0, 200)}`;
}

function getRemoteProviderConfig(provider, endpointUrl = "") {
  switch (provider) {
    case "nvidia-prod":
    case "nvidia-nim":
      return { provider, label: "NVIDIA Endpoints", type: "nvidia", credentialEnv: "NVIDIA_API_KEY", endpointUrl: NVIDIA_BUILD_ENDPOINT_URL };
    case "openai-api":
      return { provider, label: "OpenAI", type: "openai", credentialEnv: "OPENAI_API_KEY", endpointUrl: OPENAI_ENDPOINT_URL };
    case "compatible-endpoint":
      return { provider, label: "Other OpenAI-compatible endpoint", type: "openai", credentialEnv: "COMPATIBLE_API_KEY", endpointUrl: String(endpointUrl || "").trim() };
    case "gemini-api":
      return { provider, label: "Google Gemini", type: "openai", credentialEnv: "GEMINI_API_KEY", endpointUrl: GEMINI_ENDPOINT_URL };
    case "anthropic-prod":
      return { provider, label: "Anthropic", type: "anthropic", credentialEnv: "ANTHROPIC_API_KEY", endpointUrl: ANTHROPIC_ENDPOINT_URL };
    case "compatible-anthropic-endpoint":
      return { provider, label: "Other Anthropic-compatible endpoint", type: "anthropic", credentialEnv: "COMPATIBLE_ANTHROPIC_API_KEY", endpointUrl: String(endpointUrl || "").trim() };
    default:
      return null;
  }
}

function getRemoteApiKey(body, fallbackCredentialEnv) {
  if (body.apiKey) return String(body.apiKey);
  const credentialKey = String(body.credentialKey || fallbackCredentialEnv || "").trim();
  return credentialKey ? String(credentials.getCredential(credentialKey) || "") : "";
}

async function fetchJsonWithMetadata(url, options = {}) {
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.headers || {},
      body: options.body,
      signal: AbortSignal.timeout(options.timeoutMs || 15000),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    return {
      ok: response.ok,
      status: response.status,
      text,
      data,
      message: response.ok ? null : summarizeRemoteError(text, response.status),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      text: "",
      data: null,
      message: error.message || String(error),
    };
  }
}

async function fetchNvidiaModels(apiKey) {
  if (!apiKey) return { ok: false, status: 401, message: "NVIDIA_API_KEY is required to list NVIDIA endpoint models", ids: [] };
  const result = await fetchJsonWithMetadata(`${NVIDIA_BUILD_ENDPOINT_URL}/models`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });
  const ids = Array.isArray(result.data?.data) ? result.data.data.map((item) => item && item.id).filter(Boolean) : [];
  return { ...result, ids };
}

async function fetchOpenAiCompatibleModels(endpointUrl, apiKey) {
  const trimmed = String(endpointUrl || "").replace(/\/+$/, "");
  if (!trimmed) return { ok: false, status: 400, message: "endpointUrl is required", ids: [] };
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const result = await fetchJsonWithMetadata(`${trimmed}/models`, { headers });
  const ids = Array.isArray(result.data?.data) ? result.data.data.map((item) => item && item.id).filter(Boolean) : [];
  return { ...result, ids, endpointUrl: trimmed };
}

async function fetchAnthropicCompatibleModels(endpointUrl, apiKey) {
  const trimmed = String(endpointUrl || "").replace(/\/+$/, "");
  if (!trimmed) return { ok: false, status: 400, message: "endpointUrl is required", ids: [] };
  if (!apiKey) return { ok: false, status: 401, message: "API key is required", ids: [] };
  const result = await fetchJsonWithMetadata(`${trimmed}/v1/models`, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  const ids = Array.isArray(result.data?.data) ? result.data.data.map((item) => item && (item.id || item.name)).filter(Boolean) : [];
  return { ...result, ids, endpointUrl: trimmed };
}

async function validateRemoteProviderModel(body = {}) {
  const provider = String(body.provider || "").trim();
  const model = String(body.model || "").trim();
  const config = getRemoteProviderConfig(provider, body.endpointUrl);
  if (!config) return { statusCode: 400, payload: { error: "Unsupported provider", provider, allowedProviders: PROVIDERS } };
  if (!model) return { statusCode: 400, payload: { error: "model is required", provider } };

  const apiKey = getRemoteApiKey(body, config.credentialEnv);
  if (config.type === "nvidia") {
    const available = await fetchNvidiaModels(apiKey);
    if (!available.ok) {
      return { statusCode: available.status || 502, payload: { provider, model, endpointUrl: config.endpointUrl, check: { ok: false, message: available.message }, request: maskSecrets(body) } };
    }
    const validated = available.ids.includes(model);
    return {
      statusCode: validated ? 200 : 409,
      payload: {
        provider,
        providerLabel: config.label,
        model,
        endpointUrl: config.endpointUrl,
        check: validated ? { ok: true, validated: true } : { ok: false, validated: true, message: `Model '${model}' is not available from ${config.label}.` },
        availableModelCount: available.ids.length,
        request: maskSecrets(body),
      },
    };
  }

  if (config.type === "openai") {
    const available = await fetchOpenAiCompatibleModels(config.endpointUrl, apiKey);
    if (!available.ok) {
      if ([404, 405].includes(available.status)) {
        return { statusCode: 200, payload: { provider, providerLabel: config.label, model, endpointUrl: config.endpointUrl, check: { ok: true, validated: false, message: "Endpoint does not expose /models for validation." }, request: maskSecrets(body) } };
      }
      return { statusCode: available.status || 502, payload: { provider, model, endpointUrl: config.endpointUrl, check: { ok: false, message: available.message }, request: maskSecrets(body) } };
    }
    const validated = available.ids.includes(model);
    return {
      statusCode: validated ? 200 : 409,
      payload: {
        provider,
        providerLabel: config.label,
        model,
        endpointUrl: config.endpointUrl,
        check: validated ? { ok: true, validated: true } : { ok: false, validated: true, message: `Model '${model}' is not available from ${config.label}.` },
        availableModelCount: available.ids.length,
        request: maskSecrets(body),
      },
    };
  }

  const available = await fetchAnthropicCompatibleModels(config.endpointUrl, apiKey);
  if (!available.ok) {
    if ([404, 405].includes(available.status)) {
      return { statusCode: 200, payload: { provider, providerLabel: config.label, model, endpointUrl: config.endpointUrl, check: { ok: true, validated: false, message: "Endpoint does not expose /v1/models for validation." }, request: maskSecrets(body) } };
    }
    return { statusCode: available.status || 502, payload: { provider, model, endpointUrl: config.endpointUrl, check: { ok: false, message: available.message }, request: maskSecrets(body) } };
  }
  const validated = available.ids.includes(model);
  return {
    statusCode: validated ? 200 : 409,
    payload: {
      provider,
      providerLabel: config.label,
      model,
      endpointUrl: config.endpointUrl,
      check: validated ? { ok: true, validated: true } : { ok: false, validated: true, message: `Model '${model}' is not available from ${config.label}.` },
      availableModelCount: available.ids.length,
      request: maskSecrets(body),
    },
  };
}

function getSandboxDetails(name) {
  const sandbox = registry.getSandbox(name);
  if (!sandbox) return null;
  return { ...sandbox, liveInference: getInferenceInfo().parsed };
}

function getPresetDetails(name) {
  return {
    sandboxName: name,
    applied: policies.getAppliedPresets(name),
    available: policies.listPresets(),
  };
}

function getCredentialSummary() {
  const stored = credentials.loadCredentials();
  return {
    path: credentials.CREDS_FILE,
    keys: CREDENTIAL_KEYS.map((key) => ({
      key,
      presentInEnv: Boolean(process.env[key]),
      presentInStore: Boolean(stored[key]),
      active: Boolean(credentials.getCredential(key)),
    })),
  };
}

function getPresetByName(name) {
  const content = policies.loadPreset(name);
  if (!content) return null;
  const info = policies.listPresets().find((preset) => preset.name === name) || { name };
  return {
    ...info,
    content,
    endpoints: policies.getPresetEndpoints(content),
  };
}

function getPolicyRaw(sandboxName) {
  const command = policies.buildPolicyGetCommand(sandboxName);
  const result = runCommand("bash", ["-lc", command]);
  return {
    ...wrapCommand(`policy get ${sandboxName}`, result),
    parsedPolicy: policies.parseCurrentPolicy(result.stdout || result.stderr || ""),
  };
}

function getPolicyEndpoints(sandboxName) {
  const raw = getPolicyRaw(sandboxName);
  const endpoints = policies.getPresetEndpoints(raw.parsedPolicy || "");
  return {
    sandboxName,
    endpoints,
    endpointCount: endpoints.length,
    parsedPolicy: raw.parsedPolicy,
    command: {
      success: raw.success,
      label: raw.label,
      exitCode: raw.exitCode,
      stdout: raw.stdout,
      stderr: raw.stderr,
    },
  };
}

function getStructuredSandboxStatus(sandboxName) {
  const sandbox = registry.getSandbox(sandboxName);
  const liveInference = getInferenceInfo().parsed;
  const nimStatus = sandbox && sandbox.nimContainer
    ? nim.nimStatusByName(sandbox.nimContainer)
    : nim.nimStatus(sandboxName);
  const liveStatus = runNemoclaw([sandboxName, "status"]);
  return {
    sandboxName,
    registry: sandbox,
    liveInference,
    nimStatus,
    statusCommand: wrapCommand(`nemoclaw ${sandboxName} status`, liveStatus),
  };
}

function getForwardPort(input) {
  const value = Number(input || DEFAULT_FORWARD_PORT);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error("Invalid port");
  }
  return value;
}

function getActiveGatewayName(output = "") {
  const match = stripAnsi(output).match(/^\s*Gateway:\s+(.+?)\s*$/m);
  return match ? match[1].trim() : "";
}

function hasNamedGateway(output = "") {
  return stripAnsi(output).includes("Gateway: nemoclaw");
}

function getGatewayStatus() {
  const status = runOpenshell(["status"]);
  const gatewayInfo = runOpenshell(["gateway", "info", "-g", "nemoclaw"]);
  const cleanStatus = stripAnsi(`${status.stdout}${status.stderr}`);
  const activeGateway = getActiveGatewayName(`${status.stdout}${status.stderr}`);
  const connected = /^\s*Status:\s*Connected\b/im.test(cleanStatus);
  const named = hasNamedGateway(`${gatewayInfo.stdout}${gatewayInfo.stderr}`);
  const refusing = /Connection refused|client error \(Connect\)|tcp connect error/i.test(cleanStatus);
  let state = "missing_named";
  if (connected && activeGateway === "nemoclaw" && named) {
    state = "healthy_named";
  } else if (activeGateway === "nemoclaw" && named && refusing) {
    state = "named_unreachable";
  } else if (activeGateway === "nemoclaw" && named) {
    state = "named_unhealthy";
  } else if (connected) {
    state = "connected_other";
  }
  return {
    state,
    activeGateway,
    connected,
    namedGatewayPresent: named,
    openshellStatus: wrapCommand("openshell status", status),
    namedGatewayInfo: wrapCommand("openshell gateway info -g nemoclaw", gatewayInfo),
  };
}

function getSandboxGatewayState(sandboxName) {
  const result = runOpenshell(["sandbox", "get", sandboxName]);
  const output = `${result.stdout}${result.stderr}`;
  let state = "unknown_error";
  if (result.ok) {
    state = "present";
  } else if (/NotFound|sandbox not found/i.test(output)) {
    state = "missing";
  } else if (/transport error|Connection refused|handshake verification failed|Missing gateway auth token|device identity required/i.test(output)) {
    state = "gateway_error";
  }
  return {
    sandboxName,
    state,
    command: wrapCommand(`openshell sandbox get ${sandboxName}`, result),
    gateway: getGatewayStatus(),
  };
}

function getSandboxReadiness(sandboxName) {
  const sandboxList = runOpenshell(["sandbox", "list"]);
  const phase = runOpenshell([
    "doctor",
    "exec",
    "--",
    "kubectl",
    "-n",
    "openshell",
    "get",
    "pod",
    sandboxName,
    "-o",
    "jsonpath={.status.phase}",
  ]);
  const phaseText = `${phase.stdout}${phase.stderr}`.trim();
  return {
    sandboxName,
    ready: onboard.isSandboxReady(`${sandboxList.stdout}${sandboxList.stderr}`, sandboxName) || phaseText === "Running",
    podPhase: phaseText || null,
    sandboxList: wrapCommand("openshell sandbox list", sandboxList),
    podPhaseCommand: wrapCommand(`kubectl get pod ${sandboxName}`, phase),
    gatewayState: getSandboxGatewayState(sandboxName),
  };
}

function getNimGpuInfo() {
  return {
    gpu: nim.detectGpu(),
    models: nim.listModels(),
  };
}

function getDefaultLocalModel() {
  const gpu = nim.detectGpu();
  const runCapture = (command, options = {}) => {
    const result = runCommand("bash", ["-lc", command], options);
    return `${result.stdout}${result.stderr}`.trim();
  };
  const installedModels = localInference.getOllamaModelOptions(runCapture);
  const bootstrapModels = localInference.getBootstrapOllamaModelOptions(gpu);
  const recommendedModel = localInference.getDefaultOllamaModel(runCapture, gpu);
  return {
    provider: "ollama-local",
    gpu,
    installedModels,
    bootstrapModels,
    recommendedModel,
    usingInstalledModels: installedModels.length > 0,
    baseUrl: localInference.getLocalProviderBaseUrl("ollama-local"),
  };
}

function getSandboxNimInfo(sandboxName) {
  const sandbox = registry.getSandbox(sandboxName);
  const model = sandbox?.model || null;
  const container = sandbox?.nimContainer || nim.containerName(sandboxName);
  return {
    sandboxName,
    registry: sandbox || null,
    model,
    container,
    image: model ? nim.getImageForModel(model) : null,
    status: nim.nimStatusByName(container),
  };
}

function getServicesPidDir(sandboxName = "default") {
  return path.join("/tmp", `nemoclaw-services-${sandboxName}`);
}

function getServiceLogPath(serviceName, sandboxName = "default") {
  return path.join(getServicesPidDir(sandboxName), `${serviceName}.log`);
}

function getServicePidPath(serviceName, sandboxName = "default") {
  return path.join(getServicesPidDir(sandboxName), `${serviceName}.pid`);
}

function getStructuredServicesStatus(sandboxName = "default") {
  const pidDir = getServicesPidDir(sandboxName);
  const services = ["telegram-bridge", "cloudflared"].map((name) => {
    const pidFile = getServicePidPath(name, sandboxName);
    const logFile = getServiceLogPath(name, sandboxName);
    let pid = null;
    let running = false;
    if (fs.existsSync(pidFile)) {
      const rawPid = fs.readFileSync(pidFile, "utf-8").trim();
      pid = Number(rawPid) || null;
      if (pid) {
        try {
          process.kill(pid, 0);
          running = true;
        } catch {}
      }
    }
    let publicUrl = null;
    if (name === "cloudflared" && fs.existsSync(logFile)) {
      const match = fs.readFileSync(logFile, "utf-8").match(/https:\/\/[a-z0-9-]*\.trycloudflare\.com/);
      publicUrl = match ? match[0] : null;
    }
    return {
      name,
      running,
      pid,
      pidFile,
      logFile,
      logExists: fs.existsSync(logFile),
      publicUrl,
    };
  });
  return {
    sandboxName,
    pidDir,
    platformNote: "Service scripts use bash and /tmp paths; best supported in Linux/WSL/macOS environments.",
    services,
  };
}

async function getPortPreflight(port) {
  const safePort = getForwardPort(port);
  const result = await preflight.checkPortAvailable(safePort);
  return { port: safePort, ...result };
}

async function getBatchPortPreflight(values) {
  const ports = Array.from(new Set(
    String(values || `${DEFAULT_FORWARD_PORT}`)
      .split(",")
      .map((value) => Number(String(value).trim()))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= 65535)
  ));
  const checks = await Promise.all(ports.map((port) => getPortPreflight(port)));
  return {
    ok: checks.every((item) => item.ok),
    count: checks.length,
    conflictCount: checks.filter((item) => item.ok === false).length,
    ports: checks,
  };
}

function getOpenshellDiagnostics() {
  const dockerHost = platformInfo.detectDockerHost();
  const dockerVersion = runCommand("docker", ["version", "--format", "{{json .}}"]);
  const openshellVersion = onboard.getInstalledOpenshellVersion();
  return {
    openshell: {
      resolvedBinary: openshellBinary,
      version: openshellVersion,
      stableGatewayImageRef: onboard.getStableGatewayImageRef(),
    },
    docker: {
      detectedHost: dockerHost,
      socketCandidates: platformInfo.getDockerSocketCandidates ? platformInfo.getDockerSocketCandidates() : [],
      runtime: platformInfo.inferContainerRuntime(`${dockerVersion.stdout}${dockerVersion.stderr}`),
      versionCommand: wrapCommand("docker version --format {{json .}}", dockerVersion),
    },
    platform: {
      platform: process.platform,
      arch: process.arch,
      isWsl: platformInfo.isWsl(),
      shouldPatchCoredns: platformInfo.shouldPatchCoredns(platformInfo.inferContainerRuntime(`${dockerVersion.stdout}${dockerVersion.stderr}`)),
    },
  };
}

function getLocalInferenceProviders() {
  const gpu = nim.detectGpu();
  return {
    providers: LOCAL_INFERENCE_PROVIDERS.map((provider) => ({
      provider,
      baseUrl: localInference.getLocalProviderBaseUrl(provider),
      validationBaseUrl: localInference.getLocalProviderValidationBaseUrl(provider),
      healthCheck: localInference.getLocalProviderHealthCheck(provider),
      containerReachabilityCheck: localInference.getLocalProviderContainerReachabilityCheck(provider),
      defaultModel: provider === "ollama-local" ? localInference.getDefaultOllamaModel((command, options = {}) => runCommand("bash", ["-lc", command], options).stdout, gpu) : null,
    })),
  };
}

function getLocalProviderDiagnostics(provider, model = "") {
  if (!LOCAL_INFERENCE_PROVIDERS.includes(provider)) {
    return { statusCode: 400, payload: { error: "Unsupported local provider", provider, allowedProviders: LOCAL_INFERENCE_PROVIDERS } };
  }
  const runner = (command, options = {}) => {
    const result = runCommand("bash", ["-lc", command], options);
    return `${result.stdout}${result.stderr}`.trim();
  };
  const providerCheck = localInference.validateLocalProvider(provider, runner);
  const modelCheck = provider === "ollama-local" && model ? localInference.validateOllamaModel(model, runner) : { ok: true };
  return {
    statusCode: providerCheck.ok && modelCheck.ok ? 200 : 409,
    payload: {
      provider,
      model: model || null,
      expected: {
        baseUrl: localInference.getLocalProviderBaseUrl(provider),
        validationBaseUrl: localInference.getLocalProviderValidationBaseUrl(provider),
      },
      commands: {
        healthCheck: localInference.getLocalProviderHealthCheck(provider),
        containerReachabilityCheck: localInference.getLocalProviderContainerReachabilityCheck(provider),
        probeCommand: provider === "ollama-local" && model ? localInference.getOllamaProbeCommand(model) : null,
      },
      providerCheck,
      modelCheck,
    },
  };
}

function getPresetEntries(name) {
  const content = policies.loadPreset(name);
  if (!content) return null;
  const entries = policies.extractPresetEntries(content);
  return {
    name,
    entries,
    endpoints: policies.getPresetEndpoints(entries || ""),
  };
}

function getNimCompatibility() {
  const gpu = nim.detectGpu();
  const models = nim.listModels();
  const compatible = [];
  const incompatible = [];
  for (const model of models) {
    const image = nim.getImageForModel(model.name);
    if (gpu?.nimCapable && Number(gpu.totalMemoryMB || 0) >= Number(model.minGpuMemoryMB || 0)) {
      compatible.push({ ...model, image });
    } else {
      incompatible.push({
        ...model,
        image,
        reason: !gpu
          ? "No supported GPU detected"
          : !gpu.nimCapable
            ? "Detected GPU/runtime is not NIM-capable"
            : "requires more GPU memory than detected",
      });
    }
  }
  return {
    gpu,
    compatible,
    incompatible,
  };
}

function getPolicyPreviewMerge(sandboxName, presetName) {
  const presetContent = policies.loadPreset(presetName);
  if (!presetContent) return null;
  const presetEntries = policies.extractPresetEntries(presetContent) || "";
  const current = getPolicyRaw(sandboxName);
  let currentPolicy = current.parsedPolicy || "";
  let merged = "";
  if (currentPolicy && currentPolicy.includes("network_policies:")) {
    const lines = currentPolicy.split("\n");
    const result = [];
    let inNetworkPolicies = false;
    let inserted = false;
    for (const line of lines) {
      const isTopLevel = /^\S.*:/.test(line);
      if (line.trim() === "network_policies:" || line.trim().startsWith("network_policies:")) {
        inNetworkPolicies = true;
        result.push(line);
        continue;
      }
      if (inNetworkPolicies && isTopLevel && !inserted) {
        result.push(presetEntries);
        inserted = true;
        inNetworkPolicies = false;
      }
      result.push(line);
    }
    if (inNetworkPolicies && !inserted) result.push(presetEntries);
    merged = result.join("\n");
  } else if (currentPolicy) {
    if (!currentPolicy.includes("version:")) currentPolicy = `version: 1\n${currentPolicy}`;
    merged = `${currentPolicy}\n\nnetwork_policies:\n${presetEntries}`;
  } else {
    merged = `version: 1\n\nnetwork_policies:\n${presetEntries}`;
  }
  const currentEndpoints = policies.getPresetEndpoints(current.parsedPolicy || "");
  const presetEndpoints = policies.getPresetEndpoints(presetEntries || "");
  const mergedEndpoints = policies.getPresetEndpoints(merged || "");
  return {
    sandboxName,
    presetName,
    current: {
      endpointCount: currentEndpoints.length,
      endpoints: currentEndpoints,
    },
    preset: {
      endpointCount: presetEndpoints.length,
      endpoints: presetEndpoints,
      entries: presetEntries,
    },
    merged: {
      endpointCount: mergedEndpoints.length,
      endpoints: mergedEndpoints,
      newEndpoints: mergedEndpoints.filter((value) => !currentEndpoints.includes(value)),
      alreadyPresentEndpoints: presetEndpoints.filter((value) => currentEndpoints.includes(value)),
      policyYaml: merged,
    },
    command: current.command,
  };
}

function getEnvironmentSummary(query) {
  const docker = platformInfo.detectDockerHost();
  const dockerVersion = runCommand("docker", ["version", "--format", "{{json .}}"]);
  const openshellVersion = onboard.getInstalledOpenshellVersion();
  const portValues = String(query.get("ports") || `${DEFAULT_FORWARD_PORT}`)
    .split(",")
    .map((value) => Number(String(value).trim()))
    .filter((value) => Number.isInteger(value) && value > 0 && value <= 65535);
  return {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    isWsl: platformInfo.isWsl(),
    dockerHost: docker,
    containerRuntime: platformInfo.inferContainerRuntime(`${dockerVersion.stdout}${dockerVersion.stderr}`),
    openshellBinary,
    openshellVersion,
    stableGatewayImageRef: onboard.getStableGatewayImageRef(),
    gpu: nim.detectGpu(),
    gateway: getGatewayStatus(),
    ports: portValues,
    localInference: getLocalInferenceProviders(),
  };
}

function getOnboardPreview(body = {}) {
  const provider = String(body.provider || "nvidia-prod").trim();
  const model = String(body.model || inferenceConfig.DEFAULT_CLOUD_MODEL).trim();
  const preferredInferenceApi = body.preferredInferenceApi ? String(body.preferredInferenceApi) : null;
  return {
    provider,
    model,
    providerSelection: inferenceConfig.getProviderSelectionConfig(provider, model),
    openClawPrimaryModel: inferenceConfig.getOpenClawPrimaryModel(provider, model),
    sandboxInference: onboard.getSandboxInferenceConfig(model, provider, preferredInferenceApi),
    localBaseUrl: ["ollama-local", "vllm-local"].includes(provider)
      ? localInference.getLocalProviderBaseUrl(provider)
      : null,
    credentialKey: inferenceConfig.getProviderSelectionConfig(provider, model)?.credentialEnv || null,
  };
}

function buildOnboardEnv(body) {
  const env = { NEMOCLAW_NON_INTERACTIVE: "1" };
  const simpleMap = {
    provider: "NEMOCLAW_PROVIDER",
    model: "NEMOCLAW_MODEL",
    endpointUrl: "NEMOCLAW_ENDPOINT_URL",
    sandboxName: "NEMOCLAW_SANDBOX_NAME",
    chatUiUrl: "CHAT_UI_URL",
  };
  for (const [key, envName] of Object.entries(simpleMap)) {
    if (body[key]) env[envName] = String(body[key]);
  }
  if (parseBool(body.recreateSandbox)) env.NEMOCLAW_RECREATE_SANDBOX = "1";
  if (parseBool(body.experimental)) env.NEMOCLAW_EXPERIMENTAL = "1";
  if (body.policyMode) env.NEMOCLAW_POLICY_MODE = String(body.policyMode);
  if (Array.isArray(body.policyPresets) && body.policyPresets.length) env.NEMOCLAW_POLICY_PRESETS = body.policyPresets.join(",");
  if (!Array.isArray(body.policyPresets) && body.policyPresets) env.NEMOCLAW_POLICY_PRESETS = String(body.policyPresets);

  for (const key of [
    "NVIDIA_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "COMPATIBLE_API_KEY",
    "COMPATIBLE_ANTHROPIC_API_KEY", "GEMINI_API_KEY", "TELEGRAM_BOT_TOKEN",
    "SLACK_BOT_TOKEN", "DISCORD_BOT_TOKEN",
  ]) {
    if (body[key]) env[key] = String(body[key]);
  }
  return env;
}

function buildDeployEnv(body) {
  const env = {};
  if (body.gpu) env.NEMOCLAW_GPU = String(body.gpu);
  for (const key of ["NVIDIA_API_KEY", "GITHUB_TOKEN", "TELEGRAM_BOT_TOKEN", "SLACK_BOT_TOKEN", "DISCORD_BOT_TOKEN"]) {
    if (body[key]) env[key] = String(body[key]);
  }
  return env;
}

function summarizeInstallScript() {
  return {
    bootstrapInstallerUrl: CANONICAL_INSTALL_URL,
    upstreamNemoClawInstallerUrl: UPSTREAM_NEMOCLAW_INSTALL_URL,
    installRepoUrl: INSTALL_REPO_URL,
    localRepoInstallScript: ROOT_INSTALL_SCRIPT,
    standaloneHelperScript: STANDALONE_INSTALL_SCRIPT,
    localRepoInstallExists: fs.existsSync(ROOT_INSTALL_SCRIPT),
    standaloneHelperExists: fs.existsSync(STANDALONE_INSTALL_SCRIPT),
    note: "One-command bootstrap uses standalone-api/install.sh from thanhan92-f1/Nemo-Claw. It clones or reuses that repo, then runs the local ROOT_INSTALL_SCRIPT to install NemoClaw and finally prepares the standalone API wrapper.",
  };
}

function readTextFileSafe(filePath) {
  return fs.readFileSync(filePath, "utf-8");
}

function runRootInstall(body = {}) {
  const args = [];
  if (parseBool(body.nonInteractive)) args.push("--non-interactive");
  if (parseBool(body.help)) args.push("--help");
  if (parseBool(body.version)) args.push("--version");

  const env = {};
  const envKeys = [
    "NVIDIA_API_KEY",
    "NEMOCLAW_NON_INTERACTIVE",
    "NEMOCLAW_SANDBOX_NAME",
    "NEMOCLAW_RECREATE_SANDBOX",
    "NEMOCLAW_INSTALL_TAG",
    "NEMOCLAW_PROVIDER",
    "NEMOCLAW_MODEL",
    "NEMOCLAW_POLICY_MODE",
    "NEMOCLAW_POLICY_PRESETS",
    "NEMOCLAW_EXPERIMENTAL",
    "CHAT_UI_URL",
    "DISCORD_BOT_TOKEN",
    "SLACK_BOT_TOKEN",
    "TELEGRAM_BOT_TOKEN",
  ];
  for (const key of envKeys) {
    if (body[key] !== undefined && body[key] !== null && body[key] !== "") {
      env[key] = String(body[key]);
    }
  }
  const command = fs.existsSync(ROOT_INSTALL_SCRIPT)
    ? (args.length > 0
      ? `bash ${shellQuote(ROOT_INSTALL_SCRIPT)} ${args.map((arg) => shellQuote(arg)).join(" ")}`
      : `bash ${shellQuote(ROOT_INSTALL_SCRIPT)}`)
    : (args.length > 0
      ? `curl -fsSL ${shellQuote(UPSTREAM_NEMOCLAW_INSTALL_URL)} | bash -s -- ${args.map((arg) => shellQuote(arg)).join(" ")}`
      : `curl -fsSL ${shellQuote(UPSTREAM_NEMOCLAW_INSTALL_URL)} | bash`);
  return runCommand("bash", ["-lc", command], { env });
}

function makeSshConfig(sandboxName) {
  const content = execFileSync(openshellBinary, ["sandbox", "ssh-config", sandboxName], {
    encoding: "utf-8",
    env: withHome(),
    cwd: ROOT,
  });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nemoclaw-web-ssh-"));
  const file = path.join(dir, "config");
  fs.writeFileSync(file, content, { mode: 0o600 });
  return {
    file,
    cleanup() {
      try { fs.unlinkSync(file); } catch {}
      try { fs.rmdirSync(dir); } catch {}
    },
  };
}

function getUiLinks(sandboxName, port = DEFAULT_FORWARD_PORT) {
  const safePort = getForwardPort(port);
  runOpenshell(["forward", "start", "--background", String(safePort), sandboxName]);
  const ssh = makeSshConfig(sandboxName);
  try {
    const raw = execFileSync("ssh", ["-T", "-F", ssh.file, `openshell-${sandboxName}`, "cat /sandbox/.openclaw/openclaw.json"], {
      encoding: "utf-8",
      env: withHome(),
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let token = "";
    try {
      token = JSON.parse(raw)?.gateway?.auth?.token || "";
    } catch {}
    const localBase = `http://127.0.0.1:${safePort}/`;
    return {
      sandboxName,
      port: safePort,
      localUi: token ? `${localBase}#token=${token}` : localBase,
      terminalPage: `/terminal?sandbox=${encodeURIComponent(sandboxName)}`,
      chatPage: `/chat?sandbox=${encodeURIComponent(sandboxName)}`,
      apiStatus: `/api/sandboxes/${encodeURIComponent(sandboxName)}/status`,
      apiLogs: `/api/sandboxes/${encodeURIComponent(sandboxName)}/logs`,
      tokenPresent: Boolean(token),
    };
  } finally {
    ssh.cleanup();
  }
}

function filterAgentOutput(stdout, stderr, exitCode) {
  const lines = String(stdout || "").split(/\r?\n/);
  const cleaned = lines.filter((line) => {
    const value = line.trim();
    if (!value) return false;
    return ![
      "Setting up NemoClaw",
      "[plugins]",
      "NemoClaw ready",
      "NemoClaw registered",
      "openclaw agent",
      "┌─",
      "│ ",
      "└─",
    ].some((marker) => value.startsWith(marker) || value.includes(marker));
  }).join("\n").trim();
  if (cleaned) return cleaned;
  if (exitCode !== 0) return String(stderr || "Agent command failed").trim();
  return "(no response)";
}

function runChat(sandboxName, message, sessionId) {
  const ssh = makeSshConfig(sandboxName);
  try {
    const exports = [];
    if (process.env.NVIDIA_API_KEY) exports.push(`export NVIDIA_API_KEY=${shellQuote(process.env.NVIDIA_API_KEY)}`);
    const remote = [
      ...exports,
      `nemoclaw-start openclaw agent --agent main --local -m ${shellQuote(message)} --session-id ${shellQuote(`web-${sessionId}`)}`,
    ].join(" && ");
    const result = runCommand("ssh", ["-T", "-F", ssh.file, `openshell-${sandboxName}`, remote], { env: withHome() });
    return {
      ok: result.ok,
      sandboxName,
      sessionId,
      response: filterAgentOutput(result.stdout, result.stderr, result.exitCode),
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    };
  } finally {
    ssh.cleanup();
  }
}

function terminalAction(action, body) {
  const sandboxName = normalizeSandboxName(body.sandboxName || DEFAULT_SANDBOX);
  const port = getForwardPort(body.port);
  switch (action) {
    case "list":
      return { label: "nemoclaw list", result: runNemoclaw(["list"]) };
    case "status":
      return { label: "nemoclaw status", result: runNemoclaw(["status"]) };
    case "sandbox-status":
      return { label: `nemoclaw ${sandboxName} status`, result: runNemoclaw([sandboxName, "status"]) };
    case "logs": {
      const args = [sandboxName, "logs"];
      if (parseBool(body.follow)) args.push("--follow");
      return { label: `nemoclaw ${sandboxName} logs`, result: runNemoclaw(args) };
    }
    case "policy-list":
      return { label: `nemoclaw ${sandboxName} policy-list`, result: runNemoclaw([sandboxName, "policy-list"]) };
    case "connect":
      return { label: `openshell forward start ${sandboxName}`, result: runOpenshell(["forward", "start", "--background", String(port), sandboxName]) };
    case "ui":
      return { label: `ui links ${sandboxName}`, result: { ok: true, exitCode: 0, stdout: JSON.stringify(getUiLinks(sandboxName, port), null, 2), stderr: "" } };
    default:
      throw new Error(`Unsupported terminal action: ${action}`);
  }
}

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<style>
:root{--bg:#09090b;--panel:#111827;--line:#253146;--text:#f8fafc;--muted:#94a3b8;--green:#76b900;--cyan:#22d3ee;--pink:#f472b6}
*{box-sizing:border-box}body{margin:0;font-family:Segoe UI,Arial,sans-serif;background:radial-gradient(circle at top left,rgba(34,211,238,.14),transparent 30%),radial-gradient(circle at top right,rgba(244,114,182,.14),transparent 30%),linear-gradient(135deg,#020617,#0f172a);color:var(--text)}
main{max-width:1180px;margin:0 auto;padding:24px} .hero,.card{background:rgba(15,23,42,.88);border:1px solid var(--line);border-radius:22px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
.hero{padding:24px}.card{padding:18px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:16px}.row{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}
.badge{display:inline-block;padding:8px 12px;border-radius:999px;background:rgba(118,185,0,.16);border:1px solid rgba(118,185,0,.28);color:#e2f7b3;font-size:12px;text-transform:uppercase;letter-spacing:.08em}
h1,h2{margin:10px 0}p{color:var(--muted);line-height:1.6}a{color:var(--cyan);text-decoration:none}a:hover{text-decoration:underline}
input,textarea,select{width:100%;margin-top:8px;padding:12px 14px;border-radius:14px;border:1px solid #314158;background:#020617;color:var(--text)}textarea{min-height:140px;resize:vertical}
button,.btn{display:inline-block;padding:12px 16px;border-radius:14px;border:none;background:linear-gradient(135deg,var(--green),#9be112);color:#04110a;font-weight:700;cursor:pointer;text-decoration:none}.btn.secondary{background:#101826;color:var(--text);border:1px solid var(--line)}
pre{white-space:pre-wrap;word-break:break-word;background:#020617;border:1px solid var(--line);border-radius:16px;padding:14px}table{width:100%;border-collapse:collapse}th,td{padding:10px;border-bottom:1px solid rgba(148,163,184,.14);text-align:left;vertical-align:top}
.chips{display:flex;gap:10px;flex-wrap:wrap}.chip{padding:8px 12px;border-radius:999px;background:rgba(34,211,238,.1);border:1px solid rgba(34,211,238,.2)}footer{margin-top:18px;color:var(--muted);font-size:13px}
</style>
</head>
<body><main>${body}<footer>NemoClaw ${esc(PACKAGE_JSON.version)} · ${esc(HOST)}:${esc(String(PORT))} · OpenShell: ${esc(openshellBinary)}</footer></main></body>
</html>`;
}

function homePage() {
  const sandboxes = registry.listSandboxes();
  const routeRows = ROUTES.map(([method, route, desc]) => `<tr><td><b>${esc(method)}</b></td><td><code>${esc(route)}</code></td><td>${esc(desc)}</td></tr>`).join("");
  const chips = sandboxes.sandboxes.length
    ? sandboxes.sandboxes.map((sb) => `<span class="chip">${esc(sb.name)} · ${esc(sb.model || "unknown")}</span>`).join("")
    : `<span class="chip">No sandbox registered</span>`;
  return layout("NemoClaw standalone API", `
<section class="hero">
  <span class="badge">Candy UI · Standalone wrapper</span>
  <h1>NemoClaw standalone API</h1>
  <p>Wrapper riêng, không can thiệp core code. Có <code>/chat</code>, <code>/terminal</code>, REST API và Postman.</p>
  <div class="chips">
    <a class="btn" href="/chat?sandbox=${encodeURIComponent(DEFAULT_SANDBOX)}">Open /chat</a>
    <a class="btn secondary" href="/terminal?sandbox=${encodeURIComponent(DEFAULT_SANDBOX)}">Open /terminal</a>
    <a class="btn secondary" href="/api">API index</a>
  </div>
</section>
<section class="grid">
  <article class="card"><h2>Sandboxes</h2><div class="chips">${chips}</div></article>
  <article class="card"><h2>Postman</h2><pre>standalone-api/postman/nemoclaw-standalone-api.postman_collection.json
standalone-api/postman/nemoclaw-local.postman_environment.json</pre></article>
</section>
<section class="card" style="margin-top:16px"><h2>All routes</h2><table><thead><tr><th>Method</th><th>Path</th><th>Description</th></tr></thead><tbody>${routeRows}</tbody></table></section>`);
}

function chatPage(query) {
  const sandbox = esc(query.get("sandbox") || DEFAULT_SANDBOX);
  return layout("NemoClaw /chat", `
<section class="hero"><span class="badge">Candy chat</span><h1>/chat</h1><p>Chat với sandbox không cần gõ lệnh.</p></section>
<section class="grid">
  <article class="card">
    <h2>Prompt</h2>
    <div class="row">
      <label>Sandbox<input id="sandboxName" value="${sandbox}" /></label>
      <label>Session ID<input id="sessionId" value="web-chat-${Date.now()}" /></label>
    </div>
    <label>Message<textarea id="message" placeholder="Xin chào NemoClaw..."></textarea></label>
    <div class="chips"><button id="sendBtn">Send</button><a class="btn secondary" href="/terminal?sandbox=${encodeURIComponent(query.get("sandbox") || DEFAULT_SANDBOX)}">Open /terminal</a></div>
  </article>
  <article class="card"><h2>Response</h2><pre id="result">Ready.</pre></article>
</section>
<script>
const btn=document.getElementById('sendBtn');const result=document.getElementById('result');
btn.onclick=async()=>{btn.disabled=true;result.textContent='Thinking...';try{const res=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sandboxName:document.getElementById('sandboxName').value,sessionId:document.getElementById('sessionId').value,message:document.getElementById('message').value})});result.textContent=JSON.stringify(await res.json(),null,2)}catch(e){result.textContent=String(e&&e.message||e)}finally{btn.disabled=false}};
</script>`);
}

function terminalPage(query) {
  const sandbox = esc(query.get("sandbox") || DEFAULT_SANDBOX);
  return layout("NemoClaw /terminal", `
<section class="hero"><span class="badge">Candy terminal</span><h1>/terminal</h1><p>Web terminal helper cho action an toàn đã allow-list.</p></section>
<section class="grid">
  <article class="card">
    <h2>Run</h2>
    <label>Sandbox<input id="sandboxName" value="${sandbox}" /></label>
    <label>Action<select id="action"><option value="list">list</option><option value="status">status</option><option value="sandbox-status">sandbox-status</option><option value="logs">logs</option><option value="policy-list">policy-list</option><option value="connect">connect</option><option value="ui">ui</option></select></label>
    <label><input id="follow" type="checkbox" style="width:auto;margin-right:8px" /> Follow logs</label>
    <div class="chips"><button id="runBtn">Run</button><a class="btn secondary" href="/chat?sandbox=${encodeURIComponent(query.get("sandbox") || DEFAULT_SANDBOX)}">Open /chat</a></div>
  </article>
  <article class="card"><h2>Output</h2><pre id="output">Ready.</pre></article>
</section>
<script>
const runBtn=document.getElementById('runBtn');const output=document.getElementById('output');
runBtn.onclick=async()=>{runBtn.disabled=true;output.textContent='Running...';try{const res=await fetch('/api/terminal/exec',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sandboxName:document.getElementById('sandboxName').value,action:document.getElementById('action').value,follow:document.getElementById('follow').checked})});output.textContent=JSON.stringify(await res.json(),null,2)}catch(e){output.textContent=String(e&&e.message||e)}finally{runBtn.disabled=false}};
</script>`);
}

async function handle(req, res, url) {
  const pathname = url.pathname;
  let match;

  if (req.method === "GET" && pathname === "/") return sendHtml(res, 200, homePage());
  if (req.method === "GET" && pathname === "/chat") return sendHtml(res, 200, chatPage(url.searchParams));
  if (req.method === "GET" && pathname === "/terminal") return sendHtml(res, 200, terminalPage(url.searchParams));
  if (req.method === "GET" && pathname === "/health") {
    return sendJson(res, 200, { ok: true, name: PACKAGE_JSON.name, version: PACKAGE_JSON.version, host: HOST, port: PORT, defaultSandbox: DEFAULT_SANDBOX, openshellBinary });
  }
  if (req.method === "GET" && pathname === "/api") {
    return sendJson(res, 200, { name: "nemoclaw-standalone-api", version: PACKAGE_JSON.version, baseUrl: `http://${HOST}:${PORT}`, endpoints: ROUTES.map(([method, pathValue, description]) => ({ method, path: pathValue, description })) });
  }
  if (req.method === "GET" && pathname === "/api/commands") {
    return sendJson(res, 200, CLI_SURFACE);
  }
  if (req.method === "GET" && pathname === "/api/version") return sendJson(res, 200, { name: PACKAGE_JSON.name, version: PACKAGE_JSON.version });
  if (req.method === "GET" && pathname === "/api/help") {
    const result = runNemoclaw(["help"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand("nemoclaw help", result));
  }
  if (req.method === "GET" && pathname === "/api/list") {
    const result = runNemoclaw(["list"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand("nemoclaw list", result));
  }
  if (req.method === "GET" && pathname === "/api/status") {
    const result = runNemoclaw(["status"]);
    return sendJson(res, result.ok ? 200 : 500, { ...wrapCommand("nemoclaw status", result), registry: registry.listSandboxes() });
  }

  if (req.method === "GET" && pathname === "/api/presets") return sendJson(res, 200, { presets: policies.listPresets() });
  match = pathname.match(/^\/api\/presets\/([^/]+)$/);
  if (req.method === "GET" && match) {
    const presetName = decodeURIComponent(match[1]);
    const detail = getPresetByName(presetName);
    if (!detail) return sendJson(res, 404, { error: `Preset '${presetName}' not found` });
    return sendJson(res, 200, detail);
  }
  match = pathname.match(/^\/api\/presets\/([^/]+)\/endpoints$/);
  if (req.method === "GET" && match) {
    const presetName = decodeURIComponent(match[1]);
    const detail = getPresetByName(presetName);
    if (!detail) return sendJson(res, 404, { error: `Preset '${presetName}' not found` });
    return sendJson(res, 200, { name: presetName, endpoints: detail.endpoints });
  }
  match = pathname.match(/^\/api\/presets\/([^/]+)\/entries$/);
  if (req.method === "GET" && match) {
    const presetName = decodeURIComponent(match[1]);
    const detail = getPresetEntries(presetName);
    if (!detail) return sendJson(res, 404, { error: `Preset '${presetName}' not found` });
    return sendJson(res, 200, detail);
  }

  if (req.method === "GET" && pathname === "/api/install") {
    return sendJson(res, 200, summarizeInstallScript());
  }
  if (req.method === "GET" && pathname === "/api/install/script") {
    const payload = summarizeInstallScript();
    if (fs.existsSync(ROOT_INSTALL_SCRIPT)) {
      payload.localRepoInstallContent = readTextFileSafe(ROOT_INSTALL_SCRIPT);
    }
    payload.howToUse = `curl -fsSL ${CANONICAL_INSTALL_URL} | bash`;
    payload.installFlow = [
      `Bootstrap helper from ${CANONICAL_INSTALL_URL}`,
      `Clone or reuse repo: ${INSTALL_REPO_URL}`,
      `Run local ROOT_INSTALL_SCRIPT: ${ROOT_INSTALL_SCRIPT}`,
      `Upstream NemoClaw installer reference: ${UPSTREAM_NEMOCLAW_INSTALL_URL}`,
    ];
    return sendJson(res, 200, payload);
  }
  if (req.method === "POST" && pathname === "/api/install/run") {
    const body = await readBody(req);
    try {
      const result = runRootInstall(body);
      return sendJson(res, result.ok ? 200 : 500, { request: maskSecrets(body), ...summarizeInstallScript(), ...wrapCommand("bash install.sh", result) });
    } catch (error) {
      return sendJson(res, 500, { error: error.message, ...summarizeInstallScript() });
    }
  }

  if (req.method === "GET" && pathname === "/api/onboard/options") {
    return sendJson(res, 200, {
      providers: PROVIDERS,
      policyModes: ["suggested", "custom", "skip"],
      policyPresets: policies.listPresets(),
      exampleBody: {
        provider: "nvidia-prod",
        model: "nvidia/nemotron-3-super-120b-a12b",
        sandboxName: DEFAULT_SANDBOX,
        recreateSandbox: false,
        policyMode: "suggested",
        policyPresets: ["telegram"],
        chatUiUrl: `http://${HOST}:${PORT}/chat?sandbox=${DEFAULT_SANDBOX}`,
      },
    });
  }
  if (req.method === "POST" && pathname === "/api/onboard") {
    const body = await readBody(req);
    const env = buildOnboardEnv(body);
    const result = runNemoclaw(["onboard", "--non-interactive"], { env });
    return sendJson(res, result.ok ? 200 : 500, { request: maskSecrets(body), env: maskSecrets(env), ...wrapCommand("nemoclaw onboard --non-interactive", result) });
  }
  if (req.method === "POST" && pathname === "/api/setup") {
    const result = runNemoclaw(["setup"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand("nemoclaw setup", result));
  }
  if (req.method === "POST" && pathname === "/api/setup-spark") {
    const result = runNemoclaw(["setup-spark"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand("nemoclaw setup-spark", result));
  }
  if (req.method === "GET" && pathname === "/api/gateway/status") {
    return sendJson(res, 200, getGatewayStatus());
  }
  if (req.method === "GET" && pathname === "/api/openshell/diagnostics") {
    return sendJson(res, 200, getOpenshellDiagnostics());
  }
  if (req.method === "GET" && pathname === "/api/environment/summary") {
    return sendJson(res, 200, getEnvironmentSummary(url.searchParams));
  }
  if (req.method === "GET" && pathname === "/api/preflight/port") {
    const payload = await getPortPreflight(url.searchParams.get("port"));
    return sendJson(res, payload.ok ? 200 : 409, payload);
  }
  if (req.method === "GET" && pathname === "/api/preflight/ports") {
    const payload = await getBatchPortPreflight(url.searchParams.get("ports"));
    return sendJson(res, payload.ok ? 200 : 409, payload);
  }
  if (req.method === "POST" && pathname === "/api/onboard/preview") {
    const body = await readBody(req);
    return sendJson(res, 200, getOnboardPreview(body));
  }

  if (req.method === "GET" && pathname === "/api/inference") {
    return sendJson(res, 200, getInferenceInfo());
  }
  if (req.method === "GET" && pathname === "/api/inference/providers") {
    return sendJson(res, 200, {
      providers: PROVIDERS,
      localBaseUrls: {
        "ollama-local": localInference.getLocalProviderBaseUrl("ollama-local"),
        "vllm-local": localInference.getLocalProviderBaseUrl("vllm-local"),
      },
      defaults: {
        ollama: localInference.DEFAULT_OLLAMA_MODEL,
      },
      nimModels: nim.listModels(),
    });
  }
  if (req.method === "GET" && pathname === "/api/inference/models/nvidia") {
    const apiKey = getRemoteApiKey({}, "NVIDIA_API_KEY");
    const result = await fetchNvidiaModels(apiKey);
    return sendJson(res, result.ok ? 200 : (result.status || 502), {
      provider: "nvidia-prod",
      providerLabel: "NVIDIA Endpoints",
      endpointUrl: NVIDIA_BUILD_ENDPOINT_URL,
      credentialKey: "NVIDIA_API_KEY",
      ok: result.ok,
      count: result.ids.length,
      ids: result.ids,
      message: result.message,
    });
  }
  if (req.method === "POST" && pathname === "/api/inference/models/openai-compatible") {
    const body = await readBody(req);
    const provider = String(body.provider || "compatible-endpoint").trim();
    const config = getRemoteProviderConfig(provider, body.endpointUrl);
    if (!config || config.type !== "openai") {
      return sendJson(res, 400, { error: "provider must be one of openai-api, gemini-api, compatible-endpoint", provider });
    }
    const result = await fetchOpenAiCompatibleModels(config.endpointUrl, getRemoteApiKey(body, config.credentialEnv));
    return sendJson(res, result.ok ? 200 : (result.status || 502), {
      provider,
      providerLabel: config.label,
      endpointUrl: config.endpointUrl,
      credentialKey: config.credentialEnv,
      ok: result.ok,
      count: result.ids.length,
      ids: result.ids,
      message: result.message,
      request: maskSecrets(body),
    });
  }
  if (req.method === "POST" && pathname === "/api/inference/models/anthropic-compatible") {
    const body = await readBody(req);
    const provider = String(body.provider || "compatible-anthropic-endpoint").trim();
    const config = getRemoteProviderConfig(provider, body.endpointUrl);
    if (!config || config.type !== "anthropic") {
      return sendJson(res, 400, { error: "provider must be one of anthropic-prod, compatible-anthropic-endpoint", provider });
    }
    const result = await fetchAnthropicCompatibleModels(config.endpointUrl, getRemoteApiKey(body, config.credentialEnv));
    return sendJson(res, result.ok ? 200 : (result.status || 502), {
      provider,
      providerLabel: config.label,
      endpointUrl: config.endpointUrl,
      credentialKey: config.credentialEnv,
      ok: result.ok,
      count: result.ids.length,
      ids: result.ids,
      message: result.message,
      request: maskSecrets(body),
    });
  }
  if (req.method === "POST" && pathname === "/api/inference/remote/validate") {
    const body = await readBody(req);
    const result = await validateRemoteProviderModel(body);
    return sendJson(res, result.statusCode, result.payload);
  }
  if (req.method === "GET" && pathname === "/api/inference/local/providers") {
    return sendJson(res, 200, getLocalInferenceProviders());
  }
  match = pathname.match(/^\/api\/inference\/local\/providers\/([^/]+)\/diagnostics$/);
  if (req.method === "GET" && match) {
    const provider = decodeURIComponent(match[1]);
    const result = getLocalProviderDiagnostics(provider, String(url.searchParams.get("model") || ""));
    return sendJson(res, result.statusCode, result.payload);
  }
  if (req.method === "GET" && pathname === "/api/inference/local/ollama/models") {
    const models = localInference.getOllamaModelOptions((command, options = {}) => runCommand("bash", ["-lc", command], options).stdout);
    return sendJson(res, 200, { models });
  }
  if (req.method === "GET" && pathname === "/api/inference/local/default-model") {
    return sendJson(res, 200, getDefaultLocalModel());
  }
  if (req.method === "GET" && pathname === "/api/inference/local/bootstrap-options") {
    return sendJson(res, 200, {
      gpu: nim.detectGpu(),
      models: localInference.getBootstrapOllamaModelOptions(nim.detectGpu()),
    });
  }
  if (req.method === "POST" && pathname === "/api/inference/local/validate") {
    const body = await readBody(req);
    const provider = String(body.provider || "").trim();
    const model = String(body.model || "").trim();
    const runner = (command, options = {}) => {
      const result = runCommand("bash", ["-lc", command], options);
      return `${result.stdout}${result.stderr}`.trim();
    };
    const providerCheck = provider ? localInference.validateLocalProvider(provider, runner) : { ok: true };
    const modelCheck = model ? localInference.validateOllamaModel(model, runner) : { ok: true };
    return sendJson(res, providerCheck.ok && modelCheck.ok ? 200 : 500, { provider, model, providerCheck, modelCheck });
  }
  if (req.method === "GET" && pathname === "/api/credentials") {
    return sendJson(res, 200, getCredentialSummary());
  }
  match = pathname.match(/^\/api\/credentials\/([^/]+)$/);
  if (req.method === "PUT" && match) {
    const key = decodeURIComponent(match[1]);
    if (!CREDENTIAL_KEYS.includes(key)) {
      return sendJson(res, 400, { error: "Unsupported credential key", allowedKeys: CREDENTIAL_KEYS });
    }
    const body = await readBody(req);
    if (!body.value) return sendJson(res, 400, { error: "value is required" });
    credentials.saveCredential(key, String(body.value));
    return sendJson(res, 200, { success: true, key, summary: getCredentialSummary() });
  }
  if (req.method === "GET" && pathname === "/api/sandboxes") return sendJson(res, 200, registry.listSandboxes());
  if (req.method === "GET" && pathname === "/api/sandboxes/default") {
    return sendJson(res, 200, { defaultSandbox: registry.getDefault() });
  }
  if (req.method === "PUT" && pathname === "/api/sandboxes/default") {
    const body = await readBody(req);
    const name = normalizeSandboxName(body.name);
    const success = registry.setDefault(name);
    return sendJson(res, success ? 200 : 404, { success, defaultSandbox: registry.getDefault(), name });
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const details = getSandboxDetails(sandboxName);
    if (!details) return sendJson(res, 404, { error: `Sandbox '${sandboxName}' not found in registry` });
    return sendJson(res, 200, details);
  }
  if (req.method === "DELETE" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const args = [sandboxName, "destroy", "--yes"];
    const result = runNemoclaw(args);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand(`nemoclaw ${sandboxName} destroy --yes`, result));
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/status$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const result = runNemoclaw([sandboxName, "status"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand(`nemoclaw ${sandboxName} status`, result));
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/status\/structured$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getStructuredSandboxStatus(sandboxName));
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/gateway-state$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getSandboxGatewayState(sandboxName));
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/readiness$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getSandboxReadiness(sandboxName));
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/nim$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getSandboxNimInfo(sandboxName));
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/connect$/);
  if (req.method === "POST" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const body = await readBody(req);
    const port = getForwardPort(body.port);
    const result = runOpenshell(["forward", "start", "--background", String(port), sandboxName]);
    let links;
    try { links = getUiLinks(sandboxName, port); } catch (error) { links = { error: error.message, port }; }
    return sendJson(res, result.ok ? 200 : 500, { ...wrapCommand(`openshell forward start --background 18789 ${sandboxName}`, result), next: { chat: `/chat?sandbox=${encodeURIComponent(sandboxName)}`, terminal: `/terminal?sandbox=${encodeURIComponent(sandboxName)}` }, links });
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/logs$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const follow = parseBool(url.searchParams.get("follow"));
    if (!follow) {
      const result = runNemoclaw([sandboxName, "logs"]);
      return sendJson(res, result.ok ? 200 : 500, wrapCommand(`nemoclaw ${sandboxName} logs`, result));
    }
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const child = spawn(process.execPath, [CLI_PATH, sandboxName, "logs", "--follow"], { cwd: ROOT, env: withHome(), stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk) => res.write(chunk));
    child.stderr.on("data", (chunk) => res.write(chunk));
    child.on("close", (code) => res.end(`\n[stream closed: ${code}]\n`));
    req.on("close", () => child.kill());
    return;
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/policies$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getPresetDetails(sandboxName));
  }
  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/policy\/raw$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getPolicyRaw(sandboxName));
  }
  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/policy\/endpoints$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    return sendJson(res, 200, getPolicyEndpoints(sandboxName));
  }
  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/policy\/preview-merge$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const presetName = String(url.searchParams.get("preset") || "").trim();
    if (!presetName) return sendJson(res, 400, { error: "preset query parameter is required", sandboxName });
    const preview = getPolicyPreviewMerge(sandboxName, presetName);
    if (!preview) return sendJson(res, 404, { error: `Preset '${presetName}' not found`, sandboxName, presetName });
    return sendJson(res, 200, preview);
  }
  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/policies$/);
  if (req.method === "POST" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const body = await readBody(req);
    const presetName = String(body.presetName || "").trim();
    if (!presetName) return sendJson(res, 400, { error: "presetName is required" });
    try {
      const applied = policies.applyPreset(sandboxName, presetName);
      return sendJson(res, applied ? 200 : 500, { success: Boolean(applied), sandboxName, presetName, presets: getPresetDetails(sandboxName) });
    } catch (error) {
      return sendJson(res, 500, { error: error.message, sandboxName, presetName });
    }
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/policy-add$/);
  if (req.method === "POST" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    const body = await readBody(req);
    const presetName = String(body.presetName || "").trim();
    if (!presetName) return sendJson(res, 400, { error: "presetName is required" });
    let applied = false;
    try {
      policies.applyPreset(sandboxName, presetName);
      applied = true;
    } catch {}
    return sendJson(res, applied ? 200 : 500, {
      sandboxName,
      presetName,
      applied,
      note: "CLI policy-add is interactive; wrapper applies the preset directly for API usage.",
      commandPreview: {
        label: `nemoclaw ${sandboxName} policy-add`,
        success: true,
        exitCode: 0,
        stdout: "Interactive CLI command mapped to direct preset application in standalone API.",
        stderr: "",
      },
      presets: getPresetDetails(sandboxName),
    });
  }

  match = pathname.match(/^\/api\/sandboxes\/([^/]+)\/ui$/);
  if (req.method === "GET" && match) {
    const sandboxName = normalizeSandboxName(decodeURIComponent(match[1]));
    try { return sendJson(res, 200, getUiLinks(sandboxName, url.searchParams.get("port"))); } catch (error) { return sendJson(res, 500, { error: error.message, sandboxName }); }
  }

  if (req.method === "GET" && pathname === "/api/services/status") {
    const sandboxName = String(url.searchParams.get("sandboxName") || "").trim();
    const args = [path.join(ROOT, "scripts", "start-services.sh")];
    if (sandboxName) args.push("--sandbox", sandboxName);
    args.push("--status");
    const result = runCommand("bash", args);
    return sendJson(res, result.ok ? 200 : 500, { sandboxName: sandboxName || "default", ...wrapCommand("start-services --status", result) });
  }
  if (req.method === "GET" && pathname === "/api/services/structured-status") {
    const sandboxName = String(url.searchParams.get("sandboxName") || "default").trim() || "default";
    return sendJson(res, 200, getStructuredServicesStatus(sandboxName));
  }
  match = pathname.match(/^\/api\/services\/logs\/([^/]+)$/);
  if (req.method === "GET" && match) {
    const serviceName = decodeURIComponent(match[1]);
    const sandboxName = String(url.searchParams.get("sandboxName") || "default").trim() || "default";
    if (!["telegram-bridge", "cloudflared"].includes(serviceName)) {
      return sendJson(res, 400, { error: "Unsupported service", allowedServices: ["telegram-bridge", "cloudflared"] });
    }
    const logPath = getServiceLogPath(serviceName, sandboxName);
    if (!fs.existsSync(logPath)) {
      return sendJson(res, 404, { error: "Log file not found", serviceName, sandboxName, logPath });
    }
    const content = fs.readFileSync(logPath, "utf-8");
    return sendJson(res, 200, { serviceName, sandboxName, logPath, content });
  }
  if (req.method === "POST" && pathname === "/api/start") {
    const result = runNemoclaw(["start"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand("nemoclaw start", result));
  }
  if (req.method === "POST" && pathname === "/api/stop") {
    const result = runNemoclaw(["stop"]);
    return sendJson(res, result.ok ? 200 : 500, wrapCommand("nemoclaw stop", result));
  }
  if (req.method === "POST" && pathname === "/api/services/start") {
    const body = await readBody(req);
    const env = {};
    if (body.sandboxName) env.SANDBOX_NAME = String(body.sandboxName);
    if (body.NVIDIA_API_KEY) env.NVIDIA_API_KEY = String(body.NVIDIA_API_KEY);
    if (body.TELEGRAM_BOT_TOKEN) env.TELEGRAM_BOT_TOKEN = String(body.TELEGRAM_BOT_TOKEN);
    if (body.dashboardPort) env.DASHBOARD_PORT = String(getForwardPort(body.dashboardPort));
    const result = runCommand("bash", [path.join(ROOT, "scripts", "start-services.sh")], { env });
    return sendJson(res, result.ok ? 200 : 500, { request: maskSecrets(body), ...wrapCommand("start-services", result) });
  }
  if (req.method === "POST" && pathname === "/api/services/stop") {
    const body = await readBody(req);
    const args = [path.join(ROOT, "scripts", "start-services.sh")];
    if (body.sandboxName) args.push("--sandbox", String(body.sandboxName));
    args.push("--stop");
    const result = runCommand("bash", args);
    return sendJson(res, result.ok ? 200 : 500, { request: body, ...wrapCommand("start-services --stop", result) });
  }

  if (req.method === "GET" && pathname === "/api/nim/gpu") {
    return sendJson(res, 200, getNimGpuInfo());
  }
  if (req.method === "GET" && pathname === "/api/nim/models/compatible") {
    return sendJson(res, 200, getNimCompatibility());
  }

  if (req.method === "POST" && pathname === "/api/deployments") {
    const body = await readBody(req);
    if (!body.instanceName) return sendJson(res, 400, { error: "instanceName is required" });
    const result = runNemoclaw(["deploy", String(body.instanceName)], { env: buildDeployEnv(body) });
    return sendJson(res, result.ok ? 200 : 500, { request: maskSecrets(body), ...wrapCommand(`nemoclaw deploy ${body.instanceName}`, result) });
  }
  if (req.method === "POST" && pathname === "/api/debug") {
    const body = await readBody(req);
    const args = ["debug"];
    if (body.sandboxName) args.push("--sandbox", String(body.sandboxName));
    if (parseBool(body.quick)) args.push("--quick");
    if (body.outputPath) args.push("--output", String(body.outputPath));
    const result = runNemoclaw(args);
    return sendJson(res, result.ok ? 200 : 500, { request: body, ...wrapCommand(`nemoclaw ${args.join(" ")}`, result) });
  }
  if (req.method === "POST" && pathname === "/api/uninstall") {
    const body = await readBody(req);
    const args = ["uninstall"];
    if (parseBool(body.yes, true)) args.push("--yes");
    if (parseBool(body.keepOpenshell)) args.push("--keep-openshell");
    if (parseBool(body.deleteModels)) args.push("--delete-models");
    const result = runNemoclaw(args);
    return sendJson(res, result.ok ? 200 : 500, { request: body, ...wrapCommand(`nemoclaw ${args.join(" ")}`, result) });
  }

  if (req.method === "POST" && pathname === "/api/chat") {
    const body = await readBody(req);
    const sandboxName = normalizeSandboxName(body.sandboxName || DEFAULT_SANDBOX);
    if (!body.message) return sendJson(res, 400, { error: "message is required", sandboxName });
    try {
      const result = runChat(sandboxName, String(body.message), safeSessionId(body.sessionId));
      return sendJson(res, result.ok ? 200 : 500, result);
    } catch (error) {
      return sendJson(res, 500, { error: error.message, sandboxName });
    }
  }

  if (req.method === "POST" && pathname === "/api/terminal/exec") {
    const body = await readBody(req);
    const action = String(body.action || "status");
    try {
      const { label, result } = terminalAction(action, body);
      let payload = wrapCommand(label, result);
      if (action === "ui") {
        try { payload.links = JSON.parse(result.stdout); } catch {}
      }
      return sendJson(res, result.ok ? 200 : 500, payload);
    } catch (error) {
      return sendJson(res, 400, { error: error.message, allowedActions: ["list", "status", "sandbox-status", "logs", "policy-list", "connect", "ui"] });
    }
  }

  return sendJson(res, 404, { error: "Not found", method: req.method, path: pathname });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") return send(res, 204, "");
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    await handle(req, res, url);
  } catch (error) {
    sendJson(res, 500, { error: error.message, stack: process.env.NODE_ENV === "development" ? error.stack : undefined });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`NemoClaw standalone API listening on http://${HOST}:${PORT}`);
  console.log(`Home: http://${HOST}:${PORT}/`);
  console.log(`Chat: http://${HOST}:${PORT}/chat?sandbox=${encodeURIComponent(DEFAULT_SANDBOX)}`);
  console.log(`Terminal: http://${HOST}:${PORT}/terminal?sandbox=${encodeURIComponent(DEFAULT_SANDBOX)}`);
});

server.on("clientError", (_error, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

process.on("SIGINT", () => server.close(() => process.exit(0)));
process.on("SIGTERM", () => server.close(() => process.exit(0)));

module.exports = { server };
