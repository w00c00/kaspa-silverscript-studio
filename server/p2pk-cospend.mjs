import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { transactionCommitment } from "./security.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");

function authorizationError(message, code = "INVALID_P2PK_COSPEND") {
  return Object.assign(new Error(message), { status: 400, code });
}

function networkOf(id) {
  const network = NETWORKS[id];
  if (!network) throw authorizationError(`Unsupported P2PK authorization network: ${id}`);
  return network;
}

function normalizeUtxo(raw) {
  const entry = raw?.entry || raw?.utxoEntry || raw;
  const outpoint = raw?.outpoint || entry?.outpoint || {};
  const scriptPublicKey = raw?.scriptPublicKey || entry?.scriptPublicKey || {};
  return {
    address: String(raw?.address || entry?.address || "").trim().toLowerCase(),
    outpoint: { transactionId: String(outpoint.transactionId || "").toLowerCase(), index: Number(outpoint.index) },
    amount: BigInt(raw?.amount ?? entry?.amount ?? 0),
    script: String(scriptPublicKey.script || scriptPublicKey.scriptPublicKey || raw?.script || "").replace(/^0x/, "").toLowerCase(),
    blockDaaScore: BigInt(raw?.blockDaaScore ?? entry?.blockDaaScore ?? 0),
    isCoinbase: Boolean(raw?.isCoinbase ?? entry?.isCoinbase)
  };
}

export function selectP2pkFundingUtxo(utxos, requiredSompi) {
  const required = BigInt(requiredSompi);
  if (required <= 0n) throw authorizationError("Required P2PK funding amount must be positive");
  const candidates = (Array.isArray(utxos) ? utxos : []).map(normalizeUtxo)
    .filter((utxo) => !utxo.isCoinbase && utxo.blockDaaScore > 0n && utxo.amount >= required && /^[0-9a-f]{64}$/.test(utxo.outpoint.transactionId) && Number.isSafeInteger(utxo.outpoint.index) && utxo.outpoint.index >= 0)
    .sort((left, right) => left.amount === right.amount ? 0 : left.amount < right.amount ? -1 : 1);
  if (!candidates.length) throw authorizationError("No confirmed plain P2PK UTXO covers the required amount", "P2PK_FUNDING_NOT_FOUND");
  return candidates[0];
}

export function createP2pkCoSpendAuthorization({ network: networkId = "tn10", address, publicKey, utxo, inputIndex }) {
  const network = networkOf(networkId);
  const walletAddress = String(address || "").trim().toLowerCase();
  const keyHex = String(publicKey || "").trim().toLowerCase();
  if (!walletAddress.startsWith(`${network.prefix}:`)) throw authorizationError("P2PK authorization address is on the wrong network", "P2PK_WRONG_NETWORK");
  if (!/^[0-9a-f]{64}$/.test(keyHex)) throw authorizationError("P2PK authorization requires a 32-byte x-only public key");
  let key;
  try {
    key = new kaspa.XOnlyPublicKey(keyHex);
    if (key.toAddress(network.kaspaNetworkId).toString() !== walletAddress) throw authorizationError("P2PK public key does not belong to the authorization address");
  } finally { try { key?.free?.(); } catch {} }
  const normalized = normalizeUtxo(utxo);
  if (normalized.address && normalized.address !== walletAddress) throw authorizationError("P2PK UTXO address does not match the authorization wallet");
  const expectedScript = kaspa.payToAddressScript(walletAddress).script;
  if (normalized.script !== expectedScript) throw authorizationError("P2PK UTXO script does not match the authorization wallet");
  if (normalized.amount <= 0n || normalized.blockDaaScore <= 0n || normalized.isCoinbase) throw authorizationError("P2PK authorization UTXO is not a confirmed spendable non-coinbase output");
  if (!Number.isSafeInteger(inputIndex) || inputIndex < 0) throw authorizationError("P2PK authorization input index is invalid");
  return {
    input: {
      previousOutpoint: normalized.outpoint,
      signatureScript: "",
      sequence: 0n,
      // Toccata v1 inputs must leave the legacy sig-op field at zero.
      sigOpCount: 0,
      computeBudget: 10,
      utxo: {
        address: walletAddress,
        outpoint: normalized.outpoint,
        amount: normalized.amount,
        scriptPublicKey: new kaspa.ScriptPublicKey(0, normalized.script),
        blockDaaScore: normalized.blockDaaScore,
        isCoinbase: false
      }
    },
    metadata: {
      inputIndex,
      address: walletAddress,
      publicKey: keyHex,
      amountSompi: normalized.amount.toString(),
      outpoint: normalized.outpoint,
      signed: false,
      purpose: "covenant-owner-authorization"
    }
  };
}

export async function signP2pkCoSpendPackage(input, walletService) {
  const pkg = typeof input.package === "string" ? JSON.parse(input.package) : structuredClone(input.package || {});
  const metadata = pkg.p2pkAuthorization;
  if (!metadata || typeof metadata !== "object") throw authorizationError("Operation package has no P2PK co-spend authorization metadata");
  if (input.confirmation !== "SIGN REVIEWED P2PK CO-SPEND") throw authorizationError("P2PK co-spend confirmation phrase is required", "P2PK_CONFIRMATION_REQUIRED");
  const transaction = kaspa.Transaction.deserializeFromSafeJSON(String(pkg.transactionSafeJson));
  const inputIndex = Number(metadata.inputIndex);
  if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= transaction.inputs.length) throw authorizationError("P2PK authorization input index is invalid");
  const target = transaction.inputs[inputIndex];
  if (!target.utxo || target.utxo.scriptPublicKey.script !== kaspa.payToAddressScript(metadata.address).script) {
    throw authorizationError("P2PK authorization metadata does not match the transaction input");
  }
  const beforeCommitment = transactionCommitment(pkg.transactionSafeJson);
  const beforeScripts = transaction.inputs.map((item) => item.signatureScript);
  if (typeof walletService?.signP2pkInput !== "function") throw authorizationError("Wallet signer does not support isolated P2PK co-spend authorization");
  const signedJson = await walletService.signP2pkInput({
    walletId: input.walletId,
    walletSecret: input.walletSecret,
    paymentSecret: input.paymentSecret,
    network: pkg.network,
    transactionSafeJson: pkg.transactionSafeJson,
    inputIndex,
    expectedAddress: metadata.address
  });
  if (transactionCommitment(signedJson) !== beforeCommitment) throw authorizationError("Wallet changed the reviewed P2PK co-spend transaction");
  const signed = kaspa.Transaction.deserializeFromSafeJSON(signedJson);
  if (!signed.inputs[inputIndex].signatureScript) throw authorizationError("Wallet did not sign the P2PK authorization input");
  for (let index = 0; index < beforeScripts.length; index += 1) {
    if (index !== inputIndex && signed.inputs[index].signatureScript !== beforeScripts[index]) {
      throw authorizationError("Wallet changed a covenant input while authorizing the P2PK co-spend");
    }
  }
  pkg.transactionSafeJson = signedJson;
  pkg.p2pkAuthorization = { ...metadata, signed: true };
  return { package: pkg, authorization: pkg.p2pkAuthorization, commitment: beforeCommitment };
}
