import fs from "node:fs";
import path from "node:path";

export function executableSuffix(platform = process.platform) {
  return platform === "win32" ? ".exe" : "";
}

export function executableName(name, platform = process.platform) {
  return `${name}${executableSuffix(platform)}`;
}

export function binaryRelativePath(name, platform = process.platform) {
  return path.posix.join("bin", executableName(name, platform));
}

export function cargoReleaseBinary(targetDirectory, name, platform = process.platform) {
  return path.join(targetDirectory, "release", executableName(name, platform));
}

export function makeExecutable(file, platform = process.platform) {
  if (platform !== "win32") fs.chmodSync(file, 0o755);
}
