import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const directory = path.resolve(process.argv[2] || "release-assets");
const platform = String(process.argv[3] || process.platform).replace(/[^a-z0-9_-]/gi, "");
if (!fs.existsSync(directory)) throw new Error(`Release asset directory is missing: ${directory}`);
const outputName = `SHA256SUMS-${platform}.txt`;
const files = fs.readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name !== outputName)
  .map((entry) => entry.name)
  .sort();
if (!files.length) throw new Error(`No release assets found in ${directory}`);
const lines = files.map((name) => {
  const digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(directory, name))).digest("hex");
  return `${digest}  ${name}`;
});
fs.writeFileSync(path.join(directory, outputName), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
