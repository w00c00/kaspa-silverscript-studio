import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [];
for (const directory of ["server", "src", "scripts"]) {
  const current = path.join(root, directory);
  if (!fs.existsSync(current)) continue;
  for (const name of fs.readdirSync(current)) {
    if (/\.(mjs|js)$/.test(name)) files.push(path.join(current, name));
  }
}
for (const file of files) execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
const preflightManifest = JSON.parse(fs.readFileSync(path.join(root, "config", "kascov-preflight.json"), "utf8"));
if (preflightManifest.sourceMode !== "vendored-mit-snapshot") throw new Error("Local preflight must use the vendored source snapshot");
for (const requiredPath of [preflightManifest.sourceModule, preflightManifest.license, "vendor/kascov-preflight/Cargo.lock"]) {
  if (!requiredPath || !fs.existsSync(path.join(root, requiredPath))) throw new Error(`Vendored preflight source is incomplete: ${requiredPath || "missing manifest path"}`);
}
const preflightLocalManifestFile = path.join(root, "config", "kascov-preflight.local.json");
if (!fs.existsSync(preflightLocalManifestFile)) throw new Error("Local preflight manifest is missing. Run npm run setup:kascov-preflight.");
const preflightLocalManifest = JSON.parse(fs.readFileSync(preflightLocalManifestFile, "utf8"));
const preflightBinary = path.resolve(root, preflightLocalManifest.binary || preflightManifest.binary);
if (!fs.existsSync(preflightBinary)) throw new Error("Pinned local preflight engine is missing. Run npm run setup:kascov-preflight.");
const preflightSha256 = crypto.createHash("sha256").update(fs.readFileSync(preflightBinary)).digest("hex");
if (preflightLocalManifest.upstreamCommit !== preflightManifest.upstreamCommit) throw new Error("Local preflight manifest was built from a different Kascov commit");
if (preflightLocalManifest.rustyKaspaCommit !== preflightManifest.rustyKaspaCommit) throw new Error("Local preflight manifest was built from a different rusty-kaspa commit");
if (preflightSha256 !== preflightLocalManifest.sha256) throw new Error("Pinned local preflight engine SHA-256 does not match config/kascov-preflight.local.json");
console.log(`syntax ok: ${files.length} files`);
