import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { config, NETWORKS } from "./config.mjs";
import { safeId, sha256 } from "./security.mjs";
import { canonicalKcc721Metadata } from "../src/kcc721-metadata.js";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const SOMPI = 100_000_000n;

function parameterError(message) {
  return Object.assign(new Error(message), { status: 400, code: "INVALID_TEMPLATE_PARAMETERS" });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function compilerExpression(value) {
  if (["pubkey", "bytes32"].includes(value?.kind) && /^[0-9a-f]{64}$/i.test(value.hex || "")) {
    return { kind: "array", data: Array.from(Buffer.from(value.hex, "hex"), (data) => ({ kind: "byte", data })) };
  }
  if (value?.kind === "byte[]" && Array.isArray(value.data)) {
    return { kind: "array", data: value.data.map((data) => ({ kind: "byte", data })) };
  }
  if (value?.kind === "pubkey[]" && Array.isArray(value.hex)) {
    return { kind: "array", data: value.hex.map((hex) => publicKeyExpression(hex)) };
  }
  if (value?.kind === "int[]" && Array.isArray(value.data)) {
    return { kind: "array", data: value.data.map((data) => ({ kind: "int", data })) };
  }
  return value;
}

function publicKeyExpression(hex) {
  return compilerExpression({ kind: "pubkey", hex });
}

function parseAmount(value, minimum = "0.5") {
  const text = String(value ?? "").trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(text)) throw parameterError("Template amount must be a positive KAS decimal with at most 8 places");
  const [whole, fraction = ""] = text.split(".");
  const sompi = BigInt(whole) * SOMPI + BigInt(fraction.padEnd(8, "0"));
  const [minWhole, minFraction = ""] = String(minimum).split(".");
  const minimumSompi = BigInt(minWhole) * SOMPI + BigInt(minFraction.padEnd(8, "0"));
  if (sompi < minimumSompi) throw parameterError(`Template amount must be at least ${minimum} KAS`);
  return text;
}

function addressPublicKey(value, network) {
  const text = String(value || "").trim().toLowerCase();
  if (!text.startsWith(`${network.prefix}:`)) throw parameterError(`Template wallet address is not on ${network.labelEn}`);
  let address;
  let key;
  try {
    address = new kaspa.Address(text);
    key = kaspa.XOnlyPublicKey.fromAddress(address);
    const hex = key.toString().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("invalid x-only key");
    if (key.toAddress(network.kaspaNetworkId).toString() !== text) throw new Error("address/key mismatch");
    return { address: text, publicKey: hex };
  } catch {
    throw parameterError("Template wallet must be a valid P2PK address on the selected network");
  } finally {
    try { key?.free?.(); } catch {}
    try { address?.free?.(); } catch {}
  }
}

function unixTimestamp(value, minimumFutureSeconds = 30) {
  const timestamp = Math.floor(Date.parse(String(value || "")) / 1000);
  if (!Number.isSafeInteger(timestamp)) throw parameterError("Template unlock time is invalid");
  if (timestamp < Math.floor(Date.now() / 1000) + minimumFutureSeconds) {
    throw parameterError(`Template unlock time must be at least ${minimumFutureSeconds} seconds in the future`);
  }
  return timestamp;
}

function hex32(value) {
  const text = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(text)) throw parameterError("Template SHA-256 digest must contain exactly 64 hexadecimal characters");
  return text;
}

function hexBytes(value, minimumBytes = 1, maximumBytes = 520) {
  const text = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(text) || text.length % 2) throw parameterError("Template byte data must be valid hexadecimal data");
  const length = text.length / 2;
  if (length < minimumBytes || length > maximumBytes) throw parameterError(`Template byte data must contain ${minimumBytes}-${maximumBytes} bytes`);
  return { hex: text, data: Array.from(Buffer.from(text, "hex")) };
}

function durationDays(value, minimum = 1, maximum = 3650) {
  const days = Number(String(value ?? "").trim());
  if (!Number.isSafeInteger(days) || days < minimum || days > maximum) {
    throw parameterError(`Template inactivity period must be an integer from ${minimum} to ${maximum} days`);
  }
  const seconds = days * 86400;
  if (!Number.isSafeInteger(seconds)) throw parameterError("Template inactivity period is too large");
  return { days, seconds };
}

function durationPeriod(value, minimumSeconds = 60, maximumSeconds = 315360000) {
  const legacy = typeof value !== "object" || value === null || Array.isArray(value);
  const amount = Number(String(legacy ? value : value.value ?? "").trim());
  const unit = legacy ? "days" : String(value.unit || "").trim();
  const units = { minutes: 60, hours: 3600, days: 86400, weeks: 604800 };
  if (!Number.isSafeInteger(amount) || amount < 1) throw parameterError("Template duration value must be a positive integer");
  if (!units[unit]) throw parameterError("Template duration unit must be minutes, hours, days, or weeks");
  const seconds = amount * units[unit];
  if (!Number.isSafeInteger(seconds) || seconds < minimumSeconds || seconds > maximumSeconds) {
    throw parameterError(`Template duration must be from ${minimumSeconds} to ${maximumSeconds} seconds`);
  }
  return { value: amount, unit, seconds };
}

function heirs(value, network, minimum = 2, maximum = 5) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) {
    throw parameterError(`Template requires ${minimum}-${maximum} inheritors`);
  }
  const used = new Set();
  let totalShares = 0;
  const normalized = value.map((item, index) => {
    const identity = addressPublicKey(item?.address, network);
    if (used.has(identity.address)) throw parameterError("Inheritor wallet addresses must be different");
    used.add(identity.address);
    const shareBps = Number(item?.shareBps);
    if (!Number.isSafeInteger(shareBps) || shareBps < 1 || shareBps > 9999) {
      throw parameterError(`Inheritor ${index + 1} share must be an integer from 1 to 9999 basis points`);
    }
    totalShares += shareBps;
    return { address: identity.address, publicKey: identity.publicKey, shareBps };
  });
  if (totalShares !== 10000) throw parameterError("Inheritor shares must total exactly 100% (10000 basis points)");
  return normalized;
}

export class TemplateStore {
  constructor(directory = path.join(config.root, "templates")) {
    this.directory = directory;
  }

  list() {
    if (!fs.existsSync(this.directory)) return [];
    return fs.readdirSync(this.directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.get(entry.name))
      .filter(Boolean)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
  }

  get(id) {
    const normalized = safeId(id, "template id");
    const directory = path.join(this.directory, normalized);
    try {
      const manifest = readJson(path.join(directory, "manifest.json"));
      const source = fs.readFileSync(path.join(directory, manifest.sourceFile || "contract.sil"), "utf8");
      const packContracts = Array.isArray(manifest.packContracts) ? manifest.packContracts.map((contract) => ({
        ...contract,
        source: fs.readFileSync(path.join(directory, contract.sourceFile), "utf8"),
        constructorArgs: Array.isArray(contract.constructorArgs) ? contract.constructorArgs.map(compilerExpression) : []
      })) : [];
      return {
        ...manifest,
        id: normalized,
        source,
        packContracts,
        constructorArgs: Array.isArray(manifest.constructorArgs) ? manifest.constructorArgs.map(compilerExpression) : [],
        transactionPlans: Array.isArray(manifest.transactionPlans) ? manifest.transactionPlans : []
      };
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  deploymentBlockedReasons(id, input = {}) {
    const template = this.get(id);
    if (!template) return [];
    if (template.deploymentMode === "pack-only") {
      return [template.deploymentBlockedReason || "This experimental template pack requires its dedicated multi-contract transaction builder"];
    }
    const project = input.project;
    if (project?.review?.configured === true && project.review.templateId === template.id) {
      const expected = this.projectInput(template.id, project.network, project.templateParameters, {
        encodingVersion: Number(project.review.parameterEncodingVersion || 1)
      });
      const sourceMatches = String(input.source || "") === expected.source;
      const argumentsMatch = JSON.stringify(input.constructorArgs || []) === JSON.stringify(expected.constructorArgs);
      if (sourceMatches && argumentsMatch) return [];
      return ["Configured template source or constructor arguments changed; re-apply the template before deployment"];
    }
    return (template.requiredReplacements || []).filter((index) =>
      JSON.stringify(input.constructorArgs?.[index]) === JSON.stringify(template.constructorArgs[index])
    ).map((index) => `Replace template constructor argument ${index} before deployment`);
  }

  projectInput(id, network = "tn10", inputParameters = {}, options = {}) {
    const template = this.get(id);
    if (!template) throw Object.assign(new Error("Template not found"), { status: 404 });
    const selectedNetwork = network === "mainnet" ? "mainnet" : "tn10";
    if (Array.isArray(template.networkAllowlist) && !template.networkAllowlist.includes(selectedNetwork)) {
      throw parameterError(`Template ${template.id} is restricted to ${template.networkAllowlist.join(", ")}`);
    }
    const networkConfig = NETWORKS[selectedNetwork];
    const definitions = Array.isArray(template.parameters) ? template.parameters : [];
    const acceptedIds = new Set(definitions.map((field) => field.id));
    for (const key of Object.keys(inputParameters || {})) if (!acceptedIds.has(key)) throw parameterError(`Unknown template parameter: ${key}`);
    const parameters = {};
    const constructorArgs = template.constructorArgs.map((value) => structuredClone(value));
    const parameterEncodingVersion = Number(options.encodingVersion || template.parameterEncodingVersion || 1);
    const uniqueGroups = new Map();
    let deployAmount = "0.5";
    for (const field of definitions) {
      const raw = inputParameters?.[field.id];
      if ((raw === undefined || raw === null || String(raw).trim() === "") && field.required !== false) throw parameterError(`Template parameter is required: ${field.id}`);
      if (field.type === "amount") {
        const value = parseAmount(raw, field.minimum || "0.5");
        parameters[field.id] = value;
        if (field.projectField === "deployAmount") deployAmount = value;
        if (Number.isInteger(field.argIndex)) {
          const [whole, fraction = ""] = value.split(".");
          const sompi = BigInt(whole) * SOMPI + BigInt(fraction.padEnd(8, "0"));
          if (sompi > BigInt(Number.MAX_SAFE_INTEGER)) throw parameterError("Template amount exceeds the compiler argument safe integer range");
          constructorArgs[field.argIndex] = { kind: "int", data: Number(sompi) };
        }
      } else if (field.type === "address") {
        const value = addressPublicKey(raw, networkConfig);
        parameters[field.id] = value.address;
        if (field.uniqueGroup) {
          const used = uniqueGroups.get(field.uniqueGroup) || new Set();
          if (used.has(value.address)) throw parameterError(`Template wallet addresses in ${field.uniqueGroup} must be different`);
          used.add(value.address);
          uniqueGroups.set(field.uniqueGroup, used);
        }
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = publicKeyExpression(value.publicKey);
      } else if (field.type === "datetime") {
        const value = unixTimestamp(raw, selectedNetwork === "mainnet" ? 3600 : 30);
        parameters[field.id] = new Date(value * 1000).toISOString();
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = { kind: "int", data: value };
      } else if (field.type === "sha256") {
        const value = hex32(raw);
        parameters[field.id] = value;
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = compilerExpression({ kind: "bytes32", hex: value });
      } else if (field.type === "hexBytes") {
        const value = hexBytes(raw, Number(field.minimumBytes || 1), Number(field.maximumBytes || 520));
        parameters[field.id] = value.hex;
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = compilerExpression({ kind: "byte[]", data: value.data });
      } else if (field.type === "choice") {
        const value = String(raw || "").trim();
        const options = Array.isArray(field.options) ? field.options.map((option) => String(option.value)) : [];
        if (!options.includes(value)) throw parameterError(`Template choice ${field.id} is invalid`);
        parameters[field.id] = value;
      } else if (field.type === "kcc721CollectionId") {
        const mode = String(inputParameters?.collectionMode || "preview");
        if (mode === "preview") {
          const value = "00".repeat(32);
          parameters[field.id] = null;
          if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = compilerExpression({ kind: "bytes32", hex: value });
        } else {
          const value = hex32(raw);
          if (value === "00".repeat(32)) throw parameterError("A verified Collection covenant ID cannot be the all-zero preview sentinel");
          parameters[field.id] = value;
          if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = compilerExpression({ kind: "bytes32", hex: value });
        }
      } else if (field.type === "kcc721Metadata") {
        let canonical;
        try {
          canonical = canonicalKcc721Metadata(raw);
        } catch (error) {
          throw parameterError(error.message);
        }
        const digest = sha256(canonical.canonicalJson);
        parameters[field.id] = { ...canonical.metadata, canonicalJson: canonical.canonicalJson, digest };
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = compilerExpression({ kind: "bytes32", hex: digest });
      } else if (field.type === "integer") {
        const value = Number(String(raw ?? "").trim());
        const minimum = Number(field.minimum ?? 0);
        const maximum = Number(field.maximum ?? Number.MAX_SAFE_INTEGER);
        if (!Number.isSafeInteger(value) || value < minimum || value > maximum) throw parameterError(`Template integer ${field.id} must be from ${minimum} to ${maximum}`);
        parameters[field.id] = value;
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = { kind: "int", data: value };
      } else if (field.type === "durationDays") {
        const value = durationDays(raw, Number(field.minimum || 1), Number(field.maximum || 3650));
        parameters[field.id] = value.days;
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = { kind: "int", data: value.seconds };
      } else if (field.type === "duration") {
        const minimumSeconds = Math.max(Number(field.minimumSeconds || 60), selectedNetwork === "mainnet" ? 86400 : 60);
        const value = durationPeriod(raw, minimumSeconds, Number(field.maximumSeconds || 315360000));
        parameters[field.id] = { value: value.value, unit: value.unit };
        const encoded = parameterEncodingVersion >= 2 ? value.seconds * Number(networkConfig.daaPerSecond || 1) : value.seconds;
        if (!Number.isSafeInteger(encoded)) throw parameterError("Template duration encoding exceeds the safe integer range");
        if (Number.isInteger(field.argIndex)) constructorArgs[field.argIndex] = { kind: "int", data: encoded };
      } else if (field.type === "heirs") {
        const value = heirs(raw, networkConfig, Number(field.minimum || 2), Number(field.maximum || 5));
        if (field.disallowParameter && parameters[field.disallowParameter] && value.some((item) => item.address === parameters[field.disallowParameter])) {
          throw parameterError("Inheritor wallets must be different from the owner wallet");
        }
        parameters[field.id] = value.map(({ address, shareBps }) => ({ address, shareBps }));
        if (Number.isInteger(field.keyArgIndex)) {
          constructorArgs[field.keyArgIndex] = compilerExpression({ kind: "pubkey[]", hex: value.map((item) => item.publicKey) });
        }
        if (Number.isInteger(field.shareArgIndex)) {
          constructorArgs[field.shareArgIndex] = compilerExpression({ kind: "int[]", data: value.map((item) => item.shareBps) });
        }
      } else {
        throw parameterError(`Unsupported template parameter type: ${field.type}`);
      }
    }
    return {
      name: options.language === "zh" ? template.titleZh : template.titleEn,
      network: selectedNetwork,
      requirements: template.requirementsEn,
      source: template.source,
      constructorArgs,
      compilerProfileId: template.compilerProfileId || config.compiler.defaultProfileId,
      templateParameters: parameters,
      deployAmount,
      specification: {
        title: options.language === "zh" ? template.titleZh : template.titleEn,
        summaryZh: template.descriptionZh,
        summaryEn: template.descriptionEn,
        network: selectedNetwork === "mainnet" ? "mainnet" : "testnet-10",
        invariants: template.invariants || []
      },
      transactionPlans: template.transactionPlans,
      review: {
        riskLevel: "experimental",
        templateId: template.id,
        compilerProfileId: template.compilerProfileId || config.compiler.defaultProfileId,
        configured: true,
        parameterEncodingVersion,
        daaPerSecond: Number(networkConfig.daaPerSecond || 1),
        note: "Compile-verified starter template; transaction construction and adversarial testing remain application-specific."
      }
    };
  }
}
