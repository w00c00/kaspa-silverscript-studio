import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { sha256 } from "./security.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const MAX_COVENANT_INPUTS = 32;

function builderError(message, code = "INVALID_ATOMIC_COVENANT_BUILD") {
  return Object.assign(new Error(message), { status: 400, code });
}

function cleanHex(value, bytes = null) {
  const hex = String(value || "").replace(/^0x/, "").toLowerCase();
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/.test(hex) || (bytes !== null && hex.length !== bytes * 2)) throw builderError("Atomic covenant build contains invalid hexadecimal data");
  return hex;
}

function covenantIdOf(utxo) {
  return cleanHex(utxo?.entry?.covenantId || utxo?.covenantId, 32);
}

function amountOf(utxo) {
  const amount = BigInt(utxo?.amount ?? utxo?.entry?.amount ?? 0);
  if (amount <= 0n) throw builderError("Every atomic covenant input must have positive value");
  return amount;
}

function transactionUtxo(utxo) {
  if (utxo?.entry) return utxo;
  const outpoint = utxo?.outpoint || {};
  const script = String(utxo?.scriptPublicKey?.script || utxo?.scriptPublicKey || "").replace(/^0000/, "").toLowerCase();
  const safeUtxo = {
    ...(utxo?.address ? { address: String(utxo.address) } : {}),
    amount: amountOf(utxo).toString(),
    scriptPublicKey: `0000${cleanHex(script)}`,
    blockDaaScore: BigInt(utxo?.blockDaaScore ?? 0).toString(),
    isCoinbase: Boolean(utxo?.isCoinbase),
    covenantId: covenantIdOf(utxo)
  };
  const carrier = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify({
    id: "00".repeat(32),
    version: 1,
    inputs: [{ transactionId: outpoint.transactionId, index: Number(outpoint.index), sequence: "0", sigOpCount: 0, computeBudget: 0, signatureScript: "", utxo: safeUtxo }],
    outputs: [{ value: "1", scriptPublicKey: safeUtxo.scriptPublicKey, covenant: null }],
    subnetworkId: "00".repeat(20), lockTime: "0", gas: "0", storageMass: "0", payload: ""
  }));
  return carrier.inputs[0].utxo;
}

function outputFrom(descriptor, network, inputIndexById) {
  const value = BigInt(descriptor.valueSompi);
  if (value <= 0n) throw builderError("Every atomic output must have positive value");
  if (descriptor.address) {
    const address = String(descriptor.address).trim().toLowerCase();
    if (!address.startsWith(`${network.prefix}:`)) throw builderError("Atomic output address is on the wrong network");
    return new kaspa.TransactionOutput(value, kaspa.payToAddressScript(address));
  }
  const programHex = cleanHex(descriptor.programHex);
  const covenantId = cleanHex(descriptor.covenantId, 32);
  const sourceInputIndex = inputIndexById.get(covenantId);
  if (!Number.isSafeInteger(sourceInputIndex)) throw builderError("Covenant continuation output does not map to an input covenant ID");
  return new kaspa.TransactionOutput(
    value,
    kaspa.payToScriptHashScript(programHex),
    new kaspa.CovenantBinding(sourceInputIndex, new kaspa.Hash(covenantId))
  );
}

export function buildAtomicCovenantPackage({ network: networkId = "tn10", covenantInputs, outputs, p2pkAuthorization = null, feeSompi, provenance = {} }) {
  const network = NETWORKS[networkId];
  if (!network) throw builderError("Atomic covenant build network is unsupported");
  if (!Array.isArray(covenantInputs) || covenantInputs.length < 2 || covenantInputs.length > MAX_COVENANT_INPUTS) {
    throw builderError(`Atomic covenant build requires 2-${MAX_COVENANT_INPUTS} covenant inputs`);
  }
  if (!Array.isArray(outputs) || !outputs.length || outputs.length > 64) throw builderError("Atomic covenant build requires 1-64 outputs");
  const usedOutpoints = new Set();
  const usedIds = new Set();
  const metadata = [];
  const transactionInputs = covenantInputs.map((item, index) => {
    const utxo = item.utxo;
    const outpoint = utxo?.outpoint || utxo?.entry?.outpoint;
    const outpointKey = `${String(outpoint?.transactionId || "").toLowerCase()}:${Number(outpoint?.index)}`;
    if (!/^[0-9a-f]{64}:\d+$/.test(outpointKey) || usedOutpoints.has(outpointKey)) throw builderError("Atomic covenant inputs must have unique valid outpoints");
    usedOutpoints.add(outpointKey);
    const covenantId = covenantIdOf(utxo);
    if (usedIds.has(covenantId)) throw builderError("Atomic builder requires one live input per covenant ID");
    usedIds.add(covenantId);
    const programHex = cleanHex(item.programHex);
    const script = utxo?.scriptPublicKey?.script || utxo?.entry?.scriptPublicKey?.script;
    if (String(script || "").toLowerCase() !== kaspa.payToScriptHashScript(programHex).script) throw builderError("Atomic covenant redeem program does not match its input UTXO");
    metadata.push({
      index,
      covenantId,
      programHex,
      programSha256: sha256(Buffer.from(programHex, "hex")),
      abi: item.abi,
      stateFields: item.stateFields || [],
      entrypoint: item.entrypoint,
      arguments: item.arguments || []
    });
    return {
      previousOutpoint: outpoint,
      signatureScript: "",
      sequence: BigInt(item.sequence || 0),
      // Toccata v1 inputs use computeBudget; a non-zero legacy sig-op field is
      // rejected by current nodes before script execution.
      sigOpCount: 0,
      computeBudget: Number(item.computeBudget || 120),
      utxo: transactionUtxo(utxo)
    };
  });
  if (p2pkAuthorization?.input) {
    const expectedIndex = transactionInputs.length;
    if (!p2pkAuthorization.metadata || Number(p2pkAuthorization.metadata.inputIndex) !== expectedIndex) {
      throw builderError("P2PK authorization metadata must identify the appended authorization input");
    }
    const authInput = p2pkAuthorization.input;
    const authScript = String(authInput.utxo?.scriptPublicKey?.script || "").toLowerCase();
    const authAddress = String(p2pkAuthorization.metadata.address || "").toLowerCase();
    if (!authAddress.startsWith(`${network.prefix}:`) || authScript !== kaspa.payToAddressScript(authAddress).script) {
      throw builderError("P2PK authorization input does not match its wallet or network");
    }
    if (authInput.signatureScript) throw builderError("P2PK authorization must be unsigned before the atomic package is reviewed");
    transactionInputs.push(authInput);
  }
  const inputIndexById = new Map(metadata.map((item) => [item.covenantId, item.index]));
  const transactionOutputs = outputs.map((output) => outputFrom(output, network, inputIndexById));
  const inputTotal = covenantInputs.reduce((sum, item) => sum + amountOf(item.utxo), 0n)
    + (p2pkAuthorization?.input ? amountOf(p2pkAuthorization.input.utxo) : 0n);
  const outputTotal = outputs.reduce((sum, output) => sum + BigInt(output.valueSompi), 0n);
  const fee = inputTotal - outputTotal;
  if (fee < 0n) throw builderError("Atomic covenant outputs exceed inputs");
  if (fee !== BigInt(feeSompi)) throw builderError("Atomic covenant fee does not equal the explicit fee");
  const transaction = new kaspa.Transaction({
    version: 1,
    inputs: transactionInputs,
    outputs: transactionOutputs,
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  });
  const covenantSignatures = metadata.reduce((sum, item) => sum + (item.arguments || []).filter((argument) => argument?.kind === "signature").length, 0);
  const sigOps = Math.max(1, covenantSignatures + (p2pkAuthorization?.input ? 1 : 0));
  if (!kaspa.updateTransactionMass(network.kaspaNetworkId, transaction, sigOps, true)) throw builderError("Atomic covenant transaction exceeds the current mass limit", "ATOMIC_MASS_LIMIT");
  return {
    version: 1,
    network: network.id,
    transactionSafeJson: transaction.serializeToSafeJSON(),
    covenantInputs: metadata,
    ...(p2pkAuthorization?.metadata ? { p2pkAuthorization: { ...p2pkAuthorization.metadata, signed: false } } : {}),
    provenance: {
      kind: "silverstudio-atomic-covenant",
      atomic: true,
      inputCount: metadata.length,
      ...provenance
    }
  };
}
