import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { binaryRelativePath } from "./platform-binaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const provenanceFile = path.join(root, "config", "kascov-preflight.json");
const localFile = path.join(root, "config", "kascov-preflight.local.json");
const provenance = JSON.parse(fs.readFileSync(provenanceFile, "utf8"));
const relativeBinary = binaryRelativePath("kascov-preflight");
const binary = path.resolve(root, relativeBinary);

if (!fs.existsSync(binary)) throw new Error(`Local preflight binary is missing: ${binary}`);
const sha256 = crypto.createHash("sha256").update(fs.readFileSync(binary)).digest("hex");
const local = {
  binary: relativeBinary,
  sha256,
  platform: process.platform,
  architecture: process.arch,
  upstreamCommit: provenance.upstreamCommit,
  rustyKaspaCommit: provenance.rustyKaspaCommit,
  generatedAt: new Date().toISOString()
};
fs.writeFileSync(localFile, `${JSON.stringify(local, null, 2)}\n`, { mode: 0o600 });
console.log(`${sha256}  ${binary}`);
