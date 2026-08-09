import fs from "node:fs";
import path from "node:path";
import { safeId } from "./security.mjs";

const SAMPLE_SOURCE = `pragma silverscript ^0.1.0;

contract OwnerVault(pubkey owner) {
    entry spend(sig signature) {
        require(checkSig(signature, owner));
    }
}
`;

export class ProjectStore {
  constructor(dataDir) {
    this.directory = path.join(dataDir, "projects");
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  file(id) {
    return path.join(this.directory, `${safeId(id, "project id")}.json`);
  }

  list() {
    return fs.readdirSync(this.directory)
      .filter((name) => name.endsWith(".json"))
      .map((name) => {
        try {
          const value = JSON.parse(fs.readFileSync(path.join(this.directory, name), "utf8"));
          return { id: value.id, name: value.name, updatedAt: value.updatedAt, network: value.network };
        } catch { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  }

  get(id) {
    try { return JSON.parse(fs.readFileSync(this.file(id), "utf8")); } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  create(input = {}) {
    const id = safeId(input.id || `contract-${Date.now().toString(36)}`, "project id");
    if (this.get(id)) throw Object.assign(new Error("Project already exists"), { status: 409 });
    const now = new Date().toISOString();
    return this.save(id, {
      id,
      name: String(input.name || "Untitled Covenant").slice(0, 120),
      network: input.network === "mainnet" ? "mainnet" : "tn10",
      requirements: String(input.requirements || ""),
      source: String(input.source || SAMPLE_SOURCE),
      constructorArgs: Array.isArray(input.constructorArgs) ? input.constructorArgs : [],
      compilerProfileId: String(input.compilerProfileId || "latest-cb34aa5"),
      templateParameters: input.templateParameters && typeof input.templateParameters === "object" ? input.templateParameters : {},
      deployAmount: String(input.deployAmount || "0.5"),
      specification: input.specification || null,
      transactionPlans: Array.isArray(input.transactionPlans) ? input.transactionPlans : [],
      review: input.review || null,
      artifact: null,
      deployment: null,
      createdAt: now,
      updatedAt: now
    });
  }

  save(id, input) {
    const normalized = safeId(id, "project id");
    const current = this.get(normalized) || {};
    const allowed = ["name", "network", "requirements", "source", "constructorArgs", "compilerProfileId", "templateParameters", "deployAmount", "specification", "transactionPlans", "review", "artifact", "deployment"];
    const next = { ...current, id: normalized };
    for (const key of allowed) if (Object.hasOwn(input, key)) next[key] = input[key];
    next.createdAt ||= new Date().toISOString();
    next.updatedAt = new Date().toISOString();
    const file = this.file(normalized);
    const temporary = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporary, file);
    return next;
  }

  remove(id) {
    const normalized = safeId(id, "project id");
    const file = this.file(normalized);
    try {
      fs.unlinkSync(file);
      return true;
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
  }
}

export { SAMPLE_SOURCE };
