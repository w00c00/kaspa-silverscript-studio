import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { parseAiContract } from "../server/ai-providers.mjs";
import { compileContract, compilerManifest, compilerProfiles, detectBreakingChanges, encodeConstructorArgsForProfile, migrateSourceToProfile, staticAnalyze } from "../server/compiler.mjs";
import { DraftStore } from "../server/draft-store.mjs";
import { publicConfig, SILVERSCRIPT_COMMIT } from "../server/config.mjs";
import { buildDeployDraft, buildWalletTransferDraft, configureNodeAccess, kascovPreflight, setRpcClientFactoryForTests, sompiToKas, toKascovPreflightTransaction, walletBalance } from "../server/kaspa-service.mjs";
import { ProjectStore, SAMPLE_SOURCE } from "../server/project-store.mjs";
import { AiSettingsStore, AppSettingsStore } from "../server/settings-store.mjs";
import { TemplateStore } from "../server/template-store.mjs";
import { WalletService } from "../server/wallet-service.mjs";
import { exportExternalCovenantPackage, finalizeExternalCovenantPackage, inspectExternalCovenantPackage, signExternalCovenantPackage } from "../server/external-covenant-service.mjs";
import { buildTemplateOperationPackage, templateOperations } from "../server/template-operation-service.mjs";
import { clearProjectScopedTransactionState } from "../src/project-transaction-state.js";
import { availableLifecycleOperations, lifecycleInheritanceDistributionAvailable, lifecycleRenewalAvailable } from "../src/lifecycle-presentation.js";
import { operationPresentation } from "../server/operation-metadata.mjs";
import { buildLifecycleStatus, spentLifecycleStatus } from "../server/lifecycle-status.mjs";
import { assertInheritanceDistributionOpen, assertLocalRenewalOpen, assertLocalRenewalPackage } from "../server/local-operation-authorization.mjs";
import { detectPreferredLanguage } from "../src/locale.js";
import { CovenantStateSource, covenantStateProvider, verifyCovenantStateCandidate } from "../server/covenant-state-source.mjs";
import { createP2pkCoSpendAuthorization, selectP2pkFundingUtxo, signP2pkCoSpendPackage } from "../server/p2pk-cospend.mjs";
import { buildAtomicCovenantPackage } from "../server/atomic-covenant-builder.mjs";
import { canonicalKcc721Metadata } from "../src/kcc721-metadata.js";
import { binaryRelativePath, cargoReleaseBinary, executableName } from "../scripts/platform-binaries.mjs";

const require = createRequire(import.meta.url);
const kaspa = require("@kluster/kaspa-wasm");

function byteArray(bytes) {
  return { kind: "array", data: Array.from(bytes, (data) => ({ kind: "byte", data })) };
}

const TEMPLATE_KEYS = [
  "e493dbf1c10d80f3581e4904930b1404cc6c13900ee0758474fa94abe8c4cd13",
  "2f8bde4d1a07209355b4a7250a5c5128e88b84bddc619ab7cba8d569b240efe4",
  "fff97bd5755eeea420453a14355235d382f6472f8568a18b2f057a1460297556",
  "5cbdf0646e5db4eaa398f365f2ea7a0e3d419b7e0330e39ce92bddedcac4f9bc",
  "2f01e5e15cca351daff3843fb70f3c2f0a1bdd05e5af888a67784ef3e10a2a01"
];

function configuredTemplateParameters(template, network = "testnet-10") {
  let addressIndex = 0;
  return Object.fromEntries((template.parameters || []).map((field) => {
    if (field.type === "amount") return [field.id, Number(field.minimum || 0) > 0.15 ? String(field.default || field.minimum) : "0.15"];
    if (field.type === "address") return [field.id, new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[addressIndex++ % TEMPLATE_KEYS.length]).toAddress(network).toString()];
    if (field.type === "datetime") return [field.id, "2035-01-02T03:04:00.000Z"];
    if (field.type === "sha256") return [field.id, "42".repeat(32)];
    if (field.type === "choice") return [field.id, String(field.default || field.options?.[0]?.value || "")];
    if (field.type === "kcc721CollectionId") return [field.id, ""];
    if (field.type === "kcc721Metadata") return [field.id, structuredClone(field.default || { name: "TN10 test NFT", attributes: [] })];
    if (field.type === "integer") {
      const base = Number(field.default ?? field.minimum ?? 0);
      return [field.id, base < Number(field.maximum ?? Number.MAX_SAFE_INTEGER) ? base + 1 : base];
    }
    if (field.type === "durationDays") return [field.id, 181];
    if (field.type === "duration") return [field.id, { value: 181, unit: "days" }];
    if (field.type === "heirs") return [field.id, [
      { address: new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[addressIndex++]).toAddress(network).toString(), shareBps: 6000 },
      { address: new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[addressIndex++]).toAddress(network).toString(), shareBps: 4000 }
    ]];
    throw new Error(`Unsupported test template field: ${field.type}`);
  }));
}

test("language detection respects manual choice, system language and time-zone fallback", () => {
  assert.equal(detectPreferredLanguage({
    storedLanguage: "en",
    languages: ["zh-CN"],
    timeZone: "Asia/Shanghai"
  }), "en");
  assert.equal(detectPreferredLanguage({
    languages: ["zh-TW", "en-US"],
    language: "zh-TW",
    timeZone: "America/Los_Angeles"
  }), "zh");
  assert.equal(detectPreferredLanguage({
    languages: ["en-US", "zh-CN"],
    language: "en-US",
    timeZone: "Asia/Shanghai"
  }), "en");
  assert.equal(detectPreferredLanguage({
    languages: ["ja-JP"],
    language: "ja-JP",
    timeZone: "Asia/Hong_Kong"
  }), "zh");
  assert.equal(detectPreferredLanguage({
    languages: ["fr-FR"],
    language: "fr-FR",
    timeZone: "Europe/Paris"
  }), "en");
});

test("desktop runtime includes server-imported KCC721 metadata code", () => {
  const prepareDesktop = fs.readFileSync(new URL("../scripts/prepare-desktop-runtime.mjs", import.meta.url), "utf8");
  assert.match(prepareDesktop, /src\/kcc721-metadata\.js/);
});

test("desktop helpers use native executable names on Windows and Unix", () => {
  assert.equal(executableName("silverc-latest", "win32"), "silverc-latest.exe");
  assert.equal(executableName("silverc-latest", "linux"), "silverc-latest");
  assert.equal(binaryRelativePath("kascov-preflight", "win32"), "bin/kascov-preflight.exe");
  assert.equal(binaryRelativePath("kascov-preflight", "darwin"), "bin/kascov-preflight");
  assert.equal(cargoReleaseBinary("target", "silverc", "win32"), path.join("target", "release", "silverc.exe"));
  const rustLauncher = fs.readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  assert.match(rustLauncher, /KASCOV_PREFLIGHT_BIN/);
  assert.match(rustLauncher, /cfg!\(windows\)/);
});

test("AI package retains explicit transaction plans and stays experimental", () => {
  const parsed = parseAiContract(JSON.stringify({
    specification: { title: "Counter" },
    transactionPlans: [{ transition: "bump", inputs: [{ role: "counter" }], outputs: [{ role: "next" }] }],
    source: "pragma silverscript ^0.1.0;\ncontract Counter() { entrypoint function bump() { require(true); } }",
    constructorArgs: [],
    review: { riskLevel: "safe" }
  }));
  assert.equal(parsed.transactionPlans[0].transition, "bump");
  assert.equal(parsed.review.riskLevel, "experimental");
});

test("public configuration never exposes provider secrets", () => {
  const serialized = JSON.stringify(publicConfig());
  assert.doesNotMatch(serialized, /apiKey|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  assert.equal(publicConfig().compiler.expectedCommit, SILVERSCRIPT_COMMIT);
});

test("AI settings encrypt API keys and never return them to the UI", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-ai-vault-test-"));
  const apiKey = "test-api-key-that-must-never-be-public";
  const environment = {
    openai: { model: "gpt-test", apiKey: "" },
    anthropic: { model: "", apiKey: "" },
    gemini: { model: "gemini-test", apiKey: "" },
    openrouter: { model: "router-test", apiKey: "" },
    ollama: { model: "local-test", baseUrl: "http://127.0.0.1:11434" },
    compatible: { model: "", apiKey: "", baseUrl: "" }
  };
  try {
    const appSettings = new AppSettingsStore(directory);
    const vault = new AiSettingsStore(directory, environment, () => appSettings.public().aiAutoLockMinutes);
    const status = await vault.save({ providerId: "openai", model: "gpt-test", apiKey, vaultSecret: "long-test-vault-password" });
    assert.equal(status.locked, false);
    assert.equal(status.providers.openai.configured, true);
    assert.doesNotMatch(JSON.stringify(status), /apiKey|sk-test-secret/);
    const stored = fs.readFileSync(vault.file, "utf8");
    assert.doesNotMatch(stored, /sk-test-secret|long-test-vault-password/);
    assert.equal(vault.provider("openai").apiKey, apiKey);
    vault.lock();
    assert.throws(() => vault.provider("openai"), /vault is locked/i);
    await assert.rejects(vault.unlock("wrong-password-value"), /incorrect or the vault is damaged/i);
    await vault.unlock("long-test-vault-password");
    assert.equal(vault.provider("openai").apiKey, apiKey);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("application settings reject secrets and persist only allowlisted preferences", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-settings-test-"));
  try {
    const store = new AppSettingsStore(directory);
    const saved = store.save({
      defaultNetwork: "tn10",
      defaultWalletId: "wallet-example",
      aiAutoLockMinutes: 30,
      tn10RpcUrl: "ws://127.0.0.1:17210",
      walletSecret: "should-not-save"
    });
    assert.equal(saved.aiAutoLockMinutes, 30);
    assert.equal(saved.tn10RpcUrl, "ws://127.0.0.1:17210");
    assert.equal("preferredSigner" in saved, false);
    assert.throws(() => store.save({ mainnetRpcUrl: "https://example.com" }), /ws:\/\/ or wss:\/\//i);
    assert.throws(() => store.save({ mainnetRpcUrl: "wss://user:password@example.com" }), /credentials/i);
    const raw = fs.readFileSync(store.file, "utf8");
    assert.doesNotMatch(raw, /walletSecret|should-not-save/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("projects persist transaction build plans locally", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-project-test-"));
  try {
    const store = new ProjectStore(directory);
    const project = store.create({ name: "Atomic transition" });
    const transactionPlans = [{ transition: "settle", bindings: ["input 0 -> output 0 covenant id"] }];
    store.save(project.id, { transactionPlans });
    assert.deepEqual(store.get(project.id).transactionPlans, transactionPlans);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("projects can be deleted without creating a replacement", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-project-delete-test-"));
  try {
    const store = new ProjectStore(directory);
    const project = store.create({ name: "Disposable local work" });
    assert.equal(store.list().length, 1);
    assert.equal(store.remove(project.id), true);
    assert.equal(store.get(project.id), null);
    assert.equal(store.list().length, 0);
    assert.equal(store.remove(project.id), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("switching project context clears portable packages and lifecycle invitations", () => {
  const workspace = {
    externalPackage: { transactionSafeJson: "stale multisig transaction" },
    externalReview: { covenantId: "98a26a64", signatureSlots: [{ signed: false }, { signed: false }] },
    lifecycleOperations: [{ id: "spend", signers: true }],
    lifecycleInviteProjectId: "old-multisig-project",
    unrelatedPreference: "keep"
  };
  const result = clearProjectScopedTransactionState(workspace);
  assert.equal(result, workspace);
  assert.equal(workspace.externalPackage, null);
  assert.equal(workspace.externalReview, null);
  assert.deepEqual(workspace.lifecycleOperations, []);
  assert.equal(workspace.lifecycleInviteProjectId, "");
  assert.equal(workspace.unrelatedPreference, "keep");

  const uiSource = fs.readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(uiSource, /function loadProjectIntoUi\(project\) \{\s+resetProjectScopedTransactionWorkspace\(\);/);
  assert.match(uiSource, /function showNoProject\(\)[\s\S]*?resetProjectScopedTransactionWorkspace\(\);/);
});

test("a deterministic template can replace a local work without AI and clears stale evidence", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-template-apply-test-"));
  try {
    const store = new ProjectStore(directory);
    const templates = new TemplateStore();
    const template = templates.list()[0];
    const project = store.create({ name: "Custom draft" });
    store.save(project.id, { artifact: { programSha256: "stale" }, deployment: { txid: "already-broadcast" } });
    const parameters = configuredTemplateParameters(template);
    const applied = store.save(project.id, { ...templates.projectInput(template.id, "tn10", parameters), artifact: null, deployment: null });
    assert.equal(applied.id, project.id);
    assert.equal(applied.review.templateId, template.id);
    assert.equal(applied.source, template.source);
    assert.equal(applied.deployAmount, "0.15");
    assert.deepEqual(applied.templateParameters, parameters);
    assert.equal(applied.artifact, null);
    assert.equal(applied.deployment, null);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("human template fields deterministically produce compile-ready constructor arguments", async () => {
  const templates = new TemplateStore();
  for (const template of templates.list()) {
    const parameters = configuredTemplateParameters(template);
    const input = templates.projectInput(template.id, "tn10", parameters);
    assert.equal(input.deployAmount, parameters.amountKas || "0.15");
    if (template.id === "kcc721-experimental") {
      assert.equal(input.templateParameters.collectionMode, "preview");
      assert.equal(input.templateParameters.collectionId, null);
      assert.equal(input.templateParameters.metadata.name, parameters.metadata.name);
      assert.match(input.templateParameters.metadata.digest, /^[0-9a-f]{64}$/);
    } else {
      assert.deepEqual(input.templateParameters, parameters);
    }
    for (const index of template.requiredReplacements || []) assert.notDeepEqual(input.constructorArgs[index], template.constructorArgs[index]);
    const artifact = await compileContract(input);
    assert.ok(artifact.programHex.length > 0, template.id);
  }
});

test("template fields reject wrong-network and duplicate authorization wallets", () => {
  const templates = new TemplateStore();
  const owner = templates.get("owner-vault");
  const ownerParameters = configuredTemplateParameters(owner);
  ownerParameters.ownerAddress = new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[0]).toAddress("mainnet").toString();
  let wrongNetwork;
  try { templates.projectInput(owner.id, "tn10", ownerParameters); } catch (error) { wrongNetwork = error; }
  assert.match(wrongNetwork?.message || "", /not on Kaspa Testnet 10/i);
  assert.equal(wrongNetwork.status, 400);

  const multisig = templates.get("two-of-three");
  const multisigParameters = configuredTemplateParameters(multisig);
  multisigParameters.key3Address = multisigParameters.key1Address;
  let duplicates;
  try { templates.projectInput(multisig.id, "tn10", multisigParameters); } catch (error) { duplicates = error; }
  assert.match(duplicates?.message || "", /must be different/i);
  assert.equal(duplicates.status, 400);

  const inheritance = templates.get("inheritance-vault");
  const inheritanceParameters = configuredTemplateParameters(inheritance);
  inheritanceParameters.inheritors[1].address = inheritanceParameters.inheritors[0].address;
  assert.throws(() => templates.projectInput(inheritance.id, "tn10", inheritanceParameters), /must be different/i);
  inheritanceParameters.inheritors[1].address = new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[4]).toAddress("testnet-10").toString();
  inheritanceParameters.inheritors[1].shareBps = 3999;
  assert.throws(() => templates.projectInput(inheritance.id, "tn10", inheritanceParameters), /total exactly 100%/i);
  inheritanceParameters.inheritors[1].shareBps = 4000;
  inheritanceParameters.inheritors[0].address = inheritanceParameters.ownerAddress;
  assert.throws(() => templates.projectInput(inheritance.id, "tn10", inheritanceParameters), /different from the owner/i);
});

test("templates expose bilingual examples and flexible TN10 duration units", () => {
  const templates = new TemplateStore();
  for (const template of templates.list()) {
    assert.ok(template.example?.titleZh, `${template.id} Chinese example`);
    assert.ok(template.example?.titleEn, `${template.id} English example`);
    assert.ok(template.example?.stepsZh?.length >= 3, `${template.id} example steps`);
  }
  const inheritance = templates.get("inheritance-vault");
  const parameters = configuredTemplateParameters(inheritance);
  parameters.inactivityDays = { value: 1, unit: "minutes" };
  const tn10 = templates.projectInput(inheritance.id, "tn10", parameters);
  assert.equal(tn10.constructorArgs[3].data, 600);
  assert.equal(tn10.review.parameterEncodingVersion, 2);
  assert.deepEqual(tn10.templateParameters.inactivityDays, { value: 1, unit: "minutes" });
  const legacy = templates.projectInput(inheritance.id, "tn10", parameters, { encodingVersion: 1 });
  assert.equal(legacy.constructorArgs[3].data, 60);
  const mainnetParameters = configuredTemplateParameters(inheritance, "mainnet");
  mainnetParameters.inactivityDays = { value: 1, unit: "minutes" };
  assert.throws(() => templates.projectInput(inheritance.id, "mainnet", mainnetParameters), /from 86400/i);
  parameters.inactivityDays = { value: 2, unit: "hours" };
  const hours = templates.projectInput(inheritance.id, "tn10", parameters);
  assert.equal(hours.constructorArgs[3].data, 72000);
});

test("operation packages are recognized without treating provenance as authorization", () => {
  const renewal = operationPresentation({
    templateId: "inheritance-vault",
    entrypoint: "checkIn",
    signatureSlots: [{ signed: false }],
    outputs: [{ covenantId: "aa".repeat(32) }],
    covenantId: "aa".repeat(32)
  });
  assert.equal(renewal.kind, "renewal");
  assert.equal(renewal.continuation, true);
  assert.equal(renewal.signaturesRequired, 1);
  const unknown = operationPresentation({ templateId: "outside", entrypoint: "release" });
  assert.equal(unknown.kind, "external");
});

test("phrase-free local renewal requires the exact TN10 project, artifact, outpoint and same-covenant continuation", () => {
  const txid = "11".repeat(32);
  const covenantId = "22".repeat(32);
  const programSha256 = "33".repeat(32);
  const sourceSha256 = "44".repeat(32);
  const compilerCommit = "55".repeat(20);
  const project = {
    id: "local-renewal",
    network: "tn10",
    review: { templateId: "inheritance-vault" },
    deployment: { txid, covenantId },
    artifact: { programSha256, sourceSha256, compiler: { upstreamCommit: compilerCommit } }
  };
  const inspected = {
    package: {
      network: "tn10",
      provenance: {
        kind: "silverstudio-template-operation",
        projectId: project.id,
        templateId: "inheritance-vault",
        operationId: "checkIn",
        sourceSha256,
        compilerCommit
      }
    },
    review: {
      entrypoint: "checkIn",
      operation: { kind: "renewal", continuation: true },
      feeSompi: "1000000",
      outputCount: 1,
      outputs: [{ covenantId }],
      covenantId,
      programSha256,
      inputOutpoint: { transactionId: txid, index: 0 }
    }
  };
  assert.equal(assertLocalRenewalPackage(project, inspected), true);
  const counterfeit = structuredClone(inspected);
  counterfeit.review.outputs[0].covenantId = "66".repeat(32);
  assert.throws(() => assertLocalRenewalPackage(project, counterfeit), /exactly one same-covenant/i);
  const stale = structuredClone(inspected);
  stale.review.inputOutpoint.transactionId = "77".repeat(32);
  assert.throws(() => assertLocalRenewalPackage(project, stale), /current local project UTXO/i);
});

test("inheritance lifecycle reports exact DAA target and legacy time mismatch", () => {
  const project = {
    network: "tn10",
    review: { templateId: "inheritance-vault", parameterEncodingVersion: 1 },
    templateParameters: { inactivityDays: { value: 5, unit: "minutes" } },
    constructorArgs: [{}, {}, {}, { kind: "int", data: 300 }],
    deployment: { txid: "11".repeat(32), covenantId: "22".repeat(32), broadcastAt: "2026-07-23T04:28:35.770Z" }
  };
  const source = {
    covenantId: project.deployment.covenantId,
    entry: {
      outpoint: { transactionId: project.deployment.txid, index: 0 },
      entry: { amount: 15_000_000n, blockDaaScore: 524220100n }
    }
  };
  const status = buildLifecycleStatus(project, source, { virtualDaaScore: "524220250" }, Date.parse("2026-07-23T04:28:35.770Z"));
  assert.equal(status.schedule.targetDaaScore, "524220400");
  assert.equal(status.schedule.remainingDaa, "150");
  assert.equal(status.schedule.approximateRemainingSeconds, 15);
  assert.equal(status.schedule.approximateActualSeconds, 30);
  assert.equal(status.schedule.configuredSeconds, 300);
  assert.equal(status.schedule.mismatch, true);
});

test("inheritance renewal closes and distribution opens exactly at the maturity DAA boundary", () => {
  const project = {
    network: "tn10",
    review: { templateId: "inheritance-vault", parameterEncodingVersion: 2 },
    templateParameters: { inactivity: { value: 1, unit: "minutes" } },
    constructorArgs: [{}, {}, {}, { kind: "int", data: 600 }],
    deployment: { txid: "33".repeat(32), covenantId: "44".repeat(32) }
  };
  const source = {
    covenantId: project.deployment.covenantId,
    entry: {
      outpoint: { transactionId: project.deployment.txid, index: 0 },
      entry: { amount: 100_000_000n, blockDaaScore: 1_000n }
    }
  };
  const operations = [{ id: "checkIn" }, { id: "recover" }, { id: "inherit" }];
  const active = buildLifecycleStatus(project, source, { virtualDaaScore: "1599" });
  const expired = buildLifecycleStatus(project, source, { virtualDaaScore: "1600" });

  assert.equal(active.schedule.mature, false);
  assert.equal(lifecycleRenewalAvailable(active, project.review.templateId), true);
  assert.equal(lifecycleInheritanceDistributionAvailable(active, project.review.templateId), false);
  assert.deepEqual(availableLifecycleOperations(operations, active), [{ id: "checkIn" }, { id: "recover" }]);
  assert.throws(
    () => assertInheritanceDistributionOpen(active),
    (error) => error.code === "INHERITANCE_NOT_MATURE" && error.status === 409
  );

  assert.equal(expired.status, "mature");
  assert.equal(expired.schedule.mature, true);
  assert.equal(lifecycleRenewalAvailable(expired, project.review.templateId), false);
  assert.equal(lifecycleInheritanceDistributionAvailable(expired, project.review.templateId), true);
  assert.deepEqual(availableLifecycleOperations(operations, expired), [{ id: "recover" }, { id: "inherit" }]);
  assert.equal(assertInheritanceDistributionOpen(expired), true);
  assert.throws(() => assertLocalRenewalOpen(expired), /expired and can no longer be renewed/i);

  const spent = spentLifecycleStatus(project);
  assert.equal(lifecycleInheritanceDistributionAvailable(spent, project.review.templateId), false);
  assert.deepEqual(availableLifecycleOperations(operations, spent), []);
  assert.throws(
    () => assertInheritanceDistributionOpen(spent),
    (error) => error.code === "INHERITANCE_ALREADY_SPENT" && error.status === 409
  );
});

test("configured inheritance permits a legitimate 50/50 split that matches the example values", () => {
  const templates = new TemplateStore();
  const template = templates.get("inheritance-vault");
  const parameters = configuredTemplateParameters(template);
  parameters.inheritors[0].shareBps = 5000;
  parameters.inheritors[1].shareBps = 5000;
  const configured = templates.projectInput(template.id, "tn10", parameters);
  assert.deepEqual(configured.constructorArgs[2], template.constructorArgs[2]);
  const project = {
    ...configured,
    review: { ...configured.review, templateId: template.id, configured: true }
  };
  assert.deepEqual(templates.deploymentBlockedReasons(template.id, {
    source: configured.source,
    constructorArgs: configured.constructorArgs,
    project
  }), []);

  const drifted = structuredClone(configured.constructorArgs);
  drifted[3] = { kind: "int", data: 600 };
  assert.deepEqual(templates.deploymentBlockedReasons(template.id, {
    source: configured.source,
    constructorArgs: drifted,
    project
  }), ["Configured template source or constructor arguments changed; re-apply the template before deployment"]);
});

test("mature inheritance builds a complete unsigned distribution that conserves the covenant value", async () => {
  const templates = new TemplateStore();
  const template = templates.get("inheritance-vault");
  const configured = templates.projectInput(template.id, "tn10", configuredTemplateParameters(template));
  const artifact = await compileContract(configured);
  const covenantId = "99".repeat(32);
  const project = {
    id: "mature-inheritance-distribution",
    ...configured,
    artifact,
    deployment: { txid: "88".repeat(32), covenantId, network: "tn10" },
    review: { ...configured.review, templateId: template.id }
  };
  const p2sh = kaspa.payToScriptHashScript(artifact.programHex);
  const p2shAddress = kaspa.addressFromScriptPublicKey(p2sh, "testnet-10").toString();
  const holder = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify({
    id: "00".repeat(32),
    version: 1,
    inputs: [{
      transactionId: "88".repeat(32),
      index: 0,
      sequence: "0",
      sigOpCount: 0,
      computeBudget: 0,
      signatureScript: "",
      utxo: {
        address: p2shAddress,
        amount: "50000000",
        scriptPublicKey: `0000${p2sh.script}`,
        blockDaaScore: "1000",
        isCoinbase: false,
        covenantId
      }
    }],
    outputs: [{
      value: "1",
      scriptPublicKey: `0000${kaspa.payToAddressScript(configured.templateParameters.ownerAddress).script}`,
      covenant: null
    }],
    subnetworkId: "00".repeat(20),
    lockTime: "0",
    gas: "0",
    storageMass: "0",
    payload: ""
  }));
  const lookup = async () => ({ entry: holder.inputs[0].utxo, address: p2shAddress, covenantId });
  const preflight = async () => ({ ok: true, verdict: "ready", stage: "draft" });

  const built = await buildTemplateOperationPackage(
    { operationId: "inherit", feeKas: "0.01" },
    project,
    template,
    lookup,
    preflight
  );

  assert.equal(built.review.entrypoint, "inherit");
  assert.equal(built.review.operation.kind, "inheritance-payment");
  assert.equal(built.review.complete, true);
  assert.deepEqual(built.review.signatureSlots, []);
  assert.deepEqual(built.review.outputs.map((output) => output.valueSompi), ["29400000", "19600000"]);
  assert.deepEqual(
    built.review.outputs.map((output) => output.address),
    configured.templateParameters.inheritors.map((inheritor) => inheritor.address.toLowerCase())
  );
  assert.equal(
    built.review.outputs.reduce((total, output) => total + BigInt(output.valueSompi), 0n),
    49_000_000n
  );
  assert.equal(
    JSON.parse(built.package.transactionSafeJson).inputs[0].sequence,
    String(configured.constructorArgs[3].data)
  );

  const invalidProject = structuredClone(project);
  invalidProject.templateParameters.inheritors[1].shareBps = 3999;
  await assert.rejects(
    buildTemplateOperationPackage(
      { operationId: "inherit", feeKas: "0.01" },
      invalidProject,
      template,
      lookup,
      preflight
    ),
    /total exactly 100%/i
  );
});

test("pinned official compiler fully compiles the sample contract", async () => {
  const manifest = compilerManifest();
  assert.equal(manifest.upstreamCommit, SILVERSCRIPT_COMMIT);
  const owner = byteArray(new Uint8Array(32).fill(2));
  const artifact = await compileContract({ source: SAMPLE_SOURCE, constructorArgs: [owner] });
  assert.equal(artifact.contractName, "OwnerVault");
  assert.equal(artifact.compiler.upstreamCommit, SILVERSCRIPT_COMMIT);
  assert.match(artifact.programSha256, /^[0-9a-f]{64}$/);
  assert.equal(artifact.analysis.findingCount, 0);
});

test("compiler profiles detect and safely migrate known upstream breaking changes", async () => {
  const legacySource = `pragma silverscript ^0.1.0;
contract Compatibility(pubkey owner) {
  entrypoint function spend(sig signature) {
    require(checkSig(signature, owner));
  }
}`;
  const profiles = compilerProfiles();
  assert.deepEqual(profiles.map((profile) => profile.id), ["latest-4b0e1cd", "legacy-2a3961c"]);
  assert.ok(profiles.every((profile) => profile.configured));
  const report = detectBreakingChanges(`${legacySource}\n// checkSigFromStack and tx.inputs[0].outpointTransactionHash.reverse()`, "latest-4b0e1cd");
  assert.equal(report.compatible, false);
  assert.ok(report.findings.some((finding) => finding.id === "entry-syntax" && finding.line === 3));
  assert.ok(report.findings.some((finding) => finding.id === "reverse-removed" && finding.replacement === null));
  const migrated = migrateSourceToProfile(legacySource, "latest-4b0e1cd");
  assert.deepEqual(migrated.applied, ["entry-syntax"]);
  assert.equal(migrated.report.compatible, true);
  const owner = byteArray(new Uint8Array(32).fill(3));
  const legacyArtifact = await compileContract({ source: legacySource, constructorArgs: [owner], compilerProfileId: "legacy-2a3961c" });
  const latestArtifact = await compileContract({ source: migrated.source, constructorArgs: [owner], compilerProfileId: "latest-4b0e1cd" });
  assert.equal(legacyArtifact.compiler.artifactBytecodeField, "script");
  assert.equal(latestArtifact.compiler.artifactBytecodeField, "bytecode");
  const encoded = encodeConstructorArgsForProfile(migrated.source, [owner], "latest-4b0e1cd");
  assert.equal(encoded[0].data.type_ref.base, "byte");
  assert.deepEqual(encoded[0].data.type_ref.array_dims, [{ kind: "fixed", value: 32 }]);
});

test("CovenantStateSource rejects false matches, records fallback and fails on ambiguity", async () => {
  const request = { covenantId: "11".repeat(32), script: "aa55" };
  const valid = (txByte, amount = 10_000n) => ({
    outpoint: { transactionId: txByte.repeat(32), index: 0 },
    entry: { amount, scriptPublicKey: { script: "aa55" }, covenantId: request.covenantId, isCoinbase: false }
  });
  assert.equal(verifyCovenantStateCandidate(valid("22"), request).amount, 10_000n);
  assert.throws(() => verifyCovenantStateCandidate({ ...valid("22"), entry: { ...valid("22").entry, covenantId: "33".repeat(32) } }, request), (error) => error.code === "COVENANT_ID_MISMATCH");
  const source = new CovenantStateSource([
    covenantStateProvider("broken-provider", async () => { throw new Error("offline"); }),
    covenantStateProvider("wrong-provider", async () => [{ ...valid("22"), entry: { ...valid("22").entry, scriptPublicKey: { script: "ffff" } } }]),
    covenantStateProvider("verified-provider", async () => [valid("44")])
  ]);
  const resolved = await source.resolve(request);
  assert.equal(resolved.provider, "verified-provider");
  assert.equal(resolved.verified, true);
  assert.ok(resolved.attempts.some((attempt) => attempt.provider === "broken-provider" && /offline/.test(attempt.error)));
  assert.ok(resolved.attempts.some((attempt) => attempt.rejected === "COVENANT_SCRIPT_MISMATCH"));
  await assert.rejects(
    new CovenantStateSource([covenantStateProvider("ambiguous-provider", async () => [valid("55"), valid("66")])]).resolve(request),
    (error) => error.code === "AMBIGUOUS_COVENANT_UTXO"
  );
});

test("external covenant packages bind the P2SH program, covenant id, ABI slot, fee and local signature", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-external-covenant-test-"));
  const originalFetch = globalThis.fetch;
  try {
    const wallets = new WalletService(directory);
    const created = await wallets.create({ title: "External signer", walletSecret: "test-wallet-password" });
    const unlocked = await wallets.unlock({ walletId: created.wallet.id, walletSecret: "test-wallet-password", network: "tn10" });
    const artifact = await compileContract({ source: SAMPLE_SOURCE, constructorArgs: [byteArray(Buffer.from(unlocked.publicKey, "hex"))] });
    const p2sh = kaspa.payToScriptHashScript(artifact.programHex);
    const p2shAddress = kaspa.addressFromScriptPublicKey(p2sh, "testnet-10").toString();
    const covenantId = "33".repeat(32);
    const transactionSafeJson = JSON.stringify({
      id: "00".repeat(32),
      version: 1,
      inputs: [{
        transactionId: "22".repeat(32), index: 0, sequence: "0", sigOpCount: 0, computeBudget: 120, signatureScript: "",
        utxo: { address: p2shAddress, amount: "10000000", scriptPublicKey: `0000${p2sh.script}`, blockDaaScore: "0", isCoinbase: false, covenantId }
      }],
      outputs: [{ value: "9999000", scriptPublicKey: `0000${kaspa.payToAddressScript(unlocked.address).script}`, covenant: null }],
      subnetworkId: "00".repeat(20), lockTime: "0", gas: "0", storageMass: "0", payload: ""
    });
    const packageValue = {
      version: 1,
      network: "tn10",
      transactionSafeJson,
      covenantInput: {
        index: 0,
        covenantId,
        programHex: artifact.programHex,
        abi: artifact.abi,
        entrypoint: "spend",
        arguments: [{ kind: "signature", publicKey: unlocked.publicKey }]
      }
    };
    const inspected = inspectExternalCovenantPackage(packageValue);
    assert.equal(inspected.review.covenantId, covenantId);
    assert.equal(inspected.review.feeSompi, "1000");
    assert.equal(inspected.review.signatureSlots[0].signed, false);
    const exported = exportExternalCovenantPackage(packageValue, path.join(directory, "downloads"));
    assert.match(exported.filename, /^silverscript-[0-9a-f]{12}\.ssinvite$/);
    assert.deepEqual(JSON.parse(fs.readFileSync(exported.file, "utf8")), inspected.package);
    globalThis.fetch = async (url) => {
      if (String(url).includes("/preflight")) return new Response(JSON.stringify({ ok: true, verdict: "ready", findings: [], executed: [{ pass: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      throw new Error(`Unexpected URL: ${url}`);
    };
    const signed = await signExternalCovenantPackage({
      package: packageValue,
      walletId: created.wallet.id,
      walletSecret: "test-wallet-password",
      publicKey: unlocked.publicKey,
      confirmation: "SIGN REVIEWED EXTERNAL COVENANT"
    }, wallets);
    assert.equal(signed.remainingSignatureSlots, 0);
    assert.equal(signed.review.complete, true);
    assert.equal(signed.preflight.verdict, "ready");
    assert.match(signed.package.covenantInput.arguments[0].hex, /^[0-9a-f]{130}$/);
    const signedTransaction = JSON.parse(signed.package.transactionSafeJson);
    assert.ok(signedTransaction.inputs[0].signatureScript.length > artifact.programHex.length);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("P2PK co-spend authorization and atomic multi-covenant builder bind wallet, inputs, covenant IDs and fee", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-atomic-cospend-test-"));
  try {
    const wallets = new WalletService(directory);
    const created = await wallets.create({ title: "Atomic owner", walletSecret: "atomic-wallet-password" });
    const owner = await wallets.unlock({ walletId: created.wallet.id, walletSecret: "atomic-wallet-password", network: "tn10" });
    const source = `pragma silverscript ^0.1.0;
contract AtomicCell() { entry spend() { require(true); } }`;
    const artifact = await compileContract({ source, constructorArgs: [] });
    const p2sh = kaspa.payToScriptHashScript(artifact.programHex);
    const p2shAddress = kaspa.addressFromScriptPublicKey(p2sh, "testnet-10").toString();
    const covenantUtxo = (txByte, amount, covenantId) => ({
      address: p2shAddress,
      outpoint: { transactionId: txByte.repeat(32), index: 0 },
      amount,
      scriptPublicKey: p2sh,
      blockDaaScore: 100n,
      isCoinbase: false,
      covenantId
    });
    const p2pkScript = kaspa.payToAddressScript(owner.address);
    const fundingUtxos = [
      { address: owner.address, outpoint: { transactionId: "77".repeat(32), index: 0 }, amount: 9_000_000n, scriptPublicKey: p2pkScript, blockDaaScore: 10n, isCoinbase: false },
      { address: owner.address, outpoint: { transactionId: "88".repeat(32), index: 0 }, amount: 5_000_000n, scriptPublicKey: p2pkScript, blockDaaScore: 10n, isCoinbase: false },
      { address: owner.address, outpoint: { transactionId: "99".repeat(32), index: 0 }, amount: 4_000_000n, scriptPublicKey: p2pkScript, blockDaaScore: 0n, isCoinbase: false }
    ];
    const selected = selectP2pkFundingUtxo(fundingUtxos, 4_000_000n);
    assert.equal(selected.amount, 5_000_000n);
    const authorization = createP2pkCoSpendAuthorization({
      network: "tn10",
      address: owner.address,
      publicKey: owner.publicKey,
      utxo: selected,
      inputIndex: 2
    });
    const inputs = [
      { utxo: covenantUtxo("11", 12_000_000n, "aa".repeat(32)), programHex: artifact.programHex, abi: artifact.abi, entrypoint: "spend", arguments: [] },
      { utxo: covenantUtxo("22", 13_000_000n, "bb".repeat(32)), programHex: artifact.programHex, abi: artifact.abi, entrypoint: "spend", arguments: [] }
    ];
    const pkg = buildAtomicCovenantPackage({
      network: "tn10",
      covenantInputs: inputs,
      p2pkAuthorization: authorization,
      outputs: [{ address: owner.address, valueSompi: "29000000" }],
      feeSompi: "1000000",
      provenance: { templateId: "kcc721-experimental", operationId: "transfer" }
    });
    const inspected = inspectExternalCovenantPackage(pkg);
    assert.equal(inspected.review.atomic, true);
    assert.deepEqual(inspected.review.targetInputIndexes, [0, 1]);
    assert.equal(inspected.review.p2pkAuthorization.signed, false);
    assert.equal(inspected.review.complete, false);
    const signed = await signP2pkCoSpendPackage({
      package: inspected.package,
      walletId: created.wallet.id,
      walletSecret: "atomic-wallet-password",
      confirmation: "SIGN REVIEWED P2PK CO-SPEND"
    }, wallets);
    const signedReview = inspectExternalCovenantPackage(signed.package);
    assert.equal(signedReview.review.p2pkAuthorization.signed, true);
    assert.equal(signedReview.review.complete, true);
    const signedTransaction = JSON.parse(signed.package.transactionSafeJson);
    assert.equal(signedTransaction.inputs[0].signatureScript, "");
    assert.equal(signedTransaction.inputs[1].signatureScript, "");
    assert.ok(signedTransaction.inputs[2].signatureScript.length > 0);

    const duplicate = inputs.map((item) => ({ ...item, utxo: { ...item.utxo } }));
    duplicate[1].utxo.covenantId = duplicate[0].utxo.covenantId;
    assert.throws(() => buildAtomicCovenantPackage({ network: "tn10", covenantInputs: duplicate, outputs: [{ address: owner.address, valueSompi: "24000000" }], feeSompi: "1000000" }), /one live input per covenant ID/i);
    assert.throws(() => buildAtomicCovenantPackage({ network: "tn10", covenantInputs: inputs, outputs: [{ address: owner.address, valueSompi: "24000000" }], feeSompi: "999999" }), /explicit fee/i);
    const wrongNetwork = new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[0]).toAddress("mainnet").toString();
    assert.throws(() => buildAtomicCovenantPackage({ network: "tn10", covenantInputs: inputs, outputs: [{ address: wrongNetwork, valueSompi: "24000000" }], feeSompi: "1000000" }), /wrong network/i);
    const forged = structuredClone(pkg);
    forged.p2pkAuthorization.inputIndex = 0;
    assert.throws(() => inspectExternalCovenantPackage(forged), /cannot point at a covenant input/i);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("Merkle one-time claim and commit/reveal builders verify proofs before producing signing packages", async () => {
  const templates = new TemplateStore();
  const claimantKey = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  const claimantAddress = new kaspa.XOnlyPublicKey(claimantKey).toAddress("testnet-10").toString();
  const refundAddress = new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[1]).toAddress("testnet-10").toString();
  const claimId = "a1".repeat(32);
  const salt = "b2".repeat(32);
  const merkleRoot = crypto.createHash("sha256").update(Buffer.concat([
    Buffer.from(claimantKey, "hex"), Buffer.from(claimId, "hex"), Buffer.from(salt, "hex")
  ])).digest("hex");
  const timeout = new Date(Date.now() + 3_600_000).toISOString();
  const merkleTemplate = templates.get("merkle-one-time-claim");
  const merkleInput = templates.projectInput(merkleTemplate.id, "tn10", {
    amountKas: "0.5",
    claimantAddress,
    refundAddress,
    merkleRoot,
    leafIndex: 0,
    claimId,
    timeout
  });
  const merkleArtifact = await compileContract(merkleInput);

  const domain = "c3".repeat(32);
  const payloadHex = Buffer.from("verified delivery", "utf8").toString("hex");
  const revealSalt = "d4".repeat(32);
  const commitment = crypto.createHash("sha256").update(Buffer.concat([
    Buffer.from(domain, "hex"), Buffer.from(payloadHex, "hex"), Buffer.from(revealSalt, "hex")
  ])).digest("hex");
  const commitTemplate = templates.get("commit-reveal");
  const commitInput = templates.projectInput(commitTemplate.id, "tn10", {
    amountKas: "0.5",
    senderAddress: refundAddress,
    recipientAddress: claimantAddress,
    domain,
    commitment,
    timeout
  });
  const commitArtifact = await compileContract(commitInput);

  async function build(projectInput, artifact, template, operationInput, covenantByte) {
    const covenantId = covenantByte.repeat(32);
    const p2sh = kaspa.payToScriptHashScript(artifact.programHex);
    const p2shAddress = kaspa.addressFromScriptPublicKey(p2sh, "testnet-10").toString();
    const project = {
      id: `proof-${template.id}`,
      ...projectInput,
      artifact,
      deployment: { txid: "ee".repeat(32), covenantId, network: "tn10" },
      review: { ...projectInput.review, templateId: template.id }
    };
    const holder = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify({
      id: "00".repeat(32), version: 1,
      inputs: [{ transactionId: "ee".repeat(32), index: 0, sequence: "0", sigOpCount: 0, computeBudget: 0, signatureScript: "", utxo: { address: p2shAddress, amount: "50000000", scriptPublicKey: `0000${p2sh.script}`, blockDaaScore: "0", isCoinbase: false, covenantId } }],
      outputs: [{ value: "1", scriptPublicKey: `0000${kaspa.payToAddressScript(claimantAddress).script}`, covenant: null }],
      subnetworkId: "00".repeat(20), lockTime: "0", gas: "0", storageMass: "0", payload: ""
    }));
    const lookup = async () => ({ entry: holder.inputs[0].utxo, address: p2shAddress, covenantId });
    const preflight = async () => ({ ok: true, verdict: "ready", stage: "draft" });
    return buildTemplateOperationPackage(operationInput, project, template, lookup, preflight);
  }

  const merklePackage = await build(merkleInput, merkleArtifact, merkleTemplate, {
    operationId: "claim", proofHex: "", saltHex: salt, feeKas: "0.01"
  }, "91");
  assert.equal(merklePackage.review.operation.kind, "merkle-claim");
  assert.equal(merklePackage.review.signatureSlots[0].publicKey, claimantKey);
  await assert.rejects(
    build(merkleInput, merkleArtifact, merkleTemplate, { operationId: "claim", proofHex: "", saltHex: "00".repeat(32), feeKas: "0.01" }, "92"),
    (error) => error.code === "MERKLE_PROOF_MISMATCH"
  );

  const revealPackage = await build(commitInput, commitArtifact, commitTemplate, {
    operationId: "reveal", payloadHex, saltHex: revealSalt, feeKas: "0.01"
  }, "93");
  assert.equal(revealPackage.review.operation.kind, "commit-reveal");
  assert.equal(revealPackage.review.signatureSlots[0].publicKey, claimantKey);
  await assert.rejects(
    build(commitInput, commitArtifact, commitTemplate, { operationId: "reveal", payloadHex: "ff", saltHex: revealSalt, feeKas: "0.01" }, "94"),
    (error) => error.code === "COMMITMENT_MISMATCH"
  );

  const claimantPrivateKey = new kaspa.PrivateKey("01".padStart(64, "0"));
  const originalFetch = globalThis.fetch;
  function finalizeWithClaimantSignature(built, signatureIndex, mutate = null) {
    const pkg = structuredClone(built.package);
    const transaction = kaspa.Transaction.deserializeFromSafeJSON(pkg.transactionSafeJson);
    const encoded = String(kaspa.createInputSignature(transaction, 0, claimantPrivateKey, 1)).toLowerCase();
    pkg.covenantInput.arguments[signatureIndex].hex = /^41[0-9a-f]{130}$/.test(encoded) ? encoded.slice(2) : encoded;
    mutate?.(pkg.covenantInput.arguments);
    return finalizeExternalCovenantPackage(pkg).package.transactionSafeJson;
  }
  try {
    globalThis.fetch = async () => { throw new Error("all websites unavailable"); };
    let validMerkle;
    const validMerkleJson = finalizeWithClaimantSignature(merklePackage, 2);
    try { validMerkle = await kascovPreflight(validMerkleJson, "tn10", "signed"); }
    catch (error) { throw new Error(`Valid Merkle execution failed: ${JSON.stringify(error.report || error.message)}`); }
    assert.equal(validMerkle.verdict, "ready");
    assert.equal(validMerkle.provider, "local");
    await assert.rejects(
      kascovPreflight(finalizeWithClaimantSignature(merklePackage, 2, (args) => { args[1].hex = "00".repeat(32); }), "tn10", "signed"),
      (error) => error.code === "PREFLIGHT_REJECTED"
    );
    const validReveal = await kascovPreflight(finalizeWithClaimantSignature(revealPackage, 2), "tn10", "signed");
    assert.equal(validReveal.verdict, "ready");
    await assert.rejects(
      kascovPreflight(finalizeWithClaimantSignature(revealPackage, 2, (args) => { args[0].hex = "ff"; }), "tn10", "signed"),
      (error) => error.code === "PREFLIGHT_REJECTED"
    );
  } finally {
    globalThis.fetch = originalFetch;
    try { claimantPrivateKey.free(); } catch {}
  }
});

test("TN10 Experimental KCC721 pack compiles all pinned contracts and blocks standalone or mainnet deployment", async () => {
  const templates = new TemplateStore();
  const pack = templates.get("kcc721-experimental");
  assert.equal(pack.experimentalOnly, true);
  assert.deepEqual(pack.networkAllowlist, ["tn10"]);
  assert.equal(pack.packContracts.length, 4);
  const compiled = new Map();
  for (const contract of pack.packContracts) {
    const artifact = await compileContract({ source: contract.source, constructorArgs: contract.constructorArgs, compilerProfileId: pack.compilerProfileId });
    assert.ok(artifact.programHex.length > 0, contract.id);
    assert.equal(artifact.compiler.id, "latest-4b0e1cd");
    compiled.set(contract.id, artifact);
  }
  const configured = templates.projectInput(pack.id, "tn10", configuredTemplateParameters(pack));
  const expectedMetadata = canonicalKcc721Metadata(pack.parameters.find((field) => field.type === "kcc721Metadata").default);
  const expectedMetadataDigest = crypto.createHash("sha256").update(expectedMetadata.canonicalJson).digest("hex");
  assert.equal(configured.templateParameters.collectionMode, "preview");
  assert.equal(configured.templateParameters.collectionId, null);
  assert.equal(configured.templateParameters.metadata.digest, expectedMetadataDigest);
  assert.deepEqual(configured.constructorArgs[0], byteArray(Buffer.alloc(32)));
  assert.deepEqual(configured.constructorArgs[2], byteArray(Buffer.from(expectedMetadataDigest, "hex")));
  assert.match(templates.deploymentBlockedReasons(pack.id, { project: configured })[0], /four-contract TN10 experimental pack/i);
  assert.throws(() => templates.projectInput(pack.id, "mainnet", configuredTemplateParameters(pack, "mainnet")), /restricted to tn10/i);

  const importedParameters = configuredTemplateParameters(pack);
  importedParameters.collectionMode = "existing";
  assert.throws(() => templates.projectInput(pack.id, "tn10", importedParameters), /exactly 64 hexadecimal/i);
  importedParameters.collectionId = "00".repeat(32);
  assert.throws(() => templates.projectInput(pack.id, "tn10", importedParameters), /all-zero preview sentinel/i);
  importedParameters.collectionId = "ab".repeat(32);
  const imported = templates.projectInput(pack.id, "tn10", importedParameters);
  assert.equal(imported.templateParameters.collectionId, "ab".repeat(32));
  assert.deepEqual(imported.constructorArgs[0], byteArray(Buffer.from("ab".repeat(32), "hex")));

  const nftContract = pack.packContracts.find((contract) => contract.id === "nft");
  const currentOwnerPrivateKey = new kaspa.PrivateKey("01".padStart(64, "0"));
  const nextOwnerPrivateKey = new kaspa.PrivateKey("02".padStart(64, "0"));
  const currentOwnerKey = currentOwnerPrivateKey.toPublicKey().toXOnlyPublicKey().toString();
  const nextOwnerKey = nextOwnerPrivateKey.toPublicKey().toXOnlyPublicKey().toString();
  const currentOwnerAddress = currentOwnerPrivateKey.toAddress("testnet-10").toString();
  const collectionId = "11".repeat(32);
  const metadataDigest = "22".repeat(32);
  const argsFor = (tokenId, ownerKey) => [
    byteArray(Buffer.from(collectionId, "hex")),
    { kind: "int", data: tokenId },
    byteArray(Buffer.from(metadataDigest, "hex")),
    byteArray(Buffer.from(ownerKey, "hex"))
  ];
  const currentArtifacts = [
    await compileContract({ source: nftContract.source, constructorArgs: argsFor(1, currentOwnerKey) }),
    await compileContract({ source: nftContract.source, constructorArgs: argsFor(2, currentOwnerKey) })
  ];
  const nextArtifacts = [
    await compileContract({ source: nftContract.source, constructorArgs: argsFor(1, nextOwnerKey) }),
    await compileContract({ source: nftContract.source, constructorArgs: argsFor(2, nextOwnerKey) })
  ];
  const covenantIds = ["a7".repeat(32), "b8".repeat(32)];
  const covenantUtxo = (index) => {
    const p2sh = kaspa.payToScriptHashScript(currentArtifacts[index].programHex);
    return {
      address: kaspa.addressFromScriptPublicKey(p2sh, "testnet-10").toString(),
      outpoint: { transactionId: `${index + 3}`.repeat(64), index: 0 },
      amount: 50_000_000n,
      scriptPublicKey: p2sh,
      blockDaaScore: 100n,
      isCoinbase: false,
      covenantId: covenantIds[index]
    };
  };
  const ownerUtxo = {
    address: currentOwnerAddress,
    outpoint: { transactionId: "c9".repeat(32), index: 0 },
    amount: 5_000_000n,
    scriptPublicKey: kaspa.payToAddressScript(currentOwnerAddress),
    blockDaaScore: 100n,
    isCoinbase: false
  };
  const authorization = createP2pkCoSpendAuthorization({
    network: "tn10", address: currentOwnerAddress, publicKey: currentOwnerKey, utxo: ownerUtxo, inputIndex: 2
  });
  const stateArgument = (tokenId) => ({
    kind: "state",
    fields: {
      collectionId: { kind: "bytes32", hex: collectionId },
      tokenId: { kind: "int", data: tokenId },
      metadataDigest: { kind: "bytes32", hex: metadataDigest },
      owner: { kind: "pubkey", hex: nextOwnerKey }
    }
  });
  const atomic = buildAtomicCovenantPackage({
    network: "tn10",
    covenantInputs: [0, 1].map((index) => ({
      utxo: covenantUtxo(index),
      programHex: currentArtifacts[index].programHex,
      abi: currentArtifacts[index].abi,
      stateFields: currentArtifacts[index].stateFields,
      entrypoint: "__covenant_entrypoint_auth_transfer",
      arguments: [stateArgument(index + 1), { kind: "int", data: 2 }]
    })),
    p2pkAuthorization: authorization,
    outputs: [
      { programHex: nextArtifacts[0].programHex, covenantId: covenantIds[0], valueSompi: "50000000" },
      { programHex: nextArtifacts[1].programHex, covenantId: covenantIds[1], valueSompi: "50000000" },
      { address: currentOwnerAddress, valueSompi: "4000000" }
    ],
    feeSompi: "1000000",
    provenance: { templateId: pack.id, operationId: "transfer" }
  });
  const p2pkSigner = {
    async signP2pkInput({ transactionSafeJson, inputIndex }) {
      const transaction = kaspa.Transaction.deserializeFromSafeJSON(transactionSafeJson);
      const encoded = String(kaspa.createInputSignature(transaction, inputIndex, currentOwnerPrivateKey, 1)).toLowerCase();
      const inputs = transaction.inputs;
      inputs[inputIndex].signatureScript = /^41[0-9a-f]{130}$/.test(encoded) ? encoded : `41${encoded}`;
      transaction.inputs = inputs;
      transaction.finalize();
      return transaction.serializeToSafeJSON();
    }
  };
  const originalFetch = globalThis.fetch;
  try {
    const ownerSigned = await signP2pkCoSpendPackage({ package: atomic, confirmation: "SIGN REVIEWED P2PK CO-SPEND" }, p2pkSigner);
    const finalized = finalizeExternalCovenantPackage(ownerSigned.package);
    assert.equal(finalized.review.atomic, true);
    assert.equal(finalized.review.operation.kind, "p2pk-cospend");
    assert.equal(finalized.review.complete, true);
    globalThis.fetch = async () => { throw new Error("all websites unavailable"); };
    const report = await kascovPreflight(finalized.package.transactionSafeJson, "tn10", "signed");
    assert.equal(report.verdict, "ready");
    assert.equal(report.executed.length, 3);
    assert.ok(report.executed.every((entry) => entry.pass));
  } finally {
    globalThis.fetch = originalFetch;
    try { currentOwnerPrivateKey.free(); } catch {}
    try { nextOwnerPrivateKey.free(); } catch {}
  }
});

test("every built-in template exposes a deterministic reverse operation package", async () => {
  const templates = new TemplateStore();
  const covenantId = "44".repeat(32);
  const destination = new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[4]).toAddress("testnet-10").toString();
  let multisigPackage;
  let inheritancePackage;
  const cases = [
    ["owner-vault", { operationId: "spend", destinationAddress: destination, feeKas: "0.01" }],
    ["timelock-transfer", { operationId: "claim", feeKas: "0.01" }],
    ["two-of-three", { operationId: "spend", destinationAddress: destination, signerAddresses: null, feeKas: "0.01" }],
    ["hashlock-refund", { operationId: "refund", feeKas: "0.01" }],
    ["inheritance-vault", { operationId: "checkIn", feeKas: "0.01" }]
  ];
  for (const [templateId, operationInput] of cases) {
    const template = templates.get(templateId);
    const configured = templates.projectInput(templateId, "tn10", configuredTemplateParameters(template));
    const artifact = await compileContract(configured);
    const project = {
      id: `project-${templateId}`,
      ...configured,
      artifact,
      deployment: { txid: "55".repeat(32), covenantId, network: "tn10" },
      review: { ...configured.review, templateId }
    };
    if (templateId === "two-of-three") operationInput.signerAddresses = [configured.templateParameters.key1Address, configured.templateParameters.key2Address];
    const p2sh = kaspa.payToScriptHashScript(artifact.programHex);
    const p2shAddress = kaspa.addressFromScriptPublicKey(p2sh, "testnet-10").toString();
    const holder = kaspa.Transaction.deserializeFromSafeJSON(JSON.stringify({
      id: "00".repeat(32), version: 1,
      inputs: [{ transactionId: "55".repeat(32), index: 0, sequence: "0", sigOpCount: 0, computeBudget: 0, signatureScript: "", utxo: { address: p2shAddress, amount: "50000000", scriptPublicKey: `0000${p2sh.script}`, blockDaaScore: "0", isCoinbase: false, covenantId } }],
      outputs: [{ value: "1", scriptPublicKey: `0000${kaspa.payToAddressScript(destination).script}`, covenant: null }],
      subnetworkId: "00".repeat(20), lockTime: "0", gas: "0", storageMass: "0", payload: ""
    }));
    const lookup = async () => ({ entry: holder.inputs[0].utxo, address: p2shAddress, covenantId });
    if (templateId === "two-of-three") {
      await assert.rejects(
        buildTemplateOperationPackage({ ...operationInput, destinationAddress: "" }, project, template, lookup),
        (error) => error.code === "OPERATION_ADDRESS_REQUIRED" && /destination wallet is required/i.test(error.message)
      );
      const wrongNetworkDestination = new kaspa.XOnlyPublicKey(TEMPLATE_KEYS[4]).toAddress("mainnet").toString();
      await assert.rejects(
        buildTemplateOperationPackage({ ...operationInput, destinationAddress: wrongNetworkDestination }, project, template, lookup),
        (error) => error.code === "OPERATION_ADDRESS_WRONG_NETWORK" && /wrong network/i.test(error.message)
      );
    }
    const preflight = async (transactionSafeJson, network, stage) => {
      const transaction = JSON.parse(transactionSafeJson);
      assert.equal(transaction.inputs[0].computeBudget, 120, templateId);
      assert.equal(network, "tn10", templateId);
      assert.equal(stage, "draft", templateId);
      return { ok: true, verdict: "ready", stage };
    };
    const built = await buildTemplateOperationPackage(operationInput, project, template, lookup, preflight);
    assert.equal(built.review.entrypoint, operationInput.operationId, templateId);
    assert.equal(built.review.covenantId, covenantId, templateId);
    const operations = templateOperations(project);
    assert.ok(operations.length >= 1, templateId);
    assert.equal(built.review.feeSompi, "1000000", templateId);
    assert.equal(built.preflight.verdict, "ready", templateId);
    if (templateId === "two-of-three") {
      assert.deepEqual(operations[0].availableSigners, [
        configured.templateParameters.key1Address,
        configured.templateParameters.key2Address,
        configured.templateParameters.key3Address
      ]);
      assert.equal(built.review.signatureSlots.length, 2);
      multisigPackage = built.package;
    }
    if (templateId === "inheritance-vault") inheritancePackage = built.package;
  }
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url) => {
      if (String(url).includes("/preflight")) return new Response(JSON.stringify({ ok: true, verdict: "ready", findings: [], executed: [{ pass: true }] }), { status: 200, headers: { "content-type": "application/json" } });
      throw new Error(`Unexpected URL: ${url}`);
    };
    const signerService = {
      async createCovenantInputSignature({ expectedPublicKey }) {
        return `${expectedPublicKey.slice(0, 64)}${"00".repeat(33)}`;
      }
    };
    const firstPublicKey = multisigPackage.covenantInput.arguments[1].publicKey;
    const secondPublicKey = multisigPackage.covenantInput.arguments[3].publicKey;
    const first = await signExternalCovenantPackage({ package: multisigPackage, publicKey: firstPublicKey, confirmation: "SIGN REVIEWED EXTERNAL COVENANT" }, signerService);
    assert.equal(first.remainingSignatureSlots, 1);
    assert.equal(first.review.complete, false);
    assert.equal(JSON.parse(first.package.transactionSafeJson).inputs[0].signatureScript, "");
    await assert.rejects(
      signExternalCovenantPackage({ package: first.package, publicKey: secondPublicKey, confirmation: "SIGN REVIEWED EXTERNAL COVENANT" }, signerService),
      (error) => error.code === "PREFLIGHT_REJECTED" && /script engine rejected|invalid hash type/i.test(error.message)
    );

    assert.ok(inheritancePackage.covenantInput.programHex.length / 2 > 520);
    const ownerPublicKey = inheritancePackage.covenantInput.arguments[0].publicKey;
    await assert.rejects(
      signExternalCovenantPackage({
        package: inheritancePackage,
        publicKey: ownerPublicKey,
        confirmation: "SIGN REVIEWED EXTERNAL COVENANT"
      }, signerService),
      (error) => error.code === "PREFLIGHT_REJECTED" && /script engine rejected|invalid hash type/i.test(error.message)
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("heuristic triage returns structured findings", async () => {
  const analysis = await staticAnalyze(SAMPLE_SOURCE);
  assert.equal(analysis.kind, "heuristic-triage");
  assert.ok(Array.isArray(analysis.findings));
  const risky = await staticAnalyze(`pragma silverscript ^0.1.0;
contract Risky() {
  policy spend(...) -> (next_states: State[]) termination = allowed {
    validateOutputStateWithTemplate(outputIndex, template);
    require(tx.outputs[feeOutputIndex].scriptPubKey == expectedScript);
    return next_states;
  }
}`);
  assert.deepEqual(risky.findings.map((finding) => finding.code), ["SS001", "SS002", "SS003", "SS004"]);
});

test("deployment builder rejects source edited after compilation before network access", async () => {
  const publicKey = "79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
  const address = new kaspa.XOnlyPublicKey(publicKey).toAddress("testnet-10").toString();
  const programHex = "51";
  const artifact = {
    programHex,
    programSha256: crypto.createHash("sha256").update(Buffer.from(programHex, "hex")).digest("hex"),
    sourceSha256: crypto.createHash("sha256").update("compiled source").digest("hex"),
    constructorArgsSha256: crypto.createHash("sha256").update("[]").digest("hex")
  };
  await assert.rejects(
    buildDeployDraft({ network: "tn10", address, publicKey, amountKas: "0.05", artifact, source: "edited source", constructorArgs: [] }, {}),
    /source changed after compilation/i
  );
});

test("deployment builder rejects constructor arguments edited after compilation before network access", async () => {
  const publicKey = TEMPLATE_KEYS[0];
  const address = new kaspa.XOnlyPublicKey(publicKey).toAddress("testnet-10").toString();
  const programHex = "51";
  const artifact = {
    programHex,
    programSha256: crypto.createHash("sha256").update(Buffer.from(programHex, "hex")).digest("hex"),
    sourceSha256: crypto.createHash("sha256").update("compiled source").digest("hex"),
    constructorArgsSha256: crypto.createHash("sha256").update("[]").digest("hex")
  };
  await assert.rejects(
    buildDeployDraft({ network: "tn10", address, publicKey, amountKas: "0.05", artifact, source: "compiled source", constructorArgs: [{ kind: "int", data: 1 }] }, {}),
    /constructor arguments changed after compilation/i
  );
});

test("Kascov preflight adapter preserves WASM Safe JSON outpoints, scripts and genesis covenant identity", () => {
  const privateKey = new kaspa.PrivateKey("01".padStart(64, "0"));
  const address = privateKey.toAddress("testnet-10").toString();
  const utxo = {
    address,
    outpoint: { transactionId: "33".repeat(32), index: 2 },
    amount: 100_000_000n,
    scriptPublicKey: kaspa.payToAddressScript(address),
    blockDaaScore: 0n,
    isCoinbase: false
  };
  const transaction = new kaspa.Transaction({
    version: 1,
    inputs: [{ previousOutpoint: utxo.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 0, computeBudget: 120, utxo }],
    outputs: [new kaspa.TransactionOutput(99_000_000n, kaspa.payToScriptHashScript("51"))],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  });
  transaction.populateGenesisCovenants([{ authorizingInput: 0, outputs: [0] }]);
  kaspa.updateTransactionMass("testnet-10", transaction, 1, true);
  const safeJson = transaction.serializeToSafeJSON();
  const safe = JSON.parse(safeJson);
  const adapted = toKascovPreflightTransaction(safeJson);
  assert.deepEqual(adapted.inputs[0].previousOutpoint, { transactionId: "33".repeat(32), index: 2 });
  assert.equal(adapted.inputs[0].transactionId, undefined);
  assert.deepEqual(adapted.outputs[0].scriptPublicKey, {
    version: 0,
    script: safe.outputs[0].scriptPublicKey.slice(4)
  });
  assert.deepEqual(adapted.inputs[0].utxo.scriptPublicKey, {
    version: 0,
    script: safe.inputs[0].utxo.scriptPublicKey.slice(4)
  });
  const adaptedOutput = new kaspa.TransactionOutput(
    BigInt(adapted.outputs[0].value),
    new kaspa.ScriptPublicKey(adapted.outputs[0].scriptPublicKey.version, adapted.outputs[0].scriptPublicKey.script)
  );
  const recomputed = kaspa.covenantId(adapted.inputs[0].previousOutpoint, [{ index: 0, output: adaptedOutput }]).toString();
  assert.equal(recomputed, safe.outputs[0].covenant.covenantId);
  assert.equal(JSON.stringify(JSON.parse(safeJson)), JSON.stringify(safe));
  try { adaptedOutput.free(); } catch {}
  try { transaction.free(); } catch {}
  try { privateKey.free(); } catch {}
});

test("signed transactions pass the bundled script engine when Kascov is completely offline", async () => {
  const originalFetch = globalThis.fetch;
  const privateKey = new kaspa.PrivateKey("01".padStart(64, "0"));
  const address = privateKey.toAddress("testnet-10").toString();
  const utxo = {
    address,
    outpoint: { transactionId: "ab".repeat(32), index: 0 },
    amount: 100_000_000n,
    scriptPublicKey: kaspa.payToAddressScript(address),
    blockDaaScore: 0n,
    isCoinbase: false
  };
  const transaction = new kaspa.Transaction({
    version: 1,
    inputs: [{ previousOutpoint: utxo.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 0, computeBudget: 10, utxo }],
    outputs: [new kaspa.TransactionOutput(99_000_000n, kaspa.payToAddressScript(address))],
    lockTime: 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  });
  try {
    kaspa.updateTransactionMass("testnet-10", transaction, 1, true);
    const signedJson = kaspa.signTransaction(transaction, [privateKey], true).serializeToSafeJSON();
    globalThis.fetch = async () => { throw new Error("all websites unavailable"); };
    const report = await kascovPreflight(signedJson, "tn10", "signed");
    assert.equal(report.verdict, "ready");
    assert.equal(report.provider, "local");
    assert.equal(report.localEngineVerified, true);
    assert.equal(report.kascov.available, false);
    assert.equal(report.executed[0].pass, true);
    globalThis.fetch = async () => new Response(JSON.stringify({
      ok: true,
      verdict: "will_fail",
      findings: [{ severity: "error", message: "simulated remote disagreement" }]
    }), { status: 200, headers: { "content-type": "application/json" } });
    const disagreed = await kascovPreflight(signedJson, "tn10", "signed");
    assert.equal(disagreed.provider, "local");
    assert.equal(disagreed.kascov.disagreement, true);
    assert.equal(disagreed.verdict, "ready");
  } finally {
    globalThis.fetch = originalFetch;
    try { transaction.free(); } catch {}
    try { privateKey.free(); } catch {}
  }
});

test("wallet balances come from Kaspa node RPC without a REST explorer", async () => {
  const privateKey = new kaspa.PrivateKey("03".padStart(64, "0"));
  const address = privateKey.toAddress("testnet-10").toString();
  try {
    configureNodeAccess({ tn10RpcUrl: "ws://127.0.0.1:17210" });
    setRpcClientFactoryForTests((network, directUrl) => ({
      async connect() {},
      async disconnect() {},
      async stop() {},
      async getServerInfo() {
        assert.equal(network.kaspaNetworkId, "testnet-10");
        assert.equal(directUrl, "ws://127.0.0.1:17210");
        return { networkId: "testnet-10" };
      },
      async getBalanceByAddress(request) {
        assert.equal(request.address, address);
        return { balance: 123_456_789n };
      }
    }));
    const balance = await walletBalance("tn10", address);
    assert.equal(balance.balanceSompi, "123456789");
    assert.equal(balance.balanceKas, "1.23456789");
    setRpcClientFactoryForTests(() => ({
      async connect() {},
      async disconnect() {},
      async stop() {},
      async getServerInfo() { return { networkId: "mainnet" }; }
    }));
    await assert.rejects(walletBalance("tn10", address), (error) => error.code === "KASPA_NODE_WRONG_NETWORK");
  } finally {
    configureNodeAccess({});
    setRpcClientFactoryForTests();
    try { privateKey.free(); } catch {}
  }
});

test("wallet transfer builder produces one immutable reviewed draft with exact fees", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-transfer-test-"));
  const originalFetch = globalThis.fetch;
  const privateKey = new kaspa.PrivateKey("01".padStart(64, "0"));
  const recipientKey = new kaspa.PrivateKey("02".padStart(64, "0"));
  const address = privateKey.toAddress("testnet-10").toString();
  const recipient = recipientKey.toAddress("testnet-10").toString();
  const script = kaspa.payToAddressScript(address).script;
  try {
    setRpcClientFactoryForTests(() => ({
      async connect() {},
      async disconnect() {},
      async stop() {},
      async getServerInfo() { return { networkId: "testnet-10" }; },
      async getUtxosByAddresses() {
        return { entries: [{
          address,
          outpoint: { transactionId: "22".repeat(32), index: 0 },
          amount: 100000000n,
          scriptPublicKey: { script },
          blockDaaScore: 0n,
          isCoinbase: false
        }] };
      }
    }));
    globalThis.fetch = async (url, options = {}) => {
      if (String(url).includes("/preflight")) {
        const submitted = JSON.parse(options.body);
        assert.deepEqual(submitted.inputs[0].previousOutpoint, { transactionId: "22".repeat(32), index: 0 });
        assert.equal(submitted.inputs[0].transactionId, undefined);
        assert.equal(typeof submitted.inputs[0].utxo.scriptPublicKey, "object");
        assert.equal(typeof submitted.outputs[0].scriptPublicKey, "object");
        return new Response(JSON.stringify({ ok: true, verdict: "ready", findings: [] }), { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`Unexpected URL: ${url}`);
    };
    const draft = await buildWalletTransferDraft({ network: "tn10", address, recipient, amountKas: "0.5" }, new DraftStore(directory));
    assert.equal(draft.amountSompi, "50000000");
    assert.ok(BigInt(draft.feeSompi) > 0n);
    assert.equal(sompiToKas(draft.amountSompi), "0.5");
    assert.match(draft.commitment, /^[0-9a-f]{64}$/);
    assert.deepEqual(draft.signing.inputIndexes, [0]);
    assert.doesNotMatch(JSON.stringify(draft), /walletSecret|mnemonic|privateKey/);
  } finally {
    setRpcClientFactoryForTests();
    globalThis.fetch = originalFetch;
    try { privateKey.free(); } catch {}
    try { recipientKey.free(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("every built-in template fully compiles with its realistic default arguments", async () => {
  const templates = new TemplateStore().list();
  assert.ok(templates.length >= 4);
  for (const template of templates) {
    const artifact = await compileContract(template);
    assert.ok(artifact.programHex.length > 0, template.id);
    assert.equal(artifact.compiler.upstreamCommit, SILVERSCRIPT_COMMIT);
  }
});

test("local wallet encrypts its mnemonic and signs without persisting secrets", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-wallet-test-"));
  const walletSecret = "temporary-test-password";
  try {
    const service = new WalletService(directory);
    const created = await service.create({ title: "Test wallet", walletSecret });
    assert.equal(created.recoveryPhrase.split(" ").length, 12);
    const stored = fs.readFileSync(service.file(created.wallet.id), "utf8");
    assert.doesNotMatch(stored, new RegExp(created.recoveryPhrase.replaceAll(" ", "\\s+")));
    assert.doesNotMatch(stored, /temporary-test-password/);

    const wallet = await service.unlock({ walletId: created.wallet.id, walletSecret, network: "tn10" });
    assert.match(wallet.address, /^kaspatest:/);
    const utxo = {
      address: wallet.address,
      outpoint: { transactionId: "11".repeat(32), index: 0 },
      amount: 100_000_000n,
      scriptPublicKey: kaspa.payToAddressScript(wallet.address),
      blockDaaScore: 0n,
      isCoinbase: false
    };
    const transaction = new kaspa.Transaction({
      version: 1,
      inputs: [{ previousOutpoint: utxo.outpoint, signatureScript: "", sequence: 0n, sigOpCount: 1, utxo }],
      outputs: [new kaspa.TransactionOutput(99_000_000n, kaspa.payToAddressScript(wallet.address))],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: ""
    });
    kaspa.updateTransactionMass("testnet-10", transaction, 1, true);
    const signedJson = await service.signTransaction({
      walletId: wallet.id,
      walletSecret,
      network: "tn10",
      expectedAddress: wallet.address,
      transactionSafeJson: transaction.serializeToSafeJSON()
    });
    const signed = kaspa.Transaction.deserializeFromSafeJSON(signedJson);
    assert.ok(signed.inputs[0].signatureScript.length > 0);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
