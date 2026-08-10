import crypto from "node:crypto";
import { createRequire } from "node:module";
import { NETWORKS } from "./config.mjs";
import { finalizeExternalCovenantPackage, inspectExternalCovenantPackage } from "./external-covenant-service.mjs";
import { findCovenantUtxo, kasToSompi, kascovPreflight, sompiToKas } from "./kaspa-service.mjs";
import { buildCovenantDescriptor, caip2Network } from "./covenant-descriptor.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");
const MAX_OPERATION_FEE = 10_000_000n;
const OPERATION_COMPUTE_BUDGET = 120;
// Draft preflight uses zero-filled signature slots. A real CheckSig adds about
// 2,495 compute grams with the pinned engine, or 249,500 sompi at the current
// relay rate. Round upward so the package is fully funded before any signer is
// asked to approve it.
const SIGNATURE_EXECUTION_FEE_RESERVE = 250_000n;

const OPERATIONS = {
  "owner-vault": [
    { id: "spend", titleZh: "拥有者释放", titleEn: "Owner spend", destination: true }
  ],
  "timelock-transfer": [
    { id: "claim", titleZh: "收款方领取", titleEn: "Recipient claim" },
    { id: "refund", titleZh: "到期退款", titleEn: "Timeout refund" }
  ],
  "two-of-three": [
    { id: "spend", titleZh: "三选二释放", titleEn: "Two-of-three spend", destination: true, signers: true }
  ],
  "hashlock-refund": [
    { id: "claim", titleZh: "提供秘密领取", titleEn: "Claim with secret", secret: true },
    { id: "refund", titleZh: "到期退款", titleEn: "Timeout refund" }
  ],
  "inheritance-vault": [
    { id: "checkIn", titleZh: "拥有者签到续期", titleEn: "Owner check-in" },
    { id: "recover", titleZh: "拥有者取回", titleEn: "Owner recovery" },
    { id: "inherit", titleZh: "到期分配继承", titleEn: "Mature inheritance distribution" }
  ],
  "merkle-one-time-claim": [
    { id: "claim", titleZh: "提交 Merkle 证明领取", titleEn: "Claim with Merkle proof", proof: true, salt: true },
    { id: "refund", titleZh: "到期退款", titleEn: "Timeout refund" }
  ],
  "commit-reveal": [
    { id: "reveal", titleZh: "公开承诺原文领取", titleEn: "Reveal committed payload", payload: true, salt: true },
    { id: "refund", titleZh: "到期退款", titleEn: "Timeout refund" }
  ],
  "groth16-proof-release": [
    { id: "claim", titleZh: "提交 Groth16 证明释放", titleEn: "Release with Groth16 proof", proof: true, proofKind: "groth16" }
  ]
};

function operationError(message, code = "INVALID_TEMPLATE_OPERATION") {
  return Object.assign(new Error(message), { status: 400, code });
}

function publicKeyOf(address, network, label = "Operation wallet") {
  const value = String(address || "").trim().toLowerCase();
  if (!value) throw operationError(`${label} is required`, "OPERATION_ADDRESS_REQUIRED");
  if (!value.startsWith(`${network.prefix}:`)) throw operationError(`${label} is on the wrong network`, "OPERATION_ADDRESS_WRONG_NETWORK");
  let parsed;
  let key;
  try {
    parsed = new kaspa.Address(value);
    key = kaspa.XOnlyPublicKey.fromAddress(parsed);
    return { address: value, publicKey: key.toString().toLowerCase() };
  } catch { throw operationError(`${label} must be a valid P2PK wallet address`, "OPERATION_ADDRESS_INVALID"); }
  finally { try { key?.free(); } catch {} try { parsed?.free(); } catch {} }
}

function signature(publicKey) {
  return { kind: "signature", publicKey };
}

function int(data) {
  return { kind: "int", data: Number(data) };
}

function bytesArgument(hex, kind = "bytes") {
  return { kind, hex };
}

function operationHex(value, label, { minimumBytes = 0, maximumBytes = 520, exactBytes = null } = {}) {
  const hex = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2) throw operationError(`${label} must be hexadecimal data`);
  const bytes = hex.length / 2;
  if (exactBytes !== null && bytes !== exactBytes) throw operationError(`${label} must contain exactly ${exactBytes} bytes`);
  if (bytes < minimumBytes || bytes > maximumBytes) throw operationError(`${label} must contain ${minimumBytes}-${maximumBytes} bytes`);
  return hex;
}

function verifyMerkleProof(publicKey, claimId, saltHex, proofHex, leafIndex, expectedRoot) {
  let node = crypto.createHash("sha256").update(Buffer.concat([
    Buffer.from(publicKey, "hex"), Buffer.from(claimId, "hex"), Buffer.from(saltHex, "hex")
  ])).digest();
  let cursor = Number(leafIndex);
  for (let offset = 0; offset < proofHex.length; offset += 64) {
    const sibling = Buffer.from(proofHex.slice(offset, offset + 64), "hex");
    node = crypto.createHash("sha256").update(cursor % 2 === 0 ? Buffer.concat([node, sibling]) : Buffer.concat([sibling, node])).digest();
    cursor = Math.floor(cursor / 2);
  }
  if (node.toString("hex") !== String(expectedRoot || "").toLowerCase()) throw operationError("Merkle proof does not match the configured root", "MERKLE_PROOF_MISMATCH");
}

function templateIdOf(project) {
  const id = String(project?.review?.templateId || "");
  if (!OPERATIONS[id]) throw operationError("This project has no deterministic lifecycle operation builder", "NO_TEMPLATE_OPERATION_BUILDER");
  return id;
}

export function templateOperations(project) {
  const templateId = templateIdOf(project);
  const operations = structuredClone(OPERATIONS[templateId]);
  if (templateId === "two-of-three") {
    const parameters = project.templateParameters || {};
    const availableSigners = [parameters.key1Address, parameters.key2Address, parameters.key3Address].filter(Boolean);
    for (const operation of operations) if (operation.signers) operation.availableSigners = availableSigners;
  }
  return operations;
}

function exactOperation(templateId, operationId) {
  const operation = OPERATIONS[templateId]?.find((item) => item.id === operationId);
  if (!operation) throw operationError("Unknown template lifecycle operation");
  return operation;
}

function timeoutOf(project, templateId) {
  const indexes = { "timelock-transfer": 2, "hashlock-refund": 3, "merkle-one-time-claim": 5, "commit-reveal": 4 };
  const index = indexes[templateId];
  const value = Number(project.constructorArgs?.[index]?.data);
  if (!Number.isSafeInteger(value) || value <= 0) throw operationError("Compiled timeout constructor argument is invalid");
  return value;
}

function controlPrincipalsOf(template, project) {
  return (Array.isArray(template.controlPrincipals) ? template.controlPrincipals : []).map((principal) => {
    const normalized = { ...principal };
    if (principal.cardinalityParameter) {
      const value = project.templateParameters?.[principal.cardinalityParameter];
      normalized.cardinality = Array.isArray(value) ? value.length : 0;
      delete normalized.cardinalityParameter;
    }
    return normalized;
  });
}

function inheritOutputs(parameters, value, network) {
  const inheritors = parameters?.inheritors;
  if (!Array.isArray(inheritors) || inheritors.length < 2 || inheritors.length > 5) throw operationError("Inheritance parameters are missing");
  const base = value / 10000n;
  const remainder = value % 10000n;
  let paid = 0n;
  let shareTotal = 0n;
  const outputs = inheritors.map((item, index) => {
    const identity = publicKeyOf(item.address, network);
    const shareNumber = Number(item.shareBps);
    if (!Number.isSafeInteger(shareNumber) || shareNumber <= 0 || shareNumber > 10000) {
      throw operationError("Every inheritance share must be a positive integer no greater than 100%");
    }
    const share = BigInt(shareNumber);
    shareTotal += share;
    let amount = base * share + (remainder * share) / 10000n;
    if (index === inheritors.length - 1) amount = value - paid;
    if (amount <= 0n) throw operationError("Every inheritor output must receive a positive amount");
    paid += amount;
    return new kaspa.TransactionOutput(amount, kaspa.payToAddressScript(identity.address));
  });
  if (shareTotal !== 10000n) throw operationError("Inheritance shares must total exactly 100%");
  if (paid !== value) throw operationError("Inheritance outputs do not conserve the distributable value");
  return outputs;
}

export async function buildTemplateOperationPackage(
  input,
  project,
  template,
  findUtxo = findCovenantUtxo,
  preflight = kascovPreflight,
  feeContext = null
) {
  const templateId = templateIdOf(project);
  const operation = exactOperation(templateId, String(input.operationId || ""));
  if (!project?.artifact?.programHex || !project?.deployment?.txid) throw operationError("Project must have a compiled and broadcast covenant deployment");
  if (project.deployment.network !== project.network) throw operationError("Project deployment network does not match the project");
  const network = NETWORKS[project.network];
  if (!network) throw operationError("Project network is unsupported");
  const source = feeContext?.source || await findUtxo(
      project.network,
      project.artifact.programHex,
      project.deployment.activeTxid || project.deployment.txid,
      project.deployment.activeOutputIndex ?? 0,
      project.deployment.covenantId || ""
    );
  if (project.deployment.covenantId && project.deployment.covenantId !== source.covenantId) throw operationError("Stored deployment covenant ID does not match the unspent output");
  const requestedFee = feeContext?.requestedFee ?? kasToSompi(String(input.feeKas || "0.01"));
  const fee = feeContext?.fee ?? requestedFee;
  if (fee < 1000n || fee > MAX_OPERATION_FEE) throw operationError("Operation fee must be from 0.00001 to 0.1 KAS/TKAS");
  const inputValue = BigInt(source.entry.amount);
  if (inputValue <= fee) throw operationError("Covenant value is not enough to pay the selected fee");
  const payout = inputValue - fee;
  const parameters = project.templateParameters || {};
  let outputs = [];
  let args = [];
  let sequence = 0n;
  let lockTime = 0n;
  let sigOps = 0;

  if (templateId === "owner-vault") {
    const owner = publicKeyOf(parameters.ownerAddress, network);
    const destination = publicKeyOf(input.destinationAddress, network, "Destination wallet");
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(destination.address))];
    args = [signature(owner.publicKey)];
    sigOps = 1;
  } else if (templateId === "timelock-transfer") {
    const isClaim = operation.id === "claim";
    const identity = publicKeyOf(isClaim ? parameters.recipientAddress : parameters.senderAddress, network);
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    args = [signature(identity.publicKey)];
    sigOps = 1;
    if (!isClaim) lockTime = BigInt(timeoutOf(project, templateId));
  } else if (templateId === "two-of-three") {
    const configured = [parameters.key1Address, parameters.key2Address, parameters.key3Address].map((address) => publicKeyOf(address, network));
    const requested = Array.isArray(input.signerAddresses) ? input.signerAddresses.map((address) => publicKeyOf(address, network)) : [];
    if (requested.length !== 2 || requested[0].address === requested[1].address) throw operationError("Select exactly two different configured signer wallets");
    for (const signer of requested) if (!configured.some((item) => item.address === signer.address)) throw operationError("Selected signer is not part of this multisig covenant");
    const destination = publicKeyOf(input.destinationAddress, network, "Destination wallet");
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(destination.address))];
    args = [{ kind: "pubkey", hex: requested[0].publicKey }, signature(requested[0].publicKey), { kind: "pubkey", hex: requested[1].publicKey }, signature(requested[1].publicKey)];
    sigOps = 2;
  } else if (templateId === "hashlock-refund") {
    const isClaim = operation.id === "claim";
    const identity = publicKeyOf(isClaim ? parameters.recipientAddress : parameters.senderAddress, network);
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    if (isClaim) {
      const secretHex = String(input.secretHex || "").trim().toLowerCase().replace(/^0x/, "");
      if (!secretHex || secretHex.length % 2 || !/^[0-9a-f]+$/.test(secretHex) || secretHex.length > 1040) throw operationError("Claim secret must be 1-520 bytes of hexadecimal data");
      if (crypto.createHash("sha256").update(Buffer.from(secretHex, "hex")).digest("hex") !== parameters.secretHash) throw operationError("Claim secret does not match the configured SHA-256 digest");
      args = [{ kind: "bytes", hex: secretHex }, signature(identity.publicKey)];
    } else {
      args = [signature(identity.publicKey)];
      lockTime = BigInt(timeoutOf(project, templateId));
    }
    sigOps = 1;
  } else if (templateId === "inheritance-vault") {
    const owner = publicKeyOf(parameters.ownerAddress, network);
    if (operation.id === "checkIn") {
      outputs = [new kaspa.TransactionOutput(payout, kaspa.payToScriptHashScript(project.artifact.programHex), new kaspa.CovenantBinding(0, new kaspa.Hash(source.covenantId)))];
      args = [signature(owner.publicKey), int(fee)];
      sigOps = 1;
    } else if (operation.id === "recover") {
      outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(owner.address))];
      args = [signature(owner.publicKey), int(fee)];
      sigOps = 1;
    } else {
      outputs = inheritOutputs(parameters, payout, network);
      args = [int(fee)];
      sequence = BigInt(Number(project.constructorArgs?.[3]?.data || 0));
      if (sequence <= 0n) throw operationError("Inheritance inactivity period is invalid");
    }
  } else if (templateId === "merkle-one-time-claim") {
    const isClaim = operation.id === "claim";
    const identity = publicKeyOf(isClaim ? parameters.claimantAddress : parameters.refundAddress, network);
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    if (isClaim) {
      const proofHex = operationHex(input.proofHex, "Merkle proof", { maximumBytes: 512 });
      if ((proofHex.length / 2) % 32 !== 0) throw operationError("Merkle proof must contain complete 32-byte siblings");
      const saltHex = operationHex(input.saltHex, "Merkle salt", { exactBytes: 32 });
      verifyMerkleProof(identity.publicKey, parameters.claimId, saltHex, proofHex, parameters.leafIndex, parameters.merkleRoot);
      args = [bytesArgument(proofHex), bytesArgument(saltHex, "bytes32"), signature(identity.publicKey), int(fee)];
      sigOps = 1;
    } else {
      args = [signature(identity.publicKey), int(fee)];
      sigOps = 1;
      lockTime = BigInt(timeoutOf(project, templateId));
    }
  } else if (templateId === "groth16-proof-release") {
    const identity = publicKeyOf(parameters.recipientAddress, network);
    const proofHex = operationHex(input.proofHex, "Groth16 proof", { minimumBytes: 1, maximumBytes: 520 });
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    args = [bytesArgument(proofHex), int(fee)];
  } else if (templateId === "commit-reveal") {
    const isReveal = operation.id === "reveal";
    const identity = publicKeyOf(isReveal ? parameters.recipientAddress : parameters.senderAddress, network);
    outputs = [new kaspa.TransactionOutput(payout, kaspa.payToAddressScript(identity.address))];
    if (isReveal) {
      const payloadHex = operationHex(input.payloadHex, "Reveal payload", { minimumBytes: 1, maximumBytes: 480 });
      const saltHex = operationHex(input.saltHex, "Reveal salt", { exactBytes: 32 });
      const commitment = crypto.createHash("sha256").update(Buffer.concat([
        Buffer.from(parameters.domain, "hex"), Buffer.from(payloadHex, "hex"), Buffer.from(saltHex, "hex")
      ])).digest("hex");
      if (commitment !== parameters.commitment) throw operationError("Reveal payload and salt do not match the configured commitment", "COMMITMENT_MISMATCH");
      args = [bytesArgument(payloadHex), bytesArgument(saltHex, "bytes32"), signature(identity.publicKey), int(fee)];
      sigOps = 1;
    } else {
      args = [signature(identity.publicKey), int(fee)];
      sigOps = 1;
      lockTime = BigInt(timeoutOf(project, templateId));
    }
  }

  const transaction = new kaspa.Transaction({
    version: 1,
    inputs: [{
      previousOutpoint: source.entry.outpoint,
      signatureScript: "",
      sequence,
      // Toccata v1 commits a compute budget, not the legacy v0 sig-op field.
      sigOpCount: 0,
      computeBudget: OPERATION_COMPUTE_BUDGET,
      utxo: source.entry
    }],
    outputs,
    lockTime,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: ""
  });
  const authorizationPrincipals = args
    .map((argument, index) => argument?.kind === "signature" ? {
      role: `${operation.id}.signature-${index}`,
      profile: "p2pk-schnorr/v1",
      cardinality: 1,
      reference: { kind: "public-key", value: argument.publicKey }
    } : null)
    .filter(Boolean);
  const descriptor = buildCovenantDescriptor({
    profileId: template.descriptorProfileId || `silverstudio/${templateId}/v1`,
    network: project.network,
    programSha256: project.artifact.programSha256,
    covenantId: source.covenantId,
    abi: project.artifact.abi,
    stateFields: project.artifact.stateFields || [],
    controlPrincipals: controlPrincipalsOf(template, project),
    authorizationPrincipals
  });
  const packageValue = {
    version: 1,
    network: project.network,
    networkCaip2: caip2Network(project.network),
    transactionSafeJson: transaction.serializeToSafeJSON(),
    covenantInput: {
      index: 0,
      covenantId: source.covenantId,
      programHex: project.artifact.programHex,
      programSha256: project.artifact.programSha256,
      abi: project.artifact.abi,
      entrypoint: operation.id,
      arguments: args,
      descriptor: descriptor.descriptor,
      descriptorSha256: descriptor.descriptorSha256
    },
    provenance: {
      kind: "silverstudio-template-operation",
      projectId: project.id,
      templateId,
      operationId: operation.id,
      compilerCommit: project.artifact.compiler?.upstreamCommit || "",
      sourceSha256: project.artifact.sourceSha256 || ""
    }
  };
  let prepared = sigOps === 0 ? finalizeExternalCovenantPackage(packageValue) : inspectExternalCovenantPackage(packageValue);

  // The redeem program and covenant arguments are added to signatureScript only
  // when an operation package is finalized. Estimating before that point
  // underprices large contracts. Fill temporary signature slots, assemble the
  // exact script, and then calculate the network minimum fee and mass.
  let estimation = prepared;
  if (!prepared.review.complete) {
    const estimatePackage = structuredClone(prepared.package);
    for (const covenantInput of estimatePackage.covenantInputs || []) {
      covenantInput.arguments = (covenantInput.arguments || []).map((argument) => argument?.kind === "signature" && !argument.hex
        ? { ...argument, hex: "00".repeat(65) }
        : argument);
    }
    if (estimatePackage.covenantInputs?.length === 1) estimatePackage.covenantInput = estimatePackage.covenantInputs[0];
    estimation = finalizeExternalCovenantPackage(estimatePackage);
  }
  const estimatedTransaction = kaspa.Transaction.deserializeFromSafeJSON(estimation.package.transactionSafeJson);
  const minimumSignatures = Math.max(sigOps, 1);
  const calculatedMass = BigInt(kaspa.calculateTransactionMass(network.kaspaNetworkId, estimatedTransaction, minimumSignatures, true));
  const maximumMass = BigInt(kaspa.maximumStandardTransactionMass());
  const minimumFee = kaspa.calculateTransactionFee(network.kaspaNetworkId, estimatedTransaction, minimumSignatures, true);
  try { estimatedTransaction.free?.(); } catch {}
  if (calculatedMass > maximumMass || minimumFee === undefined) {
    throw operationError(`Operation transaction exceeds the standard mass limit (${calculatedMass}/${maximumMass})`, "OPERATION_MASS_LIMIT");
  }
  const requiredFee = BigInt(minimumFee);
  if (fee < requiredFee) {
    const pass = Number(feeContext?.pass || 0);
    if (pass >= 3 || requiredFee > MAX_OPERATION_FEE) {
      throw operationError(`Operation requires at least ${sompiToKas(requiredFee)} KAS/TKAS in fees`, "OPERATION_FEE_TOO_LOW");
    }
    return buildTemplateOperationPackage(input, project, template, async () => source, preflight, {
      source,
      requestedFee,
      fee: requiredFee,
      pass: pass + 1
    });
  }

  const unsignedTransaction = kaspa.Transaction.deserializeFromSafeJSON(packageValue.transactionSafeJson);
  unsignedTransaction.storageMass = calculatedMass;
  unsignedTransaction.finalize();
  packageValue.transactionSafeJson = unsignedTransaction.serializeToSafeJSON();
  try { unsignedTransaction.free?.(); } catch {}
  prepared = sigOps === 0 ? finalizeExternalCovenantPackage(packageValue) : inspectExternalCovenantPackage(packageValue);
  let preflightReport = await preflight(prepared.package.transactionSafeJson, project.network, "draft");
  let engineMinimumFee = 0n;
  try { engineMinimumFee = BigInt(preflightReport?.fee?.estimate_sompi || 0); } catch {}
  const signatureExecutionReserve = BigInt(sigOps) * SIGNATURE_EXECUTION_FEE_RESERVE;
  const engineRequiredFee = engineMinimumFee + signatureExecutionReserve;
  if (engineRequiredFee > fee) {
    const pass = Number(feeContext?.pass || 0);
    if (pass >= 3 || engineRequiredFee > MAX_OPERATION_FEE) {
      throw operationError(`Operation requires at least ${sompiToKas(engineRequiredFee)} KAS/TKAS in fees`, "OPERATION_FEE_TOO_LOW");
    }
    return buildTemplateOperationPackage(input, project, template, async () => source, preflight, {
      source,
      requestedFee,
      fee: engineRequiredFee,
      pass: pass + 1
    });
  }

  const engineMasses = preflightReport?.masses || {};
  const authoritativeMass = [engineMasses.compute, engineMasses.storage, engineMasses.transient]
    .map((value) => Number(value || 0))
    .filter((value) => Number.isSafeInteger(value) && value > 0)
    .reduce((maximum, value) => Math.max(maximum, value), 0);
  if (authoritativeMass > 0) {
    const finalTransaction = kaspa.Transaction.deserializeFromSafeJSON(prepared.package.transactionSafeJson);
    if (BigInt(finalTransaction.storageMass) !== BigInt(authoritativeMass)) {
      finalTransaction.storageMass = BigInt(authoritativeMass);
      finalTransaction.finalize();
      prepared.package.transactionSafeJson = finalTransaction.serializeToSafeJSON();
      prepared = inspectExternalCovenantPackage(prepared.package);
      preflightReport = await preflight(prepared.package.transactionSafeJson, project.network, "draft");
    }
    try { finalTransaction.free?.(); } catch {}
  }
  return {
    operation,
    ...prepared,
    preflight: preflightReport,
    fee: {
      requestedSompi: requestedFee.toString(),
      requestedKas: sompiToKas(requestedFee),
      actualSompi: fee.toString(),
      actualKas: sompiToKas(fee),
      automaticallyAdjusted: fee > requestedFee,
      calculatedMass: calculatedMass.toString(),
      maximumStandardMass: maximumMass.toString(),
      engineMinimumFeeSompi: engineMinimumFee.toString(),
      signatureExecutionReserveSompi: signatureExecutionReserve.toString(),
      engineMasses
    }
  };
}
