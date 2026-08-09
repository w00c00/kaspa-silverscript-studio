import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, publicConfig } from "./config.mjs";
import { generateWithAi } from "./ai-providers.mjs";
import { compileContract, compilerManifest, compilerProfiles, detectBreakingChanges, migrateSourceToProfile, staticAnalyze } from "./compiler.mjs";
import { DraftStore } from "./draft-store.mjs";
import { broadcastWalletTransfer, buildDeployDraft, buildWalletTransferDraft, broadcastDeploy, configureNodeAccess, discoverNetworks, findCovenantUtxo, kascovPreflight, nodeStatus, signAndBroadcastWalletTransfer, signDeployDraft, submitReviewedTransaction, transactionEvidence, walletBalance } from "./kaspa-service.mjs";
import { ProjectStore } from "./project-store.mjs";
import { localCors, requireLocalOrigin, sha256 } from "./security.mjs";
import { AiSettingsStore, AppSettingsStore } from "./settings-store.mjs";
import { skillManifest } from "./skill-context.mjs";
import { TemplateStore } from "./template-store.mjs";
import { WalletService } from "./wallet-service.mjs";
import { exportExternalCovenantPackage, inspectExternalCovenantPackage, signExternalCovenantPackage } from "./external-covenant-service.mjs";
import { buildTemplateOperationPackage, templateOperations } from "./template-operation-service.mjs";
import { buildLifecycleStatus, spentLifecycleStatus } from "./lifecycle-status.mjs";
import { assertInheritanceDistributionOpen, assertLocalRenewalOpen, assertLocalRenewalPackage } from "./local-operation-authorization.mjs";
import { signP2pkCoSpendPackage } from "./p2pk-cospend.mjs";
import { createP2pkCoSpendAuthorization, selectP2pkFundingUtxo } from "./p2pk-cospend.mjs";
import { buildAtomicCovenantPackage } from "./atomic-covenant-builder.mjs";

fs.mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
const projects = new ProjectStore(config.dataDir);
const drafts = new DraftStore(config.dataDir);
const templates = new TemplateStore();
const wallets = new WalletService(config.dataDir);
const settings = new AppSettingsStore(config.dataDir);
configureNodeAccess(settings.public());
const aiSettings = new AiSettingsStore(config.dataDir, config.providers, () => settings.public().aiAutoLockMinutes);
const sessionToken = crypto.randomBytes(24).toString("hex");
const app = express();

async function lifecycleStatusFor(project) {
  if (!project?.deployment?.txid || !project?.artifact?.programHex) {
    return { deployed: false, unspent: false, status: "not-deployed", network: project?.network || "", schedule: null };
  }
  try {
    const source = await findCovenantUtxo(
      project.network,
      project.artifact.programHex,
      project.deployment.activeTxid || project.deployment.txid,
      project.deployment.activeOutputIndex ?? 0,
      project.deployment.covenantId || ""
    );
    const node = await nodeStatus(project.network);
    return buildLifecycleStatus(project, source, node);
  } catch (error) {
    if (error.code === "COVENANT_UTXO_NOT_FOUND") return spentLifecycleStatus(project);
    throw error;
  }
}

app.disable("x-powered-by");
app.use(localCors);
app.use(express.json({ limit: "1mb" }));
app.use(requireLocalOrigin);
app.use((req, res, next) => {
  if (req.path.startsWith("/api")) res.setHeader("cache-control", "no-store");
  next();
});
app.use((req, _res, next) => {
  if (!req.path.startsWith("/api") || ["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.headers["x-studio-token"] === sessionToken) return next();
  next(Object.assign(new Error("Local session token is missing or invalid"), { status: 403 }));
});

app.get("/api/session", (_req, res) => res.json({ token: sessionToken }));
app.get("/api/config", (_req, res) => res.json({ ...publicConfig(), providers: aiSettings.publicStatus().providers, skill: skillManifest() }));
app.get("/api/health", (_req, res) => res.json({ ok: true, localOnly: true, now: new Date().toISOString() }));

app.get("/api/settings", (_req, res) => res.json({ settings: settings.public(), ai: aiSettings.publicStatus() }));
app.put("/api/settings", (req, res, next) => {
  try {
    const input = { ...(req.body || {}) };
    if (!config.allowMainnet && input.defaultNetwork === "mainnet") throw Object.assign(new Error("Mainnet is disabled by this application build"), { status: 403 });
    if (input.defaultWalletId && !wallets.read(input.defaultWalletId)) throw new Error("Default wallet does not exist");
    const saved = settings.save(input);
    configureNodeAccess(saved);
    res.json({ settings: saved, ai: aiSettings.publicStatus() });
  } catch (error) { next(error); }
});
app.post("/api/settings/ai/save", async (req, res, next) => {
  try { res.json({ ai: await aiSettings.save(req.body || {}) }); } catch (error) { next(error); }
});
app.post("/api/settings/ai/remove", async (req, res, next) => {
  try { res.json({ ai: await aiSettings.remove(req.body || {}) }); } catch (error) { next(error); }
});
app.post("/api/settings/ai/unlock", async (req, res, next) => {
  try { res.json({ ai: await aiSettings.unlock(req.body?.vaultSecret) }); } catch (error) { next(error); }
});
app.post("/api/settings/ai/lock", (_req, res) => {
  aiSettings.lock();
  res.json({ ai: aiSettings.publicStatus() });
});

app.get("/api/node/status", async (req, res, next) => {
  try { res.json(await nodeStatus(String(req.query.network || "tn10"))); } catch (error) { next(error); }
});
app.get("/api/nodes/discover", async (_req, res, next) => {
  try { res.json({ nodes: await discoverNetworks() }); } catch (error) { next(error); }
});

app.get("/api/wallets", (_req, res) => res.json({ wallets: wallets.list() }));
app.post("/api/wallets", async (req, res, next) => {
  try { res.status(201).json(await wallets.create(req.body || {})); } catch (error) { next(error); }
});
app.post("/api/wallets/:id/unlock", async (req, res, next) => {
  try { res.json({ wallet: await wallets.unlock({ ...req.body, walletId: req.params.id }) }); } catch (error) { next(error); }
});
app.get("/api/wallets/balance", async (req, res, next) => {
  try { res.json({ balance: await walletBalance(String(req.query.network || "tn10"), String(req.query.address || "")) }); } catch (error) { next(error); }
});
app.post("/api/wallets/transfer/draft", async (req, res, next) => {
  try { res.json({ draft: await buildWalletTransferDraft(req.body || {}, drafts) }); } catch (error) { next(error); }
});
app.post("/api/wallets/transfer/send", async (req, res, next) => {
  try { res.json({ result: await signAndBroadcastWalletTransfer(req.body || {}, drafts, wallets) }); } catch (error) { next(error); }
});
app.post("/api/wallets/transfer/broadcast", async (req, res, next) => {
  try { res.json({ result: await broadcastWalletTransfer(req.body || {}, drafts) }); } catch (error) { next(error); }
});

app.get("/api/templates", (_req, res) => res.json({ templates: templates.list() }));
app.post("/api/templates/:id/projects", (req, res, next) => {
  try {
    const input = templates.projectInput(req.params.id, req.body?.network, req.body?.parameters, { language: req.body?.language });
    res.status(201).json({ project: projects.create(input) });
  } catch (error) { next(error); }
});
app.put("/api/projects/:projectId/template/:templateId", (req, res, next) => {
  try {
    if (!projects.get(req.params.projectId)) return res.status(404).json({ error: "Project not found" });
    const current = projects.get(req.params.projectId);
    const input = templates.projectInput(req.params.templateId, req.body?.network, req.body?.parameters, { language: req.body?.language });
    res.json({ project: projects.save(req.params.projectId, { ...input, name: current.name, artifact: null, deployment: null }) });
  } catch (error) { next(error); }
});

app.get("/api/projects", (_req, res) => res.json({ projects: projects.list() }));
app.post("/api/projects", (req, res, next) => {
  try { res.status(201).json({ project: projects.create(req.body) }); } catch (error) { next(error); }
});
app.get("/api/projects/:id", (req, res, next) => {
  try {
    const project = projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ project });
  } catch (error) { next(error); }
});
app.put("/api/projects/:id", (req, res, next) => {
  try { res.json({ project: projects.save(req.params.id, req.body || {}) }); } catch (error) { next(error); }
});
app.delete("/api/projects/:id", (req, res, next) => {
  try {
    if (!projects.remove(req.params.id)) return res.status(404).json({ error: "Project not found" });
    res.json({ deleted: true, id: req.params.id });
  } catch (error) { next(error); }
});
app.get("/api/projects/:id/operations", (req, res, next) => {
  try {
    const project = projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ operations: templateOperations(project) });
  } catch (error) { next(error); }
});
app.get("/api/projects/:id/lifecycle-status", async (req, res, next) => {
  try {
    const project = projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    res.json({ status: await lifecycleStatusFor(project) });
  } catch (error) { next(error); }
});
app.post("/api/covenants/resolve", async (req, res, next) => {
  try {
    const result = await findCovenantUtxo(
      req.body?.network || "tn10",
      req.body?.programHex,
      req.body?.transactionId,
      req.body?.outputIndex ?? 0,
      req.body?.covenantId || ""
    );
    res.json({ state: {
      network: req.body?.network || "tn10",
      covenantId: result.covenantId,
      outpoint: result.outpoint,
      amountSompi: result.amountSompi,
      address: result.address,
      provider: result.provider,
      verified: result.verified,
      attempts: result.attempts
    } });
  } catch (error) { next(error); }
});
app.post("/api/projects/:id/operations/build", async (req, res, next) => {
  try {
    const project = projects.get(req.params.id);
    if (!project) return res.status(404).json({ error: "Project not found" });
    const template = templates.get(project.review?.templateId);
    if (!template) throw new Error("Project template was not found");
    const expected = templates.projectInput(template.id, project.network, project.templateParameters, {
      encodingVersion: Number(project.review?.parameterEncodingVersion || 1)
    });
    if (project.source !== expected.source || JSON.stringify(project.constructorArgs) !== JSON.stringify(expected.constructorArgs)) {
      throw Object.assign(new Error("Lifecycle builders require the unchanged deterministic template source and parameters"), { status: 400, code: "TEMPLATE_OPERATION_DRIFT" });
    }
    if (project.artifact?.sourceSha256 !== sha256(project.source) || project.artifact?.constructorArgsSha256 !== sha256(JSON.stringify(project.constructorArgs))) {
      throw Object.assign(new Error("Lifecycle builders require a fresh compiled artifact for the current source and constructor arguments"), { status: 400, code: "TEMPLATE_OPERATION_STALE_ARTIFACT" });
    }
    if (project.review?.templateId === "inheritance-vault" && req.body?.operationId === "checkIn") {
      assertLocalRenewalOpen(await lifecycleStatusFor(project));
    }
    if (project.review?.templateId === "inheritance-vault" && req.body?.operationId === "inherit") {
      assertInheritanceDistributionOpen(await lifecycleStatusFor(project));
    }
    res.json(await buildTemplateOperationPackage(req.body || {}, project, template));
  } catch (error) { next(error); }
});

app.post("/api/ai/generate", async (req, res, next) => {
  try {
    const providerId = String(req.body?.provider || "openai").toLowerCase();
    const answer = await generateWithAi({ ...req.body, mode: "generate" }, aiSettings.provider(providerId));
    res.json(answer);
  } catch (error) { next(error); }
});
app.post("/api/ai/review", async (req, res, next) => {
  try {
    const providerId = String(req.body?.provider || "openai").toLowerCase();
    const answer = await generateWithAi({ ...req.body, mode: "review" }, aiSettings.provider(providerId));
    res.json(answer);
  } catch (error) { next(error); }
});

app.post("/api/contracts/analyze", async (req, res, next) => {
  try { res.json({ analysis: await staticAnalyze(req.body?.source) }); } catch (error) { next(error); }
});
app.post("/api/contracts/compatibility", (req, res, next) => {
  try {
    const targetProfileId = req.body?.targetProfileId || config.compiler.defaultProfileId;
    const report = detectBreakingChanges(req.body?.source, targetProfileId);
    const migration = req.body?.includeMigration === true ? migrateSourceToProfile(req.body?.source, targetProfileId) : null;
    res.json({ report, migration });
  } catch (error) { next(error); }
});
app.post("/api/contracts/compile", async (req, res, next) => {
  try {
    const artifact = await compileContract(req.body || {});
    const template = req.body?.templateId ? templates.get(req.body.templateId) : null;
    if (template) {
      artifact.templateId = template.id;
      const project = req.body?.projectId ? projects.get(req.body.projectId) : null;
      artifact.deploymentBlockedReasons = templates.deploymentBlockedReasons(template.id, {
        source: req.body?.source,
        constructorArgs: req.body?.constructorArgs,
        project
      });
    }
    res.json({ artifact });
  } catch (error) { next(error); }
});
app.get("/api/compiler", (_req, res, next) => {
  try {
    const manifest = compilerManifest();
    res.json({ configured: true, manifest: { ...manifest, bin: path.basename(manifest.bin) }, profiles: compilerProfiles() });
  } catch (error) { next(error); }
});
app.get("/api/compiler/profiles", (_req, res) => res.json({ defaultProfileId: config.compiler.defaultProfileId, profiles: compilerProfiles() }));

app.post("/api/deploy/draft", async (req, res, next) => {
  try { res.json({ draft: await buildDeployDraft(req.body || {}, drafts) }); } catch (error) { next(error); }
});
app.post("/api/deploy/preflight", async (req, res, next) => {
  try {
    const report = await kascovPreflight(req.body?.transaction, req.body?.network || "tn10", req.body?.stage || "draft");
    res.json({ report });
  } catch (error) { next(error); }
});
app.post("/api/deploy/sign", async (req, res, next) => {
  try { res.json(await signDeployDraft(req.body || {}, drafts, wallets)); } catch (error) { next(error); }
});
app.post("/api/deploy/broadcast", async (req, res, next) => {
  try { res.json({ result: await broadcastDeploy(req.body || {}, drafts) }); } catch (error) { next(error); }
});
app.post("/api/external-covenants/inspect", (req, res, next) => {
  try { res.json(inspectExternalCovenantPackage(req.body?.package)); } catch (error) { next(error); }
});
app.post("/api/external-covenants/build-atomic", (req, res, next) => {
  try { res.json(inspectExternalCovenantPackage(buildAtomicCovenantPackage(req.body || {}))); } catch (error) { next(error); }
});
app.post("/api/p2pk-cospend/select", (req, res, next) => {
  try {
    const utxo = selectP2pkFundingUtxo(req.body?.utxos, req.body?.requiredSompi);
    res.json({ utxo: { ...utxo, amount: utxo.amount.toString(), blockDaaScore: utxo.blockDaaScore.toString() } });
  } catch (error) { next(error); }
});
app.post("/api/p2pk-cospend/authorization", (req, res, next) => {
  try { res.json(createP2pkCoSpendAuthorization(req.body || {})); } catch (error) { next(error); }
});
app.post("/api/external-covenants/export", (req, res, next) => {
  try { res.json({ export: exportExternalCovenantPackage(req.body?.package) }); } catch (error) { next(error); }
});
app.post("/api/external-covenants/sign", async (req, res, next) => {
  try {
    const input = { ...(req.body || {}) };
    if (input.localRenewal === true) {
      const inspected = inspectExternalCovenantPackage(input.package);
      const project = projects.get(inspected.package.provenance?.projectId);
      assertLocalRenewalPackage(project, inspected, await lifecycleStatusFor(project));
      input.confirmation = "SIGN REVIEWED EXTERNAL COVENANT";
    }
    res.json(await signExternalCovenantPackage(input, wallets));
  } catch (error) { next(error); }
});
app.post("/api/external-covenants/sign-p2pk-cospend", async (req, res, next) => {
  try { res.json(await signP2pkCoSpendPackage(req.body || {}, wallets)); } catch (error) { next(error); }
});
app.post("/api/external-covenants/broadcast", async (req, res, next) => {
  try {
    const inspected = inspectExternalCovenantPackage(req.body?.package);
    if (req.body?.localRenewal === true) {
      const project = projects.get(inspected.package.provenance?.projectId);
      assertLocalRenewalPackage(project, inspected, await lifecycleStatusFor(project));
    } else if (req.body?.confirmation !== "BROADCAST REVIEWED COVENANT") {
      throw Object.assign(new Error("External covenant broadcast confirmation phrase is required"), { status: 400 });
    }
    if (!inspected.review.complete) throw new Error("Covenant package still has unsigned signature slots");
    if (inspected.package.network === "mainnet" && req.body?.mainnetConfirmation !== "BROADCAST REAL KAS COVENANT") {
      throw Object.assign(new Error("Mainnet covenant broadcast confirmation phrase is required"), { status: 400 });
    }
    const result = await submitReviewedTransaction(inspected.package.network, inspected.package.transactionSafeJson);
    let project = null;
    const provenance = inspected.package.provenance || {};
    if (provenance.kind === "silverstudio-template-operation" && provenance.projectId) {
      const current = projects.get(provenance.projectId);
      const inputOutpoint = inspected.review.inputOutpoint || {};
      const expectedTxid = String(current?.deployment?.activeTxid || current?.deployment?.txid || "").toLowerCase();
      const identityMatches = current
        && current.network === inspected.package.network
        && current.review?.templateId === provenance.templateId
        && current.deployment?.covenantId === inspected.review.covenantId
        && current.artifact?.programSha256 === inspected.review.programSha256
        && String(inputOutpoint.transactionId || "").toLowerCase() === expectedTxid;
      if (identityMatches) {
        const continuation = inspected.review.outputs.find((output) => String(output.covenantId || "").toLowerCase() === inspected.review.covenantId);
        const history = Array.isArray(current.deployment.history) ? current.deployment.history.slice(-99) : [];
        history.push({
          txid: result.txid,
          operation: inspected.review.operation?.kind || inspected.review.entrypoint,
          entrypoint: inspected.review.entrypoint,
          broadcastAt: result.broadcastAt,
          continuation: Boolean(continuation)
        });
        project = projects.save(current.id, {
          deployment: {
            ...current.deployment,
            activeTxid: continuation ? result.txid : "",
            activeOutputIndex: continuation ? continuation.index : null,
            status: continuation ? "active" : "spent",
            lastOperationAt: result.broadcastAt,
            history
          }
        });
      }
    }
    res.json({ result, project });
  } catch (error) { next(error); }
});
app.get("/api/transactions/:network/:txid", async (req, res, next) => {
  try { res.json(await transactionEvidence(req.params.network, req.params.txid)); } catch (error) { next(error); }
});

const dist = path.join(config.root, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist, {
    etag: true,
    maxAge: "1h",
    setHeaders(res, file) {
      if (path.basename(file) === "index.html") res.setHeader("cache-control", "no-store");
    }
  }));
  app.get("/{*splat}", (_req, res) => res.setHeader("cache-control", "no-store").sendFile(path.join(dist, "index.html")));
}

app.use((error, req, res, _next) => {
  const status = Number(error.status || 500);
  const message = error?.message || (typeof error === "string" ? error : String(error || ""));
  const body = {
    error: message && message !== "[object Object]" ? message : "Internal error",
    code: error.code || "",
    details: error.report || undefined,
    requestId: sha256(`${Date.now()}:${Math.random()}`).slice(0, 12)
  };
  if (status >= 500) console.error(`[${body.requestId}] ${req.method} ${req.path} ${error.code || error.name || "Error"}`);
  res.status(status).json(body);
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Kaspa SilverScript Studio: http://${config.host}:${config.port}`);
  console.log(`Local data: ${config.dataDir}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

export { app };
