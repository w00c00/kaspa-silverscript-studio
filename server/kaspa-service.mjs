import { createRequire } from "node:module";
import fs from "node:fs";
import { spawn } from "node:child_process";
import { config, NETWORKS } from "./config.mjs";
import { sha256, transactionCommitment } from "./security.mjs";
import { CovenantStateSource, covenantStateProvider } from "./covenant-state-source.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const SOMPI = 100_000_000n;
// A 0.5 KAS covenant cell stays below the bundled wallet calculator's
// conservative 100,000-mass ceiling even when it is funded from a large
// faucet/mining UTXO. This is a Studio safety floor, not a consensus dust rule.
const MIN_DEPLOY_SOMPI = 50_000_000n;
const DEFAULT_FEE_RESERVE = 2_000_000n;

function networkOf(id) {
  const network = NETWORKS[id];
  if (!network) throw new Error(`Unsupported network: ${id}`);
  return network;
}

export function kasToSompi(value) {
  const text = String(value ?? "").trim();
  if (!/^(0|[1-9]\d*)(\.\d{1,8})?$/.test(text)) throw new Error("KAS amount must be a positive decimal with at most 8 places");
  const [whole, fraction = ""] = text.split(".");
  return BigInt(whole) * SOMPI + BigInt(fraction.padEnd(8, "0"));
}

export function sompiToKas(value) {
  const amount = BigInt(value || 0);
  const whole = amount / SOMPI;
  const fraction = String(amount % SOMPI).padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

async function fetchJson(url, options = {}, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text }; }
    if (!response.ok) {
      const message = payload?.detail || payload?.error || payload?.message || `HTTP ${response.status}`;
      throw Object.assign(new Error(Array.isArray(message) ? JSON.stringify(message) : String(message)), { status: response.status });
    }
    return payload;
  } finally { clearTimeout(timer); }
}

function normalizeUtxo(item) {
  const entry = item.entry || item.utxoEntry || item;
  const scriptPublicKey = item.scriptPublicKey || entry.scriptPublicKey || {};
  const outpoint = item.outpoint || entry.outpoint || {};
  return {
    address: String(item.address || entry.address || ""),
    outpoint: {
      transactionId: String(outpoint.transactionId || item.transactionId || ""),
      index: Number(outpoint.index ?? item.index ?? 0)
    },
    amount: BigInt(item.amount ?? entry.amount ?? 0),
    script: String(scriptPublicKey.scriptPublicKey || scriptPublicKey.script || ""),
    blockDaaScore: BigInt(item.blockDaaScore ?? entry.blockDaaScore ?? 0),
    isCoinbase: Boolean(item.isCoinbase ?? entry.isCoinbase)
  };
}

const runtimeRpcUrls = {
  tn10: config.rpcUrls.tn10,
  mainnet: config.rpcUrls.mainnet
};
let rpcClientFactoryForTests = null;

export function configureNodeAccess(settings = {}) {
  runtimeRpcUrls.tn10 = String(settings.tn10RpcUrl || config.rpcUrls.tn10 || "").trim();
  runtimeRpcUrls.mainnet = String(settings.mainnetRpcUrl || config.rpcUrls.mainnet || "").trim();
}

export function setRpcClientFactoryForTests(factory = null) {
  rpcClientFactoryForTests = typeof factory === "function" ? factory : null;
}

async function withRpc(network, action) {
  const directUrl = runtimeRpcUrls[network.id];
  const rpc = rpcClientFactoryForTests
    ? rpcClientFactoryForTests(network, directUrl)
    : directUrl
      ? new kaspa.RpcClient({ url: directUrl, networkId: network.kaspaNetworkId })
      : new kaspa.RpcClient({ resolver: new kaspa.Resolver(), networkId: network.kaspaNetworkId });
  await rpc.connect();
  try {
    const serverInfo = await rpc.getServerInfo();
    if (String(serverInfo?.networkId || "") !== network.kaspaNetworkId) {
      throw Object.assign(new Error(`Kaspa node is on ${serverInfo?.networkId || "an unknown network"}, expected ${network.kaspaNetworkId}`), {
        code: "KASPA_NODE_WRONG_NETWORK"
      });
    }
    return await action(rpc, serverInfo);
  } finally {
    try { await rpc.disconnect?.(); } catch {}
    try { await rpc.stop?.(); } catch {}
  }
}

export async function nodeStatus(networkId) {
  const network = networkOf(networkId);
  const directUrl = runtimeRpcUrls[network.id];
  const started = Date.now();
  return withRpc(network, async (rpc, serverInfo) => {
    const [syncStatus, dagInfo] = await Promise.all([
      rpc.getSyncStatus(),
      rpc.getBlockDagInfo()
    ]);
    return {
      network: network.id,
      kaspaNetworkId: network.kaspaNetworkId,
      connected: true,
      latencyMs: Date.now() - started,
      synced: Boolean(syncStatus?.isSynced ?? syncStatus),
      serverVersion: serverInfo?.serverVersion || serverInfo?.server_version || "",
      virtualDaaScore: String(dagInfo?.virtualDaaScore || dagInfo?.virtual_daa_score || ""),
      nodeId: String(rpc.nodeId || ""),
      url: directUrl || String(rpc.url || ""),
      discoveredBy: directUrl ? "custom-rpc" : "kaspa-resolver"
    };
  });
}

export async function discoverNetworks() {
  const settled = await Promise.allSettled(Object.keys(NETWORKS).map((id) => nodeStatus(id)));
  return Object.keys(NETWORKS).map((id, index) => settled[index].status === "fulfilled"
    ? settled[index].value
    : { network: id, connected: false, error: String(settled[index].reason?.message || settled[index].reason) });
}

function assertNetworkAddress(address, network, label = "Address") {
  const value = String(address || "").trim();
  if (!value.toLowerCase().startsWith(`${network.prefix}:`)) throw new Error(`${label} is not on ${network.labelEn}`);
  try { kaspa.payToAddressScript(value); } catch { throw new Error(`${label} is invalid`); }
  return value;
}

export async function walletBalance(networkId, address) {
  const network = networkOf(networkId || "tn10");
  const walletAddress = assertNetworkAddress(address, network, "Wallet address");
  const response = await withRpc(network, (rpc) => rpc.getBalanceByAddress({ address: walletAddress }));
  const balance = BigInt(response?.balance ?? 0);
  return {
    network: network.id,
    symbol: network.symbol,
    address: walletAddress,
    balanceSompi: balance.toString(),
    balanceKas: sompiToKas(balance),
    checkedAt: new Date().toISOString()
  };
}

export async function signDeployDraft(input, draftStore, walletService) {
  const draft = draftStore.get(input.draftId);
  if (!draft) throw Object.assign(new Error("Deployment draft was not found"), { status: 404 });
  if (draft.status === "broadcast") throw new Error("Deployment draft was already broadcast");
  const signedTransactionSafeJson = await walletService.signTransaction({
    walletId: input.walletId,
    walletSecret: input.walletSecret,
    paymentSecret: input.paymentSecret,
    network: draft.network,
    transactionSafeJson: draft.unsignedTransactionSafeJson,
    expectedAddress: draft.address
  });
  if (transactionCommitment(signedTransactionSafeJson) !== draft.commitment) throw new Error("Wallet changed the approved deployment transaction");
  return { signedTransactionSafeJson };
}

export async function buildWalletTransferDraft(input, draftStore) {
  const network = networkOf(input.network || "tn10");
  if (network.id === "mainnet") {
    if (!config.allowMainnet) throw Object.assign(new Error("Mainnet transfers are disabled by this application build"), { status: 403 });
    if (input.mainnetConfirmation !== "SEND REAL KAS") throw new Error("Mainnet transfer confirmation phrase is required");
  }
  const address = assertNetworkAddress(input.address, network, "Wallet address");
  const recipient = assertNetworkAddress(input.recipient, network, "Recipient address");
  const amount = kasToSompi(input.amountKas);
  if (amount <= 0n) throw new Error("Transfer amount must be greater than zero");
  if (network.id === "mainnet" && amount > kasToSompi(config.mainnetMaxDeployKas)) {
    throw new Error(`Mainnet transfer exceeds the ${config.mainnetMaxDeployKas} KAS local cap`);
  }
  const source = await fetchSpendableUtxos(network, address);
  if (!source.length) throw new Error("Wallet has no spendable UTXOs");
  const entries = source.map((utxo) => ({
    address,
    outpoint: utxo.outpoint,
    amount: utxo.amount,
    scriptPublicKey: new kaspa.ScriptPublicKey(0, utxo.script),
    blockDaaScore: utxo.blockDaaScore,
    isCoinbase: false
  }));
  const generated = await kaspa.createTransactions({
    entries,
    outputs: [{ address: recipient, amount }],
    changeAddress: address,
    priorityFee: 0n,
    networkId: network.kaspaNetworkId
  });
  if (generated.transactions.length !== 1) {
    for (const transaction of generated.transactions) try { transaction.free(); } catch {}
    throw new Error("This wallet needs a consolidation transaction before a single reviewed transfer can be created");
  }
  const pending = generated.transactions[0];
  const unsignedTransactionSafeJson = pending.serializeToSafeJSON();
  const feeSompi = BigInt(generated.summary.fees || 0);
  const preflight = await kascovPreflight(unsignedTransactionSafeJson, network.id, "draft");
  const record = draftStore.create({
    kind: "wallet-transfer",
    network: network.id,
    address,
    recipient,
    amountSompi: amount.toString(),
    feeSompi: feeSompi.toString(),
    unsignedTransactionSafeJson,
    commitment: transactionCommitment(unsignedTransactionSafeJson),
    preflight
  });
  try { pending.free(); } catch {}
  try { generated.summary.free(); } catch {}
  return {
    id: record.id,
    network: record.network,
    symbol: network.symbol,
    address,
    recipient,
    amountSompi: record.amountSompi,
    amountKas: sompiToKas(amount),
    feeSompi: record.feeSompi,
    feeKas: sompiToKas(feeSompi),
    commitment: record.commitment,
    preflight,
    signing: {
      method: "studio.localWallet",
      txJsonString: unsignedTransactionSafeJson,
      inputIndexes: (JSON.parse(unsignedTransactionSafeJson).inputs || []).map((_input, index) => index),
      sighashType: 1
    }
  };
}

export async function signAndBroadcastWalletTransfer(input, draftStore, walletService) {
  const draft = draftStore.get(input.draftId);
  if (!draft || draft.kind !== "wallet-transfer") throw Object.assign(new Error("Wallet transfer draft was not found"), { status: 404 });
  if (draft.status === "broadcast") return draft.result;
  const signedJson = await walletService.signTransaction({
    walletId: input.walletId,
    walletSecret: input.walletSecret,
    paymentSecret: input.paymentSecret,
    network: draft.network,
    transactionSafeJson: draft.unsignedTransactionSafeJson,
    expectedAddress: draft.address
  });
  return broadcastWalletTransfer({ draftId: input.draftId, signedTransactionSafeJson: signedJson }, draftStore);
}

export async function broadcastWalletTransfer(input, draftStore) {
  const draft = draftStore.get(input.draftId);
  if (!draft || draft.kind !== "wallet-transfer") throw Object.assign(new Error("Wallet transfer draft was not found"), { status: 404 });
  if (draft.status === "broadcast") return draft.result;
  const signedJson = typeof input.signedTransactionSafeJson === "string" ? input.signedTransactionSafeJson : JSON.stringify(input.signedTransactionSafeJson);
  if (transactionCommitment(signedJson) !== draft.commitment) throw new Error("Signed transaction differs from the approved transfer draft");
  const safe = JSON.parse(signedJson);
  if ((safe.inputs || []).some((transactionInput) => !transactionInput.signatureScript)) throw new Error("Every transfer input must be signed");
  const preflight = await kascovPreflight(signedJson, draft.network, "signed");
  const network = networkOf(draft.network);
  const transaction = kaspa.Transaction.deserializeFromSafeJSON(signedJson);
  const response = await withRpc(network, (rpc) => rpc.submitTransaction({ transaction, allowOrphan: false }));
  const txid = String(response?.transactionId || response?.transaction_id || transaction.id || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error("Kaspa node returned no transaction ID");
  const result = {
    txid,
    network: draft.network,
    recipient: draft.recipient,
    amountSompi: draft.amountSompi,
    amountKas: sompiToKas(draft.amountSompi),
    feeSompi: draft.feeSompi,
    feeKas: sompiToKas(draft.feeSompi),
    preflight,
    kascovTransactionUrl: `${config.kascovBaseUrl}/#/${network.kascovNetworkId}/tx/${txid}`,
    broadcastAt: new Date().toISOString()
  };
  draft.status = "broadcast";
  draft.result = result;
  draft.signedTransactionSha256 = sha256(signedJson);
  draftStore.save(draft);
  return result;
}

function assertAddressAndPublicKey(address, publicKey, network) {
  if (!String(address).toLowerCase().startsWith(`${network.prefix}:`)) throw new Error(`Wallet address is not on ${network.labelEn}`);
  const key = String(publicKey || "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(key)) throw new Error("Wallet must expose a 32-byte x-only public key");
  const derived = new kaspa.XOnlyPublicKey(key).toAddress(network.kaspaNetworkId).toString();
  if (derived !== address) throw new Error("Wallet public key does not belong to the selected address");
}

function assertProgramHex(programHex) {
  const hex = String(programHex || "").trim().toLowerCase();
  if (!hex || hex.length % 2 || !/^[0-9a-f]+$/.test(hex)) throw new Error("Compiled programHex is invalid");
  if (hex.length > 20_000) throw new Error("Compiled program exceeds the local 10KB limit");
  return hex;
}

async function fetchSpendableUtxos(network, address) {
  const response = await withRpc(network, (rpc) => rpc.getUtxosByAddresses([address]));
  return (response.entries || []).map(normalizeUtxo)
    .filter((item) => item.outpoint.transactionId && item.script && !item.isCoinbase)
    .sort((a, b) => a.amount === b.amount ? 0 : a.amount > b.amount ? -1 : 1);
}

function kascovScriptPublicKey(value, wasmSafeShape) {
  if (value && typeof value === "object") {
    return {
      version: Number(value.version || 0),
      script: String(value.script || value.scriptPublicKey || value.hex || "").replace(/^0x/, "").toLowerCase()
    };
  }
  const hex = String(value || "").trim().replace(/^0x/, "").toLowerCase();
  if (!wasmSafeShape) return { version: 0, script: hex };
  if (hex.length < 4 || hex.length % 2 || !/^[0-9a-f]+$/.test(hex)) throw new Error("WASM Safe JSON contains an invalid scriptPublicKey");
  return { version: Number.parseInt(hex.slice(0, 4), 16), script: hex.slice(4) };
}

export function toKascovPreflightTransaction(transaction) {
  const parsed = typeof transaction === "string" ? JSON.parse(transaction) : structuredClone(transaction);
  const source = parsed?.transaction && typeof parsed.transaction === "object" ? parsed.transaction : parsed;
  if (!source || typeof source !== "object") throw new Error("Transaction preflight requires a transaction JSON object");
  const inputs = Array.isArray(source.inputs) ? source.inputs : [];
  const outputs = Array.isArray(source.outputs) ? source.outputs : [];
  const wasmSafeShape = inputs.some((input) => input?.previousOutpoint == null && input?.transactionId);
  return {
    version: source.version,
    inputs: inputs.map((input) => {
      const previousOutpoint = input.previousOutpoint || {
        transactionId: input.transactionId,
        index: input.index
      };
      const utxo = input.utxo || input.utxoEntry;
      return {
        previousOutpoint: {
          transactionId: previousOutpoint?.transactionId,
          index: previousOutpoint?.index
        },
        sequence: input.sequence,
        sigOpCount: input.sigOpCount,
        computeBudget: input.computeBudget,
        signatureScript: input.signatureScript,
        ...(utxo ? {
          utxo: {
            amount: utxo.amount ?? utxo.value,
            scriptPublicKey: kascovScriptPublicKey(utxo.scriptPublicKey, wasmSafeShape),
            blockDaaScore: utxo.blockDaaScore,
            isCoinbase: utxo.isCoinbase,
            covenantId: utxo.covenantId
          }
        } : {})
      };
    }),
    outputs: outputs.map((output) => ({
      value: output.value ?? output.amount,
      scriptPublicKey: kascovScriptPublicKey(output.scriptPublicKey, wasmSafeShape),
      ...(output.covenant ? { covenant: output.covenant } : {})
    })),
    lockTime: source.lockTime,
    subnetworkId: source.subnetworkId,
    gas: source.gas,
    payload: source.payload
  };
}

export async function kascovPreflight(transaction, networkId, stage = "draft") {
  const network = networkOf(networkId);
  const raw = typeof transaction === "string" ? transaction : JSON.stringify(transaction);
  const preflightTransaction = toKascovPreflightTransaction(raw);
  const localReport = await localPreflight(preflightTransaction, network);
  assertPreflightAccepted(localReport, raw, stage, "Local Kaspa script-engine");

  let report = localReport;
  let provider = "local";
  let remoteAvailable = false;
  let remoteError = "";
  try {
    const remoteReport = await fetchJson(`${config.kascovBaseUrl}/data/${network.kascovNetworkId}/preflight`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(preflightTransaction)
    }, 6_000);
    remoteAvailable = true;
    try {
      assertPreflightAccepted(remoteReport, raw, stage, "Kascov");
    } catch (error) {
      remoteError = `Kascov disagrees with the pinned local engine: ${error.message}`;
      return {
        ...localReport,
        stage,
        provider: "local",
        localEngineVerified: true,
        localVerdict: localReport.verdict,
        kascov: {
          preferred: true,
          available: true,
          disagreement: true,
          verdict: remoteReport.verdict || "",
          error: remoteError
        },
        transactionSha256: sha256(raw),
        checkedAt: new Date().toISOString()
      };
    }
    report = remoteReport;
    provider = "kascov";
  } catch (error) {
    remoteError = error.name === "AbortError" ? "Kascov request timed out" : String(error.message || error);
  }
  return {
    ...report,
    stage,
    provider,
    localEngineVerified: true,
    localVerdict: localReport.verdict,
    kascov: {
      preferred: true,
      available: remoteAvailable,
      ...(remoteError ? { error: remoteError } : {})
    },
    transactionSha256: sha256(raw),
    checkedAt: new Date().toISOString()
  };
}

function assertPreflightAccepted(report, raw, stage, label) {
  const errors = (report.findings || []).filter((finding) => finding?.severity === "error");
  if (report.ok !== true || report.verdict === "will_fail" || errors.length) {
    throw Object.assign(new Error(errors[0]?.message || `${label} preflight: ${report.verdict || "failed"}`), { code: "PREFLIGHT_REJECTED", report });
  }
  if (stage === "signed") {
    const parsed = JSON.parse(raw);
    const executed = Array.isArray(report.executed) ? report.executed : [];
    if (report.verdict !== "ready" || executed.length !== (parsed.inputs || []).length || executed.some((item) => item.pass !== true)) {
      throw Object.assign(new Error(`Every signed input must pass ${label} execution before broadcast`), { code: "SIGNED_PREFLIGHT_INCOMPLETE", report });
    }
  }
}

function localPreflight(transaction, network) {
  if (!fs.existsSync(config.preflightEngine.bin)) {
    throw Object.assign(new Error("Bundled local preflight engine is missing; transaction operations are disabled"), {
      code: "LOCAL_PREFLIGHT_MISSING"
    });
  }
  const actualSha256 = sha256(fs.readFileSync(config.preflightEngine.bin));
  if (!/^[0-9a-f]{64}$/.test(config.preflightEngine.sha256) || actualSha256 !== config.preflightEngine.sha256) {
    throw Object.assign(new Error("Bundled local preflight engine failed its pinned SHA-256 check"), {
      code: "LOCAL_PREFLIGHT_INTEGRITY_FAILED"
    });
  }
  const body = JSON.stringify(transaction);
  return new Promise((resolve, reject) => {
    const child = spawn(config.preflightEngine.bin, [network.kaspaNetworkId], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Object.assign(new Error("Local preflight engine timed out"), { code: "LOCAL_PREFLIGHT_TIMEOUT" }));
    }, 15_000);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 4_000_000) child.kill("SIGKILL");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 64_000) child.kill("SIGKILL");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`Unable to start local preflight engine: ${error.message}`), { code: "LOCAL_PREFLIGHT_START_FAILED" }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(Object.assign(new Error(`Local preflight failed: ${stderr.trim() || `exit ${code}`}`), { code: "LOCAL_PREFLIGHT_FAILED" }));
        return;
      }
      try { resolve(JSON.parse(stdout)); }
      catch { reject(Object.assign(new Error("Local preflight returned invalid JSON"), { code: "LOCAL_PREFLIGHT_INVALID" })); }
    });
    child.stdin.end(body);
  });
}

export async function buildDeployDraft(input, draftStore) {
  const network = networkOf(input.network || "tn10");
  if (network.id === "mainnet") {
    if (!config.allowMainnet) throw new Error("Mainnet deployment is disabled. Set ALLOW_MAINNET=true only after independent review.");
    if (input.mainnetConfirmation !== "DEPLOY REAL KAS") throw new Error("Mainnet confirmation phrase is required");
  }
  const address = String(input.address || "").trim();
  const publicKey = String(input.publicKey || "").trim();
  assertAddressAndPublicKey(address, publicKey, network);
  const amount = kasToSompi(input.amountKas);
  if (amount < MIN_DEPLOY_SOMPI) {
    throw Object.assign(new Error("Studio requires at least 0.5 KAS/TKAS for conservative covenant storage-mass headroom"), {
      status: 400,
      code: "COVENANT_AMOUNT_BELOW_STANDARD_MASS",
      report: { minimumAmountSompi: MIN_DEPLOY_SOMPI.toString(), minimumAmountKas: sompiToKas(MIN_DEPLOY_SOMPI) }
    });
  }
  if (network.id === "mainnet" && amount > kasToSompi(config.mainnetMaxDeployKas)) throw new Error(`Mainnet deployment exceeds the ${config.mainnetMaxDeployKas} KAS local cap`);
  const programHex = assertProgramHex(input.artifact?.programHex);
  if (Array.isArray(input.artifact?.deploymentBlockedReasons) && input.artifact.deploymentBlockedReasons.length) {
    throw new Error(input.artifact.deploymentBlockedReasons[0]);
  }
  const sourceSha256 = String(input.artifact?.sourceSha256 || "");
  const programSha256 = String(input.artifact?.programSha256 || "");
  const constructorArgsSha256 = String(input.artifact?.constructorArgsSha256 || "");
  if (!/^[0-9a-f]{64}$/.test(sourceSha256) || sha256(Buffer.from(programHex, "hex")) !== programSha256) {
    throw new Error("Compiled artifact hashes are missing or inconsistent");
  }
  if (sha256(String(input.source || "")) !== sourceSha256) {
    throw new Error("Contract source changed after compilation. Recompile before building a deployment transaction.");
  }
  if (!Array.isArray(input.constructorArgs) || sha256(JSON.stringify(input.constructorArgs)) !== constructorArgsSha256) {
    throw new Error("Constructor arguments changed after compilation. Recompile before building a deployment transaction.");
  }
  const utxos = await fetchSpendableUtxos(network, address);
  const required = amount + DEFAULT_FEE_RESERVE;
  const candidates = utxos.filter((item) => item.amount >= required).sort((a, b) => a.amount < b.amount ? -1 : a.amount > b.amount ? 1 : 0);
  if (!candidates.length) throw new Error(`No plain spendable UTXO contains at least ${Number(required) / Number(SOMPI)} ${network.symbol}`);

  let transaction = null;
  let lowestMass = null;
  for (const utxo of candidates) {
    const inputValue = {
      previousOutpoint: utxo.outpoint,
      signatureScript: "",
      sequence: 0n,
      sigOpCount: 0,
      computeBudget: 120,
      utxo: {
        address,
        outpoint: utxo.outpoint,
        amount: utxo.amount,
        scriptPublicKey: new kaspa.ScriptPublicKey(0, utxo.script),
        blockDaaScore: utxo.blockDaaScore,
        isCoinbase: false
      }
    };
    const outputs = [new kaspa.TransactionOutput(amount, kaspa.payToScriptHashScript(programHex))];
    const change = utxo.amount - required;
    if (change > 0n) outputs.push(new kaspa.TransactionOutput(change, kaspa.payToAddressScript(address)));
    const candidate = new kaspa.Transaction({
      version: 1,
      inputs: [inputValue],
      outputs,
      lockTime: 0n,
      subnetworkId: "0000000000000000000000000000000000000000",
      gas: 0n,
      payload: ""
    });
    candidate.populateGenesisCovenants([{ authorizingInput: 0, outputs: [0] }]);
    const mass = BigInt(kaspa.calculateTransactionMass(network.kaspaNetworkId, candidate, 1, true));
    if (lowestMass === null || mass < lowestMass) lowestMass = mass;
    if (kaspa.updateTransactionMass(network.kaspaNetworkId, candidate, 1, true)) {
      transaction = candidate;
      break;
    }
    try { candidate.free?.(); } catch {}
  }
  if (!transaction) {
    const maximumMass = BigInt(kaspa.maximumStandardTransactionMass());
    throw Object.assign(new Error(`No available UTXO can fund this covenant within the standard mass limit (${lowestMass ?? "unknown"}/${maximumMass})`), {
      status: 400,
      code: "COVENANT_DEPLOYMENT_MASS_LIMIT",
      report: {
        calculatedMass: lowestMass?.toString() || "",
        maximumStandardMass: maximumMass.toString(),
        minimumAmountKas: sompiToKas(MIN_DEPLOY_SOMPI)
      }
    });
  }
  const unsignedTransactionSafeJson = transaction.serializeToSafeJSON();
  const safe = JSON.parse(unsignedTransactionSafeJson);
  const covenantId = String(safe.outputs?.[0]?.covenant?.covenantId || "");
  if (!/^[0-9a-f]{64}$/i.test(covenantId)) throw new Error("WASM builder did not populate a covenant ID");
  const preflight = await kascovPreflight(unsignedTransactionSafeJson, network.id, "draft");
  const record = draftStore.create({
    projectId: input.projectId || "",
    network: network.id,
    address,
    publicKey,
    amountSompi: amount.toString(),
    feeReserveSompi: DEFAULT_FEE_RESERVE.toString(),
    covenantId,
    programHex,
    programSha256,
    sourceSha256,
    unsignedTransactionSafeJson,
    commitment: transactionCommitment(unsignedTransactionSafeJson),
    preflight
  });
  return {
    id: record.id,
    network: record.network,
    covenantId,
    amountSompi: record.amountSompi,
    feeReserveSompi: record.feeReserveSompi,
    preflight,
    signing: {
      method: "studio.localWallet",
      txJsonString: unsignedTransactionSafeJson,
      inputIndex: 0,
      sighashType: 1
    }
  };
}

export async function broadcastDeploy({ draftId, signedTransactionSafeJson }, draftStore) {
  const draft = draftStore.get(draftId);
  if (!draft) throw Object.assign(new Error("Deployment draft was not found"), { status: 404 });
  if (draft.status === "broadcast") return draft.result;
  const signedJson = typeof signedTransactionSafeJson === "string" ? signedTransactionSafeJson : JSON.stringify(signedTransactionSafeJson);
  if (transactionCommitment(signedJson) !== draft.commitment) throw new Error("Signed transaction differs from the approved deployment draft");
  const safe = JSON.parse(signedJson);
  if ((safe.inputs || []).some((input) => !input.signatureScript)) throw new Error("Every transaction input must be signed");
  const preflight = await kascovPreflight(signedJson, draft.network, "signed");
  const network = networkOf(draft.network);
  const transaction = kaspa.Transaction.deserializeFromSafeJSON(signedJson);
  const response = await withRpc(network, (rpc) => rpc.submitTransaction({ transaction, allowOrphan: false }));
  const txid = String(response?.transactionId || response?.transaction_id || transaction.id || "");
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error("Kaspa node accepted the request but returned no transaction ID");
  const result = {
    txid: txid.toLowerCase(),
    covenantId: draft.covenantId,
    network: draft.network,
    preflight,
    kascovTransactionUrl: `${config.kascovBaseUrl}/#/${network.kascovNetworkId}/tx/${txid}`,
    kascovCovenantUrl: `${config.kascovBaseUrl}/#/${network.kascovNetworkId}/c/${draft.covenantId}`,
    broadcastAt: new Date().toISOString()
  };
  draft.status = "broadcast";
  draft.result = result;
  draft.signedTransactionSha256 = sha256(signedJson);
  draftStore.save(draft);
  return result;
}

export async function transactionEvidence(networkId, txid) {
  const network = networkOf(networkId);
  if (!/^[0-9a-f]{64}$/i.test(txid)) throw new Error("txid must be 32-byte hex");
  try {
    const evidence = await fetchJson(`${config.kascovBaseUrl}/data/${network.kascovNetworkId}/tx/${txid}.json`);
    return { indexed: true, evidence };
  } catch (error) {
    if (error.status === 404) return { indexed: false, evidence: null };
    return {
      indexed: false,
      evidence: null,
      kascovAvailable: false,
      error: error.name === "AbortError" ? "Kascov request timed out" : String(error.message || error)
    };
  }
}

export async function findCovenantUtxo(networkId, programHex, txid, outputIndex = 0, expectedCovenantId = "") {
  const network = networkOf(networkId || "tn10");
  const script = kaspa.payToScriptHashScript(assertProgramHex(programHex));
  const address = kaspa.addressFromScriptPublicKey(script, network.kaspaNetworkId)?.toString();
  if (!address) throw new Error("Unable to derive the covenant P2SH address");
  const expectedTxid = String(txid || "").toLowerCase();
  const expectedIndex = Number(outputIndex);
  const expectedId = String(expectedCovenantId || "").toLowerCase();
  const result = await withRpc(network, async (rpc) => {
    const providers = [
      covenantStateProvider("native-covenant-rpc", async () => {
        const response = await rpc.getUtxosByCovenantId({ covenantId: expectedId, limit: 300 });
        return response?.entries || response?.utxos || [];
      }, () => Boolean(expectedId && typeof rpc.getUtxosByCovenantId === "function")),
      covenantStateProvider("native-outpoint-rpc", async () => {
        const response = await rpc.getUtxosByOutpoints([{ transactionId: expectedTxid, index: expectedIndex }]);
        return response?.entries || response?.utxos || [];
      }, () => Boolean(expectedTxid && typeof rpc.getUtxosByOutpoints === "function")),
      covenantStateProvider("p2sh-address-rpc", async () => {
        const response = await rpc.getUtxosByAddresses([address]);
        const entries = response?.entries || [];
        const exact = entries.filter((entry) => String(entry.outpoint?.transactionId || "").toLowerCase() === expectedTxid && Number(entry.outpoint?.index) === expectedIndex);
        if (exact.length) return exact;
        return expectedId ? entries.filter((entry) => String(entry.entry?.covenantId || entry.covenantId || "").toLowerCase() === expectedId) : [];
      })
    ];
    return new CovenantStateSource(providers).resolve({
      network: network.id,
      covenantId: expectedId,
      script: script.script,
      ...(expectedTxid && !expectedId ? { outpoint: { transactionId: expectedTxid, index: expectedIndex } } : {})
    });
  });
  return { ...result, address };
}

export async function submitReviewedTransaction(networkId, transactionSafeJson) {
  const network = networkOf(networkId || "tn10");
  if (network.id === "mainnet" && !config.allowMainnet) throw Object.assign(new Error("Mainnet covenant broadcast is disabled by this application build"), { status: 403 });
  const preflight = await kascovPreflight(transactionSafeJson, network.id, "signed");
  const transaction = kaspa.Transaction.deserializeFromSafeJSON(String(transactionSafeJson));
  if (transaction.inputs.some((input) => !input.signatureScript)) throw new Error("Every transaction input must have a finalized signature script");
  const response = await withRpc(network, (rpc) => rpc.submitTransaction({ transaction, allowOrphan: false }));
  const txid = String(response?.transactionId || response?.transaction_id || transaction.id || "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error("Kaspa node returned no transaction ID");
  return {
    txid,
    network: network.id,
    preflight,
    kascovTransactionUrl: `${config.kascovBaseUrl}/#/${network.kascovNetworkId}/tx/${txid}`,
    broadcastAt: new Date().toISOString()
  };
}
