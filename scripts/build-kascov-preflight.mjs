import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { cargoReleaseBinary, executableName, makeExecutable } from "./platform-binaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.join(root, "vendor", "kascov-preflight");
const manifest = path.join(workspace, "Cargo.toml");
const lock = path.join(workspace, "Cargo.lock");
const targetDirectory = path.resolve(process.env.CARGO_TARGET_DIR || path.join(root, ".build", "kascov-target"));
const output = path.join(root, "bin", executableName("kascov-preflight"));

function run(command, args, options = {}) {
  execFileSync(command, args, { stdio: "inherit", ...options });
}

if (!fs.existsSync(manifest) || !fs.existsSync(lock)) {
  throw new Error("Vendored Kascov preflight workspace is incomplete");
}

run("cargo", [
  "build",
  "--locked",
  "--manifest-path", manifest,
  "--release",
  "-p", "studio-kascov-preflight",
  "--bin", "kascov-preflight"
], { env: { ...process.env, CARGO_TARGET_DIR: targetDirectory } });

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.copyFileSync(cargoReleaseBinary(targetDirectory, "kascov-preflight"), output);
makeExecutable(output);
run(process.execPath, [path.join(root, "scripts", "write-kascov-preflight-manifest.mjs")]);
