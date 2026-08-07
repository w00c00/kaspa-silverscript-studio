import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { cargoReleaseBinary, executableName, makeExecutable } from "./platform-binaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryUrl = process.env.KASCOV_REPOSITORY || "https://github.com/Knitser/kascov.git";
const commit = process.env.KASCOV_COMMIT || "b64d6b4114df324f899783080371f26b619b19d0";
const work = path.resolve(process.env.KASCOV_BUILD_DIR || path.join(root, ".build", `kascov-${commit}`));
const targetDirectory = path.resolve(process.env.CARGO_TARGET_DIR || path.join(root, ".build", "kascov-target"));
const output = path.join(root, "bin", executableName("kascov-preflight"));
const packageName = "studio-kascov-preflight";

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

function packageIdentities(lock) {
  return lock
    .replace(/\r\n/g, "\n")
    .split(/\n(?=\[\[package\]\]\n)/)
    .filter((section) => section.startsWith("[[package]]\n"))
    .map((section) => {
      const field = (name) => section.match(new RegExp(`^${name} = "([^"]*)"$`, "m"))?.[1] || "";
      return JSON.stringify([field("name"), field("version"), field("source"), field("checksum")]);
    });
}

if (!fs.existsSync(path.join(work, ".git"))) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(work), { recursive: true });
  run("git", ["clone", "--filter=blob:none", "--no-checkout", repositoryUrl, work]);
}

run("git", ["-C", work, "fetch", "--depth", "1", "origin", commit]);
run("git", ["-C", work, "checkout", "--detach", "--force", commit]);
const lockFile = path.join(work, "Cargo.lock");
const pinnedLock = fs.readFileSync(lockFile, "utf8");
const crateDirectory = path.join(work, "crates", packageName);
const sourceDirectory = path.join(crateDirectory, "src");
fs.mkdirSync(sourceDirectory, { recursive: true });
fs.copyFileSync(path.join(root, "native", "kascov-preflight-main.rs"), path.join(sourceDirectory, "main.rs"));
const upstreamPreflightFile = path.join(work, "crates", "kascov", "src", "preflight.rs");
const upstreamPreflight = fs.readFileSync(upstreamPreflightFile, "utf8");
if (!upstreamPreflight.includes("use kascov_core::Network;")) throw new Error("Pinned Kascov preflight source has an unexpected Network import");
fs.writeFileSync(path.join(sourceDirectory, "preflight.rs"), upstreamPreflight.replace("use kascov_core::Network;", "use crate::Network;"));
fs.writeFileSync(path.join(crateDirectory, "Cargo.toml"), `[package]
name = "${packageName}"
version.workspace = true
edition.workspace = true
license.workspace = true

[dependencies]
kascov-decode = { workspace = true }
kascov-sim = { workspace = true }
kaspa-consensus-core = { workspace = true }
serde = { workspace = true }
serde_json = { workspace = true }
hex = { workspace = true }

[[bin]]
name = "kascov-preflight"
path = "src/main.rs"
`);
const workspaceManifestFile = path.join(work, "Cargo.toml");
const workspaceManifest = fs.readFileSync(workspaceManifestFile, "utf8");
if (!workspaceManifest.includes("members = [")) throw new Error("Pinned Kascov workspace manifest has an unexpected members declaration");
fs.writeFileSync(workspaceManifestFile, workspaceManifest.replace("members = [", `members = ["crates/${packageName}", `));
const buildArgs = [
  "build",
  "--manifest-path", workspaceManifestFile,
  "--release",
  "-p", packageName,
  "--bin", "kascov-preflight"
];
// Cargo must first register the injected local package in the upstream lockfile.
// The existing lockfile supplies every external resolution. Target-specific
// dependency sections can be rewritten on Windows, so compare immutable package
// identities instead of formatting: every pinned name/version/source/checksum
// tuple must remain present before repeating the build under --locked.
run("cargo", buildArgs, { env: { ...process.env, CARGO_TARGET_DIR: targetDirectory } });
const updatedLock = fs.readFileSync(lockFile, "utf8");
const pinnedPackages = packageIdentities(pinnedLock);
const updatedPackages = new Set(packageIdentities(updatedLock));
for (const identity of pinnedPackages) {
  if (!updatedPackages.has(identity)) throw new Error(`Pinned Kascov dependency drifted while adding the local preflight package: ${identity}`);
}
if (![...updatedPackages].some((identity) => JSON.parse(identity)[0] === packageName)) {
  throw new Error("Cargo did not register the local Kascov preflight package");
}
run("cargo", [
  "build",
  "--locked",
  ...buildArgs.slice(1)
], { env: { ...process.env, CARGO_TARGET_DIR: targetDirectory } });
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(cargoReleaseBinary(targetDirectory, "kascov-preflight"), output);
makeExecutable(output);
run(process.execPath, [path.join(root, "scripts", "write-kascov-preflight-manifest.mjs")]);
