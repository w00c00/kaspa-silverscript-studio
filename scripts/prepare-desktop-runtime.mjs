import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { binaryRelativePath, executableName, makeExecutable } from "./platform-binaries.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauri = path.join(root, "src-tauri");
const runtime = path.join(tauri, "runtime", "app");
const binaries = path.join(tauri, "binaries");

function copy(relative) {
  const destination = path.join(runtime, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.cpSync(path.join(root, relative), destination, { recursive: true, force: true });
}

const helperNames = ["silverc-latest", "silverc-cb34aa5", "silverc-legacy", "kascov-preflight"];
for (const helper of helperNames) {
  const source = path.join(root, binaryRelativePath(helper));
  if (!fs.existsSync(source)) throw new Error(`Pinned ${executableName(helper)} is missing. Run the matching setup command first.`);
}
fs.rmSync(path.join(tauri, "runtime"), { recursive: true, force: true });
fs.mkdirSync(runtime, { recursive: true });
for (const entry of ["server", "src/kcc721-metadata.js", "templates", "knowledge", "config", "third_party", "dist", "node_modules", "package.json"]) copy(entry);
fs.mkdirSync(path.join(runtime, "bin"), { recursive: true });
for (const helper of helperNames) {
  const relative = binaryRelativePath(helper);
  const destination = path.join(runtime, relative);
  fs.copyFileSync(path.join(root, relative), destination);
  makeExecutable(destination);
}

const hostLine = execFileSync("rustc", ["-vV"], { encoding: "utf8" }).split("\n").find((line) => line.startsWith("host: "));
if (!hostLine) throw new Error("Unable to determine the Rust target triple");
const triple = hostLine.slice(6).trim();
fs.mkdirSync(binaries, { recursive: true });
const sidecar = path.join(binaries, `node-${triple}${process.platform === "win32" ? ".exe" : ""}`);
fs.copyFileSync(process.execPath, sidecar);
makeExecutable(sidecar);

console.log(`Desktop runtime prepared for ${triple}`);
console.log(`Node sidecar: ${sidecar}`);
