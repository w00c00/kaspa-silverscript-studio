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

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

if (!fs.existsSync(path.join(work, ".git"))) {
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(work), { recursive: true });
  run("git", ["clone", "--filter=blob:none", "--no-checkout", repositoryUrl, work]);
}

run("git", ["-C", work, "fetch", "--depth", "1", "origin", commit]);
run("git", ["-C", work, "checkout", "--detach", "--force", commit]);
const sourceDirectory = path.join(work, "crates", "kascov", "src", "bin");
fs.mkdirSync(sourceDirectory, { recursive: true });
fs.copyFileSync(path.join(root, "native", "kascov-preflight-main.rs"), path.join(sourceDirectory, "kascov-preflight.rs"));
run("cargo", [
  "build",
  "--manifest-path", path.join(work, "Cargo.toml"),
  "--locked",
  "--release",
  "-p", "kascov",
  "--bin", "kascov-preflight"
], { env: { ...process.env, CARGO_TARGET_DIR: targetDirectory } });
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(cargoReleaseBinary(targetDirectory, "kascov-preflight"), output);
makeExecutable(output);
run(process.execPath, [path.join(root, "scripts", "write-kascov-preflight-manifest.mjs")]);
