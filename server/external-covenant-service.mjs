import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config, NETWORKS } from "./config.mjs";
import { sha256, transactionCommitment } from "./security.mjs";
import { kascovPreflight, sompiToKas } from "./kaspa-service.mjs";
import { operationPresentation } from "./operation-metadata.mjs";
import { caip2Network, normalizePackageNetwork, verifyCovenantDescriptor } from "./covenant-descriptor.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const COVENANT_SCRIPT_OPTIONS = { flags: { covenantsEnabled: true } };
const MAX_PACKAGE_BYTES = 1_000_000;
const MAX_EXTERNAL_FEE = 10_000_000n;

function packageError(message, code = "INVALID_COVENANT_PACKAGE") {
  return Object.assign(new Error(message), { status: 400, code });
}

function parsePackage(input) {
  const value = typeof input === "string" ? input : JSON.stringify(input || {});
  if (Buffer.byteLength(value, "utf8") > MAX_PACKAGE_BYTES) throw packageError("External covenant package exceeds 1MB");
  let parsed;
  try { parsed = typeof input === "string" ? JSON.parse(input) : structuredClone(input || {}); } catch { throw packageError("External covenant package is not valid JSON"); }
  if (parsed.version !== 1) throw packageError("External covenant package version must be 1");
  const originalNetwork = parsed.network;
  parsed.network = normalizePackageNetwork(parsed.network);
  if (!NETWORKS[parsed.network]) throw packageError("External covenant package network is unsupported");
  const expectedCaip2 = caip2Network(parsed.network);
  if (parsed.networkCaip2 && parsed.networkCaip2 !== expectedCaip2) throw packageError("External covenant package CAIP-2 network does not match its network");
  parsed.networkCaip2 = expectedCaip2;
  if (originalNetwork !== parsed.network) parsed.networkAlias = String(originalNetwork);
  if (typeof parsed.transactionSafeJson !== "string") parsed.transactionSafeJson = JSON.stringify(parsed.transactionSafeJson || {});
  const metadata = Array.isArray(parsed.covenantInputs)
    ? parsed.covenantInputs
    : parsed.covenantInput && typeof parsed.covenantInput === "object" ? [parsed.covenantInput] : [];
  if (!metadata.length || metadata.length > 32 || metadata.some((item) => !item || typeof item !== "object")) {
    throw packageError("External covenant package requires 1-32 covenant input metadata records");
  }
  parsed.covenantInputs = metadata;
  if (metadata.length === 1) parsed.covenantInput = metadata[0];
  return parsed;
}

function cleanProgram(value) {
  const hex = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!hex || hex.length % 2 || hex.length > 20_000 || !/^[0-9a-f]+$/.test(hex)) throw packageError("Covenant redeem program is invalid");
  return hex;
}

function cleanAbi(value) {
  if (!Array.isArray(value) || !value.length || value.length > 32) throw packageError("Covenant ABI must contain 1-32 entrypoints");
  return value.map((entry) => {
    const name = String(entry?.name || "");
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw packageError("Covenant ABI contains an invalid entrypoint name");
    if (!Array.isArray(entry.inputs) || entry.inputs.length > 32) throw packageError(`Covenant ABI entrypoint ${name} has invalid inputs`);
    return { name, inputs: entry.inputs.map((item) => ({ name: String(item?.name || ""), type_name: String(item?.type_name || "") })) };
  });
}

function cleanStateFields(value) {
  if (!Array.isArray(value) || !value.length || value.length > 64) throw packageError("State ABI fields must contain 1-64 records");
  return value.map((field) => {
    const name = String(field?.name || "");
    const type = String(field?.type_name || "");
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(name)) throw packageError("State ABI contains an invalid field name");
    if (!(["int", "bool", "pubkey", "byte[]"].includes(type) || /^byte\[\d+\]$/.test(type))) {
      throw packageError(`State witness encoding does not support field type ${type}`);
    }
    return { name, type_name: type };
  });
}

function transactionFrom(pkg) {
  try { return kaspa.Transaction.deserializeFromSafeJSON(pkg.transactionSafeJson); } catch { throw packageError("Transaction Safe JSON cannot be decoded by Kaspa WASM"); }
}

function inputCovenantId(input) {
  try { return String(input.utxo?.entry?.covenantId || "").toLowerCase(); } catch { return ""; }
}

function outputAddress(output, networkId) {
  try { return kaspa.addressFromScriptPublicKey(output.scriptPublicKey, networkId)?.toString() || ""; } catch { return ""; }
}

function normalizedCovenant(transaction, metadata) {
  const inputIndex = Number(metadata.index);
  if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= transaction.inputs.length) throw packageError("Covenant input index is invalid");
  const input = transaction.inputs[inputIndex];
  if (!input.utxo) throw packageError("Target input must include its complete UTXO entry");
  const programHex = cleanProgram(metadata.programHex);
  const actualProgramSha256 = sha256(Buffer.from(programHex, "hex"));
  if (metadata.programSha256 && String(metadata.programSha256).toLowerCase() !== actualProgramSha256) throw packageError("Declared program SHA-256 does not match programHex");
  const expectedScript = kaspa.payToScriptHashScript(programHex).script;
  if (input.utxo.scriptPublicKey.script !== expectedScript) throw packageError("Redeem program does not match the target input P2SH script");
  const covenantId = inputCovenantId(input);
  if (!/^[0-9a-f]{64}$/.test(covenantId)) throw packageError("Target input has no covenant ID");
  if (metadata.covenantId && String(metadata.covenantId).toLowerCase() !== covenantId) throw packageError("Declared covenant ID does not match the target UTXO");
  const abi = cleanAbi(metadata.abi);
  const entrypoint = String(metadata.entrypoint || "");
  const selected = abi.find((entry) => entry.name === entrypoint);
  if (!selected) throw packageError("Selected entrypoint is not present in the supplied ABI");
  const argumentsList = Array.isArray(metadata.arguments) ? structuredClone(metadata.arguments) : [];
  if (argumentsList.length !== selected.inputs.length) throw packageError(`Entrypoint ${entrypoint} expects ${selected.inputs.length} arguments`);
  for (let index = 0; index < selected.inputs.length; index += 1) {
    const type = selected.inputs[index].type_name;
    if (!["sig", "pubkey", "int", "bool", "byte[]", "State"].includes(type) && !/^byte\[\d+\]$/.test(type)) {
      throw packageError(`External signing does not yet support ABI argument type ${type}`);
    }
    if (type === "sig" && !/^[0-9a-f]{64}$/i.test(argumentsList[index]?.publicKey || "")) {
      throw packageError(`Signature slot ${selected.inputs[index].name || index} requires a 32-byte x-only public key`);
    }
  }
  const stateFields = selected.inputs.some((input) => input.type_name === "State") ? cleanStateFields(metadata.stateFields) : [];
  const programSha256 = sha256(Buffer.from(programHex, "hex"));
  const descriptor = metadata.descriptor
    ? verifyCovenantDescriptor(metadata.descriptor, {
      network: metadata.network || "",
      programSha256,
      covenantId,
      abi,
      stateFields,
      descriptorSha256: metadata.descriptorSha256
    })
    : null;
  return { input, inputIndex, programHex, programSha256, covenantId, abi, selected, argumentsList, stateFields, descriptor };
}

function normalized(pkg) {
  const transaction = transactionFrom(pkg);
  const covenants = pkg.covenantInputs.map((metadata) => normalizedCovenant(transaction, { ...metadata, network: pkg.network }));
  if (new Set(covenants.map((item) => item.inputIndex)).size !== covenants.length) throw packageError("Covenant metadata records must target different transaction inputs");
  let inputTotal = 0n;
  for (const item of transaction.inputs) {
    if (!item.utxo) throw packageError("Every transaction input must include its complete UTXO entry");
    inputTotal += BigInt(item.utxo.amount);
  }
  let outputTotal = 0n;
  for (const output of transaction.outputs) outputTotal += BigInt(output.value);
  const fee = inputTotal - outputTotal;
  if (fee < 0n) throw packageError("Transaction outputs exceed its inputs");
  if (fee > MAX_EXTERNAL_FEE) throw packageError("External transaction fee exceeds the local 0.1 KAS/TKAS safety cap", "EXTERNAL_FEE_CAP");
  return { transaction, covenants, fee, ...covenants[0] };
}

function normalizedP2pkAuthorization(pkg, resolved) {
  if (!pkg.p2pkAuthorization) return null;
  const metadata = pkg.p2pkAuthorization;
  const inputIndex = Number(metadata.inputIndex);
  if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= resolved.transaction.inputs.length) {
    throw packageError("P2PK authorization input index is invalid");
  }
  if (resolved.covenants.some((item) => item.inputIndex === inputIndex)) {
    throw packageError("P2PK authorization cannot point at a covenant input");
  }
  const network = NETWORKS[pkg.network];
  const address = String(metadata.address || "").trim().toLowerCase();
  const publicKey = String(metadata.publicKey || "").trim().toLowerCase();
  if (!address.startsWith(`${network.prefix}:`) || !/^[0-9a-f]{64}$/.test(publicKey)) {
    throw packageError("P2PK authorization wallet metadata is invalid");
  }
  let key;
  try {
    key = new kaspa.XOnlyPublicKey(publicKey);
    if (key.toAddress(network.kaspaNetworkId).toString() !== address) throw packageError("P2PK authorization public key does not match its wallet address");
  } finally { try { key?.free?.(); } catch {} }
  const input = resolved.transaction.inputs[inputIndex];
  if (!input.utxo || input.utxo.scriptPublicKey.script !== kaspa.payToAddressScript(address).script) {
    throw packageError("P2PK authorization wallet does not own the declared transaction input");
  }
  const outpoint = input.previousOutpoint || input.utxo.outpoint || {};
  if (metadata.outpoint && (String(metadata.outpoint.transactionId || "").toLowerCase() !== String(outpoint.transactionId || "").toLowerCase()
    || Number(metadata.outpoint.index) !== Number(outpoint.index))) {
    throw packageError("P2PK authorization outpoint metadata does not match the transaction input");
  }
  if (metadata.amountSompi && BigInt(metadata.amountSompi) !== BigInt(input.utxo.amount)) {
    throw packageError("P2PK authorization amount metadata does not match the transaction input");
  }
  return { ...metadata, inputIndex, address, publicKey, signed: Boolean(input.signatureScript) };
}

function bytes(value, exactLength = null) {
  const hex = String(value || "").toLowerCase().replace(/^0x/, "");
  if (hex.length % 2 || !/^[0-9a-f]*$/.test(hex)) throw packageError("Covenant argument contains invalid hexadecimal data");
  const data = Buffer.from(hex, "hex");
  if (exactLength !== null && data.length !== exactLength) throw packageError(`Covenant argument must contain exactly ${exactLength} bytes`);
  if (data.length > 520) throw packageError("Covenant argument exceeds the 520-byte stack element limit");
  return data;
}

function stateObject(value) {
  const fields = value?.fields || value?.data || value;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw packageError("State argument must contain a field object");
  return fields;
}

function appendArgument(builder, type, value, stateFields = []) {
  if (type === "int") {
    let data;
    try { data = BigInt(value?.data); } catch { throw packageError("Covenant int argument is invalid"); }
    builder.addI64(data);
    return;
  }
  if (type === "bool") {
    builder.addI64(value?.data === true ? 1n : 0n);
    return;
  }
  if (type === "sig") {
    builder.addData(bytes(value?.hex, 65));
    return;
  }
  if (type === "pubkey") {
    builder.addData(bytes(value?.hex, 32));
    return;
  }
  if (type === "State") {
    const fields = stateObject(value);
    const expected = new Set(stateFields.map((field) => field.name));
    for (const key of Object.keys(fields)) if (!expected.has(key)) throw packageError(`State argument contains unknown field ${key}`);
    for (const field of stateFields) {
      if (!(field.name in fields)) throw packageError(`State argument is missing field ${field.name}`);
      appendArgument(builder, field.type_name, fields[field.name], stateFields);
    }
    return;
  }
  const fixed = type.match(/^byte\[(\d+)\]$/);
  if (type === "byte[]" || fixed) {
    builder.addData(bytes(value?.hex, fixed ? Number(fixed[1]) : null));
    return;
  }
  throw packageError(`External signing does not yet support ABI argument type ${type}`);
}

function signatureSlots(selected, values, context = {}) {
  return selected.inputs.map((input, index) => input.type_name === "sig" ? {
    index,
    name: input.name,
    publicKey: String(values[index]?.publicKey || "").toLowerCase(),
    signed: /^[0-9a-f]{130}$/i.test(values[index]?.hex || ""),
    ...context
  } : null).filter(Boolean);
}

export function inspectExternalCovenantPackage(input) {
  const pkg = parsePackage(input);
  const resolved = normalized(pkg);
  const p2pkAuthorization = normalizedP2pkAuthorization(pkg, resolved);
  const network = NETWORKS[pkg.network];
  const outputs = resolved.transaction.outputs.map((output, index) => ({
    index,
    valueSompi: String(output.value),
    valueKas: sompiToKas(output.value),
    address: outputAddress(output, network.kaspaNetworkId),
    covenantId: String(output.covenant?.covenantId || "")
  }));
  const slots = resolved.covenants.flatMap((covenant, covenantInputIndex) => signatureSlots(covenant.selected, covenant.argumentsList, {
    covenantInputIndex,
    transactionInputIndex: covenant.inputIndex,
    covenantId: covenant.covenantId,
    entrypoint: covenant.selected.name
  }));
  const normalizedMetadata = resolved.covenants.map((covenant, index) => ({
    ...pkg.covenantInputs[index],
    programHex: covenant.programHex,
    covenantId: covenant.covenantId,
    abi: covenant.abi,
    arguments: covenant.argumentsList,
    stateFields: covenant.stateFields,
    ...(covenant.descriptor ? {
      descriptor: covenant.descriptor.descriptor,
      descriptorSha256: covenant.descriptor.descriptorSha256
    } : {})
  }));
  const p2pkSigned = !p2pkAuthorization || p2pkAuthorization.signed;
  const operation = operationPresentation({
    templateId: pkg.provenance?.templateId,
    entrypoint: resolved.selected.name,
    signatureSlots: slots,
    outputs,
    covenantId: resolved.covenantId
  });
  const previousOutpoint = resolved.input.previousOutpoint || {};
  return {
    package: {
      ...pkg,
      covenantInputs: normalizedMetadata,
      ...(normalizedMetadata.length === 1 ? { covenantInput: normalizedMetadata[0] } : {})
    },
    review: {
      network: pkg.network,
      transactionId: String(resolved.transaction.id || ""),
      commitment: transactionCommitment(pkg.transactionSafeJson),
      inputCount: resolved.transaction.inputs.length,
      outputCount: resolved.transaction.outputs.length,
      targetInputIndex: resolved.inputIndex,
      targetInputIndexes: resolved.covenants.map((item) => item.inputIndex),
      inputOutpoint: {
        transactionId: String(previousOutpoint.transactionId || ""),
        index: Number(previousOutpoint.index || 0)
      },
      covenantId: resolved.covenantId,
      programSha256: sha256(Buffer.from(resolved.programHex, "hex")),
      entrypoint: resolved.selected.name,
      feeSompi: resolved.fee.toString(),
      feeKas: sompiToKas(resolved.fee),
      outputs,
      signatureSlots: slots,
      covenantInputs: resolved.covenants.map((item) => ({
        transactionInputIndex: item.inputIndex,
        covenantId: item.covenantId,
        programSha256: item.programSha256,
        entrypoint: item.selected.name,
        signatureCount: signatureSlots(item.selected, item.argumentsList).length,
        descriptorStatus: item.descriptor ? "verified-v1" : "legacy-missing",
        descriptorSha256: item.descriptor?.descriptorSha256 || ""
      })),
      descriptorStatus: resolved.covenants.every((item) => item.descriptor) ? "verified-v1" : "legacy-missing",
      descriptorSha256: resolved.descriptor?.descriptorSha256 || "",
      p2pkAuthorization,
      operation,
      atomic: resolved.covenants.length > 1,
      complete: slots.every((slot) => slot.signed) && p2pkSigned,
      warning: resolved.covenants.every((item) => item.descriptor)
        ? "The versioned descriptor and ABI commitments match this package, but metadata still does not prove redeem-program semantics. Review trusted source/artifact provenance before signing."
        : "Legacy package: no versioned descriptor is present. The supplied ABI is metadata, not proof of redeem-program semantics; review trusted source/artifact provenance before signing."
    }
  };
}

export function exportExternalCovenantPackage(input, directory = path.join(os.homedir(), "Downloads")) {
  const inspected = inspectExternalCovenantPackage(input);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stem = `silverscript-${inspected.review.commitment.slice(0, 12)}`;
  let file = "";
  for (let index = 0; index < 100; index += 1) {
    const suffix = index ? `-${index + 1}` : "";
    const candidate = path.join(directory, `${stem}${suffix}.ssinvite`);
    try {
      fs.writeFileSync(candidate, `${JSON.stringify(inspected.package, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
      file = candidate;
      break;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
  if (!file) throw packageError("Could not allocate a unique invitation filename", "INVITATION_EXPORT_FAILED");
  return { file, filename: path.basename(file), commitment: inspected.review.commitment };
}

export function finalizeExternalCovenantPackage(input) {
  const inspected = inspectExternalCovenantPackage(input);
  const pkg = inspected.package;
  const resolved = normalized(pkg);
  const remaining = resolved.covenants.flatMap((covenant, covenantInputIndex) => signatureSlots(covenant.selected, covenant.argumentsList, { covenantInputIndex })).filter((slot) => !slot.signed);
  if (remaining.length) throw packageError(`Covenant package still has ${remaining.length} unsigned signature slots`, "SIGNATURE_SLOTS_REMAIN");
  const transactionInputs = resolved.transaction.inputs;
  for (const covenant of resolved.covenants) {
    const argumentScript = new kaspa.ScriptBuilder(COVENANT_SCRIPT_OPTIONS);
    covenant.selected.inputs.forEach((definition, index) => appendArgument(argumentScript, definition.type_name, covenant.argumentsList[index], covenant.stateFields));
    if (covenant.abi.length > 1) argumentScript.addI64(BigInt(covenant.abi.findIndex((entry) => entry.name === covenant.selected.name)));
    transactionInputs[covenant.inputIndex].signatureScript = kaspa.ScriptBuilder
      .fromScript(covenant.programHex, COVENANT_SCRIPT_OPTIONS)
      .encodePayToScriptHashSignatureScript(argumentScript.drain());
  }
  resolved.transaction.inputs = transactionInputs;
  resolved.transaction.finalize();
  pkg.transactionSafeJson = resolved.transaction.serializeToSafeJSON();
  return inspectExternalCovenantPackage(pkg);
}

export async function signExternalCovenantPackage(input, walletService) {
  const inspected = inspectExternalCovenantPackage(input.package);
  const pkg = inspected.package;
  if (input.confirmation !== "SIGN REVIEWED EXTERNAL COVENANT") throw packageError("External covenant signing confirmation phrase is required", "EXTERNAL_CONFIRMATION_REQUIRED");
  if (pkg.network === "mainnet") {
    if (!config.allowMainnet) throw Object.assign(new Error("Mainnet external signing is disabled by this application build"), { status: 403 });
    if (input.mainnetConfirmation !== "SIGN REAL KAS EXTERNAL") throw packageError("Mainnet external signing confirmation phrase is required");
  }
  const resolved = normalized(pkg);
  const publicKey = String(input.publicKey || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(publicKey)) throw packageError("Connected wallet public key is invalid");
  const slots = resolved.covenants.flatMap((covenant, covenantInputIndex) => signatureSlots(covenant.selected, covenant.argumentsList, {
    covenantInputIndex,
    transactionInputIndex: covenant.inputIndex
  }));
  const matching = slots.filter((slot) => slot.publicKey === publicKey && !slot.signed);
  if (!matching.length) throw packageError("Connected wallet has no unsigned slot in this covenant entrypoint", "NO_MATCHING_SIGNATURE_SLOT");
  for (const slot of matching) {
    const covenant = resolved.covenants[slot.covenantInputIndex];
    const signature = await walletService.createCovenantInputSignature({
      walletId: input.walletId,
      walletSecret: input.walletSecret,
      paymentSecret: input.paymentSecret,
      network: pkg.network,
      transactionSafeJson: pkg.transactionSafeJson,
      inputIndex: covenant.inputIndex,
      expectedPublicKey: publicKey
    });
    covenant.argumentsList[slot.index] = { ...covenant.argumentsList[slot.index], kind: "signature", publicKey, hex: signature };
    pkg.covenantInputs[slot.covenantInputIndex].arguments = covenant.argumentsList;
  }
  if (pkg.covenantInputs.length === 1) pkg.covenantInput = pkg.covenantInputs[0];
  const remaining = resolved.covenants.flatMap((covenant, covenantInputIndex) => signatureSlots(covenant.selected, covenant.argumentsList, { covenantInputIndex })).filter((slot) => !slot.signed);
  let preflight = null;
  if (!remaining.length) {
    const finalized = finalizeExternalCovenantPackage(pkg);
    pkg.transactionSafeJson = finalized.package.transactionSafeJson;
    preflight = await kascovPreflight(pkg.transactionSafeJson, pkg.network, "signed");
  }
  const reviewed = inspectExternalCovenantPackage(pkg);
  return { ...reviewed, preflight, remainingSignatureSlots: remaining.length };
}
