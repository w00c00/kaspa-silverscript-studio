import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { cargoReleaseBinary, executableName, makeExecutable } from "./platform-binaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const latestCommit = "6f9e078b1d8b5389212755183b592704de99fea5";
const previousCommit = "cb34aa5e6a598f9e461c4ad7014279ba89251d8d";
const legacyCommit = "2a3961cadc76bb16a425042172ffe32481da89b5";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "silverstudio-silverc-"));

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function output(command, args, options = {}) {
  return execFileSync(command, args, { encoding: "utf8", ...options }).trim();
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function buildProfile({ id, commit, outputName, configuredSource }) {
  let repository = path.join(work, id);
  if (configuredSource) {
    repository = path.resolve(configuredSource);
    const actual = output("git", ["-C", repository, "rev-parse", "HEAD"]);
    if (actual !== commit) throw new Error(`Local SilverScript source for ${id} is at ${actual}, expected ${commit}`);
  } else {
    run("git", ["clone", "--filter=blob:none", "--no-checkout", "https://github.com/kaspanet/silverscript.git", repository]);
    run("git", ["-C", repository, "checkout", "--detach", commit]);
  }

  const targetDirectory = path.join(work, `target-${id}`);
  run("cargo", [
    "build",
    "--manifest-path", path.join(repository, "Cargo.toml"),
    "-p", "silverscript-lang",
    "--bin", "silverc",
    "--release"
  ], { env: { ...process.env, CARGO_TARGET_DIR: targetDirectory } });

  const source = cargoReleaseBinary(targetDirectory, "silverc");
  const destination = path.join(root, "bin", executableName(outputName));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  makeExecutable(destination);
  return destination;
}

try {
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  const latestBin = buildProfile({
    id: "latest-6f9e078",
    commit: latestCommit,
    outputName: "silverc-latest",
    configuredSource: process.env.SILVERSCRIPT_LATEST_SOURCE || process.env.SILVERSCRIPT_SOURCE || ""
  });
  const previousBin = buildProfile({
    id: "latest-cb34aa5",
    commit: previousCommit,
    outputName: "silverc-cb34aa5",
    configuredSource: process.env.SILVERSCRIPT_PREVIOUS_SOURCE || ""
  });
  const legacyBin = buildProfile({
    id: "legacy-2a3961c",
    commit: legacyCommit,
    outputName: "silverc-legacy",
    configuredSource: process.env.SILVERSCRIPT_LEGACY_SOURCE || ""
  });
  const latestSha256 = sha256(latestBin);
  const previousSha256 = sha256(previousBin);
  const legacySha256 = sha256(legacyBin);
  const manifest = {
    defaultProfileId: "latest-6f9e078",
    profiles: {
      "latest-6f9e078": {
        bin: latestBin,
        sha256: latestSha256,
        upstreamCommit: latestCommit,
        builtAt: new Date().toISOString()
      },
      "latest-cb34aa5": {
        bin: previousBin,
        sha256: previousSha256,
        upstreamCommit: previousCommit,
        builtAt: new Date().toISOString()
      },
      "legacy-2a3961c": {
        bin: legacyBin,
        sha256: legacySha256,
        upstreamCommit: legacyCommit,
        builtAt: new Date().toISOString()
      }
    }
  };
  fs.writeFileSync(path.join(root, "config", "compiler.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  run(latestBin, ["--help"]);
  run(previousBin, ["--help"]);
  run(legacyBin, ["--help"]);
  console.log(`latest silverc commit: ${latestCommit}`);
  console.log(`latest silverc sha256: ${latestSha256}`);
  console.log(`previous silverc commit: ${previousCommit}`);
  console.log(`previous silverc sha256: ${previousSha256}`);
  console.log(`legacy silverc commit: ${legacyCommit}`);
  console.log(`legacy silverc sha256: ${legacySha256}`);
  console.log(`manifest: ${path.join(root, "config", "compiler.json")}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
