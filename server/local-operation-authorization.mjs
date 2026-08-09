function authorizationError(message) {
  return Object.assign(new Error(message), { status: 403, code: "LOCAL_OPERATION_AUTHORIZATION_FAILED" });
}

function lifecycleStateError(message, code) {
  return Object.assign(new Error(message), { status: 409, code });
}

const MAX_PHRASE_FREE_RENEWAL_FEE = 2_000_000n;

export function assertLocalRenewalOpen(status) {
  if (!status?.unspent) throw authorizationError("The local inheritance covenant is no longer unspent");
  if (status.schedule?.mature) throw authorizationError("The inheritance covenant has expired and can no longer be renewed");
  return true;
}

export function assertInheritanceDistributionOpen(status) {
  if (!status?.unspent) {
    throw lifecycleStateError("The inheritance covenant is no longer unspent", "INHERITANCE_ALREADY_SPENT");
  }
  if (!status?.schedule?.mature) {
    throw lifecycleStateError("The inheritance covenant has not reached maturity", "INHERITANCE_NOT_MATURE");
  }
  return true;
}

export function assertLocalRenewalPackage(project, inspected, status = null) {
  if (status) assertLocalRenewalOpen(status);
  const pkg = inspected?.package || {};
  const review = inspected?.review || {};
  const provenance = pkg.provenance || {};
  if (!project || project.id !== provenance.projectId) throw authorizationError("Local renewal project was not found");
  if (project.network !== "tn10" || pkg.network !== "tn10") throw authorizationError("Phrase-free local renewal is limited to TN10");
  if (provenance.kind !== "silverstudio-template-operation"
    || provenance.templateId !== "inheritance-vault"
    || provenance.operationId !== "checkIn"
    || project.review?.templateId !== "inheritance-vault") {
    throw authorizationError("Package is not a locally generated inheritance renewal");
  }
  if (review.operation?.kind !== "renewal" || review.entrypoint !== "checkIn" || !review.operation?.continuation) {
    throw authorizationError("Package does not preserve the inheritance covenant");
  }
  if (review.outputCount !== 1 || review.outputs?.[0]?.covenantId !== review.covenantId) {
    throw authorizationError("Renewal must contain exactly one same-covenant continuation");
  }
  let renewalFee;
  try { renewalFee = BigInt(review.feeSompi); } catch { throw authorizationError("Local one-click renewal fee is invalid"); }
  if (renewalFee < 1000n || renewalFee > MAX_PHRASE_FREE_RENEWAL_FEE) {
    throw authorizationError("Local one-click renewal fee must be from 0.00001 to 0.02 TKAS");
  }
  const activeTxid = String(project.deployment?.activeTxid || project.deployment?.txid || "").toLowerCase();
  if (!activeTxid || String(review.inputOutpoint?.transactionId || "").toLowerCase() !== activeTxid) {
    throw authorizationError("Renewal does not spend the current local project UTXO");
  }
  if (project.deployment?.covenantId !== review.covenantId
    || project.artifact?.programSha256 !== review.programSha256
    || project.artifact?.sourceSha256 !== provenance.sourceSha256
    || project.artifact?.compiler?.upstreamCommit !== provenance.compilerCommit) {
    throw authorizationError("Renewal provenance does not match the local compiled deployment");
  }
  return true;
}
