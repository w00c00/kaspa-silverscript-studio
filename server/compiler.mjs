import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.mjs";
import { boundedText, sha256 } from "./security.mjs";

const execFileAsync = promisify(execFile);

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function compilerProfile(profileId = config.compiler.defaultProfileId) {
  const profile = config.compiler.profiles[String(profileId || config.compiler.defaultProfileId)];
  if (!profile) throw Object.assign(new Error(`Unknown SilverScript compiler profile: ${profileId}`), { status: 400, code: "SILVERC_PROFILE_UNKNOWN" });
  return profile;
}

export function compilerProfiles() {
  return Object.values(config.compiler.profiles).map((profile) => ({
    ...profile,
    bin: path.basename(profile.bin),
    configured: fs.existsSync(profile.bin) && /^[0-9a-f]{64}$/.test(profile.sha256),
    default: profile.id === config.compiler.defaultProfileId
  }));
}

export function compilerManifest(profileId = config.compiler.defaultProfileId) {
  const profile = compilerProfile(profileId);
  const bin = profile.bin;
  if (!fs.existsSync(bin)) throw Object.assign(new Error("SilverScript compiler is not installed. Run npm run setup:silverc"), { code: "SILVERC_NOT_INSTALLED" });
  if (!/^[0-9a-f]{64}$/.test(profile.sha256)) throw Object.assign(new Error("SilverScript compiler SHA-256 is not pinned"), { code: "SILVERC_HASH_REQUIRED" });
  const actualSha256 = hashFile(bin);
  if (actualSha256 !== profile.sha256) {
    throw Object.assign(new Error("SilverScript compiler hash does not match config/compiler.json"), {
      code: "SILVERC_HASH_MISMATCH",
      expectedSha256: profile.sha256,
      actualSha256
    });
  }
  if (!/^[0-9a-f]{40}$/.test(profile.upstreamCommit)) {
    throw Object.assign(new Error("Compiler profile has no exact upstream commit"), { code: "SILVERC_COMMIT_MISMATCH" });
  }
  const stat = fs.statSync(bin);
  return {
    id: profile.id,
    label: profile.label,
    bin,
    sha256: actualSha256,
    size: stat.size,
    upstreamCommit: profile.upstreamCommit,
    artifactBytecodeField: profile.artifactBytecodeField,
    syntaxGeneration: profile.syntaxGeneration,
    status: profile.status,
    networkPolicy: profile.networkPolicy,
    builtAt: profile.builtAt
  };
}

function lineAt(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function constructorParameterTypes(source) {
  const start = source.search(/\bcontract\s+[A-Za-z_][A-Za-z0-9_]*\s*\(/);
  if (start < 0) return [];
  const open = source.indexOf("(", start);
  let depth = 0;
  let close = -1;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")" && --depth === 0) { close = index; break; }
  }
  if (close < 0) return [];
  const parameters = [];
  let current = "";
  let bracketDepth = 0;
  for (const character of source.slice(open + 1, close)) {
    if (character === "[") bracketDepth += 1;
    if (character === "]") bracketDepth -= 1;
    if (character === "," && bracketDepth === 0) {
      if (current.trim()) parameters.push(current.trim());
      current = "";
    } else current += character;
  }
  if (current.trim()) parameters.push(current.trim());
  return parameters.map((parameter) => parameter.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\[(?:\d*)\])*)\s+[A-Za-z_]/)?.[1] || "");
}

function parsedTypeRef(typeName) {
  const base = String(typeName || "").match(/^[A-Za-z_][A-Za-z0-9_]*/)?.[0] || "byte";
  const array_dims = [...String(typeName || "").matchAll(/\[([^\]]*)\]/g)].map((match) => match[1] === ""
    ? { kind: "dynamic" }
    : { kind: "fixed", value: Number(match[1]) });
  return { base, array_dims };
}

function typeNameOf(typeRef = {}) {
  return `${String(typeRef.base || "")}${(typeRef.array_dims || []).map((dimension) => dimension?.kind === "fixed" ? `[${Number(dimension.value)}]` : "[]").join("")}`;
}

function elementTypeName(typeName) {
  const dimensions = [...String(typeName || "").matchAll(/\[([^\]]*)\]/g)];
  if (!dimensions.length) return "";
  const last = dimensions[dimensions.length - 1];
  return `${String(typeName).slice(0, last.index)}${String(typeName).slice(last.index + last[0].length)}`;
}

function encodeTypedExpression(expression, expectedType) {
  if (!expression || typeof expression !== "object" || expression.kind !== "array" || !Array.isArray(expression.data)) return expression;
  const dimensions = [...String(expectedType || "").matchAll(/\[([^\]]*)\]/g)];
  let expressionType = expectedType;
  if (!dimensions.length && ["pubkey", "sig", "datasig"].includes(expectedType)) {
    expressionType = `byte[${expectedType === "pubkey" ? 32 : expectedType === "sig" ? 65 : 64}]`;
  } else if (!dimensions.length) {
    expressionType = `byte[${expression.data.length}]`;
  }
  const childType = elementTypeName(expressionType) || "byte";
  return {
    kind: "array",
    data: {
      type_ref: parsedTypeRef(expressionType),
      values: expression.data.map((item) => encodeTypedExpression(item, childType))
    }
  };
}

export function encodeConstructorArgsForProfile(source, constructorArgs, profileId = config.compiler.defaultProfileId) {
  const profile = compilerProfile(profileId);
  if (Number(profile.syntaxGeneration || 1) < 2) return structuredClone(constructorArgs);
  const types = constructorParameterTypes(source);
  if (types.length !== constructorArgs.length) throw new Error(`Contract declares ${types.length} constructor parameters but ${constructorArgs.length} arguments were supplied`);
  return constructorArgs.map((argument, index) => encodeTypedExpression(argument, types[index]));
}

export function detectBreakingChanges(source, targetProfileId = config.compiler.defaultProfileId) {
  const text = boundedText(source, "contract source");
  const target = compilerProfile(targetProfileId);
  const findings = [];
  for (const change of config.compiler.breakingChanges) {
    if (change.toProfile !== target.id) continue;
    if (!change.pattern) {
      findings.push({ ...change, line: null, detected: true });
      continue;
    }
    const expression = new RegExp(change.pattern, "gm");
    let match;
    while ((match = expression.exec(text))) {
      findings.push({ ...change, line: lineAt(text, match.index), detected: true });
      if (!match[0].length) expression.lastIndex += 1;
    }
  }
  const blockers = findings.filter((finding) => finding.severity === "error");
  return {
    targetProfileId: target.id,
    targetCommit: target.upstreamCommit,
    compatible: blockers.length === 0,
    blockerCount: blockers.length,
    findings,
    manualReviewRequired: findings.some((finding) => ["manual-review", "integration"].includes(finding.severity))
  };
}

export function migrateSourceToProfile(source, targetProfileId = config.compiler.defaultProfileId) {
  let migrated = boundedText(source, "contract source");
  const report = detectBreakingChanges(migrated, targetProfileId);
  const applied = [];
  for (const finding of report.findings) {
    if (!finding.pattern || finding.replacement === null || applied.includes(finding.id)) continue;
    migrated = migrated.replace(new RegExp(finding.pattern, "g"), finding.replacement);
    applied.push(finding.id);
  }
  return {
    source: migrated,
    applied,
    report: detectBreakingChanges(migrated, targetProfileId),
    warning: "Automatic migration only performs unambiguous renames. Review and fully compile the result with realistic arguments."
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function staticAnalyze(source) {
  const text = boundedText(source, "contract source");
  const findings = [];
  const line = (offset) => text.slice(0, offset).split("\n").length;
  const crossTemplate = /validateOutputStateWithTemplate\s*\(\s*([^,\n]+)/g;
  let match;
  while ((match = crossTemplate.exec(text))) {
    const argument = match[1].trim();
    const escaped = escapeRegExp(argument);
    const direct = argument.includes("OpCovOutputIdx");
    const idGuard = new RegExp(`OpOutputCovenantId\\s*\\(\\s*${escaped}\\s*\\)`).test(text);
    const derived = new RegExp(`\\b${escaped}\\s*=\\s*OpCovOutputIdx\\s*\\(`).test(text);
    if (!direct && !idGuard && !derived) {
      findings.push({
        code: "SS001",
        line: line(match.index),
        message: `cross-template output '${argument}' is not visibly bound to a covenant ID`
      });
    }
  }
  const scriptComparison = /scriptPubKey\s*==\s*(?!byte\[\]\s*\()([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)/g;
  while ((match = scriptComparison.exec(text))) {
    findings.push({
      code: "SS002",
      line: line(match.index),
      message: `scriptPubKey comparison with '${match[1]}' may mix byte[] and fixed bytes`
    });
  }
  if (text.includes("termination = allowed")
    && /return\s*\(?\s*next_states\s*\)?\s*;/.test(text)
    && !/next_states\.length\s*==\s*0/.test(text)) {
    findings.push({
      code: "SS003",
      line: line(text.indexOf("termination = allowed")),
      message: "termination path returns caller-supplied state without requiring termination"
    });
  }
  const feeOutput = /tx\.outputs\s*\[\s*fee\w*Index\s*\]/i.exec(text);
  if (feeOutput) {
    findings.push({
      code: "SS004",
      line: line(feeOutput.index),
      message: "review fee-output aliasing across multiple contract executions"
    });
  }
  return {
    kind: "heuristic-triage",
    findings,
    findingCount: findings.length,
    note: "Static pattern triage only; successful output is not compilation or a security proof."
  };
}

export async function compileContract({ source, constructorArgs = [], compilerProfileId = config.compiler.defaultProfileId }) {
  const text = boundedText(source, "contract source");
  if (!Array.isArray(constructorArgs)) throw new Error("constructorArgs must be an array");
  const compiler = compilerManifest(compilerProfileId);
  const canonicalArgs = JSON.stringify(constructorArgs);
  const encodedArgs = JSON.stringify(encodeConstructorArgsForProfile(text, constructorArgs, compiler.id));
  if (Buffer.byteLength(encodedArgs, "utf8") > 200_000) throw new Error("constructorArgs exceed 200KB");
  const analysis = await staticAnalyze(text);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-compile-"));
  const sourceFile = path.join(directory, "contract.sil");
  const argsFile = path.join(directory, "constructor.json");
  try {
    fs.writeFileSync(sourceFile, text, { mode: 0o600 });
    fs.writeFileSync(argsFile, encodedArgs, { mode: 0o600 });
    const { stdout, stderr } = await execFileAsync(compiler.bin, [
      sourceFile,
      "--constructor-args", argsFile,
      "--stdout"
    ], { timeout: 60_000, maxBuffer: 10_000_000 });
    let rawArtifact;
    try { rawArtifact = JSON.parse(stdout); } catch {
      throw Object.assign(new Error("silverc did not return a JSON artifact"), { stderr: String(stderr || "").slice(0, 4000) });
    }
    const bytecode = rawArtifact[compiler.artifactBytecodeField] ?? rawArtifact.bytecode ?? rawArtifact.script;
    if (!Array.isArray(bytecode) || bytecode.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
      throw new Error("silverc artifact has an invalid bytecode array");
    }
    const program = Buffer.from(bytecode);
    return {
      contractName: rawArtifact.contract_name || "",
      compilerVersion: rawArtifact.compiler_version || "",
      abi: rawArtifact.abi || [],
      stateFields: Array.isArray(rawArtifact.ast?.fields) ? rawArtifact.ast.fields.map((field) => ({
        name: String(field.name || ""),
        type_name: typeNameOf(field.type_ref)
      })) : [],
      programHex: program.toString("hex"),
      programSha256: sha256(program),
      sourceSha256: sha256(text),
      constructorArgsSha256: sha256(canonicalArgs),
      compiledAt: new Date().toISOString(),
      compiler,
      compatibility: detectBreakingChanges(text, compiler.id),
      analysis,
      warnings: String(stderr || "").trim().split("\n").filter(Boolean).slice(0, 100)
    };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
