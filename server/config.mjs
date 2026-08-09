import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(ROOT, ".env") });
dotenv.config({ path: path.join(ROOT, ".env.local"), override: true });

export const SILVERSCRIPT_COMMIT = "cb34aa5e6a598f9e461c4ad7014279ba89251d8d";
export const SILVERSCRIPT_LEGACY_COMMIT = "2a3961cadc76bb16a425042172ffe32481da89b5";

export const NETWORKS = Object.freeze({
  tn10: Object.freeze({
    id: "tn10",
    kaspaNetworkId: "testnet-10",
    kascovNetworkId: "testnet-10",
    prefix: "kaspatest",
    symbol: "TKAS",
    daaPerSecond: 10,
    labelZh: "Kaspa 测试网 TN10",
    labelEn: "Kaspa Testnet 10"
  }),
  mainnet: Object.freeze({
    id: "mainnet",
    kaspaNetworkId: "mainnet",
    kascovNetworkId: "mainnet",
    prefix: "kaspa",
    symbol: "KAS",
    daaPerSecond: 10,
    labelZh: "Kaspa 主网",
    labelEn: "Kaspa Mainnet"
  })
});

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).trim().toLowerCase());
}

function loadCompilerConfig() {
  const file = path.join(ROOT, "config", "compiler.json");
  const profilesFile = path.join(ROOT, "config", "compiler-profiles.json");
  let stored = {};
  let compatibility = {};
  try { stored = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  try { compatibility = JSON.parse(fs.readFileSync(profilesFile, "utf8")); } catch {}
  const localProfiles = stored.profiles && typeof stored.profiles === "object" ? stored.profiles : {};
  const definitions = Array.isArray(compatibility.profiles) ? compatibility.profiles : [];
  const profiles = Object.fromEntries(definitions.map((definition) => {
    const local = localProfiles[definition.id] || {};
    const isLatest = definition.upstreamCommit === SILVERSCRIPT_COMMIT;
    const legacyStored = !stored.profiles && definition.upstreamCommit === (stored.upstreamCommit || SILVERSCRIPT_LEGACY_COMMIT)
      ? stored
      : {};
    const environmentBin = isLatest ? process.env.SILVERC_LATEST_BIN || process.env.SILVERC_BIN : process.env.SILVERC_LEGACY_BIN;
    const environmentSha = isLatest ? process.env.SILVERC_LATEST_SHA256 || process.env.SILVERC_SHA256 : process.env.SILVERC_LEGACY_SHA256;
    return [definition.id, Object.freeze({
      ...definition,
      bin: path.resolve(environmentBin || local.bin || legacyStored.bin || path.join(ROOT, definition.binary)),
      sha256: String(environmentSha || local.sha256 || legacyStored.sha256 || "").toLowerCase(),
      builtAt: local.builtAt || legacyStored.builtAt || ""
    })];
  }));
  const defaultProfileId = profiles[stored.defaultProfileId]
    ? stored.defaultProfileId
    : compatibility.defaultProfileId || "latest-cb34aa5";
  return Object.freeze({
    defaultProfileId,
    profiles: Object.freeze(profiles),
    breakingChanges: Object.freeze(Array.isArray(compatibility.breakingChanges) ? compatibility.breakingChanges : []),
    manifestFile: file,
    profilesFile
  });
}

function loadPreflightConfig() {
  const file = path.join(ROOT, "config", "kascov-preflight.json");
  const localFile = path.join(ROOT, "config", "kascov-preflight.local.json");
  let stored = {};
  let local = {};
  try { stored = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
  try { local = JSON.parse(fs.readFileSync(localFile, "utf8")); } catch {}
  return {
    bin: path.resolve(process.env.KASCOV_PREFLIGHT_BIN || path.join(ROOT, local.binary || stored.binary || "bin/kascov-preflight")),
    sha256: String(process.env.KASCOV_PREFLIGHT_SHA256 || local.sha256 || "").toLowerCase(),
    upstreamCommit: stored.upstreamCommit || "",
    rustyKaspaCommit: stored.rustyKaspaCommit || "",
    manifestFile: file,
    localManifestFile: localFile
  };
}

function binaryMatches(file, expectedSha256) {
  if (!fs.existsSync(file) || !/^[0-9a-f]{64}$/.test(expectedSha256)) return false;
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") === expectedSha256;
  } catch {
    return false;
  }
}

export const config = Object.freeze({
  root: ROOT,
  host: process.env.HOST || "127.0.0.1",
  port: Number(process.env.PORT || 4310),
  dataDir: path.resolve(process.env.STUDIO_DATA_DIR || path.join(ROOT, "data")),
  kascovBaseUrl: String(process.env.KASCOV_BASE_URL || "https://kascov.io").replace(/\/$/, ""),
  preflightEngine: Object.freeze(loadPreflightConfig()),
  rpcUrls: Object.freeze({
    tn10: String(process.env.KASPA_TN10_RPC_URL || "").trim(),
    mainnet: String(process.env.KASPA_MAINNET_RPC_URL || "").trim()
  }),
  allowMainnet: bool(process.env.ALLOW_MAINNET),
  mainnetMaxDeployKas: String(process.env.MAINNET_MAX_DEPLOY_KAS || "1"),
  compiler: loadCompilerConfig(),
  providers: Object.freeze({
    openai: { model: process.env.OPENAI_MODEL || "gpt-5.6-sol", apiKey: process.env.OPENAI_API_KEY || "" },
    anthropic: { model: process.env.ANTHROPIC_MODEL || "", apiKey: process.env.ANTHROPIC_API_KEY || "" },
    gemini: { model: process.env.GEMINI_MODEL || "gemini-3.5-flash", apiKey: process.env.GEMINI_API_KEY || "" },
    openrouter: { model: process.env.OPENROUTER_MODEL || "~openai/gpt-latest", apiKey: process.env.OPENROUTER_API_KEY || "" },
    ollama: { model: process.env.OLLAMA_MODEL || "qwen3-coder", baseUrl: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434" },
    compatible: {
      model: process.env.COMPATIBLE_MODEL || "",
      apiKey: process.env.COMPATIBLE_API_KEY || "",
      baseUrl: process.env.COMPATIBLE_BASE_URL || ""
    }
  })
});

export function publicConfig() {
  const localPreflightReady = binaryMatches(config.preflightEngine.bin, config.preflightEngine.sha256);
  const providers = Object.fromEntries(Object.entries(config.providers).map(([id, provider]) => [id, {
    id,
    configured: id === "ollama" || Boolean(
      provider.apiKey
      && provider.model
      && (id !== "compatible" || provider.baseUrl)
    ),
    defaultModel: provider.model,
    local: id === "ollama"
  }]));
  return {
    networks: NETWORKS,
    defaultNetwork: "tn10",
    allowMainnet: config.allowMainnet,
    mainnetMaxDeployKas: config.mainnetMaxDeployKas,
    nodeAccess: {
      customTn10Configured: Boolean(config.rpcUrls.tn10),
      customMainnetConfigured: Boolean(config.rpcUrls.mainnet),
      resolverFallback: true
    },
    preflight: {
      localEngineConfigured: localPreflightReady,
      kascovPreferred: true,
      offlineCapable: localPreflightReady,
      upstreamCommit: config.preflightEngine.upstreamCommit,
      rustyKaspaCommit: config.preflightEngine.rustyKaspaCommit
    },
    providers,
    compiler: {
      configured: Boolean(config.compiler.profiles[config.compiler.defaultProfileId]
        && fs.existsSync(config.compiler.profiles[config.compiler.defaultProfileId].bin)
        && /^[0-9a-f]{64}$/.test(config.compiler.profiles[config.compiler.defaultProfileId].sha256)),
      defaultProfileId: config.compiler.defaultProfileId,
      upstreamCommit: config.compiler.profiles[config.compiler.defaultProfileId]?.upstreamCommit || "",
      expectedCommit: SILVERSCRIPT_COMMIT,
      profiles: Object.values(config.compiler.profiles).map(({ bin: _bin, ...profile }) => ({
        ...profile,
        configured: fs.existsSync(config.compiler.profiles[profile.id].bin) && /^[0-9a-f]{64}$/.test(profile.sha256)
      }))
    },
    silverscriptStatus: "experimental",
    recommendedNetwork: "testnet-10"
  };
}
