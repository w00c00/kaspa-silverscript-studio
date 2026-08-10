import { sha256 } from "./security.mjs";

const NETWORK_ALIASES = Object.freeze({
  tn10: "tn10",
  "testnet-10": "tn10",
  "kaspa:testnet-10": "tn10",
  mainnet: "mainnet",
  "kaspa:mainnet": "mainnet"
});

const CAIP2 = Object.freeze({ tn10: "kaspa:testnet-10", mainnet: "kaspa:mainnet" });
const PRINCIPAL_PROFILES = new Set(["p2pk-schnorr/v1", "covenant-id/v1", "program-hash/v1"]);

function descriptorError(message, code = "INVALID_COVENANT_DESCRIPTOR") {
  return Object.assign(new Error(message), { status: 400, code });
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function canonicalSha256(value) {
  return sha256(canonicalJson(value));
}

export function normalizePackageNetwork(value) {
  return NETWORK_ALIASES[String(value || "").trim().toLowerCase()] || "";
}

export function caip2Network(network) {
  return CAIP2[normalizePackageNetwork(network)] || "";
}

function cleanHex32(value, label) {
  const normalized = String(value || "").trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(normalized)) throw descriptorError(`${label} must contain exactly 32 bytes of hexadecimal data`);
  return normalized;
}

function cleanProfileId(value) {
  const normalized = String(value || "").trim();
  if (!/^[a-z0-9][a-z0-9._/-]{2,127}$/i.test(normalized)) throw descriptorError("Covenant descriptor profileId is invalid");
  return normalized;
}

function cleanPrincipal(principal, index) {
  const role = String(principal?.role || "").trim();
  const profile = String(principal?.profile || "").trim().toLowerCase();
  if (!/^[a-z][a-z0-9._/-]{1,63}$/i.test(role)) throw descriptorError(`Covenant principal ${index} has an invalid role`);
  if (!PRINCIPAL_PROFILES.has(profile)) throw descriptorError(`Covenant principal ${role} uses an unsupported profile`, "UNSUPPORTED_PRINCIPAL_PROFILE");
  const cardinality = Number(principal?.cardinality ?? 1);
  if (!Number.isSafeInteger(cardinality) || cardinality < 1 || cardinality > 32) throw descriptorError(`Covenant principal ${role} has invalid cardinality`);
  const reference = principal?.reference && typeof principal.reference === "object" ? principal.reference : null;
  let normalizedReference = null;
  if (reference) {
    const kind = String(reference.kind || "").trim();
    const expectedKind = {
      "p2pk-schnorr/v1": "public-key",
      "covenant-id/v1": "covenant-id",
      "program-hash/v1": "program-hash"
    }[profile];
    if (kind !== expectedKind) throw descriptorError(`Covenant principal ${role} reference kind does not match profile ${profile}`);
    const value = cleanHex32(reference.value, `Covenant principal ${role} reference`);
    normalizedReference = { kind, value };
  }
  return {
    role,
    profile,
    cardinality,
    ...(principal?.stateField ? { stateField: String(principal.stateField) } : {}),
    ...(principal?.constructorParameter ? { constructorParameter: String(principal.constructorParameter) } : {}),
    ...(normalizedReference ? { reference: normalizedReference } : {})
  };
}

export function buildCovenantDescriptor({
  profileId,
  network,
  programSha256,
  covenantId,
  abi,
  stateFields = [],
  controlPrincipals = [],
  authorizationPrincipals = []
}) {
  const normalizedNetwork = caip2Network(network);
  if (!normalizedNetwork) throw descriptorError("Covenant descriptor network is unsupported");
  const descriptor = {
    schema: "kaspa-covenant-descriptor",
    version: 1,
    profileId: cleanProfileId(profileId),
    network: normalizedNetwork,
    programSha256: cleanHex32(programSha256, "Covenant descriptor programSha256"),
    covenantId: cleanHex32(covenantId, "Covenant descriptor covenantId"),
    abi: {
      encoding: "silverscript-json-abi/v1",
      sha256: canonicalSha256(abi)
    },
    state: {
      encoding: "silverscript-state-layout/v1",
      sha256: canonicalSha256(stateFields)
    },
    controlPrincipals: controlPrincipals.map(cleanPrincipal),
    authorizationPrincipals: authorizationPrincipals.map(cleanPrincipal)
  };
  return { descriptor, descriptorSha256: canonicalSha256(descriptor) };
}

export function verifyCovenantDescriptor(input, expected) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw descriptorError("Covenant descriptor is missing");
  if (input.schema !== "kaspa-covenant-descriptor" || input.version !== 1) throw descriptorError("Covenant descriptor schema/version is unsupported");
  const built = buildCovenantDescriptor({
    profileId: input.profileId,
    network: input.network,
    programSha256: input.programSha256,
    covenantId: input.covenantId,
    abi: expected.abi,
    stateFields: expected.stateFields,
    controlPrincipals: Array.isArray(input.controlPrincipals) ? input.controlPrincipals : [],
    authorizationPrincipals: Array.isArray(input.authorizationPrincipals) ? input.authorizationPrincipals : []
  });
  if (built.descriptor.network !== caip2Network(expected.network)) throw descriptorError("Covenant descriptor network does not match the package");
  if (built.descriptor.programSha256 !== expected.programSha256) throw descriptorError("Covenant descriptor program hash does not match the redeem program");
  if (built.descriptor.covenantId !== expected.covenantId) throw descriptorError("Covenant descriptor ID does not match the target UTXO");
  if (input.abi?.encoding !== built.descriptor.abi.encoding || String(input.abi?.sha256 || "").toLowerCase() !== built.descriptor.abi.sha256) {
    throw descriptorError("Covenant descriptor ABI commitment does not match the supplied ABI");
  }
  if (input.state?.encoding !== built.descriptor.state.encoding || String(input.state?.sha256 || "").toLowerCase() !== built.descriptor.state.sha256) {
    throw descriptorError("Covenant descriptor state-layout commitment does not match the supplied state fields");
  }
  const declaredHash = String(expected.descriptorSha256 || "").toLowerCase();
  if (declaredHash && declaredHash !== built.descriptorSha256) throw descriptorError("Covenant descriptor SHA-256 commitment is invalid");
  return built;
}
